import { Component, HostListener, ElementRef, ViewChild, OnInit } from '@angular/core';
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
  supplier_number: string;
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
  selectedRow: number = -1;
  selectedCol: number = -1;
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

  // Debounce timer for date updates
  private dateUpdateTimer: any;

  constructor(private http: HttpClient) {}

  // Tabellenspalten für Tab-Navigation
  columns = [
    { key: 'invoice_number', label: 'Invoice Number' },
    { key: 'date', label: 'Date' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'supplier_number', label: 'Supplier Number' },
    { key: 'amount', label: 'Amount (€)' },
    { key: 'status', label: 'Status' }
  ];

  ngOnInit() {
    this.loadInvoices();
    this.startFocusMonitor();
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
      supplier_number: '',
      date: new Date().toISOString().split('T')[0], // Today's date
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      amount: 0,
      status: 'open',
      file_name: undefined
    };

    // Add to the beginning of the invoices array
    this.invoices.unshift(this.newInvoiceRow);
    this.errorMessage = '';

    // Focus on the first cell of the new row
    setTimeout(() => {
      this.selectedRow = 0;
      this.selectedCol = 0;
    }, 100);
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
      supplier_number: this.newInvoiceRow.supplier_number?.trim() || '',
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
    this.selectedRow = -1;
    this.selectedCol = -1;
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
      supplier_number: invoice.supplier_number,
      amount: invoice.amount,
      status: invoice.status
    });

    this.errorMessage = '';
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
      supplier_number: invoice.supplier_number?.trim() || '',
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
    this.selectedRow = -1;
    this.selectedCol = -1;
  }

  // Check if an invoice is currently being edited
  isInvoiceEditing(invoice: Invoice): boolean {
    return this.editingInvoiceId === invoice.id;
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
        supplier_number: 'SUP-001',
        amount: 1250.50,
        status: 'open'
      },
      {
        id: '2',
        invoice_number: 'INV-2024-002',
        date: '2024-09-05',
        due_date: '2024-09-25',
        supplier_name: 'Meat & Poultry Ltd',
        supplier_number: 'SUP-002',
        amount: 875.25,
        status: 'overdue'
      },
      {
        id: '3',
        invoice_number: 'INV-2024-003',
        date: '2024-09-10',
        due_date: '2024-10-10',
        supplier_name: 'Dairy Products AG',
        supplier_number: 'SUP-003',
        amount: 2100.75,
        status: 'paid'
      },
      {
        id: '4',
        invoice_number: 'INV-2024-004',
        date: '2024-09-15',
        due_date: '2024-10-15',
        supplier_name: 'Beverage Distributors',
        supplier_number: 'SUP-004',
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
      invoice.supplier_name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.supplier_number?.toLowerCase().includes(this.searchTerm.toLowerCase())
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
      .filter(inv => inv.status === 'open')
      .reduce((sum, inv) => {
        // Ensure amount is a valid number
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        const validAmount = isNaN(amount) ? 0 : amount;
        return sum + validAmount;
      }, 0);
  }

  selectCell(row: number, col: number) {
    this.selectedRow = row;
    this.selectedCol = col;
  }

  // Cell click is now handled by explicit edit buttons
  onCellClick(row: number, col: number, event: Event) {
    // Prevent default behavior - editing is now initiated by edit buttons only
    event.preventDefault();
  }

  // Use multiple timing strategies to ensure focus works
  private focusInputWithMultipleStrategies(row: number, col: number): void {
    const strategies = [
      () => this.focusAndSelectInput(row, col), // Immediate
      () => setTimeout(() => this.focusAndSelectInput(row, col), 10), // Short delay
      () => requestAnimationFrame(() => this.focusAndSelectInput(row, col)), // Next frame
      () => setTimeout(() => this.focusAndSelectInput(row, col), 50), // Medium delay
    ];

    // Execute strategies with staggered timing
    strategies.forEach((strategy, index) => {
      setTimeout(strategy, index * 20);
    });

    // Fallback: use MutationObserver for DOM changes
    this.setupMutationObserverForFocus(row, col);
  }

  // Setup MutationObserver to detect when DOM is ready for focus
  private setupMutationObserverForFocus(row: number, col: number): void {
    const targetNode = document.querySelector('.invoices-table');
    if (!targetNode) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(() => {
        // Check if our target input is now available
    const inputSelector = this.getInputSelector(row, col);
    const inputElement = document.querySelector(inputSelector) as HTMLInputElement;

        if (inputElement && this.isInputFocusable(inputElement)) {
          this.focusAndSelectInput(row, col);
          observer.disconnect();
        }
      });
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled']
    });

    // Disconnect after timeout to prevent memory leaks
    setTimeout(() => observer.disconnect(), 1000);
  }

  // Robust focus and select text in the input field with retry mechanism
  private focusAndSelectInput(row: number, col: number, attempt: number = 0): void {
    const maxAttempts = 5;
    const retryDelay = 50; // ms

    if (attempt >= maxAttempts) {
      console.warn(`Focus failed after ${maxAttempts} attempts for row ${row}, col ${col}`);
      return;
    }

    // Try multiple selector strategies
    let inputElement = this.findInputElement(row, col);

    // If primary selector fails, try alternative methods
    if (!inputElement) {
      inputElement = this.findInputElementAlternative(row, col);
    }

    // Check if element exists and is focusable
    if (!inputElement) {
      console.warn(`Input element not found for row ${row}, col ${col}`);

      // Debug on first attempt to understand what's happening
      if (attempt === 0) {
        this.debugInputElements(row, col);
      }

      setTimeout(() => this.focusAndSelectInput(row, col, attempt + 1), retryDelay);
      return;
    }

    // Validate input state
    if (!this.isInputFocusable(inputElement)) {
      console.warn(`Input element is not focusable:`, inputElement);
      setTimeout(() => this.focusAndSelectInput(row, col, attempt + 1), retryDelay);
      return;
    }

    try {
      // Ensure element is visible in viewport
      this.ensureElementVisible(inputElement);

      // Focus the element
      inputElement.focus();

      // Wait for focus to settle
      setTimeout(() => {
        // Double-check focus was successful
        if (document.activeElement !== inputElement) {
          console.warn('Focus was not successful, retrying...');
          setTimeout(() => this.focusAndSelectInput(row, col, attempt + 1), retryDelay);
          return;
        }

        // Select text for text/number inputs
      if (inputElement.type === 'text' || inputElement.type === 'number') {
        inputElement.select();
      }

        // For select elements, ensure proper focus
      if (inputElement.tagName === 'SELECT') {
          // Some browsers need a small delay for select focus
          setTimeout(() => inputElement.focus(), 10);
        }

        // Add focus event listeners for debugging
        this.addFocusEventListeners(inputElement, row, col);

      }, 10);

    } catch (error) {
      console.error('Error during focus operation:', error);
      setTimeout(() => this.focusAndSelectInput(row, col, attempt + 1), retryDelay);
    }
  }

  // Find input element using primary selector strategy
  private findInputElement(row: number, col: number): HTMLInputElement | HTMLSelectElement | null {
    const inputSelector = this.getInputSelector(row, col);
    if (!inputSelector) return null;

    // Special handling for date fields (columns 1 and 2)
    if (col === 1 || col === 2) {
      return this.findDateInputElement(row, col);
    }

    return document.querySelector(inputSelector) as HTMLInputElement | HTMLSelectElement;
  }

  // Special method for finding date input elements with improved accuracy
  private findDateInputElement(row: number, col: number): HTMLInputElement | null {
    // For new invoice row
    if (this.newInvoiceRow && row === 0) {
      const newRow = document.querySelector('.new-invoice-row');
      if (!newRow) return null;

      const dateInputs = newRow.querySelectorAll('input[type="date"]');
      // Column 1 = Date (first date input), Column 2 = Due Date (second date input)
      const targetIndex = col === 1 ? 0 : 1;

      if (targetIndex < dateInputs.length) {
        return dateInputs[targetIndex] as HTMLInputElement;
      }
    }

    // For existing rows
    const actualRowIndex = this.newInvoiceRow ? row - 1 : row;
    const tableRows = document.querySelectorAll('.invoices-table tbody tr:not(.new-invoice-row)');

    if (actualRowIndex >= 0 && actualRowIndex < tableRows.length) {
      const targetRow = tableRows[actualRowIndex];
      const cells = targetRow.querySelectorAll('td');

      // Date is in nth-child(2), Due Date is in nth-child(3)
      const targetCellIndex = col === 1 ? 1 : 2;

      if (targetCellIndex < cells.length) {
        const cell = cells[targetCellIndex];
        return cell.querySelector('input[type="date"]') as HTMLInputElement;
      }
    }

    return null;
  }

  // Alternative method to find input element using DOM traversal
  private findInputElementAlternative(row: number, col: number): HTMLInputElement | HTMLSelectElement | null {
    // Special handling for date fields (columns 1 and 2) - use the same improved method
    if (col === 1 || col === 2) {
      return this.findDateInputElement(row, col);
    }

    // For new invoice row
    if (this.newInvoiceRow && row === 0) {
      const newRow = document.querySelector('.new-invoice-row');
      if (!newRow) return null;

      const cells = newRow.querySelectorAll('td');
      if (col >= 0 && col < cells.length) {
        const cell = cells[col];
        if (col === 6) { // Status column has select
          return cell.querySelector('select') as HTMLSelectElement;
        } else {
          return cell.querySelector('input') as HTMLInputElement;
        }
      }
    }

    // For existing rows
    const actualRowIndex = this.newInvoiceRow ? row - 1 : row;
    const tableRows = document.querySelectorAll('.invoices-table tbody tr:not(.new-invoice-row)');

    if (actualRowIndex >= 0 && actualRowIndex < tableRows.length) {
      const targetRow = tableRows[actualRowIndex];
      const cells = targetRow.querySelectorAll('td');

      if (col >= 0 && col < cells.length) {
        const cell = cells[col];
        if (col === 6) { // Status column has select
          return cell.querySelector('select') as HTMLSelectElement;
        } else {
          return cell.querySelector('input') as HTMLInputElement;
        }
      }
    }

    return null;
  }

  // Validate if an input element is focusable
  private isInputFocusable(element: HTMLElement): boolean {
    // Check if element exists
    if (!element) return false;

    // Check if element is visible
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // Check computed styles
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return false;

    // Check if disabled
    if (element.hasAttribute('disabled') || (element as HTMLInputElement).disabled) return false;

    // Check if readonly (for inputs that shouldn't be focused)
    if ((element as HTMLInputElement).readOnly) return false;

    // Check if element is in the DOM
    if (!document.contains(element)) return false;

    return true;
  }

  // Ensure element is visible in viewport
  private ensureElementVisible(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 0 &&
                     rect.left >= 0 &&
                     rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                     rect.right <= (window.innerWidth || document.documentElement.clientWidth);

    if (!isVisible) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  // Add focus event listeners for debugging and validation
  private addFocusEventListeners(element: HTMLElement, row: number, col: number): void {
    const handleFocus = () => {
      console.log(`Focus gained on row ${row}, col ${col}`);
      this.updateFocusState(row, col, true);
    };

    const handleBlur = () => {
      console.log(`Focus lost on row ${row}, col ${col}`);
      this.updateFocusState(row, col, false);
    };

    // Remove existing listeners to avoid duplicates
    element.removeEventListener('focus', handleFocus);
    element.removeEventListener('blur', handleBlur);

    // Add new listeners
    element.addEventListener('focus', handleFocus, { once: false });
    element.addEventListener('blur', handleBlur, { once: false });
  }

  // Track focus state for validation
  private focusState = new Map<string, boolean>();

  // Update focus state tracking
  private updateFocusState(row: number, col: number, isFocused: boolean): void {
    const key = `${row}-${col}`;
    this.focusState.set(key, isFocused);
  }

  // Check if input has focus
  private isInputFocused(row: number, col: number): boolean {
    const inputElement = this.findInputElement(row, col) || this.findInputElementAlternative(row, col);
    return document.activeElement === inputElement;
  }

  // Debug method to log available input elements
  private debugInputElements(row: number, col: number): void {
    console.log(`Debugging input elements for row ${row}, col ${col}:`);

    // Primary selector
    const primarySelector = this.getInputSelector(row, col);
    const primaryElement = document.querySelector(primarySelector);
    console.log(`Primary selector: "${primarySelector}" ->`, primaryElement);

    // Alternative method
    const altElement = this.findInputElementAlternative(row, col);
    console.log(`Alternative method ->`, altElement);

    // Log all inputs in the row for context
    if (this.newInvoiceRow && row === 0) {
      const newRow = document.querySelector('.new-invoice-row');
      if (newRow) {
        const inputs = newRow.querySelectorAll('input, select');
        console.log('All inputs in new row:', inputs);
      }
    } else {
      const actualRowIndex = this.newInvoiceRow ? row - 1 : row;
      const tableRows = document.querySelectorAll('.invoices-table tbody tr:not(.new-invoice-row)');
      if (actualRowIndex >= 0 && actualRowIndex < tableRows.length) {
        const targetRow = tableRows[actualRowIndex];
        const inputs = targetRow.querySelectorAll('input, select');
        console.log(`All inputs in row ${actualRowIndex}:`, inputs);
      }
    }
  }

  // Validate focus state and attempt recovery if needed
  private validateAndRecoverFocus(row: number, col: number): void {
    if (!this.isInputFocused(row, col)) {
      console.warn(`Focus validation failed for row ${row}, col ${col}, attempting recovery`);
      // Use the robust focus method instead of the basic one
      this.focusInputWithMultipleStrategies(row, col);
    }
  }

  // Global focus monitor for edge cases
  private startFocusMonitor(): void {
    if (this.focusMonitorActive) return;
    this.focusMonitorActive = true;

    const monitor = () => {
      if (this.selectedRow !== -1 && this.selectedCol !== -1) {
        this.validateAndRecoverFocus(this.selectedRow, this.selectedCol);
      }
    };

    // Check focus every 500ms
    setInterval(monitor, 500);
  }

  private focusMonitorActive = false;

  // Get the CSS selector for the input field at the specified row and column
  private getInputSelector(row: number, col: number): string {
    // For new invoice row
    if (this.newInvoiceRow && row === 0) {
      const columnSelectors = [
        '.new-invoice-cell input[type="text"]', // Invoice Number (first text input)
        '.new-invoice-cell input[type="date"]:first-of-type', // Date
        '.new-invoice-cell input[type="date"]:last-of-type', // Due Date
        '.new-invoice-cell input[placeholder="Supplier Name"]', // Supplier Name
        '.new-invoice-cell input[placeholder="Supplier Number"]', // Supplier Number
        '.new-invoice-cell input[type="number"]', // Amount
        '.new-invoice-cell select' // Status
      ];
      return columnSelectors[col] || '';
    }

    // For existing rows - use more specific selectors with better date field distinction
    const actualRowIndex = this.newInvoiceRow ? row - 1 : row;
    const tableRows = document.querySelectorAll('.invoices-table tbody tr:not(.new-invoice-row)');

    if (actualRowIndex >= 0 && actualRowIndex < tableRows.length) {
      const targetRow = tableRows[actualRowIndex] as HTMLElement;

      // Create unique selector for this specific row and column
      const rowId = `row-${actualRowIndex}`;
      targetRow.setAttribute('data-row-id', rowId);

      // More specific selectors for date fields to avoid confusion
      const columnSelectors = [
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(1) input[type="text"]`, // Invoice Number
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(2) input[type="date"]`, // Date (nth-child(2) for date)
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(3) input[type="date"]`, // Due Date (nth-child(3) for due_date)
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(4) input[type="text"]`, // Supplier Name
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(5) input[type="text"]`, // Supplier Number
        `[data-row-id="${rowId}"] .invoice-cell:nth-child(6) input[type="number"]`, // Amount
        `[data-row-id="${rowId}"] .status-cell select` // Status
      ];

      if (col >= 0 && col < columnSelectors.length) {
        return columnSelectors[col];
      }
    }

    return '';
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    if (this.selectedRow === -1 || this.selectedCol === -1) return;

    switch (event.key) {
      case 'Tab':
        event.preventDefault();
        this.navigateTab(event.shiftKey);
        break;
      case 'Enter':
        event.preventDefault();
        // If we're at the last column, go to next row first column
        if (this.selectedCol === this.columns.length - 1) {
          this.navigateToNextRow();
        } else {
          // Otherwise go to next column in same row
          this.navigateRight();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp();
        // Focus is already handled in navigateUp method
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown();
        // Focus is already handled in navigateDown method
        break;
      case 'ArrowLeft':
        if (event.shiftKey) {
          event.preventDefault();
          this.navigateLeft();
          // Focus is already handled in navigateLeft method
        }
        break;
      case 'ArrowRight':
        if (event.shiftKey) {
          event.preventDefault();
          this.navigateRight();
          // Focus is already handled in navigateRight method
        }
        break;
    }
  }

  navigateTab(backward: boolean = false) {
    const maxRows = this.newInvoiceRow ? this.filteredInvoices.length + 1 : this.filteredInvoices.length;
    const minRow = this.newInvoiceRow ? 0 : 0;

    if (backward) {
      this.selectedCol--;
      if (this.selectedCol < 0) {
        this.selectedCol = this.columns.length - 1;
        this.selectedRow--;
        if (this.selectedRow < minRow) {
          this.selectedRow = maxRows - 1;
        }
      }
    } else {
      this.selectedCol++;
      if (this.selectedCol >= this.columns.length) {
        this.selectedCol = 0;
        this.selectedRow++;
        if (this.selectedRow >= maxRows) {
          this.selectedRow = minRow;
        }
      }
    }

    // Enhanced focus handling for date field transitions
    this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
  }

  // Enhanced focus method with special handling for date field transitions
  private focusInputWithEnhancedDateHandling(row: number, col: number): void {
    // For date fields (columns 1 and 2), use a more reliable approach
    if (col === 1 || col === 2) {
      this.focusDateFieldWithRetry(row, col);
    } else {
      // Use the standard multi-strategy approach for other fields
      this.focusInputWithMultipleStrategies(row, col);
    }
  }

  // Special focus method for date fields with improved reliability
  private focusDateFieldWithRetry(row: number, col: number, attempt: number = 0): void {
    const maxAttempts = 5;
    const retryDelay = 25; // Shorter delay for date fields

    if (attempt >= maxAttempts) {
      console.warn(`Date field focus failed after ${maxAttempts} attempts for row ${row}, col ${col}`);
      return;
    }

    // Use the improved date input finder
    const dateInput = this.findDateInputElement(row, col);

    if (!dateInput) {
      console.warn(`Date input not found for row ${row}, col ${col}, attempt ${attempt + 1}`);
      setTimeout(() => this.focusDateFieldWithRetry(row, col, attempt + 1), retryDelay);
      return;
    }

    // Check if the input is focusable
    if (!this.isInputFocusable(dateInput)) {
      console.warn(`Date input not focusable for row ${row}, col ${col}, attempt ${attempt + 1}`);
      setTimeout(() => this.focusDateFieldWithRetry(row, col, attempt + 1), retryDelay);
      return;
    }

    try {
      // Ensure element is visible
      this.ensureElementVisible(dateInput);

      // Focus the date input
      dateInput.focus();

      // Small delay to ensure focus has settled
      setTimeout(() => {
        // Verify focus was successful
        if (document.activeElement !== dateInput) {
          console.warn(`Date field focus verification failed for row ${row}, col ${col}, retrying...`);
          setTimeout(() => this.focusDateFieldWithRetry(row, col, attempt + 1), retryDelay);
          return;
        }

        // Success - update focus state
        this.updateFocusState(row, col, true);

        // For date inputs, we don't need to select text as it's not applicable
        console.log(`Successfully focused date field at row ${row}, col ${col}`);

      }, 10);

    } catch (error) {
      console.error(`Error focusing date field at row ${row}, col ${col}:`, error);
      setTimeout(() => this.focusDateFieldWithRetry(row, col, attempt + 1), retryDelay);
    }
  }

  navigateUp() {
    this.selectedRow--;
    if (this.selectedRow < (this.newInvoiceRow ? 0 : 0)) {
      const maxRows = this.newInvoiceRow ? this.filteredInvoices.length + 1 : this.filteredInvoices.length;
      this.selectedRow = maxRows - 1;
    }

    // Use enhanced focus handling for date field transitions
    this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
  }

  navigateDown() {
    this.selectedRow++;
    if (this.selectedRow >= (this.newInvoiceRow ? this.filteredInvoices.length + 1 : this.filteredInvoices.length)) {
      this.selectedRow = this.newInvoiceRow ? 1 : 0;
    }

    // Use enhanced focus handling for date field transitions
    this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
  }

  // Navigate to next row and first column (for Enter key)
  navigateToNextRow() {
    const maxRows = this.newInvoiceRow ? this.filteredInvoices.length + 1 : this.filteredInvoices.length;
    this.selectedRow++;
    this.selectedCol = 0; // Go to first column

    if (this.selectedRow >= maxRows) {
      this.selectedRow = this.newInvoiceRow ? 1 : 0;
    }

    // Use enhanced focus handling for the new position
    setTimeout(() => {
      this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
    }, 10);
  }

  navigateLeft() {
    this.selectedCol--;
    if (this.selectedCol < 0) {
      this.selectedCol = this.columns.length - 1;
    }

    // Use enhanced focus handling for date field transitions
    this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
  }

  navigateRight() {
    this.selectedCol++;
    if (this.selectedCol >= this.columns.length) {
      this.selectedCol = 0;
    }

    // Use enhanced focus handling for date field transitions
    this.focusInputWithEnhancedDateHandling(this.selectedRow, this.selectedCol);
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
