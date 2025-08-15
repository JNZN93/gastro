import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';
import { AuthService } from '../authentication.service';
import { OrderService } from '../order.service';
import { GlobalService } from '../global.service';
import { ArtikelDataService } from '../artikel-data.service';

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
  showDeleteModal = false;
  orderToDelete: Order | null = null;
  isDeleting = false;
  deleteConfirmationText = '';
  showConfirmationError = false;
  showDeleteAllModal = false;
  isDeletingAll = false;
  deleteAllConfirmationText = '';
  showDeleteAllConfirmationError = false;
  userRole: string = '';
  
  // Mapping Kundennummer -> Kundenname
  private customerNameByNumber: Record<string, string> = {};
  
  // Alle Artikel inkl. PFAND für die custom_field_1 Überprüfung (nur bei Kundenbestellungen)
  allArtikels: any[] = [];

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService,
    private orderService: OrderService,
    private globalService: GlobalService,
    private artikelService: ArtikelDataService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
    this.loadCustomers();
    this.loadAllArtikels();
  }

  // Neue Methode zum Laden aller Artikel (inkl. PFAND)
  loadAllArtikels(): void {
    this.artikelService.getData().subscribe({
      next: (response) => {
        // Alle Artikel inkl. PFAND für die custom_field_1 Überprüfung
        this.allArtikels = response;
        console.log('✅ [ORDER-OVERVIEW] Alle Artikel geladen (inkl. PFAND):', this.allArtikels.length);
      },
      error: (error) => {
        console.error('❌ [ORDER-OVERVIEW] Fehler beim Laden der Artikel:', error);
      }
    });
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        // Erlaube Zugriff für Admin und Employee
        if (response?.user?.role !== 'admin' && response?.user?.role !== 'employee') {
          this.router.navigate(['/login']);
        } else {
          this.userRole = response.user.role;
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
          this.orders = response.orders || [];
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Bestellungen:', error);
          this.orders = [];
          this.isLoading = false;
        }
      });
  }

  private loadCustomers() {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    this.http.get<any[]>(
      'https://multi-mandant-ecommerce.onrender.com/api/customers',
      { headers }
    ).subscribe({
      next: (data) => {
        const map: Record<string, string> = {};
        for (const customer of data || []) {
          const numberStr = String(customer?.customer_number ?? '').trim();
          const nameStr = String(customer?.last_name_company ?? customer?.name ?? '').trim();
          if (numberStr && nameStr) {
            map[numberStr] = nameStr;
          }
        }
        this.customerNameByNumber = map;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Kunden:', error);
      }
    });
  }

  get filteredOrders(): Order[] {
    if (!this.searchTerm) {
      return this.orders;
    }
    const term = this.searchTerm.toLowerCase();
    return this.orders.filter(order => {
      const mappedCustomerName = (this.getCustomerDisplayName(order) || '').toLowerCase();
      return (
        order.order_id?.toString().includes(this.searchTerm) ||
        order.name?.toLowerCase().includes(term) ||
        order.company?.toLowerCase().includes(term) ||
        order.email?.toLowerCase().includes(term) ||
        order.customer_number?.toLowerCase().includes(term) ||
        (order.role && order.role.toLowerCase().includes(term)) ||
        (mappedCustomerName && mappedCustomerName.includes(term))
      );
    });
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
    doc.text('Kunde: ' + this.getCustomerDisplayName(order), 14, 70);
    doc.text('E-Mail: ' + order.email, 14, 80);
    doc.text('Lieferart: ' + (order.fulfillment_type === 'delivery' ? 'Lieferung' : 'Abholung'), 14, 100);

    // Zusätzliche Bestellinformationen
    // Firma wird nicht mehr ausgegeben; stattdessen nur Kunde (oben) und die Adresse
    doc.text('Lieferadresse: ' + (order.shipping_address ? order.shipping_address : 'Keine Angabe'), 14, 110);
    doc.text('Liefer-/ Abholdatum: ' + this.formatDate(order.delivery_date), 14, 120);

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
        doc.text('Kunde: ' + this.getCustomerDisplayName(order), 14, 50);
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

  isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  getCustomerDisplayName(order: Order): string {
    const key = String(order.customer_number ?? '').trim();
    if (key) {
      const mapped = this.customerNameByNumber[key];
      if (mapped && mapped.trim()) {
        return mapped;
      }
      return `Kunde ${key}`;
    }
    if (this.isEmployee(order)) {
      return '-';
    }
    return order.name;
  }

  getEmployeeDisplayName(order: Order): string {
    if (this.isEmployee(order)) {
      return order.name;
    }
    return '-'; // Keine Anzeige für normale Kunden in der Sachbearbeiter-Spalte
  }

  deleteOrder(order: Order) {
    this.orderToDelete = order;
    this.showDeleteModal = true;
    this.deleteConfirmationText = '';
    this.showConfirmationError = false;
  }

  cancelDelete() {
    this.showDeleteModal = false;
    this.orderToDelete = null;
    this.isDeleting = false;
    this.deleteConfirmationText = '';
    this.showConfirmationError = false;
  }

  isConfirmationValid(): boolean {
    return this.deleteConfirmationText === this.orderToDelete?.order_id?.toString();
  }

  confirmDelete() {
    if (!this.orderToDelete) return;

    // Überprüfe, ob die Bestätigung korrekt ist
    if (!this.isConfirmationValid()) {
      this.showConfirmationError = true;
      return;
    }

    this.isDeleting = true;
    this.showConfirmationError = false;
    const token = localStorage.getItem('token');

    this.orderService.deleteOrder(this.orderToDelete.order_id, token).subscribe({
      next: (response) => {
        console.log('Bestellung erfolgreich gelöscht:', response);
        // Bestellung aus der lokalen Liste entfernen
        this.orders = this.orders.filter(order => order.order_id !== this.orderToDelete!.order_id);
        this.showDeleteModal = false;
        this.orderToDelete = null;
        this.isDeleting = false;
        this.deleteConfirmationText = '';
        this.showConfirmationError = false;
      },
      error: (error) => {
        console.error('Fehler beim Löschen der Bestellung:', error);
        this.isDeleting = false;
        // Hier könnte man eine Fehlermeldung anzeigen
      }
    });
  }

  deleteAllOrders() {
    this.showDeleteAllModal = true;
    this.deleteAllConfirmationText = '';
    this.showDeleteAllConfirmationError = false;
  }

  cancelDeleteAll() {
    this.showDeleteAllModal = false;
    this.isDeletingAll = false;
    this.deleteAllConfirmationText = '';
    this.showDeleteAllConfirmationError = false;
  }

  isDeleteAllConfirmationValid(): boolean {
    return this.deleteAllConfirmationText === 'ALLE LÖSCHEN';
  }

  confirmDeleteAll() {
    // Überprüfe, ob die Bestätigung korrekt ist
    if (!this.isDeleteAllConfirmationValid()) {
      this.showDeleteAllConfirmationError = true;
      return;
    }

    this.isDeletingAll = true;
    this.showDeleteAllConfirmationError = false;
    const token = localStorage.getItem('token');

    this.orderService.deleteAllOrders(token).subscribe({
      next: (response) => {
        console.log('Alle Bestellungen erfolgreich gelöscht:', response);
        // Alle Bestellungen aus der lokalen Liste entfernen
        this.orders = [];
        this.showDeleteAllModal = false;
        this.isDeletingAll = false;
        this.deleteAllConfirmationText = '';
        this.showDeleteAllConfirmationError = false;
      },
      error: (error) => {
        console.error('Fehler beim Löschen aller Bestellungen:', error);
        this.isDeletingAll = false;
        // Hier könnte man eine Fehlermeldung anzeigen
      }
    });
  }

  // Neue Methode zum Laden einer Bestellung in die Customer Orders Komponente
  loadOrderToCustomerOrders(order: Order): void {
    console.log('🔄 [LOAD-ORDER] Lade Bestellung in Customer Orders:', order);
    
    // Transformiere die Bestelldaten in das erwartete Format für Customer Orders
    // Verwende nur die Kundennummer - die Kundendaten werden später aus der Datenbank geladen
    const orderData = {
      customer: {
        id: 0, // Wird später aus der Kundendatenbank gesetzt
        customer_number: order.customer_number || order.order_id.toString(),
        last_name_company: '', // Wird später aus der Kundendatenbank geladen
        name_addition: '',
        email: '', // Wird später aus der Kundendatenbank geladen
        street: '', // Wird später aus der Kundendatenbank geladen
        city: '',
        postal_code: '',
        _country_code: ''
      },
      items: order.items.map((item: OrderItem) => ({
        id: item.product_id, // Transformiere product_id zu id für Backend-Kompatibilität
        article_number: item.product_article_number,
        article_text: item.product_name,
        sale_price: parseFloat(item.price),
        quantity: item.quantity,
        different_price: item.different_price ? parseFloat(item.different_price) : null,
        description: item.product_name,
        cost_price: 0,
        original_price: parseFloat(item.price)
      })),
      differentCompanyName: '' // Kein differentCompanyName beim Import, da die Kundendaten aus der Datenbank geladen werden
    };

    // Custom Field 1 Überprüfung NUR bei Kundenbestellungen (ohne Sachbearbeiter-Rolle)
    if (!this.isEmployee(order)) {
      console.log('🔍 [LOAD-ORDER] Kundenbestellung erkannt - starte Custom Field 1 Überprüfung...');
      console.log('🔍 [LOAD-ORDER] Anzahl alle Artikel (inkl. PFAND):', this.allArtikels.length);
      console.log('🔍 [LOAD-ORDER] Anzahl Bestellartikel:', orderData.items.length);
      
      if (this.allArtikels && this.allArtikels.length > 0) {
        const enhancedItems: any[] = [];
        
        // Durchlaufe alle Artikel der Bestellung
        orderData.items.forEach((item: any, index: number) => {
          console.log(`\n📦 [LOAD-ORDER] Verarbeite Bestellartikel ${index + 1}:`, JSON.stringify(item, null, 2));
          
          // Füge den ursprünglichen Artikel hinzu
          enhancedItems.push(item);
          
          // Suche nach dem Artikel in allen Artikeln (inkl. PFAND) basierend auf article_number
          console.log(`🔍 [LOAD-ORDER] Suche nach Artikel mit article_number: "${item.article_number}" in allen Artikeln...`);
          
          const globalArtikel = this.allArtikels.find(artikel => 
            artikel.article_number === item.article_number
          );
          
          if (globalArtikel) {
            console.log(`✅ [LOAD-ORDER] Artikel in globalArtikels gefunden:`, JSON.stringify(globalArtikel, null, 2));
            console.log(`🔍 [LOAD-ORDER] custom_field_1 Wert: "${globalArtikel.custom_field_1}"`);
            
            if (globalArtikel.custom_field_1) {
              console.log(`🔍 [LOAD-ORDER] Artikel ${item.article_text} (${item.article_number}) hat custom_field_1: ${globalArtikel.custom_field_1}`);
              
              // Suche nach dem Artikel, der in custom_field_1 referenziert wird
              console.log(`🔍 [LOAD-ORDER] Suche nach Artikel mit article_number: "${globalArtikel.custom_field_1}" in allen Artikeln...`);
              
              const customFieldArtikel = this.allArtikels.find(artikel => 
                artikel.article_number === globalArtikel.custom_field_1
              );
              
              if (customFieldArtikel) {
                console.log(`✅ [LOAD-ORDER] Custom Field Artikel gefunden:`, JSON.stringify(customFieldArtikel, null, 2));
                
                // Erstelle einen neuen Artikel-Eintrag mit der gleichen Menge
                const newItem = {
                  id: customFieldArtikel.id,
                  article_number: customFieldArtikel.article_number,
                  article_text: customFieldArtikel.article_text,
                  sale_price: customFieldArtikel.sale_price,
                  quantity: item.quantity, // Gleiche Menge wie der ursprüngliche Artikel
                  different_price: undefined,
                  description: customFieldArtikel.article_text,
                  cost_price: customFieldArtikel.cost_price || 0,
                  original_price: customFieldArtikel.sale_price
                };
                
                console.log(`✅ [LOAD-ORDER] Neuer Artikel wird hinzugefügt:`, JSON.stringify(newItem, null, 2));
                
                enhancedItems.push(newItem);
                console.log(`✅ [LOAD-ORDER] Artikel ${customFieldArtikel.article_text} (${customFieldArtikel.article_number}) mit Menge ${item.quantity} hinzugefügt`);
              } else {
                console.warn(`⚠️ [LOAD-ORDER] Artikel mit custom_field_1 ${globalArtikel.custom_field_1} nicht in globalArtikels gefunden`);
              }
            } else {
              console.log(`ℹ️ [LOAD-ORDER] Artikel ${item.article_text} (${item.article_number}) hat kein custom_field_1`);
            }
          } else {
            console.warn(`⚠️ [LOAD-ORDER] Artikel mit article_number "${item.article_number}" nicht in allen Artikeln gefunden`);
          }
        });
        
        // Aktualisiere die Items mit den erweiterten Artikeln
        orderData.items = enhancedItems;
        console.log(`📦 [LOAD-ORDER] Custom Field 1 Überprüfung abgeschlossen. Artikel vorher: ${orderData.items.length}, nachher: ${enhancedItems.length}`);
      } else {
        console.log('⚠️ [LOAD-ORDER] Keine Artikel verfügbar, überspringe Custom Field 1 Überprüfung');
      }
    } else {
      console.log('ℹ️ [LOAD-ORDER] Sachbearbeiter-Bestellung erkannt - überspringe Custom Field 1 Überprüfung');
    }

    console.log('📦 [LOAD-ORDER] Artikel werden zur Customer Orders Komponente weitergeleitet');
    console.log('📦 [LOAD-ORDER] Anzahl Artikel:', orderData.items.length);
    orderData.items.forEach((item: any) => {
      console.log(`📦 [LOAD-ORDER] Artikel: ${item.article_text} (${item.article_number}) - ID: ${item.id}`);
    });

    // Speichere die Bestelldaten im localStorage für die Customer Orders Komponente
    localStorage.setItem('pendingOrderData', JSON.stringify(orderData));
    
    console.log('💾 [LOAD-ORDER] Bestelldaten im localStorage gespeichert');
    
    // Navigiere zur Customer Orders Seite
    this.router.navigate(['/customer-orders']);
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }
} 