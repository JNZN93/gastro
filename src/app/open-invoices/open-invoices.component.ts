import { Component, ElementRef, ViewChild, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  supplier_name: string;
  amount: number;
  status: 'open' | 'paid' | 'overdue' | 'sepa';
  file?: File;
  file_name?: string;
  hidrive_path?: string;
  company?: string;
  paid_date?: string;
}

@Component({
  selector: 'app-open-invoices',
  imports: [CommonModule, FormsModule],
  templateUrl: './open-invoices.component.html',
  styleUrl: './open-invoices.component.scss'
})
export class OpenInvoicesComponent implements OnInit {

  invoices: Invoice[] = [];
  // Loading und Error States
  isLoading: boolean = true;
  isCreatingInvoice: boolean = false;
  isUploadingInvoice: string | null = null;
  errorMessage: string = '';

  // Sorting
  sortDirection: 'asc' | 'desc' = 'asc';
  sortColumn: string = 'supplier_name';

  // Temporary new invoice for inline editing
  newInvoiceRow: Invoice | null = null;

  // Track which existing invoice is in edit mode
  editingInvoiceId: string | null = null;

  // Duplicate invoice detection
  showDuplicateModal: boolean = false;
  duplicateInvoices: Invoice[] = [];
  pendingInvoiceData: any = null;

  // Paid status modal
  showPaidStatusModal: boolean = false;
  pendingPaidInvoice: Invoice | null = null;
  paidDate: string = '';
  isConfirmingPaid: boolean = false;

  // Tab navigation
  activeTab: 'all' | 'open' | 'paid' | 'overdue' | 'sepa' = 'all';

  // Toggle for showing/hiding paid invoices
  showPaidInvoices: boolean = true; // Default: show paid invoices

  // Filtered invoices cache for better performance
  private _filteredInvoices: Invoice[] = [];

  // Search term with setter for automatic filtering
  private _searchTerm: string = '';

  // Getter and setter for searchTerm with automatic filtering
  get searchTerm(): string {
    return this._searchTerm;
  }

  set searchTerm(value: string) {
    this._searchTerm = value;
    this.updateFilteredInvoices();
  }

  // Store original values for cancellation
  private originalValues = new Map<string, any>();

  // Store pending updates for date fields
  private pendingUpdates = new Map<string, { invoice: Invoice, field: string, value: any }>();

  // Scroll state for hiding dashboard title
  isScrolled: boolean = false;

  constructor(private http: HttpClient, private router: Router, private cdr: ChangeDetectorRef) {}


  ngOnInit() {
    this.loadInvoices();
  }

  // Listen to scroll events on the dashboard container
  onScroll(event: any) {
    const scrollPosition = event.target.scrollTop;
    // Hide title when scrolled more than 50px
    this.isScrolled = scrollPosition > 50;
  }

  // Also listen to window scroll as fallback
  @HostListener('window:scroll', ['$event'])
  onWindowScroll() {
    // Hide title when scrolled more than 100px
    this.isScrolled = window.pageYOffset > 100;
  }

  // Automatisch überfällige Rechnungen aktualisieren (nur beim ersten Laden)
  private updateOverdueStatuses(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.invoices.forEach(invoice => {
      // Überspringe Rechnungen die gerade bearbeitet werden oder neue temporäre Rechnungen
      if (this.editingInvoiceId === invoice.id || (this.newInvoiceRow && this.newInvoiceRow.id === invoice.id)) {
        return;
      }

      if (invoice.due_date && invoice.status !== 'paid' && invoice.status !== 'overdue' && invoice.status !== 'sepa') {
        const dueDate = new Date(invoice.due_date);
        dueDate.setHours(0, 0, 0, 0);

    if (dueDate <= today) {
          this.autoUpdateOverdueStatus(invoice);
        }
      }
    });
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
  loadInvoices(autoUpdateOverdue = true) {
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

          // Update filtered invoices cache
          this.updateFilteredInvoices();

          // Automatisch überfällige Rechnungen aktualisieren (nur beim ersten Laden)
          if (autoUpdateOverdue) {
            this.updateOverdueStatuses();
            this.autoUpdateOverdueInvoices();
          }
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

  // Automatisch überfällige Rechnungen im Backend aktualisieren
  private autoUpdateOverdueInvoices(): void {
    this.http.put<{success: boolean, message?: string, updatedCount?: number}>(
      `${environment.apiUrl}/api/incoming-invoices/auto-update-overdue`,
      {},
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.updatedCount && response.updatedCount > 0) {
          console.log(`Auto-updated ${response.updatedCount} overdue invoices`);
          // Rechnungen neu laden, um die aktualisierten Status zu zeigen (ohne erneute Auto-Update)
          this.loadInvoices(false);
        }
      },
      error: (error) => {
        console.error('Error auto-updating overdue invoices:', error);

        // Handle authentication errors
        if (error?.status === 400 && error?.error?.error === 'Invalid token!') {
          console.warn('Authentication token is invalid. User needs to login again.');
          // Clear invalid token and redirect to login
          localStorage.removeItem('token');
          // Optionally redirect to login page or show authentication error
          alert('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.');
          window.location.href = '/login'; // Adjust this to your login route
          return;
        }

        // Handle other API errors
        if (error?.status === 404) {
          console.warn('Auto-update-overdue endpoint not found or no overdue invoices found');
        } else if (error?.status >= 500) {
          console.error('Server error during auto-update:', error?.status, error?.statusText);
        }

        // Bei Fehler trotzdem fortfahren - die Frontend-Logik wird trotzdem funktionieren
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
      file_name: undefined,
      company: 'gastro' // Set default company
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

    // Amount validation removed - negative values are now allowed

    this.isCreatingInvoice = true;
    this.errorMessage = '';

    const invoiceData = {
      invoice_number: this.newInvoiceRow.invoice_number.trim(),
      supplier_name: this.newInvoiceRow.supplier_name.trim(),
      date: this.newInvoiceRow.date,
      due_date: this.newInvoiceRow.due_date,
      amount: this.newInvoiceRow.amount,
      status: this.newInvoiceRow.status || 'open',
      company: this.newInvoiceRow.company || 'gastro' // Add company field
    };

    // Check for duplicate invoice numbers first
    this.checkForDuplicates(invoiceData.invoice_number).subscribe({
      next: (hasDuplicates) => {
        if (hasDuplicates) {
          // Show modal and wait for user confirmation
          this.pendingInvoiceData = invoiceData;
          this.isCreatingInvoice = false;
        } else {
          // No duplicates, proceed with creation
          this.createInvoiceAfterCheck(invoiceData);
        }
      },
      error: (error) => {
        console.error('Error checking for duplicates:', error);
        // Continue with creation even if check fails
        this.createInvoiceAfterCheck(invoiceData);
      }
    });
  }

  // Check for duplicate invoice numbers
  private checkForDuplicates(invoiceNumber: string) {
    return new Observable<boolean>(observer => {
      this.http.get<{success: boolean, data: Invoice[], hasDuplicates: boolean}>(
        `${environment.apiUrl}/api/incoming-invoices/check-duplicate?invoice_number=${encodeURIComponent(invoiceNumber)}`,
        { headers: this.getAuthHeaders() }
      ).subscribe({
        next: (response) => {
          if (response.success && response.hasDuplicates) {
            this.duplicateInvoices = response.data;
            this.showDuplicateModal = true;
            observer.next(true);
          } else {
            observer.next(false);
          }
          observer.complete();
        },
        error: (error) => {
          console.error('Error checking duplicates:', error);
          observer.error(error);
          observer.complete();
        }
      });
    });
  }

  // Create invoice after duplicate check or user confirmation
  private createInvoiceAfterCheck(invoiceData: any) {
    this.isCreatingInvoice = true;
    const apiUrl = `${environment.apiUrl}/api/incoming-invoices`;

    this.http.post<{success: boolean, data: Invoice, message?: string}>(
      apiUrl,
      invoiceData,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const selectedFile = this.newInvoiceRow?.file;
          this.handleInvoiceCreationSuccess(response.data);

          // If file was selected, automatically upload it to HiDrive after invoice creation
          if (selectedFile) {
            this.autoUploadToHiDrive(response.data.id, selectedFile);
          }
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

  // User confirms they want to create despite duplicates
  confirmCreateDespiteDuplicates() {
    this.showDuplicateModal = false;
    if (this.pendingInvoiceData) {
      this.createInvoiceAfterCheck(this.pendingInvoiceData);
      this.pendingInvoiceData = null;
    }
  }

  // User cancels the creation
  cancelDuplicateCreation() {
    this.showDuplicateModal = false;
    this.pendingInvoiceData = null;
    this.duplicateInvoices = [];
    this.isCreatingInvoice = false;
  }

  // Automatically upload file to HiDrive for newly created invoice
  private autoUploadToHiDrive(invoiceId: string, file: File) {
    // Check if invoice is open (HiDrive upload only works for open invoices)
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    if (invoice && invoice.status === 'open') {
      this.uploadFileToInvoice(file, invoiceId, true);
    } else {
      alert('HiDrive-Upload ist nur für offene Rechnungen verfügbar. Die Datei wurde nicht hochgeladen.');
    }
  }

  // Handle successful invoice creation
  private handleInvoiceCreationSuccess(invoiceData: Invoice) {
    // Replace the temporary row with the real one, normalize amount and dates
    const normalizedInvoice = {
      ...invoiceData,
      amount: typeof invoiceData.amount === 'string' ? parseFloat(invoiceData.amount) || 0 : invoiceData.amount || 0,
      date: this.normalizeDateValue(invoiceData.date),
      due_date: this.normalizeDateValue(invoiceData.due_date)
    };
    const index = this.invoices.findIndex(inv => inv.id === this.newInvoiceRow!.id);
    if (index !== -1) {
      this.invoices[index] = normalizedInvoice;
    }
    this.newInvoiceRow = null;
    this.errorMessage = '';
    // Update filtered invoices cache after adding new invoice
    this.updateFilteredInvoices();
    // Automatisch überfällige Status aktualisieren nach dem Speichern
    this.updateOverdueStatuses();

    alert(`Rechnung "${invoiceData.invoice_number}" wurde erfolgreich erstellt${normalizedInvoice.file_name ? ' mit Datei' : ''}!`);
  }

  // Cancel the new invoice row
  cancelNewInvoice() {
    if (!this.newInvoiceRow) return;

    // Remove the temporary row
    this.invoices = this.invoices.filter(inv => inv.id !== this.newInvoiceRow!.id);
    this.newInvoiceRow = null;
    this.errorMessage = '';
    // Update filtered invoices cache after cancelling new invoice
    this.updateFilteredInvoices();

    // Reset file input
    const fileInput = document.getElementById('new-invoice-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
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

    // Amount validation removed - negative values are now allowed

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
          // Update filtered invoices cache after editing invoice
          this.updateFilteredInvoices();
          // Automatisch überfällige Status aktualisieren nach dem Speichern
          this.updateOverdueStatuses();
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

  // Confirm deletion of an invoice
  confirmDeleteInvoice(invoice: Invoice): void {
    const confirmed = confirm(`Sind Sie sicher, dass Sie die Rechnung "${invoice.invoice_number}" von "${invoice.supplier_name}" löschen möchten?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`);

    if (confirmed) {
      this.deleteInvoice(invoice);
    }
  }

  // Delete an invoice
  deleteInvoice(invoice: Invoice): void {
    this.errorMessage = '';

    this.http.delete<{success: boolean, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices/${invoice.id}`,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (response) => {
        if (response.success) {
          // Remove the invoice from the local array
          this.invoices = this.invoices.filter(inv => inv.id !== invoice.id);
          // Update filtered invoices cache after deleting invoice
          this.updateFilteredInvoices();
          alert(`Rechnung "${invoice.invoice_number}" wurde erfolgreich gelöscht.`);
        } else {
          this.errorMessage = response.message || 'Fehler beim Löschen der Rechnung';
        }
      },
      error: (error: any) => {
        console.error('Error deleting invoice:', error);
        this.errorMessage = 'Fehler beim Löschen der Rechnung. Bitte versuchen Sie es erneut.';

        // Handle authentication errors
        if (error?.status === 401) {
          console.warn('Authentication token is invalid. User needs to login again.');
          localStorage.removeItem('token');
          alert('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.');
          window.location.href = '/login';
        }
      }
    });
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

  // Trigger file input for specific row (local upload)
  triggerFileInput(rowIndex: number) {
    const fileInput = document.getElementById(`file-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      // Store upload type in a data attribute
      fileInput.setAttribute('data-upload-type', 'local');
      fileInput.click();
    }
  }

  // Trigger file input for specific row (HiDrive upload)
  triggerFileInputForHiDrive(rowIndex: number) {
    const fileInput = document.getElementById(`file-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      // Store upload type in a data attribute
      fileInput.setAttribute('data-upload-type', 'hidrive');
      fileInput.click();
    }
  }

  // Trigger file input for specific row (HiDrive upload - mobile)
  triggerFileInputForHiDriveMobile(rowIndex: number) {
    const fileInput = document.getElementById(`file-mobile-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      // Store upload type in a data attribute
      fileInput.setAttribute('data-upload-type', 'hidrive');
      fileInput.click();
    }
  }

  // Trigger file input for specific row (HiDrive overwrite)
  triggerFileInputForHiDriveOverwrite(rowIndex: number) {
    const fileInput = document.getElementById(`file-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.setAttribute('data-upload-type', 'hidrive-overwrite');
      fileInput.click();
    }
  }

  // Trigger file input for specific row (HiDrive overwrite - mobile)
  triggerFileInputForHiDriveOverwriteMobile(rowIndex: number) {
    const fileInput = document.getElementById(`file-mobile-${rowIndex}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.setAttribute('data-upload-type', 'hidrive-overwrite');
      fileInput.click();
    }
  }

  // Trigger file input for new invoice
  triggerNewInvoiceFileInput() {
    const fileInput = document.getElementById('new-invoice-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Trigger file input for new invoice (mobile)
  triggerNewInvoiceFileInputMobile() {
    const fileInput = document.getElementById('new-invoice-file-mobile') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Handle file selection for new invoice
  onNewInvoiceFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && this.newInvoiceRow) {
      this.newInvoiceRow.file = file;
    }
  }

  // Remove file from new invoice
  removeNewInvoiceFile() {
    if (this.newInvoiceRow) {
      this.newInvoiceRow.file = undefined;
      // Reset file input
      const fileInput = document.getElementById('new-invoice-file') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }
  }

  // Handle file selection for specific invoice
  onFileSelectedForInvoice(event: any, invoiceId: string) {
    const file = event.target.files[0];
    const uploadType = event.target.getAttribute('data-upload-type') || 'local';

    if (file) {
      if (uploadType === 'hidrive') {
        this.uploadFileForInvoiceToHiDrive(file, invoiceId);
      } else if (uploadType === 'hidrive-overwrite') {
        this.overwriteFileForInvoiceInHiDrive(file, invoiceId);
      } else {
        this.uploadFileForInvoice(file, invoiceId);
      }
    }

    // Reset the upload type
    event.target.removeAttribute('data-upload-type');
  }

  // Upload file for specific invoice (LOCAL)
  private uploadFileForInvoice(file: File, invoiceId: string) {
    this.uploadFileToInvoice(file, invoiceId, false);
  }

  // Upload file for specific invoice to HiDrive
  private uploadFileForInvoiceToHiDrive(file: File, invoiceId: string) {
    this.uploadFileToInvoice(file, invoiceId, true);
  }

  // Overwrite existing HiDrive file for specific invoice
  private overwriteFileForInvoiceInHiDrive(file: File, invoiceId: string) {
    this.isUploadingInvoice = invoiceId;
    this.errorMessage = '';

    const formData = new FormData();
    formData.append('file', file);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    const uploadUrl = `${environment.apiUrl}/api/incoming-invoices/${invoiceId}/upload-hidrive`;

    this.http.post<{success: boolean, data: Invoice, message?: string}>(
      uploadUrl,
      formData,
      { headers }
    ).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const index = this.invoices.findIndex(inv => inv.id === invoiceId);
          if (index !== -1) {
            // Replace the entire invoice object to ensure Angular detects the change
            this.invoices[index] = { ...response.data };
          }
          // Force update of filtered invoices
          this.updateFilteredInvoices();
          alert(`Datei "${response.data.file_name}" wurde in HiDrive ersetzt.`);
        } else {
          this.errorMessage = response.message || 'Failed to overwrite file';
        }
        this.isUploadingInvoice = null;
      },
      error: (error) => {
        console.error('Error overwriting file in HiDrive:', error);
        this.errorMessage = 'Failed to overwrite file. Please try again.';
        this.isUploadingInvoice = null;
      }
    });
  }

  // Generic file upload method
  private uploadFileToInvoice(file: File, invoiceId: string, useHiDrive: boolean = false) {
    this.isUploadingInvoice = invoiceId;
    this.errorMessage = '';

    const formData = new FormData();
    formData.append('file', file);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    const uploadUrl = useHiDrive
      ? `${environment.apiUrl}/api/incoming-invoices/${invoiceId}/upload-hidrive`
      : `${environment.apiUrl}/api/incoming-invoices/${invoiceId}/upload`;

    this.http.post<{success: boolean, data: Invoice, message?: string}>(
      uploadUrl,
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
          // Update filtered invoices cache after file upload
          this.updateFilteredInvoices();
          const storageType = useHiDrive ? 'HiDrive' : 'lokal';
          alert(`File "${file.name}" wurde erfolgreich zu ${storageType} hochgeladen!`);
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

  // Download invoice file
  downloadInvoiceFile(invoice: Invoice) {
    const downloadUrl = `${environment.apiUrl}/api/incoming-invoices/${invoice.id}/download`;

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    // For HiDrive files, use the download endpoint
    this.http.get(downloadUrl, {
      headers,
      responseType: 'blob' as 'json'
    }).subscribe({
      next: (response: any) => {
        // Create blob and download
        const blob = new Blob([response], { type: response.type || 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = invoice.file_name || 'invoice-file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Error downloading file:', error);
        this.errorMessage = 'Failed to download file. Please try again.';
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
    // Update filtered invoices cache after loading mock data
    this.updateFilteredInvoices();
  }

  // Generic sort method for all columns
  sortBy(column: string) {
    if (this.sortColumn !== column) {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    } else {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    }
    this.updateFilteredInvoices();
  }

  // Sortieren nach Lieferant (alphabetisch) und dann nach Rechnungsdatum
  sortBySupplier() {
    this.sortBy('supplier_name');
  }

  // Method to switch tabs
  switchTab(tab: 'all' | 'open' | 'paid' | 'overdue' | 'sepa') {
    this.activeTab = tab;
    this.updateFilteredInvoices();
  }

  // Method to update filtered invoices cache
  private updateFilteredInvoices() {
    // Filter out the temporary new invoice row from search results
    let filtered = this.invoices.filter(inv => !this.newInvoiceRow || inv.id !== this.newInvoiceRow.id);

    // Apply tab filter first
    if (this.activeTab !== 'all') {
      if (this.activeTab === 'open') {
        // Show both 'open' and 'overdue' in the 'Offen' tab
        filtered = filtered.filter(invoice => invoice.status === 'open' || invoice.status === 'overdue');
      } else {
        filtered = filtered.filter(invoice => invoice.status === this.activeTab);
      }
    }

    // Apply paid invoices toggle filter (hide paid invoices by default)
    // Only apply this filter if we're not on the 'paid' tab (paid tab should always show paid invoices)
    if (!this.showPaidInvoices && this.activeTab !== 'paid') {
      filtered = filtered.filter(invoice => invoice.status !== 'paid');
    }

    // Apply search filter with flexible matching
    if (this.searchTerm) {
      // Normalize search term: remove all whitespace and convert to lowercase
      const normalizedSearchTerm = this.searchTerm.replace(/\s+/g, '').toLowerCase();
      
      filtered = filtered.filter(invoice => {
        // Normalize invoice number: remove whitespace and convert to lowercase
        const normalizedInvoiceNumber = (invoice.invoice_number || '').replace(/\s+/g, '').toLowerCase();
        
        // Normalize supplier name: remove extra whitespace and convert to lowercase
        const normalizedSupplierName = (invoice.supplier_name || '').replace(/\s+/g, ' ').trim().toLowerCase();
        
        // Check if search term matches invoice number (with whitespace ignored)
        if (normalizedInvoiceNumber.includes(normalizedSearchTerm)) {
          return true;
        }
        
        // Check if search term matches supplier name (flexible whitespace matching)
        if (normalizedSupplierName.includes(normalizedSearchTerm)) {
          return true;
        }
        
        // Check if search term matches amount (numeric search)
        // Extract numbers from search term (handle both . and , as decimal separators)
        const searchNumberStr = normalizedSearchTerm.replace(/[^\d.,-]/g, '');
        if (searchNumberStr.length > 0) {
          // Try parsing with both comma and dot as decimal separator
          const searchWithDot = parseFloat(searchNumberStr.replace(',', '.'));
          const searchWithComma = parseFloat(searchNumberStr.replace('.', ','));
          const searchAsNumber = !isNaN(searchWithDot) ? searchWithDot : (!isNaN(searchWithComma) ? searchWithComma : null);
          
          if (searchAsNumber !== null && !isNaN(searchAsNumber)) {
            const invoiceAmount = typeof invoice.amount === 'string' ? parseFloat(invoice.amount) : invoice.amount || 0;
            
            // Convert amount to string without decimals for partial matching (e.g., "1250" matches "1250.50")
            const amountAsString = Math.abs(invoiceAmount).toString().replace(/\./g, '');
            const searchAsString = Math.abs(searchAsNumber).toString().replace(/\./g, '');
            
            // Check if the search number is contained in the amount string (partial match)
            if (amountAsString.includes(searchAsString) || searchAsString.includes(amountAsString)) {
              return true;
            }
            
            // Check exact match (within 0.01 difference to handle floating point precision)
            if (Math.abs(invoiceAmount - searchAsNumber) < 0.01) {
              return true;
            }
          }
        }
        
        // Check if search term matches formatted amount string (e.g., "1.250,50" or "1250,50")
        const invoiceAmount = typeof invoice.amount === 'string' ? parseFloat(invoice.amount) : invoice.amount || 0;
        const formattedAmount = this.formatCurrency(invoiceAmount)
          .replace(/\s+/g, '')
          .replace(/€/g, '')
          .toLowerCase();
        
        // Remove thousand separators and normalize decimal separator
        const normalizedFormattedAmount = formattedAmount.replace(/\./g, '').replace(',', '.');
        const normalizedSearchForAmount = normalizedSearchTerm.replace(/[^\d.,-]/g, '').replace(',', '.');
        
        if (normalizedSearchForAmount && normalizedFormattedAmount.includes(normalizedSearchForAmount)) {
          return true;
        }
        
        return false;
      });
    }

    this._filteredInvoices = this.sortInvoices(filtered);
  }

  // Toggle paid invoices visibility
  togglePaidInvoices() {
    this.showPaidInvoices = !this.showPaidInvoices;
    this.updateFilteredInvoices();
  }

  get filteredInvoices() {
    return this._filteredInvoices;
  }

  private sortInvoices(invoices: Invoice[]): Invoice[] {
    return invoices.sort((a, b) => {
      let comparison = 0;

      switch (this.sortColumn) {
        case 'supplier_name':
          const supplierA = a.supplier_name?.toLowerCase() || '';
          const supplierB = b.supplier_name?.toLowerCase() || '';
          if (supplierA < supplierB) {
            comparison = -1;
          } else if (supplierA > supplierB) {
            comparison = 1;
          }
          break;

        case 'invoice_number':
          const invoiceNumA = a.invoice_number?.toLowerCase() || '';
          const invoiceNumB = b.invoice_number?.toLowerCase() || '';
          if (invoiceNumA < invoiceNumB) {
            comparison = -1;
          } else if (invoiceNumA > invoiceNumB) {
            comparison = 1;
          }
          break;

        case 'date':
          const dateA = new Date(a.date || '1970-01-01').getTime();
          const dateB = new Date(b.date || '1970-01-01').getTime();
          comparison = dateA - dateB;
          break;

        case 'due_date':
          const dueDateA = new Date(a.due_date || '1970-01-01').getTime();
          const dueDateB = new Date(b.due_date || '1970-01-01').getTime();
          comparison = dueDateA - dueDateB;
          break;

        case 'amount':
          const amountA = typeof a.amount === 'string' ? parseFloat(a.amount) : a.amount || 0;
          const amountB = typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount || 0;
          comparison = amountA - amountB;
          break;

        case 'status':
          const statusOrder = { 'open': 1, 'overdue': 2, 'sepa': 3, 'paid': 4 };
          const statusA = statusOrder[a.status as keyof typeof statusOrder] || 0;
          const statusB = statusOrder[b.status as keyof typeof statusOrder] || 0;
          comparison = statusA - statusB;
          break;

        default:
          // Fallback: sort by supplier name
          const defaultSupplierA = a.supplier_name?.toLowerCase() || '';
          const defaultSupplierB = b.supplier_name?.toLowerCase() || '';
          if (defaultSupplierA < defaultSupplierB) {
            comparison = -1;
          } else if (defaultSupplierA > defaultSupplierB) {
            comparison = 1;
          }
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  get openInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'open').length;
  }

  get overdueInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'overdue').length;
  }

  get totalOpenAmount(): number {
    return this.filteredInvoices
      .filter(inv => inv.status === 'open' || inv.status === 'overdue' || inv.status === 'sepa')
      .reduce((sum, inv) => {
        // Ensure amount is a valid number
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        const validAmount = isNaN(amount) ? 0 : amount;
        return sum + validAmount;
      }, 0);
  }

  // Get tab-specific statistics
  getTabStats(tab: 'all' | 'open' | 'paid' | 'overdue' | 'sepa') {
    let invoices = this.invoices.filter(inv => !this.newInvoiceRow || inv.id !== this.newInvoiceRow.id);

    if (tab !== 'all') {
      if (tab === 'open') {
        // 'Offen' tab includes both 'open' and 'overdue'
        invoices = invoices.filter(inv => inv.status === 'open' || inv.status === 'overdue');
      } else {
        invoices = invoices.filter(inv => inv.status === tab);
      }
    }

    return {
      count: invoices.length,
      amount: invoices.reduce((sum, inv) => {
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0)
    };
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
  confirmStatusChange(invoice: Invoice, newStatus: 'open' | 'paid' | 'overdue' | 'sepa') {
    const oldStatus = invoice.status;
    const statusText = newStatus === 'open' ? 'Offen' :
                      newStatus === 'paid' ? 'Bezahlt' :
                      newStatus === 'sepa' ? 'SEPA' :
                      newStatus === 'overdue' ? 'Überfällig' : 'Unbekannt';

    // Special handling for paid status - show modal with date picker
    if (newStatus === 'paid') {
      console.log('Opening paid status modal for invoice:', invoice.invoice_number);
      this.pendingPaidInvoice = invoice;
      this.paidDate = new Date().toISOString().split('T')[0]; // Today's date as default
      this.showPaidStatusModal = true;
      console.log('Modal state:', this.showPaidStatusModal);
      // Revert the status change in the dropdown
      invoice.status = oldStatus;
      return;
    }

    // For other statuses, use simple confirmation
    const confirmed = confirm(`Möchten Sie den Status der Rechnung "${invoice.invoice_number}" wirklich zu "${statusText}" ändern?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`);

    if (confirmed) {
      // Update locally first for immediate UI feedback
      invoice.status = newStatus;

      // Send update to API
      this.updateInvoice(invoice.id, { status: newStatus }).subscribe({
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
              // Update filtered invoices cache after status change
              this.updateFilteredInvoices();
            }
          } else {
            this.errorMessage = response.message || 'Failed to update invoice';
            // Reload data to revert local changes
            this.loadInvoices();
          }
        },
        error: (error: any) => {
          console.error('Error updating invoice:', error);
          this.errorMessage = 'Failed to update invoice. Please try again.';
          // Reload data to revert local changes
          this.loadInvoices();
        }
      });
    } else {
      // Revert to old status
      invoice.status = oldStatus;
    }
  }

  // Handle status select changes without mutating model first
  onStatusSelectChange(invoice: Invoice, newStatus: 'open' | 'paid' | 'overdue' | 'sepa') {
    // Open modal immediately for 'paid'
    if (newStatus === 'paid') {
      console.log('[StatusSelect] paid chosen for', invoice.invoice_number);
      const oldStatus = invoice.status;
      // Defer modal open to next tick to avoid closing by same click event
      setTimeout(() => {
        console.log('[StatusSelect] opening paid modal now for', invoice.invoice_number);
        this.pendingPaidInvoice = invoice;
        this.paidDate = this.getTodayDate();
        this.showPaidStatusModal = true;
        this.cdr.detectChanges();
      }, 0);
      // Ensure UI shows original status in the select
      invoice.status = oldStatus;
      return;
    }

    // Other statuses go through the existing confirmation flow
    this.confirmStatusChange(invoice, newStatus);
  }

  // Update invoice via API
  private updateInvoice(id: string, updateData: Partial<Invoice>) {
    return this.http.put<{success: boolean, data: Invoice, message?: string}>(
      `${environment.apiUrl}/api/incoming-invoices/${id}`,
      updateData,
      { headers: this.getAuthHeaders() }
    );
  }

  // Paid status modal methods
  confirmPaidStatus() {
    if (!this.pendingPaidInvoice || !this.paidDate || this.isConfirmingPaid) {
      return;
    }

    this.isConfirmingPaid = true;

    // Update locally first for immediate UI feedback
    this.pendingPaidInvoice.status = 'paid';

    // Send update to API with paid_date
    this.updateInvoice(this.pendingPaidInvoice.id, { 
      status: 'paid', 
      paid_date: this.paidDate 
    }).subscribe({
      next: (response) => {
        this.isConfirmingPaid = false;
        if (response.success && response.data) {
          // Update local data with server response, normalize amount and dates
          const normalizedInvoice = {
            ...response.data,
            amount: typeof response.data.amount === 'string' ? parseFloat(response.data.amount) || 0 : response.data.amount || 0,
            date: this.normalizeDateValue(response.data.date),
            due_date: this.normalizeDateValue(response.data.due_date)
          };
          const index = this.invoices.findIndex(inv => inv.id === this.pendingPaidInvoice!.id);
          if (index !== -1) {
            this.invoices[index] = normalizedInvoice;
            // Update filtered invoices cache after status change
            this.updateFilteredInvoices();
          }
          // Close modal
          this.closePaidStatusModal();
        } else {
          this.errorMessage = response.message || 'Failed to update invoice';
          // Reload data to revert local changes
          this.loadInvoices();
          this.closePaidStatusModal();
        }
      },
      error: (error: any) => {
        this.isConfirmingPaid = false;
        console.error('Error updating invoice:', error);
        this.errorMessage = 'Failed to update invoice. Please try again.';
        // Reload data to revert local changes
        this.loadInvoices();
        this.closePaidStatusModal();
      }
    });
  }

  closePaidStatusModal() {
    console.log('[PaidModal] closing modal');
    this.showPaidStatusModal = false;
    this.pendingPaidInvoice = null;
    this.paidDate = '';
    this.isConfirmingPaid = false;
  }

  // Get today's date in YYYY-MM-DD format for date input max attribute
  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }



  getStatusClass(status: string): string {
    switch (status) {
      case 'open': return 'status-open';
      case 'paid': return 'status-paid';
      case 'overdue': return 'status-overdue';
      case 'sepa': return 'status-sepa';
      default: return '';
    }
  }

  // Bestimmt die Zeilen-Farbmarkierung basierend auf dem Status
  getRowClass(invoice: Invoice): string {
    switch (invoice.status) {
      case 'paid':
        return 'row-paid';
      case 'overdue':
        return 'row-overdue';
      case 'sepa':
        return 'row-sepa';
      case 'open':
      default:
        return 'row-open';
    }
  }

  // Automatisch Status auf "overdue" setzen
  private autoUpdateOverdueStatus(invoice: Invoice): void {
    // Vermeide doppelte API-Calls und überspringe SEPA-Zahlungen
    if (invoice.status === 'overdue' || invoice.status === 'sepa') return;

    invoice.status = 'overdue';

    // API-Call um Status zu aktualisieren
    this.updateInvoice(invoice.id, { status: 'overdue' }).subscribe({
      next: (response) => {
        if (response.success) {
          console.log(`Invoice ${invoice.invoice_number} automatically marked as overdue`);
          // Update filtered invoices cache after status change
          this.updateFilteredInvoices();
        } else {
          console.error('Failed to update overdue status:', response.message);
          // Bei Fehler Status zurücksetzen
          invoice.status = 'open';
          this.updateFilteredInvoices();
        }
      },
      error: (error: any) => {
        console.error('Error updating overdue status:', error);
        // Bei Fehler Status zurücksetzen
        invoice.status = 'open';
        this.updateFilteredInvoices();
      }
    });
  }

  formatCurrency(amount: any): string {
    // Handle null, undefined, or non-numeric values
    if (amount === null || amount === undefined || isNaN(amount)) {
        return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(0);
    }

    // Convert to number if it's a string
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    // Ensure it's a valid number
    if (isNaN(numericAmount)) {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(0);
    }

    // Format with thousands separators and Euro symbol in German locale
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numericAmount);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';

    // Try to handle values that are already in YYYY-MM-DD or other parseable formats
    let date: Date | null = null;

    // If already in YYYY-MM-DD, split safely (avoids timezone shifts)
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [yearStr, monthStr, dayStr] = dateString.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        date = new Date(Date.UTC(year, month - 1, day));
      }
    }

    // Fallback: attempt to parse via Date constructor
    if (!date) {
      const parsed = new Date(dateString);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!date) return '';

    const year = date.getUTCFullYear();
    const month = String((date.getUTCMonth() + 1)).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    // Strict TT.MM.JJJJ
    return `${day}.${month}.${year}`;
  }

  exportToPDF(all: boolean) {
    const data = all
      ? this.invoices.filter(inv => !this.newInvoiceRow || inv.id !== this.newInvoiceRow.id)
      : this.filteredInvoices;

    if (!data || !data.length) {
      alert('Keine Rechnungen zum Exportieren gefunden.');
      return;
    }

    Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]).then(([{ default: jsPDF }, { default: autoTable }]) => {
      const doc: any = new (jsPDF as any)();

      const head = [[
        'Lieferant',
        'Rechnungsnr.',
        'Datum',
        'Fällig',
        'Betrag',
        'Status'
      ]];

      const statusText = (s: string) =>
        s === 'open' ? 'Offen' :
        s === 'paid' ? 'Bezahlt' :
        s === 'overdue' ? 'Überfällig' :
        s === 'sepa' ? 'SEPA' : (s || '-');

      const body = data.map((inv: any) => [
        inv.supplier_name || '-',
        inv.invoice_number || '-',
        this.formatDate(inv.date || '') || '-',
        this.formatDate(inv.due_date || '') || '-',
        this.formatCurrency(inv.amount ?? 0),
        statusText(inv.status as any)
      ]);

      doc.setFontSize(14);
      doc.text('Eingehende Rechnungen', 14, 18);
      doc.setFontSize(10);
      const sub = all ? 'Alle Rechnungen' : 'Aktuelle Ansicht';
      try { doc.text(`${sub} • Export: ${new Date().toLocaleDateString('de-DE')}`, 14, 26); } catch {}

      (autoTable as any)(doc, {
        head,
        body,
        startY: 32,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          lineWidth: 0.1,
          lineColor: [229, 231, 235],
          valign: 'middle'
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [55, 65, 81],
          fontStyle: 'bold'
        },
        bodyStyles: {
          textColor: [55, 65, 81]
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250]
        },
        margin: { left: 12, right: 12 },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 26 },
          2: { cellWidth: 18 },
          3: { cellWidth: 20 },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22 }
        },
        didParseCell: (hookData: any) => {
          if (hookData.section === 'body') {
            const rowIndex = hookData.row.index;
            const inv = data[rowIndex];
            if (inv && inv.status) {
              // Farben an UI angelehnt
              if (inv.status === 'paid') {
                hookData.cell.styles.fillColor = [220, 252, 231]; // grünlich
              } else if (inv.status === 'overdue') {
                hookData.cell.styles.fillColor = [254, 226, 226]; // rötlich
              } else if (inv.status === 'sepa') {
                hookData.cell.styles.fillColor = [219, 234, 254]; // bläulich
              } else if (inv.status === 'open') {
                hookData.cell.styles.fillColor = [239, 246, 255]; // sehr helles blau
              }
            }
          }
        }
      });

      const total = data.reduce((sum: number, inv: any) => {
        const n = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        return sum + (isNaN(n) ? 0 : (n || 0));
      }, 0);

      const finalY = (doc as any).lastAutoTable?.finalY || 32;
      doc.setFontSize(11);
      doc.text('Summe:', 150, finalY + 10, { align: 'right' });
      doc.text(this.formatCurrency(total), 196, finalY + 10, { align: 'right' });

      const fnameBase = all ? 'eingehende_rechnungen_alle' : 'eingehende_rechnungen_ansicht';
      const fileName = `${fnameBase}_${new Date().toISOString().slice(0,10)}.pdf`;
      try {
        const blobUrl = doc.output('bloburl');
        const win = window.open(blobUrl, '_blank');
        if (!win) (doc as any).save(fileName);
      } catch {
        try { (doc as any).save(fileName); } catch {}
      }
    }).catch(() => {
      alert('PDF-Export fehlgeschlagen. Bitte erneut versuchen.');
    });
  }

  trackByInvoiceId(index: number, invoice: Invoice): string {
    return invoice.id;
  }

  // Gibt das Sortiersymbol für die aktuelle Spalte zurück
  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  goBack() {
    this.router.navigate(['/admin']);
  }
}

// Add exportToPDF method inside the class above (before the closing bracket)
