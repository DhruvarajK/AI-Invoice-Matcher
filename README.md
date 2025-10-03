# AI Invoice & Purchase Order Matching Tool

A simple web tool that uses AI to automatically compare your invoices and purchase orders. Just upload an invoice and a PO (as a PDF or image), and it will tell you if they match.


## What's new

- **Real-time currency conversion:**  
  If the AI detects that the invoice and PO use different currencies, the app will automatically attempt a live conversion (using the Frankfurter exchange rates API) to compare totals and report whether the amounts match after conversion.  
  Conversion results and a reconciliation object are added to the AI analysis output (see `"currency_conversion"` in the JSON response).

**Install the Required Packages**

Create a requirements.txt file with the content below, then run the install command.

**requirements.txt:**
```
fastapi
uvicorn[standard]
python-multipart
openai
Pillow
pytesseract
PyPDF2
python-dotenv
```
**Install Command:**
```Bash
pip install -r requirements.txt
```


**How to Run the App**
### Start the Server
With your virtual environment still active, run:

```Bash
uvicorn main:app --reload
```
### Open in Your Browser
Navigate to: *http://127.0.0.1:8000*

### Use the Tool
Upload your invoice and PO files, click the "Compare & Match" button, and see the results


##### Note: The application needs OpenRouter API key to run
