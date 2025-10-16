import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';
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
  tax_code?: number;
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
  customer_notes?: string; // Kundenanmerkungen
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

    this.http.get<OrdersResponse>(`${environment.apiUrl}/api/orders/all-orders`, { headers })
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
      `${environment.apiUrl}/api/customers`,
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

    //test

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
    
    // Speichere den ursprünglichen Status vor der Bearbeitung
    const originalStatus = order.status;
    console.log('💾 [LOAD-ORDER] Ursprünglicher Status gespeichert:', originalStatus);
    
    // Setze den Status auf "in_progress" wenn die Bestellung bearbeitet wird
    if (order.status !== 'in_progress') {
      console.log('📝 [LOAD-ORDER] Setze Status auf "in_progress" für Bestellung:', order.order_id);
      this.updateOrderStatusToInProgress(order);
    }
    
    // Transformiere die Bestelldaten in das erwartete Format für Customer Orders
    // Verwende nur die Kundennummer - die Kundendaten werden später aus der Datenbank geladen
    const orderData = {
      editMode: true, // ✅ Aktiviere Bearbeitungsmodus
      editingOrderId: order.order_id, // ✅ Speichere die Order-ID für Update (PUT)
      originalStatus: originalStatus, // ✅ Speichere den ursprünglichen Status
      orderDate: order.order_date || null, // Übernehme das Bestelldatum
      deliveryDate: order.delivery_date || null, // Übernehme das Lieferdatum
      customerNotes: order.customer_notes || '', // Übernehme die Kundenanmerkungen
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
        original_price: parseFloat(item.price),
        tax_code: item.tax_code || 1 // MwSt-Code für Bruttopreis-Berechnung
      })),
      differentCompanyName: '' // Kein differentCompanyName beim Import, da die Kundendaten aus der Datenbank geladen werden
    };

    // PFAND-Logik entfernt - Bestellungen werden ohne automatische PFAND-Ergänzung geladen
    console.log('📦 [LOAD-ORDER] Bestellung wird ohne PFAND-Logik geladen');
    console.log('📦 [LOAD-ORDER] Anzahl Artikel:', orderData.items.length);
    
    // Kategorie-Sortierung beibehalten (auch für bereits vorhandene PFAND-Artikel)
    if (!this.isEmployee(order) && this.allArtikels && this.allArtikels.length > 0) {
      console.log('📂 [LOAD-ORDER] Sortiere Artikel nach Kategorien...');
      orderData.items = this.sortItemsByCategory(orderData.items);
      console.log('✅ [LOAD-ORDER] Artikel nach Kategorien sortiert');
    } else if (this.isEmployee(order)) {
      console.log('ℹ️ [LOAD-ORDER] Sachbearbeiter-Bestellung erkannt - überspringe Kategorie-Sortierung');
    } else {
      console.log('⚠️ [LOAD-ORDER] Keine Artikel verfügbar, überspringe Kategorie-Sortierung');
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

  /**
   * Aktualisiert den Status einer Bestellung auf "in_progress"
   * @param order Die zu aktualisierende Bestellung
   */
  private updateOrderStatusToInProgress(order: Order): void {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ [UPDATE-STATUS] Kein Token gefunden');
      return;
    }

    console.log('🔄 [UPDATE-STATUS] Aktualisiere Status für Bestellung:', order.order_id);
    
    // Verwende den neuen Status-Only Endpoint
    this.orderService.updateOrderStatusOnly(order.order_id, 'in_progress', token).subscribe({
      next: (response) => {
        console.log('✅ [UPDATE-STATUS] Status erfolgreich aktualisiert:', response);
        // Aktualisiere den lokalen Status
        order.status = 'in_progress';
        // Aktualisiere die Bestellung in der Liste
        const orderIndex = this.orders.findIndex(o => o.order_id === order.order_id);
        if (orderIndex !== -1) {
          this.orders[orderIndex].status = 'in_progress';
        }
      },
      error: (error) => {
        console.error('❌ [UPDATE-STATUS] Fehler beim Aktualisieren des Status:', error);
        // Auch bei Fehler weiterleiten, da die Bearbeitung trotzdem möglich ist
      }
    });
  }

  /**
   * Sortiert Artikel nach Kategorien basierend auf den globalen Artikeldaten
   * @param items Array der zu sortierenden Artikel
   * @returns Nach Kategorien sortiertes Array
   */
  private sortItemsByCategory(items: any[]): any[] {
    if (!this.allArtikels || this.allArtikels.length === 0) {
      console.log('⚠️ [SORT-CATEGORY] Keine globalen Artikel verfügbar, überspringe Sortierung');
      return items;
    }

    // Definiere die gewünschte Reihenfolge der Kategorien
    const categoryOrder = [
      'GEMÜSE',
      'OBST', 
      'MILCHPRODUKTE',
      'FLEISCH',
      'FISCH',
      'BROT & GEBÄCK',
      'GETRÄNKE',
      'GEWÜRZE',
      'KONSERVEN',
      'TIEFKÜHL',
      'HYGIENE',
      'KÜCHENBEDARF',
      'PFAND',
      'SCHNELLVERKAUF',
      'Sonstiges'
    ];

    // Erweitere jeden Artikel um seine Kategorie
    const itemsWithCategory = items.map(item => {
      const globalArtikel = this.allArtikels.find(artikel => 
        artikel.article_number === item.article_number
      );
      
      if (globalArtikel && globalArtikel.category) {
        return {
          ...item,
          category: globalArtikel.category
        };
      } else {
        return {
          ...item,
          category: 'Sonstiges'
        };
      }
    });

    // Gruppiere zusammengehörige Artikel (Hauptartikel + custom_field_1)
    const groupedItems: any[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < itemsWithCategory.length; i++) {
      if (processedIndices.has(i)) continue;

      const currentItem = itemsWithCategory[i];
      const currentGlobalArtikel = this.allArtikels.find(artikel => 
        artikel.article_number === currentItem.article_number
      );

      // Prüfe, ob der aktuelle Artikel ein custom_field_1 hat
      if (currentGlobalArtikel && currentGlobalArtikel.custom_field_1) {
        // Suche nach dem custom_field_1 Artikel in den nächsten Artikeln
        let customFieldItem: any = null;
        let customFieldIndex = -1;

        // Suche in den nächsten Artikeln nach dem custom_field_1
        for (let j = i + 1; j < itemsWithCategory.length; j++) {
          if (itemsWithCategory[j].article_number === currentGlobalArtikel.custom_field_1) {
            customFieldItem = itemsWithCategory[j];
            customFieldIndex = j;
            break;
          }
        }

        if (customFieldItem) {
          // Füge Hauptartikel und custom_field_1 als Gruppe hinzu
          groupedItems.push({
            ...currentItem,
            isGroup: true,
            groupId: i,
            sortCategory: currentItem.category
          });
          groupedItems.push({
            ...customFieldItem,
            isGroup: true,
            groupId: i,
            sortCategory: currentItem.category // Verwende die Kategorie des Hauptartikels
          });
          
          // Markiere beide als verarbeitet
          processedIndices.add(i);
          processedIndices.add(customFieldIndex);
          
          console.log(`📦 [SORT-CATEGORY] Gruppe erstellt: ${currentItem.article_text} + ${customFieldItem.article_text} (Kategorie: ${currentItem.category})`);
        } else {
          // Kein custom_field_1 gefunden, füge nur den Hauptartikel hinzu
          groupedItems.push({
            ...currentItem,
            isGroup: false,
            groupId: null,
            sortCategory: currentItem.category
          });
          processedIndices.add(i);
        }
      } else {
        // Kein custom_field_1, füge den Artikel normal hinzu
        groupedItems.push({
          ...currentItem,
          isGroup: false,
          groupId: null,
          sortCategory: currentItem.category
        });
        processedIndices.add(i);
      }
    }

    // Sortiere nach der definierten Kategoriereihenfolge, aber behalte Gruppen zusammen
    const sortedItems = groupedItems.sort((a, b) => {
      const indexA = categoryOrder.indexOf(a.sortCategory);
      const indexB = categoryOrder.indexOf(b.sortCategory);
      
      // Wenn beide Kategorien in der definierten Reihenfolge sind
      if (indexA !== -1 && indexB !== -1) {
        // Wenn beide zur gleichen Gruppe gehören, behalte die Reihenfolge bei
        if (a.isGroup && b.isGroup && a.groupId === b.groupId) {
          return 0; // Keine Änderung der Reihenfolge innerhalb der Gruppe
        }
        return indexA - indexB;
      }
      
      // Wenn nur eine Kategorie in der definierten Reihenfolge ist
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // Wenn beide Kategorien nicht in der definierten Reihenfolge sind, alphabetisch sortieren
      return a.sortCategory.localeCompare(b.sortCategory);
    });

    // Entferne die temporären Sortierfelder
    const finalItems = sortedItems.map(item => {
      const { isGroup, groupId, sortCategory, ...cleanItem } = item;
      return cleanItem;
    });

    console.log('📂 [SORT-CATEGORY] Artikel nach Kategorien sortiert (Gruppen beibehalten):');
    finalItems.forEach((item, index) => {
      const globalArtikel = this.allArtikels.find(artikel => 
        artikel.article_number === item.article_number
      );
      const category = globalArtikel?.category || 'Sonstiges';
      console.log(`  ${index + 1}. ${item.article_text} - Kategorie: ${category}`);
    });

    return finalItems;
  }

  // Hilfsmethode um zu prüfen, ob eine Bestellung bearbeitbar ist
  isOrderEditable(order: Order): boolean {
    return order.status === 'open' || order.status === 'in_progress' || order.status === 'completed';
  }

  // Methode zum Bearbeiten einer offenen Bestellung
  editOrder(order: Order): void {
    console.log('✏️ [EDIT-ORDER] Bearbeite offene Bestellung:', order);
    
    // Prüfe, ob die Bestellung bearbeitbar ist
    if (!this.isOrderEditable(order)) {
      console.warn('⚠️ [EDIT-ORDER] Bestellung ist nicht bearbeitbar. Status:', order.status);
      return;
    }
    
    // Speichere den ursprünglichen Status vor der Bearbeitung
    const originalStatus = order.status;
    console.log('💾 [EDIT-ORDER] Ursprünglicher Status gespeichert:', originalStatus);
    
    // Setze den Status auf "in_progress" wenn die Bestellung bearbeitet wird
    if (order.status !== 'in_progress') {
      console.log('📝 [EDIT-ORDER] Setze Status auf "in_progress" für Bestellung:', order.order_id);
      this.updateOrderStatusToInProgress(order);
    }
    
    // Transformiere die Bestelldaten in das erwartete Format für Customer Orders
    const orderData = {
      customer: {
        id: 0,
        customer_number: order.customer_number || order.order_id.toString(),
        last_name_company: '',
        name_addition: '',
        email: '',
        street: '',
        city: '',
        postal_code: '',
        _country_code: ''
      },
      items: order.items.map((item: OrderItem) => ({
        id: item.product_id,
        article_number: item.product_article_number,
        article_text: item.product_name,
        sale_price: parseFloat(item.price),
        quantity: item.quantity,
        different_price: item.different_price ? parseFloat(item.different_price) : null,
        description: item.product_name,
        cost_price: 0,
        original_price: parseFloat(item.price),
        tax_code: item.tax_code || 1 // MwSt-Code für Bruttopreis-Berechnung
      })),
      differentCompanyName: '',
      editMode: true, // Flag für Bearbeitungsmodus
      editingOrderId: order.order_id, // Speichere die Order ID
      originalStatus: originalStatus, // ✅ Speichere den ursprünglichen Status
      orderDate: order.order_date,
      deliveryDate: order.delivery_date,
      customerNotes: order.customer_notes || '' // Übernehme die Kundenanmerkungen
    };

    // Kategorie-Sortierung beibehalten
    if (!this.isEmployee(order) && this.allArtikels && this.allArtikels.length > 0) {
      console.log('📂 [EDIT-ORDER] Sortiere Artikel nach Kategorien...');
      orderData.items = this.sortItemsByCategory(orderData.items);
      console.log('✅ [EDIT-ORDER] Artikel nach Kategorien sortiert');
    }

    // Speichere die Bestelldaten im localStorage für die Customer Orders Komponente
    localStorage.setItem('pendingOrderData', JSON.stringify(orderData));
    
    console.log('💾 [EDIT-ORDER] Bestelldaten im localStorage gespeichert (Bearbeitungsmodus)');
    
    // Navigiere zur Customer Orders Seite
    this.router.navigate(['/customer-orders']);
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  // Hilfsmethode um MwSt-Rate basierend auf tax_code zu bekommen
  getTaxRate(taxCode?: number): number {
    switch (taxCode) {
      case 1: return 0.19; // 19% MwSt
      case 2: return 0.07; // 7% MwSt
      case 3: return 0.00; // 0% MwSt
      default: return 0.19; // Standard: 19% MwSt
    }
  }

  // Hilfsmethode um den MwSt-Prozentsatz als String zu bekommen
  getTaxRatePercent(taxCode?: number): string {
    const rate = this.getTaxRate(taxCode);
    return (rate * 100).toFixed(0) + '%';
  }

  // Hilfsmethode um Bruttopreis zu berechnen (Netto + MwSt)
  getGrossPrice(netPrice: number, taxCode?: number): number {
    const taxRate = this.getTaxRate(taxCode);
    return netPrice * (1 + taxRate);
  }

  // Hilfsmethode um den Bruttopreis für ein OrderItem zu bekommen
  getItemGrossPrice(item: OrderItem): number {
    const netPrice = parseFloat(item.different_price || item.price);
    return this.getGrossPrice(netPrice, item.tax_code);
  }

  // Hilfsmethode um den Gesamt-Bruttopreis einer Bestellung zu berechnen
  getOrderTotalGross(order: Order): number {
    return order.items.reduce((sum, item) => {
      const netPrice = parseFloat(item.different_price || item.price);
      const grossPrice = this.getGrossPrice(netPrice, item.tax_code);
      const quantity = Number(item.quantity) || 0;
      return sum + (grossPrice * quantity);
    }, 0);
  }
} 