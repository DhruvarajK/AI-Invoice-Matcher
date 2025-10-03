import os
import shutil
import json
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pytesseract
from PIL import Image
import PyPDF2
from openai import OpenAI
import logging
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from pdf2image import convert_from_path
import requests
import re
import sqlite3

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

UPLOAD_FOLDER = "uploads"
DATABASE_FILE = "database.db"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = FastAPI()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Create SQLite table if not exists
conn = sqlite3.connect(DATABASE_FILE)
cur = conn.cursor()
cur.execute("""
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    invoice_file TEXT,
    po_file TEXT,
    result TEXT
)
""")
conn.commit()
conn.close()

# setting up the connection to the ai model through openrouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

class ComparisonResult(BaseModel):
    status: str
    message: str
    details: dict

def save_upload_file(upload_file: UploadFile, destination: str) -> None:   # this just takes the uploaded file and saves it to our server
  
    try:
        with open(destination, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
    except IOError as e:
        logging.error(f"Error saving file {upload_file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not save file: {upload_file.filename}")
    finally:
        # closing the file 
        upload_file.file.close()


@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "ok"}


def extract_text_from_image(file_path: str) -> str:
    # it uses tesseract to 'read' the text out of a picture
    try:
        with Image.open(file_path) as img:
            text = pytesseract.image_to_string(img)
            return text
    except Exception as e:
        logging.error(f"Error during OCR for {file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to perform OCR on image: {os.path.basename(file_path)}")

def extract_text_from_pdf(file_path: str) -> str:
    # pulls text from a pdf file, but only if it's real text
    try:
        text = ""
        num_pages = 0
        with open(file_path, "rb") as file:
            reader = PyPDF2.PdfReader(file)
            num_pages = len(reader.pages)
            # loop through all the pages and grab the text from each one
            for page_num in range(num_pages):
                page_text = reader.pages[page_num].extract_text() or ""
                text += page_text + "\n"
        
        if text.strip():
            return text
        else:
            # fallback to OCR if no selectable text is found
            logging.info(f"No selectable text extracted from PDF {file_path}, falling back to OCR.")
            ocr_text = ""
            for page_num in range(1, num_pages + 1):
                # Convert one page at a time to save memory on low-end systems
                images = convert_from_path(file_path, dpi=200, first_page=page_num, last_page=page_num)
                if images:
                    img = images[0]
                    ocr_text += pytesseract.image_to_string(img) + "\n"
            return ocr_text
    except Exception as e:
        logging.error(f"Error extracting text from PDF {file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract text from PDF: {os.path.basename(file_path)}")

def get_text_from_file(file_path: str, filename: str) -> str:
    # it checks the file extension to see what kind of file it is
    extension = os.path.splitext(filename)[1].lower()
    # then sends it to the right function to get the text out
    if extension in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff']:
        return extract_text_from_image(file_path)
    elif extension == '.pdf':
        return extract_text_from_pdf(file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {extension}")

def convert_currency_frankfurter(amount, from_currency, to_currency):
    url = f'https://api.frankfurter.app/latest?amount={amount}&from={from_currency}&to={to_currency}'
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        converted_amount = data['rates'].get(to_currency)
        if converted_amount:
            return round(converted_amount, 2)
        else:
            return f"Error: {to_currency} is not a supported currency."
    except requests.RequestException as e:
        return f"Error: Unable to fetch exchange rates - {e}"

def parse_amount(amount_str: str) -> float:
    try:
        # Remove any non-numeric characters except dots and commas
        cleaned = re.sub(r'[^\d.,]', '', amount_str).replace(',', '')
        return float(cleaned)
    except ValueError:
        return None

def analyze_documents_with_ai(invoice_text: str, po_text: str) -> dict:
    # telling it exactly what to look for and how to format the answer
    prompt = f"""
    You are an expert financial analyst AI. Your task is to perform a 3-way match between an invoice and a purchase order.
    Extract the key information from both documents, compare them, and provide a clear result.

    **Invoice Text:**
    ---
    {invoice_text}
    ---

    **Purchase Order Text:**
    ---
    {po_text}
    ---

    **Instructions:**
    1.  **Extract Key Information:** From both texts, identify and extract the following fields:
        * Invoice Number (from invoice)
        * PO Number (from purchase order)
        * Vendor Name
        * Currency (e.g., USD, INR; from both invoice and PO)
        * Total Amount (include currency symbol if present, but extract the numeric value separately if possible)
        * A list of line items with their prices (include currency for each if specified).

    2.  **Compare the Information:**
        * Does the Vendor Name match?
        * Do the Currencies match between the two documents?
        * Does the Total Amount match (considering the currency; if currencies differ, amounts do not match)?
        * Do the line items (names, prices, and currencies if specified) match between the two documents?

    3.  **Provide a JSON Output:** Your response MUST be in a valid JSON format. Do not add any text before or after the JSON block.
        The JSON should have the following structure:
        {{
            "invoice_number": "...",
            "po_number": "...",
            "vendor_match": {{
                "match": boolean,
                "invoice_vendor": "...",
                "po_vendor": "..."
            }},
            "currency_match": {{
                "match": boolean,
                "invoice_currency": "...",
                "po_currency": "..."
            }},
            "total_amount_match": {{
                "match": boolean,
                "invoice_total": "...",
                "po_total": "...",
                "difference": {{
                    "value": "If currencies match: '0.00' if amounts match, else the absolute numerical difference (e.g., '5.50'); If currencies differ: 'Cannot calculate due to currency mismatch'",
                    "currency": "The currency used for the difference (if applicable)"
                }}
            }},
            "items_match": {{
                "match": boolean,
                "details": "A brief explanation of item matching status (e.g., 'All items and prices match perfectly.', 'Mismatch found in item X price.')"
            }},
            "overall_status": "APPROVED" | "NEEDS REVIEW",
            "summary": "A concise, one-sentence summary of the findings."
        }}

    Analyze the provided texts and generate the JSON output.
    """
    try:
        # sending the texts and our instructions to the model
        completion = client.chat.completions.create(
            model="qwen/qwen-2.5-72b-instruct", 
            messages=[
                {"role": "system", "content": "You are a helpful assistant that provides responses in valid JSON format."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1, 
            ## json response
            response_format={"type": "json_object"} 
        )
        response_content = completion.choices[0].message.content
        # the ai gives us back a string of text, so we need to convert it into a python dictionary
        return json.loads(response_content)
    except Exception as e:
        logging.error(f"Error communicating with AI model: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze documents with AI.")

def save_result(invoice_filename: str, po_filename: str, result: dict):
    # function to save the model's analysis into our SQLite database
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO history (timestamp, invoice_file, po_file, result) VALUES (?, ?, ?, ?)",
            (datetime.now().isoformat(), invoice_filename, po_filename, json.dumps(result))
        )
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        logging.error(f"Error saving result to database: {e}")

templates = Jinja2Templates(directory="templates")

@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/compare")
async def compare_documents(invoice_file: UploadFile = File(...), po_file: UploadFile = File(...)):
    if not invoice_file.filename or not po_file.filename:
        raise HTTPException(status_code=400, detail="Both invoice and purchase order files must be provided.")

    # giving the files unique names based on the time 
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    invoice_filename = f"{timestamp}_invoice_{invoice_file.filename}"
    po_filename = f"{timestamp}_po_{po_file.filename}"
    invoice_path = os.path.join(UPLOAD_FOLDER, invoice_filename)
    po_path = os.path.join(UPLOAD_FOLDER, po_filename)

    # save the files to the server
    save_upload_file(invoice_file, invoice_path)
    save_upload_file(po_file, po_path)
    try:
        invoice_text = get_text_from_file(invoice_path, invoice_filename)
        po_text = get_text_from_file(po_path, po_filename)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"An unexpected error occurred during text extraction: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")
    if not invoice_text.strip() or not po_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from one or both documents. The files might be empty, scanned images of poor quality, or corrupted.")

    # sending the extracted text to the ai for analysis
    analysis_result = analyze_documents_with_ai(invoice_text, po_text)

    # Post-processing for currency conversion if mismatch
    if 'currency_match' in analysis_result and not analysis_result['currency_match']['match']:
        inv_curr = analysis_result['currency_match']['invoice_currency']
        po_curr = analysis_result['currency_match']['po_currency']
        inv_total_str = analysis_result['total_amount_match']['invoice_total']
        po_total_str = analysis_result['total_amount_match']['po_total']
        
        inv_amt = parse_amount(inv_total_str)
        po_amt = parse_amount(po_total_str)
        
        if inv_amt is not None and po_amt is not None and inv_curr and po_curr:
            converted_po = convert_currency_frankfurter(po_amt, po_curr, inv_curr)
            if not isinstance(converted_po, str):  # Success
                difference = abs(inv_amt - converted_po)
                match_after = difference < 0.01  # Tolerance for floating point
                analysis_result['currency_conversion'] = {
                    "from_currency": po_curr,
                    "to_currency": inv_curr,
                    "original_po_total": f"{po_amt:.2f} {po_curr}",
                    "converted_po_total": f"{converted_po:.2f} {inv_curr}",
                    "difference_after_conversion": {
                        "value": f"{difference:.2f}",
                        "currency": inv_curr
                    },
                    "match_after_conversion": match_after
                }
            else:
                analysis_result['currency_conversion'] = {
                    "message": converted_po  # Error message
                }
        else:
            analysis_result['currency_conversion'] = {
                "message": "Unable to parse amounts or currencies for conversion."
            }

    # save the result
    save_result(invoice_filename, po_filename, analysis_result)

    # sending analysis back to the user
    return JSONResponse(content=analysis_result)

@app.get("/history")
async def get_history():
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cur = conn.cursor()
        cur.execute("SELECT * FROM history ORDER BY timestamp DESC")
        rows = cur.fetchall()
        history_data = []
        for row in rows:
            history_data.append({
                "id": row[0],
                "timestamp": row[1],
                "invoice_file": row[2],
                "po_file": row[3],
                "result": json.loads(row[4])
            })
        conn.close()
        return JSONResponse(content=history_data)
    except (sqlite3.Error, json.JSONDecodeError):
        return JSONResponse(content=[], status_code=500)
    
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)