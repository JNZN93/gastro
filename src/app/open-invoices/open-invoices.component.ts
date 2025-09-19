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
  @ViewChild('fileInput') fileInput!: ElementRef;

  invoices: Invoice[] = [];
  searchTerm: string = '';
  selectedRow: number = -1;
  selectedCol: number = -1;
  showUploadModal = false;
  selectedFile: File | null = null;
  selectedFileName: string = '';

  // Loading und Error States
  isLoading: boolean = true;
  isUploading: boolean = false;
  errorMessage: string = '';

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
          this.invoices = response.data;
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
    if (!this.searchTerm) {
      return this.invoices;
    }
    return this.invoices.filter(invoice =>
      invoice.invoice_number.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.supplier_name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.supplier_number.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  get openInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'open').length;
  }

  get overdueInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'overdue').length;
  }

  get totalOpenAmount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'open').reduce((sum, inv) => sum + inv.amount, 0);
  }

  selectCell(row: number, col: number) {
    this.selectedRow = row;
    this.selectedCol = col;
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
        this.navigateDown();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown();
        break;
      case 'ArrowLeft':
        if (event.shiftKey) {
          event.preventDefault();
          this.navigateLeft();
        }
        break;
      case 'ArrowRight':
        if (event.shiftKey) {
          event.preventDefault();
          this.navigateRight();
        }
        break;
    }
  }

  navigateTab(backward: boolean = false) {
    const filteredInvoices = this.filteredInvoices;
    if (backward) {
      this.selectedCol--;
      if (this.selectedCol < 0) {
        this.selectedCol = this.columns.length - 1;
        this.selectedRow--;
        if (this.selectedRow < 0) {
          this.selectedRow = filteredInvoices.length - 1;
        }
      }
    } else {
      this.selectedCol++;
      if (this.selectedCol >= this.columns.length) {
        this.selectedCol = 0;
        this.selectedRow++;
        if (this.selectedRow >= filteredInvoices.length) {
          this.selectedRow = 0;
        }
      }
    }
  }

  navigateUp() {
    this.selectedRow--;
    if (this.selectedRow < 0) {
      this.selectedRow = this.filteredInvoices.length - 1;
    }
  }

  navigateDown() {
    this.selectedRow++;
    if (this.selectedRow >= this.filteredInvoices.length) {
      this.selectedRow = 0;
    }
  }

  navigateLeft() {
    this.selectedCol--;
    if (this.selectedCol < 0) {
      this.selectedCol = this.columns.length - 1;
    }
  }

  navigateRight() {
    this.selectedCol++;
    if (this.selectedCol >= this.columns.length) {
      this.selectedCol = 0;
    }
  }

  updateInvoiceField(invoice: Invoice, field: keyof Invoice, value: any) {
    // Update locally first for immediate UI feedback
    (invoice as any)[field] = value;

    // Send update to API (debounced to avoid too many requests)
    this.updateInvoice(invoice.id, { [field]: value });
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
          // Update local data with server response
          const index = this.invoices.findIndex(inv => inv.id === id);
          if (index !== -1) {
            this.invoices[index] = response.data;
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

  toggleUploadModal() {
    this.showUploadModal = !this.showUploadModal;
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    } else {
      this.selectedFile = null;
      this.selectedFileName = '';
    }
  }

  uploadInvoice() {
    if (this.selectedFile) {
      this.isUploading = true;
      this.errorMessage = '';

      const formData = new FormData();
      formData.append('file', this.selectedFile);

      // Add invoice metadata as form fields
      const invoiceData = {
        invoice_number: 'INV-2024-' + (this.invoices.length + 1).toString().padStart(3, '0'),
        date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        supplier_name: 'New Supplier',
        supplier_number: 'SUP-' + (this.invoices.length + 1).toString().padStart(3, '0'),
        amount: '0',
        notes: 'Uploaded via web interface'
      };

      Object.entries(invoiceData).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${localStorage.getItem('token')}`
        // Don't set Content-Type for FormData, let browser set it with boundary
      });

      this.http.post<{success: boolean, data: Invoice, message?: string}>(
        `${environment.apiUrl}/api/incoming-invoices/upload`,
        formData,
        { headers }
      ).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.invoices.unshift(response.data);
            this.toggleUploadModal();
            alert(`Invoice "${this.selectedFileName}" was successfully uploaded and added to the list!`);
          } else {
            this.errorMessage = response.message || 'Failed to upload invoice';
          }
          this.isUploading = false;
        },
        error: (error) => {
          console.error('Error uploading invoice:', error);
          this.errorMessage = 'Failed to upload invoice. Please try again.';
          this.isUploading = false;
        }
      });
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'open': return 'status-open';
      case 'paid': return 'status-paid';
      case 'overdue': return 'status-overdue';
      default: return '';
    }
  }

  formatCurrency(amount: number): string {
    return amount.toFixed(2).replace('.', ',') + ' €';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  }

  trackByInvoiceId(index: number, invoice: Invoice): string {
    return invoice.id;
  }
}
