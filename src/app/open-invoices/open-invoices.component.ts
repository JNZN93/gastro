import { Component, HostListener, ElementRef, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerNumber: string;
  amount: number;
  status: 'offen' | 'bezahlt' | 'überfällig';
  file?: File;
  fileName?: string;
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

  // Tabellenspalten für Tab-Navigation
  columns = [
    { key: 'invoiceNumber', label: 'Rechnungsnummer' },
    { key: 'date', label: 'Datum' },
    { key: 'dueDate', label: 'Fällig am' },
    { key: 'customerName', label: 'Kunde' },
    { key: 'customerNumber', label: 'Kundennummer' },
    { key: 'amount', label: 'Betrag (€)' },
    { key: 'status', label: 'Status' }
  ];

  ngOnInit() {
    this.loadMockInvoices();
  }

  loadMockInvoices() {
    this.invoices = [
      {
        id: '1',
        invoiceNumber: 'RG-2024-001',
        date: '2024-09-01',
        dueDate: '2024-09-30',
        customerName: 'Restaurant Zum Goldenen Hirschen',
        customerNumber: 'KUN-001',
        amount: 1250.50,
        status: 'offen'
      },
      {
        id: '2',
        invoiceNumber: 'RG-2024-002',
        date: '2024-09-05',
        dueDate: '2024-09-25',
        customerName: 'Café Central',
        customerNumber: 'KUN-002',
        amount: 875.25,
        status: 'überfällig'
      },
      {
        id: '3',
        invoiceNumber: 'RG-2024-003',
        date: '2024-09-10',
        dueDate: '2024-10-10',
        customerName: 'Hotel Kaiserhof',
        customerNumber: 'KUN-003',
        amount: 2100.75,
        status: 'bezahlt'
      },
      {
        id: '4',
        invoiceNumber: 'RG-2024-004',
        date: '2024-09-15',
        dueDate: '2024-10-15',
        customerName: 'Bistro Harmonie',
        customerNumber: 'KUN-004',
        amount: 650.00,
        status: 'offen'
      }
    ];
  }

  get filteredInvoices() {
    if (!this.searchTerm) {
      return this.invoices;
    }
    return this.invoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      invoice.customerNumber.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  get openInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'offen').length;
  }

  get overdueInvoicesCount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'überfällig').length;
  }

  get totalOpenAmount(): number {
    return this.filteredInvoices.filter(inv => inv.status === 'offen').reduce((sum, inv) => sum + inv.amount, 0);
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
    if (field === 'amount') {
      (invoice as any)[field] = parseFloat(value) || 0;
    } else {
      (invoice as any)[field] = value;
    }
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
      // Mock upload - in echter Implementierung würde hier die API aufgerufen werden
      console.log('Upload mock:', this.selectedFile.name);

      // Neue Rechnung zur Liste hinzufügen
      const newInvoice: Invoice = {
        id: Date.now().toString(),
        invoiceNumber: 'RG-2024-' + (this.invoices.length + 1).toString().padStart(3, '0'),
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        customerName: 'Neuer Kunde',
        customerNumber: 'KUN-' + (this.invoices.length + 1).toString().padStart(3, '0'),
        amount: 0,
        status: 'offen',
        file: this.selectedFile,
        fileName: this.selectedFileName
      };

      this.invoices.unshift(newInvoice);
      this.toggleUploadModal();

      // Alert für Mockup
      alert(`Rechnung "${this.selectedFileName}" wurde erfolgreich hochgeladen und zur Liste hinzugefügt!`);
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'offen': return 'status-offen';
      case 'bezahlt': return 'status-bezahlt';
      case 'überfällig': return 'status-ueberfaellig';
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
