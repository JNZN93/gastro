import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { OrderService } from '../order.service';
import { jsPDF } from 'jspdf';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { UploadLoadingComponent } from "../upload-loading/upload-loading.component";
import { GlobalService } from '../global.service';
import { ArtikelDataService } from '../artikel-data.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin',
  imports: [RouterModule, CommonModule, FormsModule, UploadLoadingComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  @ViewChild('customerFileInput') customerFileInput!: ElementRef;
  @ViewChild('customerArticlePricesFileInput') customerArticlePricesFileInput!: ElementRef;
  @ViewChild('articlesFileInput') articlesFileInput!: ElementRef;
  orders: any[] = [];
  xmlContent: any;
  showModal = false;
  showUploadModal = false;
  selectedOrder: any = null;
  newStatus: string = '';
  isLoading: boolean = true;
  isVisible: boolean = true;
  isUploading: boolean = false;
  searchTerm: string = '';
  
  // Properties für ausgewählte Dateien
  selectedCustomerFile: string = '';
  selectedCustomerArticlePricesFile: string = '';
  selectedArticlesFile: string = '';
  
  // Globale Artikel für die Überprüfung von custom_field_1
  globalArtikels: any[] = [];
  // Alle Artikel inkl. PFAND für die custom_field_1 Überprüfung
  allArtikels: any[] = [];
  
  // Kundendaten für die Anzeige der Kundennamen
  customers: any[] = [];
  customerNameMap: { [key: string]: string } = {};

  constructor(
    private router: Router,
    private orderService: OrderService,
    private http: HttpClient,
    private authService: AuthService,
    public globalService: GlobalService,
    private artikelService: ArtikelDataService
  ) { }

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
    this.loadAllArtikels();
    this.loadCustomers();
  }

  // Neue Methode zum Laden der Kundendaten
  loadCustomers(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    this.http.get<any[]>(`${environment.apiUrl}/api/customers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }).subscribe({
      next: (customers) => {
        this.customers = customers || [];
        // Erstelle eine Map von Kundennummer zu Kundennamen (wie in Order-Overview)
        this.customerNameMap = {};
        customers.forEach(customer => {
          const numberStr = String(customer?.customer_number ?? '').trim();
          const nameStr = String(customer?.last_name_company ?? customer?.name ?? '').trim();
          if (numberStr && nameStr) {
            this.customerNameMap[numberStr] = nameStr;
          }
        });
        console.log('✅ [ADMIN] Kundendaten geladen:', this.customers.length);
      },
      error: (error) => {
        console.error('❌ [ADMIN] Fehler beim Laden der Kundendaten:', error);
      }
    });
  }

  // Methode zum Abrufen des Kundennamens basierend auf der Kundennummer
  getCustomerName(order: any): string {
    // Wenn bereits ein Name vorhanden ist, verwende diesen
    if (order.name && order.name.trim() !== '') {
      return order.name;
    }
    
    // Wenn nur eine Kundennummer vorhanden ist, suche nach dem Kundennamen
    if (order.customer_number && this.customerNameMap[order.customer_number]) {
      return this.customerNameMap[order.customer_number];
    }
    
    // Fallback: Zeige Kundennummer an
    return order.customer_number || 'Unbekannter Kunde';
  }

  // Methode zum Prüfen, ob eine Bestellung von einem Mitarbeiter stammt
  isEmployeeOrder(order: any): boolean {
    return order.role === 'admin' || order.role === 'employee';
  }

  // Methode zum Anzeigen des Kundennamens (exakt wie in Order-Overview)
  getCustomerDisplayName(order: any): string {
    const key = String(order.customer_number ?? '').trim();
    if (key) {
      const mapped = this.customerNameMap[key];
      if (mapped && mapped.trim()) {
        return mapped;
      }
      return `Kunde ${key}`;
    }
    if (this.isEmployeeOrder(order)) {
      return '-';
    }
    return order.name;
  }

  // Neue Methode zum Laden aller Artikel (inkl. PFAND)
  loadAllArtikels(): void {
    this.artikelService.getData().subscribe({
      next: (response) => {
        // Alle Artikel inkl. PFAND für die custom_field_1 Überprüfung
        this.allArtikels = response;
        console.log('✅ [ADMIN] Alle Artikel geladen (inkl. PFAND):', this.allArtikels.length);
      },
      error: (error) => {
        console.error('❌ [ADMIN] Fehler beim Laden der Artikel:', error);
      }
    });
  }

  // Methode zum Laden der globalen Artikel
  loadGlobalArtikels(): void {
    this.artikelService.getData().subscribe({
      next: (response) => {
        // Alle Artikel inkl. PFAND für die custom_field_1 Überprüfung
        this.allArtikels = response;
        
        // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern (für normale Anzeige)
        this.globalArtikels = this.globalService.filterSchnellverkaufArticles(response);
        // PFAND-Artikel aus der Hauptliste filtern
        this.globalArtikels = this.globalArtikels.filter((artikel: any) => artikel.category !== 'PFAND' && artikel.category !== 'SCHNELLVERKAUF');
        
        console.log('✅ [ADMIN] Alle Artikel geladen (inkl. PFAND):', this.allArtikels.length);
        console.log('✅ [ADMIN] Gefilterte Artikel (ohne PFAND):', this.globalArtikels.length);
      },
      error: (error) => {
        console.error('❌ [ADMIN] Fehler beim Laden der globalen Artikel:', error);
      }
    });
  }

  // Getter für gefilterte Bestellungen
  get filteredOrders() {
    if (!this.searchTerm) {
      return this.orders;
    }
    return this.orders.filter(order => 
      order.order_id?.toString().includes(this.searchTerm) ||
      order.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      this.getCustomerName(order).toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.company?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.email?.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  // Methoden für Side-Modal
  toggleUploadModal() {
    this.showUploadModal = !this.showUploadModal;
  }

  closeUploadModal() {
    this.showUploadModal = false;
  }

  // Methoden für Status-Filterung
  getOrdersByStatus(status: string) {
    return this.orders.filter(order => order.status === status);
  }

  // Hilfsmethode um zu prüfen, ob es offene oder in Bearbeitung befindliche Bestellungen gibt
  hasActiveOrders(): boolean {
    const openOrders = this.getOrdersByStatus('open').length;
    const inProgressOrders = this.getOrdersByStatus('in_progress').length;
    const pickingOrders = this.getOrdersByStatus('picking').length;
    return openOrders > 0 || inProgressOrders > 0 || pickingOrders > 0;
  }

  /** True if order was edited after creation (status change, items, etc.). */
  wasOrderUpdated(order: any): boolean {
    if (!order?.updated_at || !order?.created_at) {
      return false;
    }
    return new Date(order.updated_at).getTime() - new Date(order.created_at).getTime() > 60_000;
  }

  /** Last editor name for hover tooltip (explicit editor, else picker as fallback). */
  getOrderEditorName(order: any): string {
    const editor = String(order?.updated_by_name || '').trim();
    if (editor) {
      return editor;
    }
    const picker = String(order?.picker_user_name || '').trim();
    if (picker) {
      return picker;
    }
    return '';
  }

  /** Hover-only audit info for last edit — only when we know who. */
  getOrderEditTooltip(order: any): string {
    const who = this.getOrderEditorName(order);
    if (!who) {
      return '';
    }
    if (!this.wasOrderUpdated(order) && !order?.updated_by_name) {
      // Picker gesetzt, aber noch kein Edit-Zeitstempel-Diff: trotzdem nachvollziehbar
      return `Zuletzt bearbeitet von ${who}`;
    }
    const when = order?.updated_at ? new Date(order.updated_at) : null;
    if (when && !Number.isNaN(when.getTime())) {
      const datePart = when.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Zuletzt bearbeitet von ${who} · ${datePart}`;
    }
    return `Zuletzt bearbeitet von ${who}`;
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        // Employee und Admin haben Zugriff auf das Dashboard
        if (response?.user?.role !== 'admin' && response?.user?.role !== 'employee') {
          this.router.navigate(['/login']);
        }
        // Benutzerrolle im GlobalService setzen
        this.globalService.setUserRole(response.user.role);
        this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
        this.globalService.setUserId(response.user.id != null ? Number(response.user.id) : null);
        this.globalService.setUserLoggedIn(true);
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      },
      complete: () => {
        this.isLoading = false; // Sobald abgeschlossen, lade HTML
      },
    });
  }

  loadOrders() {
    const token = localStorage.getItem('token');
    this.orderService.getAllOrders(token).subscribe({
      next: (response) => {
        this.orders = response.orders;
      },
      error: (error) => {
        console.error(error);
      },
    });
  }

  generatePdf(
    company: string,
    shippingAddress: string,
    paymentStatus: string,
    orderDate: string,
    createdAt: string,
    fulfillmentType: string,
    name: string,
    email: string,
    orderId: string,
    totalPrice: number,
    delivery_date: string,
    products: {
      price: number;
      product_article_number: string;
      product_id: number;
      product_name: string;
      quantity: number;
    }[]
  ) {
    const doc = new jsPDF();

    // Titel
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Kommissionierungsschein', 14, 20);

    // Bestellinformationen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    // Bestellnummer und weitere Infos
    doc.text('Bestellnummer: ' + orderId, 14, 40);

    // Datum und Uhrzeit konvertieren
    const orderDateFormatted = new Date(orderDate).toLocaleDateString(); // Datum
    const createdAtFormatted = new Date(createdAt).toLocaleTimeString(); // Uhrzeit

    doc.text('Datum: ' + orderDateFormatted, 14, 50); // Datum
    doc.text('Erstellt um: ' + createdAtFormatted, 14, 60); // Uhrzeit
    doc.text('Kunde: ' + name, 14, 70);
    doc.text('E-Mail: ' + email, 14, 80);
    doc.text('Lieferart: ' + (fulfillmentType == 'delivery' ? 'Lieferung' : 'Abholung'), 14, 100);

    // Zusätzliche Bestellinformationen
    doc.text('Firma: ' + (company ? company : 'Keine Angabe'), 14, 110);
    doc.text(
      'Lieferadresse: ' + (shippingAddress ? shippingAddress : 'Keine Angabe'),
      14,
      120
    );
    doc.text('Liefer-/ Abholdatum ' + this.formatDate(delivery_date), 14, 130);

    // Trennlinie
    doc.line(14, 135, 200, 135);

    // Artikelüberschrift
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Menge', 14, 145);
    doc.text('Artikel', 40, 145);
    doc.text('Artikelnr.', 160, 145);

    // Artikel und Mengen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let yPosition = 155;
    const lineHeight = 10;
    const pageHeight = 297; // A4 in mm
    const bottomMargin = 20;

    products.forEach((product, index) => {
  // Wenn yPosition zu weit unten ist, neue Seite
  if (yPosition + lineHeight > pageHeight - bottomMargin) {
    doc.addPage();
    doc.text('Bestellnummer: ' + orderId, 14, 40);
    yPosition = 60;

    // Tabellenüberschrift auf neuer Seite wiederholen (optional)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Menge', 14, yPosition);
    doc.text('Artikel', 40, yPosition);
    doc.text('Artikelnr.', 160, yPosition);
    yPosition += 10;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
  }

  // Artikeldaten
  doc.text(String(product.quantity), 14, yPosition);
  doc.text(product.product_name, 40, yPosition);
  doc.text(product.product_article_number, 160, yPosition);

  yPosition += lineHeight;
});

    // Gesamtbetrag unten
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');

    // PDF-Dokument öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }


  
formatDate(dateString: string): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');   // TT
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // MM (0-basiert)
  const year = date.getFullYear(); // JJJJ

  return `${day}.${month}.${year}`;
}



  // Event-Handler für Dateiauswahl
  onCustomerFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedCustomerFile = file.name;
    } else {
      this.selectedCustomerFile = '';
    }
  }

  onCustomerArticlePricesFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedCustomerArticlePricesFile = file.name;
    } else {
      this.selectedCustomerArticlePricesFile = '';
    }
  }

  onArticlesFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedArticlesFile = file.name;
    } else {
      this.selectedArticlesFile = '';
    }
  }

  onCustomerUploadClick() {
    const file = this.customerFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          `${environment.apiUrl}/api/customers/upload`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Kundendatei erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Kundendatei. Bitte versuchen Sie es erneut.');
          },
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onCustomerArticlePricesUploadClick() {
    const file = this.customerArticlePricesFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          `${environment.apiUrl}/api/customer-article-prices/upload`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Kunden Artikel Preise erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Kunden Artikel Preise. Bitte versuchen Sie es erneut.');
          },
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onArticlesUploadClick() {
    const file = this.articlesFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          `${environment.apiUrl}/api/products/upload`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Artikeldaten erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Artikeldaten. Bitte versuchen Sie es erneut.');
          },
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onStatusChange(event: Event, order: any) {
    const newStatus = (event.target as HTMLSelectElement).value;
    if (newStatus === 'picking') {
      alert('Status „Wird kommissioniert“ nur über die Kommissionierung setzen.');
      this.loadOrders();
      return;
    }
    if (newStatus == 'open') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus)
      return;
    }
    if (newStatus == 'in_progress') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus)
      return;
    }
    if (newStatus === 'picked') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus);
      return;
    }
    if (newStatus === 'completed') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.showModal = true;
    }
  }

  updateOrderStatus(order: any, status: string) {
    order.status = status;

    console.log(`🔄 [ADMIN-UPDATE] Aktualisiere Status für Bestellung ${order.order_id} auf: ${status} `);

    // Verwende den neuen Status-Only Endpoint
    this.orderService
      .updateOrderStatusOnly(order.order_id, status, localStorage.getItem('token'))
      .subscribe({
        next: (response) => {
          console.log('✅ [ADMIN-UPDATE] Status erfolgreich aktualisiert:', response);
          // Aktualisiere den lokalen Status
          order.status = status;
          this.loadOrders();
        },
        error: (error) => {
          console.error('❌ [ADMIN-UPDATE] Fehler beim Aktualisieren des Status:', error);
          alert(
            'Fehler beim Aktualisieren des Status. Bitte versuche es später erneut.'
          );
        },
      });
  }

  confirmCompletion() {
    if (this.selectedOrder && this.newStatus === 'completed') {
      this.updateOrderStatus(this.selectedOrder, this.newStatus);
    }
    this.showModal = false;
    this.selectedOrder = null;
  }

  cancelCompletion() {
    if (this.selectedOrder) {
      this.selectedOrder.status = 'in_progress';
      this.updateOrderStatus(this.selectedOrder, this.selectedOrder.status);
    }
    this.showModal = false;
    this.selectedOrder = null;
  }

  // ===== PERMISSION METHODS =====
  // Methode zum Prüfen, ob Benutzer Admin ist
  isAdmin(): boolean {
    return this.globalService.getUserRole() === 'admin';
  }

  // Methode zum Prüfen, ob Benutzer Employee ist
  isEmployee(): boolean {
    return this.globalService.getUserRole() === 'employee';
  }

  // Methode zum Prüfen, ob Benutzer Gastzugang erstellen darf
  canCreateGuestLink(): boolean {
    return this.isAdmin();
  }

  // Methode zum Prüfen, ob Benutzer Aufträge erstellen darf
  canCreateOrders(): boolean {
    return this.isAdmin();
  }

  // Methode zum Prüfen, ob Benutzer User Management nutzen darf
  canManageUsers(): boolean {
    return this.isAdmin();
  }

  // Methode zum Prüfen, ob Benutzer Daten hochladen darf
  canUploadData(): boolean {
    return this.isAdmin();
  }

  // Neue Methode zum Laden einer Bestellung in die Customer Orders Komponente
  loadOrderToCustomerOrders(order: any): void {
    console.log('🔄 [LOAD-ORDER] Lade Bestellung in Customer Orders:', order);
    
    // Transformiere die Bestelldaten in das erwartete Format für Customer Orders
    const orderData = {
      customer: {
        id: order.customer_id,
        customer_number: order.customer_number || order.order_id,
        last_name_company: order.name,
        name_addition: order.company || '',
        email: order.email || '',
        street: order.shipping_address || '',
        city: '',
        postal_code: '',
        _country_code: ''
      },
      items: order.items.map((item: any) => ({
        id: item.product_id, // Transformiere product_id zu id für Backend-Kompatibilität
        article_number: item.product_article_number,
        article_text: item.product_name,
        sale_price: item.price,
        quantity: item.quantity,
        different_price: item.different_price,
        description: item.product_name,
        cost_price: 0,
        original_price: item.price
      })),
      differentCompanyName: order.company || ''
    };

    // PFAND-Logik entfernt - Bestellungen werden ohne automatische PFAND-Ergänzung geladen
    console.log('📦 [LOAD-ORDER] Bestellung wird ohne PFAND-Logik geladen');
    console.log('📦 [LOAD-ORDER] Anzahl Artikel:', orderData.items.length);
    
    // Kategorie-Sortierung beibehalten (auch für bereits vorhandene PFAND-Artikel)
    if (this.allArtikels && this.allArtikels.length > 0) {
      console.log('📂 [LOAD-ORDER] Sortiere Artikel nach Kategorien...');
      orderData.items = this.sortItemsByCategory(orderData.items);
      console.log('✅ [LOAD-ORDER] Artikel nach Kategorien sortiert');
    } else {
      console.log('⚠️ [LOAD-ORDER] Keine Artikel verfügbar, überspringe Kategorie-Sortierung');
    }

    // Artikel werden direkt zur Customer Orders Komponente weitergeleitet
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
}
