const form = document.getElementById('upload-form');
const submitButton = document.getElementById('submit-button');
const resultsSection = document.getElementById('results-section');
const resultContent = document.getElementById('result-content');
const loadingSpinner = document.getElementById('loading-spinner');
const historyContainer = document.getElementById('history-container');
const toast = document.getElementById('toast');

const setupFileUpload = (inputId, dropZoneId, emptyStateId, selectedStateId) => {
    const input = document.getElementById(inputId);
    const dropZone = document.getElementById(dropZoneId);
    const emptyState = document.getElementById(emptyStateId);
    const selectedState = document.getElementById(selectedStateId);

    const updateDisplay = (file) => {
        if (file) {
            emptyState.classList.add('hidden');
            selectedState.classList.remove('hidden');
            selectedState.innerHTML = `
                <div class="flex flex-col items-center space-y-3">
                    <svg class="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <p class="text-sm font-medium text-slate-700 truncate w-full px-4">${file.name}</p>
                    <p class="text-xs text-slate-500">${(file.size / 1024).toFixed(1)} KB</p>
                    <button type="button" class="text-xs text-red-500 hover:text-red-700 font-medium" onclick="removeFile('${inputId}')">Remove File</button>
                </div>
            `;
        } else {
            emptyState.classList.remove('hidden');
            selectedState.classList.add('hidden');
            selectedState.innerHTML = '';
            input.value = '';
        }
    };
    
    input.addEventListener('change', (e) => updateDisplay(e.target.files[0]));

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            updateDisplay(input.files[0]);
        }
    });

};


window.removeFile = (inputId) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    const prefix = inputId.replace('-file', '');
    const emptyState = document.getElementById(`${prefix}-empty-state`);
    const selectedState = document.getElementById(`${prefix}-selected-state`);

    if (emptyState && selectedState) {
        emptyState.classList.remove('hidden');
        selectedState.classList.add('hidden');
        selectedState.innerHTML = '';
        input.value = ''; 
    }
};

setupFileUpload('invoice-file', 'invoice-drop-zone', 'invoice-empty-state', 'invoice-selected-state');
setupFileUpload('po-file', 'po-drop-zone', 'po-empty-state', 'po-selected-state');


form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const invoiceFile = formData.get('invoice_file');
    const poFile = formData.get('po_file');

    if (!invoiceFile || invoiceFile.size === 0 || !poFile || poFile.size === 0) {
        showToast("Please select both an invoice and a purchase order file.", true);
        return;
    }

    resultsSection.classList.remove('hidden');
    loadingSpinner.classList.remove('hidden');
    resultContent.innerHTML = '';
    resultContent.classList.add('opacity-0');
    submitButton.disabled = true;
    submitButton.innerHTML = `<div class="spinner !w-6 !h-6 !border-2" role="status"></div><span class="ml-2">Processing...</span>`;
    
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {

        const response = await fetch('/compare', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || 'An unknown error occurred.');
        }
        
        displayResults(result);
        loadHistory(); 

    } catch (error) {
        // console.error('Error:', error);
        const errorMessage = error.message || "An unexpected error occurred during processing.";
        resultContent.innerHTML = `<div class="text-center text-red-600 bg-red-50 p-4 rounded-lg">
            <h3 class="font-bold">Error</h3>
            <p>${errorMessage}</p>
        </div>`;
        showToast(errorMessage, true);
    } finally {
        loadingSpinner.classList.add('hidden');
        resultContent.classList.remove('opacity-0');
        submitButton.disabled = false;
        submitButton.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path></svg><span>Step 3: Compare & Match Documents</span>`;
    }
});

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = "toast show";
    if (isError) toast.classList.add('error');
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function displayResults(data) {
    const isApproved = data.overall_status === 'APPROVED';
    const statusConfig = {
        APPROVED: {
            color: 'green',
            icon: `<svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        },
        NEEDS_REVIEW: {
            color: 'amber',
            icon: `<svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`
        }
    };
    const currentStatus = statusConfig[data.overall_status] || statusConfig['NEEDS_REVIEW'];
    
    const renderMatchItem = (item, title, invoiceValue, poValue, details = '') => {
        const isMatch = item.match;
        const icon = isMatch 
            ? `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>` 
            : `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        return `
            <div class="bg-slate-50 p-4 rounded-lg flex items-start space-x-4">
                <div class="flex-shrink-0">${icon}</div>
                <div class="flex-grow">
                    <p class="font-semibold text-slate-800">${title}</p>
                    <div class="text-sm text-slate-600 mt-1">
                        <p><strong>Invoice:</strong> ${invoiceValue || 'N/A'}</p>
                        ${!isMatch ? `<p><strong>PO:</strong> ${poValue || 'N/A'}</p>`: ''}
                        ${details ? `<p class="mt-1 text-xs italic">${details}</p>` : ''}
                    </div>
                </div>
            </div>`;
    };

    let currencyConversionHtml = '';
    if (data.currency_conversion) {
        if (data.currency_conversion.message) {
            currencyConversionHtml = `
                <div class="bg-slate-50 p-4 rounded-lg flex items-start space-x-4">
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </div>
                    <div class="flex-grow">
                        <p class="font-semibold text-slate-800">Currency Conversion</p>
                        <div class="text-sm text-slate-600 mt-1">
                            <p>${data.currency_conversion.message}</p>
                        </div>
                    </div>
                </div>`;
        } else {
            const isMatchAfter = data.currency_conversion.match_after_conversion;
            const iconAfter = isMatchAfter 
                ? `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>` 
                : `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
            currencyConversionHtml = `
                <div class="bg-slate-50 p-4 rounded-lg flex items-start space-x-4">
                    <div class="flex-shrink-0">${iconAfter}</div>
                    <div class="flex-grow">
                        <p class="font-semibold text-slate-800">Currency Conversion (PO to Invoice Currency)</p>
                        <div class="text-sm text-slate-600 mt-1">
                            <p><strong>From:</strong> ${data.currency_conversion.from_currency}</p>
                            <p><strong>To:</strong> ${data.currency_conversion.to_currency}</p>
                            <p><strong>Original PO Total:</strong> ${data.currency_conversion.original_po_total}</p>
                            <p><strong>Converted PO Total:</strong> ${data.currency_conversion.converted_po_total}</p>
                            <p><strong>Difference After Conversion:</strong> ${data.currency_conversion.difference_after_conversion.value} ${data.currency_conversion.difference_after_conversion.currency}</p>
                        </div>
                        <p class="text-xs text-amber-600 mt-2 italic">⚠︎ Conversion rates are indicative and may vary with market fluctuations.</p>
                    </div>
                </div>`;
        }
    }

    const html = `
        <div class="flex items-center p-5 rounded-lg bg-${currentStatus.color}-50 border border-${currentStatus.color}-200 mb-8">
            ${currentStatus.icon}
            <div class="ml-4">
                <h3 class="text-lg font-bold text-slate-900">Status: ${data.overall_status.replace('_', ' ')}</h3>
                <p class="text-sm text-slate-700">${data.summary}</p>
            </div>
        </div>
        <div class="space-y-4">
            <div class="bg-slate-50 p-4 rounded-lg">
                <p class="font-semibold text-slate-800">Document Identifiers</p>
                <div class="text-sm text-slate-600 mt-1">
                    <p><strong>Invoice Number:</strong> ${data.invoice_number || 'Not found'}</p>
                    <p><strong>PO Number:</strong> ${data.po_number || 'Not found'}</p>
                </div>
            </div>
            ${renderMatchItem(data.vendor_match, 'Vendor Match', data.vendor_match.invoice_vendor, data.vendor_match.po_vendor)}
            ${renderMatchItem(data.currency_match, 'Currency Match', data.currency_match.invoice_currency, data.currency_match.po_currency)}
            ${currencyConversionHtml}
            ${renderMatchItem(data.total_amount_match, 'Total Amount Match', data.total_amount_match.invoice_total, data.total_amount_match.po_total, !data.total_amount_match.match ? `Difference: ${data.total_amount_match.difference.value} ${data.total_amount_match.difference.currency || ''}` : '')}
            ${renderMatchItem(data.items_match, 'Line Items Match', data.items_match.match ? 'All items match' : 'Mismatch found', '', data.items_match.details)}
        </div>
    `;
    resultContent.innerHTML = html;
}

async function loadHistory() {
    try {
        const response = await fetch('/history');
        const history = await response.json();

        if (!response.ok || history.length === 0) {
            historyContainer.innerHTML = `<p class="text-slate-500 text-center p-8">No history yet.</p>`;
            return;
        }

        const historyHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Files</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Summary</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-200">
                        ${history.map(item => `
                            <tr class="hover:bg-slate-50 transition-colors duration-200">
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${new Date(item.timestamp).toLocaleString()}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                    <div class="font-medium truncate max-w-xs" title="${item.invoice_file}">${item.invoice_file.split('_').slice(2).join('_')}</div>
                                    <div class="text-slate-500 truncate max-w-xs" title="${item.po_file}">${item.po_file.split('_').slice(2).join('_')}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    ${item.result.overall_status === 'APPROVED' ? 
                                      `<span class="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Approved</span>` :
                                      `<span class="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">Needs Review</span>`
                                    }
                                </td>
                                <td class="px-6 py-4 text-sm text-slate-500 max-w-sm">${item.result.summary}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        historyContainer.innerHTML = historyHtml;

    } catch (error) {
        // console.error('Failed to load history:', error);
        historyContainer.innerHTML = `<p class="text-red-500 text-center p-8">Could not load comparison history.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', loadHistory);
