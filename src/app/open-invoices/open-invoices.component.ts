import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  supplier_name: string;
  amount: number;
  status: 'open' | 'paid' | 'overdue';
  file?: File;
  file_name?: string;
}

@Component({
  selector: 'app-open-invoices',
  imports: [CommonModule, FormsModule],
  templateUrl: './open-invoices.component.html',
  styleUrl: './open-invoices.component.scss'
})
export class OpenInvoicesComponent implements OnInit {

  invoices: Invoice[] = [];
  searchTerm: string = '';
  // Loading und Error States
  isLoading: boolean = true;
  isCreatingInvoice: boolean = false;
  isUploadingInvoice: string | null = null;
  errorMessage: string = '';

  // Temporary new invoice for inline editing
  newInvoiceRow: Invoice | null = null;

  // Track which existing invoice is in edit mode
  editingInvoiceId: string | null = null;

  // Store original values for cancellation
  private originalValues = new Map<string, any>();

  // Store pending updates for date fields
  private pendingUpdates = new Map<string, { invoice: Invoice, field: string, value: any }>();


  constructor(private http: HttpClient) {}


  ngOnInit() {
    this.loadInvoices();
  }

  // Helper method to get auth headers
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  // Load invoices from API
  loadInvoices() {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.get<{success: boolean, data: Invoice[], message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices`,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Normalize data to ensure amount is always a number and dates are properly formatted
          this.invoices = response.data.map((invoice: any) => ({
            ...invoice,
            amount: typeof invoice.amount === 'string' ? parseFloat(invoice.amount) || 0 : invoice.amount || 0,
            date: this.normalizeDateValue(invoice.date),
            due_date: this.normalizeDateValue(invoice.due_date)
          }));
        } else {
          this.errorMessage = response.message || 'Failed to load invoices';
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading invoices:', error);
        this.errorMessage = 'Failed to load invoices. Please try again.';
        this.isLoading = false;
      }
    });
  }

  // Add new invoice row to table
  addNewInvoiceRow() {
    // Prevent adding multiple new rows
    if (this.newInvoiceRow) {
      this.errorMessage = 'Please save or cancel the current new invoice first';
      return;
    }

    // Create a temporary invoice with a unique ID
    this.newInvoiceRow = {
      id: 'new-' + Date.now(),
      invoice_number: '',
      supplier_name: '',
      date: new Date().toISOString().split('T')[0], // Today's date
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      amount: 0,
      status: 'open',
      file_name: undefined
    };

    // Add to the beginning of the invoices array
    this.invoices.unshift(this.newInvoiceRow);
    this.errorMessage = '';

    // Focus the first input field of the new row
    setTimeout(() => this.focusFirstInputOfNewRow(), 100);
  }

  // Save the new invoice row
  saveNewInvoice() {
    if (!this.newInvoiceRow) return;

    // Validate required fields
    if (!this.newInvoiceRow.invoice_number?.trim() ||
        !this.newInvoiceRow.supplier_name?.trim() ||
        !this.newInvoiceRow.date ||
        !this.newInvoiceRow.due_date ||
        this.newInvoiceRow.amount === null || this.newInvoiceRow.amount === undefined) {
      this.errorMessage = 'Please fill in all required fields (Invoice Number, Supplier Name, Date, Due Date, Amount)';
      return;
    }

    if (this.newInvoiceRow.amount <= 0) {
      this.errorMessage = 'Amount must be greater than 0';
      return;
    }

    this.isCreatingInvoice = true;
    this.errorMessage = '';

    const invoiceData = {
      invoice_number: this.newInvoiceRow.invoice_number.trim(),
      supplier_name: this.newInvoiceRow.supplier_name.trim(),
      date: this.newInvoiceRow.date,
      due_date: this.newInvoiceRow.due_date,
      amount: this.newInvoiceRow.amount,
      status: this.newInvoiceRow.status || 'open'
    };

    this.http.post<{success: boolean, data: Invoice, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices`,
      invoiceData,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Replace the temporary row with the real one, normalize amount and dates
          const normalizedInvoice = {
            ...response.data,
            amount: typeof response.data.amount === 'string' ? parseFloat(response.data.amount) || 0 : response.data.amount || 0,
            date: this.normalizeDateValue(response.data.date),
            due_date: this.normalizeDateValue(response.data.due_date)
          };
          const index = this.invoices.findIndex(inv => inv.id === this.newInvoiceRow!.id);
          if (index !== -1) {
            this.invoices[index] = normalizedInvoice;
          }
          this.newInvoiceRow = null;
          this.errorMessage = '';
          // Optional: alert(`Invoice "${response.data.invoice_number}" was successfully created!`);
        } else {
          this.errorMessage = response.message || 'Failed to create invoice';
        }
        this.isCreatingInvoice = false;
      },
      error: (error) => {
        console.error('Error creating invoice:', error);
        this.errorMessage = 'Failed to create invoice. Please try again.';
        this.isCreatingInvoice = false;
      }
    });
  }

  // Cancel the new invoice row
  cancelNewInvoice() {
    if (!this.newInvoiceRow) return;

    // Remove the temporary row
    this.invoices = this.invoices.filter(inv => inv.id !== this.newInvoiceRow!.id);
    this.newInvoiceRow = null;
    this.errorMessage = '';
  }

  // Start editing an existing invoice
  startEditingInvoice(invoice: Invoice) {
    if (this.editingInvoiceId || this.newInvoiceRow) {
      this.errorMessage = 'Please save or cancel the current edit first';
      return;
    }

    this.editingInvoiceId = invoice.id;

    // Store original values for cancellation
    this.originalValues.set(invoice.id, {
      invoice_number: invoice.invoice_number,
      date: invoice.date,
      due_date: invoice.due_date,
      supplier_name: invoice.supplier_name,
      amount: invoice.amount,
      status: invoice.status
    });

    this.errorMessage = '';

    // Focus the first input field of the edited row
    setTimeout(() => this.focusFirstInputOfEditedRow(invoice.id), 100);
  }

  // Save the edited invoice
  saveEditedInvoice(invoice: Invoice) {
    if (!this.editingInvoiceId || this.editingInvoiceId !== invoice.id) return;

    // Validate required fields
    if (!invoice.invoice_number?.trim() ||
        !invoice.supplier_name?.trim() ||
        !invoice.date ||
        !invoice.due_date ||
        invoice.amount === null || invoice.amount === undefined) {
      this.errorMessage = 'Please fill in all required fields (Invoice Number, Supplier Name, Date, Due Date, Amount)';
      return;
    }

    if (invoice.amount <= 0) {
      this.errorMessage = 'Amount must be greater than 0';
      return;
    }

    // Validate dates
    const invoiceDate = new Date(invoice.date);
    const dueDate = new Date(invoice.due_date);

    if (isNaN(invoiceDate.getTime()) || isNaN(dueDate.getTime())) {
      this.errorMessage = 'Invalid date format';
      return;
    }

    if (dueDate < invoiceDate) {
      this.errorMessage = 'Due date cannot be earlier than invoice date';
      return;
    }

    this.isCreatingInvoice = true;
    this.errorMessage = '';

    const updateData = {
      invoice_number: invoice.invoice_number.trim(),
      supplier_name: invoice.supplier_name.trim(),
      date: invoice.date,
      due_date: invoice.due_date,
      amount: invoice.amount,
      status: invoice.status || 'open'
    };

    this.http.put<{success: boolean, data: Invoice, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices/${invoice.id}`,
      updateData,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Update local data with server response, normalize amount and dates
          const normalizedInvoice = {
            ...response.data,
            amount: typeof response.data.amount === 'string' ? parseFloat(response.data.amount) || 0 : response.data.amount || 0,
            date: this.normalizeDateValue(response.data.date),
            due_date: this.normalizeDateValue(response.data.due_date)
          };

          const index = this.invoices.findIndex(inv => inv.id === invoice.id);
          if (index !== -1) {
            this.invoices[index] = normalizedInvoice;
          }

          // Clear edit mode
          this.editingInvoiceId = null;
          this.originalValues.delete(invoice.id);
          this.pendingUpdates.clear(); // Clear any pending updates
          this.errorMessage = '';
        } else {
          this.errorMessage = response.message || 'Failed to update invoice';
        }
        this.isCreatingInvoice = false;
      },
      error: (error) => {
        console.error('Error updating invoice:', error);
        this.errorMessage = 'Failed to update invoice. Please try again.';
        this.isCreatingInvoice = false;
      }
    });
  }

  // Cancel editing an existing invoice
  cancelEditingInvoice(invoice: Invoice) {
    if (!this.editingInvoiceId || this.editingInvoiceId !== invoice.id) return;

    // Restore original values
    const originalData = this.originalValues.get(invoice.id);
    if (originalData) {
      Object.assign(invoice, originalData);
    }

    // Clear edit mode
    this.editingInvoiceId = null;
    this.originalValues.delete(invoice.id);
    this.pendingUpdates.clear(); // Clear any pending updates
    this.errorMessage = '';
  }

  // Check if an invoice is currently being edited
  isInvoiceEditing(invoice: Invoice): boolean {
    return this.editingInvoiceId === invoice.id;
  }

  // Focus the first input field of the new invoice row
  private focusFirstInputOfNewRow(): void {
    if (!this.newInvoiceRow) return;

    // Find the first input field in the new invoice row
    const newRow = document.querySelector('.new-invoice-row');
    if (!newRow) return;

    const firstInput = newRow.querySelector('input[type="text"]') as HTMLInputElement;
    if (firstInput) {
      firstInput.focus();
      firstInput.select(); // Select all text for better UX
    }
  }

  // Focus the first input field of an edited invoice row
  private focusFirstInputOfEditedRow(invoiceId: string): void {
    // Find the edited row
    const tableRows = document.querySelectorAll('.invoices-table tbody tr');
    for (const row of tableRows) {
      if (row.classList.contains('new-invoice-row')) continue; // Skip new invoice row

      const firstInput = row.querySelector('input[type="text"]') as HTMLInputElement;
      if (firstInput) {
        firstInput.focus();
        firstInput.select(); // Select all text for better UX
        break;
      }
    }
  }

  // Trigger file input for specific row
  triggerFileInput(rowIndex: number) {
    const fileInput = document.getElementById(`file-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Handle file selection for specific invoice
  onFileSelectedForInvoice(event: any, invoiceId: string) {
    const file = event.target.files[0];
    if (file) {
      this.uploadFileForInvoice(file, invoiceId);
    }
  }

  // Upload file for specific invoice
  private uploadFileForInvoice(file: File, invoiceId: string) {
    this.isUploadingInvoice = invoiceId;
    this.errorMessage = '';

    const formData = new FormData();
    formData.append('file', file);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    this.http.post<{success: boolean, data: Invoice, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices/${invoiceId}/upload`,
      formData,
      { headers }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Update the invoice in the local array
          const index = this.invoices.findIndex(inv => inv.id === invoiceId);
          if (index !== -1) {
            this.invoices[index] = response.data;
          }
          alert(`File "${file.name}" was successfully uploaded to invoice!`);
        } else {
          this.errorMessage = response.message || 'Failed to upload file';
        }
        this.isUploadingInvoice = null;
      },
      error: (error) => {
        console.error('Error uploading file:', error);
        this.errorMessage = 'Failed to upload file. Please try again.';
        this.isUploadingInvoice = null;
      }
    });
  }

  loadMockInvoices() {
    this.invoices = [
      {
        id: '1',
        invoice_number: 'INV-2024-001',
        date: '2024-09-01',
        due_date: '2024-09-30',
        supplier_name: 'Fresh Produce GmbH',
        amount: 1250.50,
        status: 'open'
      },
      {
        id: '2',
        invoice_number: 'INV-2024-002',
        date: '2024-09-05',
        due_date: '2024-09-25',
        supplier_name: 'Meat & Poultry Ltd',
        amount: 875.25,
        status: 'overdue'
      },
      {
        id: '3',
        invoice_number: 'INV-2024-003',
        date: '2024-09-10',
        due_date: '2024-10-10',
        supplier_name: 'Dairy Products AG',
        amount: 2100.75,
        status: 'paid'
      },
      {
        id: '4',
        invoice_number: 'INV-2024-004',
        date: '2024-09-15',
        due_date: '2024-10-15',
        supplier_name: 'Beverage Distributors',
        amount: 650.00,
        status: 'open'
      }
    ];
  }

  get filteredInvoices() {
    // Filter out the temporary new invoice row from search results
    let filtered = this.invoices.filter(inv => !this.newInvoiceRow || inv.id !== this.newInvoiceRow.id);

    if (!this.searchTerm) {
      return filtered;
    }
    return filtered.filter(invoice =>
      invoice.invoice_number?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.supplier_name?.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  get openInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'open').length;
  }

  get overdueInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'overdue').length;
  }

  get totalOpenAmount(): number {
    return this.filteredInvoices
      .filter(inv => inv.status === 'open' || inv.status === 'overdue')
      .reduce((sum, inv) => {
        // Ensure amount is a valid number
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        const validAmount = isNaN(amount) ? 0 : amount;
        return sum + validAmount;
      }, 0);
  }












  onAmountInput(event: any, target: Invoice | 'new') {
    const value = event.target.value;
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    const processedValue = isNaN(numericValue) ? 0 : numericValue;

    if (target === 'new' && this.newInvoiceRow) {
      this.newInvoiceRow.amount = processedValue;
    } else if (target !== 'new') {
      this.updateInvoiceFieldLocally(target, 'amount', processedValue);
    }
  }

  onDateInput(event: any, target: Invoice | 'new', field: 'date' | 'due_date') {
    const value = event.target.value;

    // Allow empty values and partial input during editing
    let processedValue = value;

    // Only validate if we have a complete date value
    if (value && typeof value === 'string' && value.length === 10) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        console.warn(`Invalid date format: ${value}`);
        // Don't return - allow user to continue editing
        processedValue = value;
      } else {
        // Valid format - try to validate the actual date
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          console.warn(`Invalid date value: ${value}`);
          processedValue = value; // Still allow the input
        } else {
          processedValue = value;
        }
      }
    }
    // Allow empty or partial values during editing
    else if (value === '' || (value && value.length < 10)) {
      processedValue = value;
    }

    // Only update locally, don't save to API yet
    if (target === 'new' && this.newInvoiceRow) {
      (this.newInvoiceRow as any)[field] = processedValue;
    } else if (target !== 'new') {
      // Update only locally, mark for later saving
      (target as any)[field] = processedValue;
      // Store the pending update for when field loses focus
      this.markFieldForPendingUpdate(target, field, processedValue);
    }
  }

  // Mark field for pending update (called during input, saves on blur)
  private markFieldForPendingUpdate(invoice: Invoice, field: string, value: any) {
    const key = `${invoice.id}-${field}`;
    this.pendingUpdates.set(key, { invoice, field, value });
  }

  // Handle date field blur (save when user leaves the field)
  onDateBlur(event: any, target: Invoice | 'new', field: 'date' | 'due_date') {
    if (target === 'new') {
      // For new invoice row, no API save needed
      return;
    }

    const key = `${target.id}-${field}`;
    const pendingUpdate = this.pendingUpdates.get(key);

    if (pendingUpdate) {
      // Clear the pending update
      this.pendingUpdates.delete(key);

      // Only save if we have a complete date value
      const value = pendingUpdate.value;
      if (value && value.length === 10) {
        // Validate the date before saving
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(value)) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            // Valid date, save to API
            this.updateInvoice(target.id, { [field]: value });
          } else {
            console.warn(`Invalid date value, not saving: ${value}`);
            // Reload data to revert to original value
            this.loadInvoices();
          }
        } else {
          console.warn(`Invalid date format, not saving: ${value}`);
          // Reload data to revert to original value
          this.loadInvoices();
        }
      } else if (value === '') {
        // Empty date is allowed, save it
        this.updateInvoice(target.id, { [field]: value });
      }
      // For partial dates (< 10 chars), don't save and revert
      else if (value && value.length < 10) {
        console.warn(`Incomplete date value, reverting: ${value}`);
        this.loadInvoices();
      }
    }
  }

  // Normalize date values from API to ensure consistent format
  private normalizeDateValue(dateValue: any): string {
    if (!dateValue) return '';

    // If already in correct format, return as is
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }

    try {
      // Try to parse various date formats
      const date = new Date(dateValue);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date value: ${dateValue}`);
        return '';
      }

      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    } catch (error) {
      console.warn(`Error normalizing date value: ${dateValue}`, error);
      return '';
    }
  }

  // Update invoice field locally (used during editing mode)
  updateInvoiceFieldLocally(invoice: Invoice, field: keyof Invoice, value: any) {
    // Special handling for different field types
    let processedValue = value;

    if (field === 'amount') {
      // Ensure amount is always a number
      processedValue = typeof value === 'string' ? parseFloat(value) || 0 : value || 0;
      if (isNaN(processedValue)) {
        processedValue = 0;
      }
    } else if (field === 'date' || field === 'due_date') {
      // For dates, allow partial/incomplete values during editing
      if (value === '' || (value && value.length < 10)) {
        processedValue = value; // Allow partial dates during editing
      } else {
        processedValue = this.normalizeDateValue(value);
      }
    }

    // Update locally for immediate UI feedback
    (invoice as any)[field] = processedValue;
  }

  // Confirm status change with user
  confirmStatusChange(invoice: Invoice, newStatus: 'open' | 'paid' | 'overdue') {
    const oldStatus = invoice.status;
    const statusText = newStatus === 'open' ? 'Offen' :
                      newStatus === 'paid' ? 'Bezahlt' : 'Überfällig';
    const oldStatusText = oldStatus === 'open' ? 'Offen' :
                         oldStatus === 'paid' ? 'Bezahlt' : 'Überfällig';

    // Ask for confirmation
    const confirmed = confirm(`Möchten Sie den Status von "${oldStatusText}" zu "${statusText}" ändern?`);

    if (confirmed) {
      // Update locally first for immediate UI feedback
      invoice.status = newStatus;

      // Send update to API
      this.updateInvoice(invoice.id, { status: newStatus });
    } else {
      // Revert to old status
      invoice.status = oldStatus;
    }
  }

  // Update invoice via API
  private updateInvoice(id: string, updateData: Partial<Invoice>) {
    this.http.put<{success: boolean, data: Invoice, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices/${id}`,
      updateData,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Update local data with server response, normalize amount and dates
          const normalizedInvoice = {
            ...response.data,
            amount: typeof response.data.amount === 'string' ? parseFloat(response.data.amount) || 0 : response.data.amount || 0,
            date: this.normalizeDateValue(response.data.date),
            due_date: this.normalizeDateValue(response.data.due_date)
          };
          const index = this.invoices.findIndex(inv => inv.id === id);
          if (index !== -1) {
            this.invoices[index] = normalizedInvoice;
          }
        } else {
          this.errorMessage = response.message || 'Failed to update invoice';
          // Reload data to revert local changes
          this.loadInvoices();
        }
      },
      error: (error) => {
        console.error('Error updating invoice:', error);
        this.errorMessage = 'Failed to update invoice. Please try again.';
        // Reload data to revert local changes
        this.loadInvoices();
      }
    });
  }


  getStatusClass(status: string): string {
    switch (status) {
      case 'open': return 'status-open';
      case 'paid': return 'status-paid';
      case 'overdue': return 'status-overdue';
      default: return '';
    }
  }

  formatCurrency(amount: any): string {
    // Handle null, undefined, or non-numeric values
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '0,00 €';
    }

    // Convert to number if it's a string
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    // Ensure it's a valid number
    if (isNaN(numericAmount)) {
      return '0,00 €';
    }

    return numericAmount.toFixed(2).replace('.', ',') + ' €';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  }

  trackByInvoiceId(index: number, invoice: Invoice): string {
    return invoice.id;
  }
}
