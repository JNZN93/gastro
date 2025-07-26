import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';
import { AuthService } from '../authentication.service';

interface OrderItem {
  product_id: number;
  quantity: number;
  price: string;
  different_price: string | null;
  product_name: string;
  product_article_number: string;
}

interface Order {
  order_id: number;
  user_id: number;
  email: string;
  name: string;
  company: string;
  customer_number: string;
  total_price: string;
  fulfillment_type: string;
  order_date: string;
  created_at: string;
  shipping_address: string;
  payment_status: string;
  delivery_date: string;
  status: string;
  role?: string; // Neues role-Attribut
  items: OrderItem[];
}

interface OrdersResponse {
  orders: Order[];
}

@Component({
  selector: 'app-order-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-overview.component.html',
  styleUrls: ['./order-overview.component.scss']
})
export class OrderOverviewComponent implements OnInit {
  orders: Order[] = [];
  selectedOrder: Order | null = null;
  isLoading = false;
  searchTerm = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        if (response?.user?.role !== 'admin') {
          this.router.navigate(['/login']);
        }
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      }
    });
  }

  loadOrders() {
    this.isLoading = true;
    const token = localStorage.getItem('token');
    
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get<OrdersResponse>('https://multi-mandant-ecommerce.onrender.com/api/orders/all-orders', { headers })
      .subscribe({
        next: (response) => {
          console.log('Server Response:', response); // Debug-Log
          this.orders = response.orders || [];
          console.log('Processed Orders:', this.orders); // Debug-Log
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Bestellungen:', error);
          this.orders = [];
          this.isLoading = false;
        }
      });
  }

  get filteredOrders(): Order[] {
    if (!this.searchTerm) {
      return this.orders;
    }
    return this.orders.filter(order => 
      order.order_id?.toString().includes(this.searchTerm) ||
      order.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.company?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.email?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      (order.role && order.role.toLowerCase().includes(this.searchTerm.toLowerCase()))
    );
  }

  onOrderClick(order: Order) {
    this.selectedOrder = order;
  }

  closeOrderDetails() {
    this.selectedOrder = null;
  }

  generatePdf(order: Order) {
    const doc = new jsPDF();

    // Titel
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Kommissionierungsschein', 14, 20);

    // Bestellinformationen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    // Bestellnummer und weitere Infos
    doc.text('Bestellnummer: ' + order.order_id, 14, 40);

    // Datum und Uhrzeit konvertieren
    const orderDateFormatted = new Date(order.order_date).toLocaleDateString();
    const createdAtFormatted = new Date(order.created_at).toLocaleTimeString();

    doc.text('Datum: ' + orderDateFormatted, 14, 50);
    doc.text('Erstellt um: ' + createdAtFormatted, 14, 60);
    doc.text('Kunde: ' + order.customer_number, 14, 70);
    doc.text('E-Mail: ' + order.email, 14, 80);
    doc.text('Lieferart: ' + (order.fulfillment_type === 'delivery' ? 'Lieferung' : 'Abholung'), 14, 100);

    // Zusätzliche Bestellinformationen
    doc.text('Firma: ' + (order.company ? order.company : 'Keine Angabe'), 14, 110);
    doc.text('Lieferadresse: ' + (order.shipping_address ? order.shipping_address : 'Keine Angabe'), 14, 120);
    doc.text('Liefer-/ Abholdatum: ' + this.formatDate(order.delivery_date), 14, 130);

    // Trennlinie
    doc.line(14, 135, 200, 135);

    // Artikelüberschrift
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Menge', 14, 145);
    doc.text('Artikel', 40, 145);
    doc.text('Artikelnr.', 120, 145);
    doc.text('Preis', 160, 145);

    // Artikel und Mengen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let yPosition = 155;
    const lineHeight = 10;
    const pageHeight = 297; // A4 in mm
    const bottomMargin = 20;

    order.items.forEach((product, index) => {
      // Wenn yPosition zu weit unten ist, neue Seite
      if (yPosition + lineHeight > pageHeight - bottomMargin) {
        doc.addPage();
        doc.text('Bestellnummer: ' + order.order_id, 14, 40);
        doc.text('Kunde: ' + order.customer_number, 14, 50);
        yPosition = 60;

        // Tabellenüberschrift auf neuer Seite wiederholen
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Menge', 14, yPosition);
        doc.text('Artikel', 40, yPosition);
        doc.text('Artikelnr.', 120, yPosition);
        doc.text('Preis', 160, yPosition);
        yPosition += 10;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
      }

      // Artikeldaten
      doc.text(String(product.quantity), 14, yPosition);
      doc.text(product.product_name, 40, yPosition);
      doc.text(product.product_article_number, 120, yPosition);
      
      // Preis anzeigen (kundenspezifisch oder normal)
      const displayPrice = product.different_price || product.price;
      const priceText = parseFloat(displayPrice).toFixed(2) + ' €';
      doc.text(priceText, 160, yPosition);

      yPosition += lineHeight;
    });

    // Gesamtbetrag
    if (order.total_price) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      const totalPrice = parseFloat(order.total_price);
      doc.text('Gesamtpreis: ' + totalPrice.toFixed(2) + ' €', 14, yPosition + 10);
    }

    // PDF-Dokument öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';

    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'open': return 'status-open';
      case 'in_progress': return 'status-progress';
      case 'completed': return 'status-completed';
      case 'archived': return 'status-archived';
      default: return 'status-default';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'open': return 'Offen';
      case 'in_progress': return 'In Bearbeitung';
      case 'completed': return 'Abgeschlossen';
      case 'archived': return 'Archiviert';
      default: return 'Unbekannt';
    }
  }

  getPaymentStatusText(status: string): string {
    switch (status) {
      case 'paid': return 'Bezahlt';
      case 'pending': return 'Ausstehend';
      case 'failed': return 'Fehlgeschlagen';
      default: return 'Unbekannt';
    }
  }

  formatPrice(price: string): string {
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? '0.00' : numPrice.toFixed(2);
  }

  getItemTotal(price: string, quantity: number): number {
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? 0 : numPrice * quantity;
  }

  isEmployee(order: Order): boolean {
    return order.role === 'admin' || order.role === 'employee';
  }

  getCustomerDisplayName(order: Order): string {
    if (this.isEmployee(order)) {
      return '-'; // Keine Anzeige für admin/employee in der Kundenspalte
    }
    return order.name;
  }

  getEmployeeDisplayName(order: Order): string {
    if (this.isEmployee(order)) {
      return order.name;
    }
    return '-'; // Keine Anzeige für normale Kunden in der Sachbearbeiter-Spalte
  }
} 