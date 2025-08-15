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
    this.loadGlobalArtikels();
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
          'https://multi-mandant-ecommerce.onrender.com/api/customers/upload',
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
          'https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/upload',
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
          'https://multi-mandant-ecommerce.onrender.com/api/products/upload',
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
    if (newStatus == 'open') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus)
      return;
    }
    // Wenn der Status auf "In Bearbeitung" geändert wird
    if (newStatus == 'in_progress') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus)
      return;
    }
    // Wenn der Status auf "Fertig" geändert wird, öffne das Modal
    if (newStatus === 'completed') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.showModal = true;
    }
  }

  updateOrderStatus(order: any, status: string) {
    order.status = status;

    // Hier wird die API zur Statusaktualisierung aufgerufen
    this.orderService
      .updateStatus(order.order_id, status, localStorage.getItem('token'))
      .subscribe({
        next: (response) => {
          console.log(response);
          this.loadOrders();
        },
        error: (error) => {
          console.error('Fehler beim Aktualisieren des Status:', error);
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

    // Custom Field 1 Überprüfung: Füge Artikel mit custom_field_1 hinzu
    console.log('🔍 [LOAD-ORDER] Starte Custom Field 1 Überprüfung...');
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

    // Check: Prüfe ob alle Artikel in globalArtikels vorhanden sind
    // Hinweis: globalArtikels sind in der Admin-Komponente nicht verfügbar
    // Der Check wird in der Customer Orders Komponente durchgeführt
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
}
