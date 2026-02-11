import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
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
  dateFrom: string = '';
  dateTo: string = '';
  sortBy: string = 'order_id';
  sortDirection: 'asc' | 'desc' = 'desc';
  showArchived: boolean = false;
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
  
  // Warnung für bereits bearbeitete Bestellungen
  showProcessingWarning = false;
  processingWarningMessage = '';
  processingOrderId: number | null = null;
  
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
    this.loadOrders().subscribe();
    this.loadCustomers();
    this.loadAllArtikels();
    this.loadDateFiltersFromLocalStorage();
  }

  reloadOrders(): void {
    this.loadOrders().subscribe();
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

  /**
   * Lädt alle Bestellungen. Gibt ein Observable zurück, damit nach dem Laden
   * weitere Aktionen ausgeführt werden können (z. B. Details, Drucken, Bearbeiten).
   */
  loadOrders(): Observable<OrdersResponse> {
    this.isLoading = true;
    const token = localStorage.getItem('token');

    if (!token) {
      this.router.navigate(['/login']);
      this.isLoading = false;
      return of({ orders: [] });
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get<OrdersResponse>(`${environment.apiUrl}/api/orders/all-orders`, { headers }).pipe(
      tap((response) => {
        this.orders = response.orders || [];
        this.isLoading = false;
      }),
      catchError((error) => {
        console.error('Fehler beim Laden der Bestellungen:', error);
        this.orders = [];
        this.isLoading = false;
        return of({ orders: [] });
      })
    );
  }

  private customersByNumber: Record<string, any> = {}; // Vollständige Kundendaten

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
            // Speichere auch vollständige Kundendaten
            this.customersByNumber[numberStr] = customer;
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
    let filtered = this.orders;
    
    // Archiv-Filter anwenden
    if (!this.showArchived) {
      filtered = filtered.filter(order => order.status !== 'archived');
    }
    
    // Datumsfilter anwenden
    if (this.dateFrom || this.dateTo) {
      filtered = filtered.filter(order => {
        if (!order.order_date) return false;
        
        const orderDate = new Date(order.order_date);
        orderDate.setHours(0, 0, 0, 0);
        
        if (this.dateFrom) {
          const fromDate = new Date(this.dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (orderDate < fromDate) return false;
        }
        
        if (this.dateTo) {
          const toDate = new Date(this.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) return false;
        }
        
        return true;
      });
    }
    
    // Suchfilter anwenden - Leerzeichen trimmen und normalisieren
    const trimmedSearchTerm = this.searchTerm?.trim().replace(/\s+/g, ' ') || '';
    if (trimmedSearchTerm) {
      // Suchbegriff in einzelne Wörter aufteilen (Leerzeichen als Trenner)
      const searchWords = trimmedSearchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
      
      filtered = filtered.filter(order => {
        // Alle Suchfelder in einem String zusammenfassen für die Suche
        const searchableText = [
          order.order_id?.toString() || '',
          order.name || '',
          order.company || '',
          order.email || '',
          order.customer_number || '',
          order.role || '',
          this.getCustomerDisplayName(order) || ''
        ].join(' ').toLowerCase();
        
        // Jedes Suchwort muss im kombinierten Text gefunden werden
        // Die Reihenfolge spielt keine Rolle
        return searchWords.every(word => searchableText.includes(word));
      });
    }
    
    // Sortierung anwenden
    return this.sortOrders(filtered);
  }

  sortOrders(orders: Order[]): Order[] {
    const sorted = [...orders];
    
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (this.sortBy) {
        case 'order_id':
          aValue = a.order_id;
          bValue = b.order_id;
          break;
        case 'order_date':
          aValue = a.order_date ? new Date(a.order_date).getTime() : 0;
          bValue = b.order_date ? new Date(b.order_date).getTime() : 0;
          break;
        case 'created_at':
          aValue = a.created_at ? new Date(a.created_at).getTime() : 0;
          bValue = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'delivery_date':
          aValue = a.delivery_date ? new Date(a.delivery_date).getTime() : 0;
          bValue = b.delivery_date ? new Date(b.delivery_date).getTime() : 0;
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'customer_number':
          aValue = a.customer_number || '';
          bValue = b.customer_number || '';
          break;
        case 'total_price':
          aValue = parseFloat(a.total_price || '0');
          bValue = parseFloat(b.total_price || '0');
          break;
        case 'customer_name':
          aValue = this.getCustomerDisplayName(a).toLowerCase();
          bValue = this.getCustomerDisplayName(b).toLowerCase();
          break;
        case 'fulfillment_type':
          aValue = a.fulfillment_type || '';
          bValue = b.fulfillment_type || '';
          break;
        case 'payment_status':
          aValue = a.payment_status || '';
          bValue = b.payment_status || '';
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return sorted;
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
  }

  sortByColumn(column: string): void {
    if (this.sortBy === column) {
      // Wenn bereits nach dieser Spalte sortiert wird, Richtung umkehren
      this.toggleSortDirection();
    } else {
      // Neue Spalte, Standardrichtung setzen
      this.sortBy = column;
      this.sortDirection = 'desc';
    }
  }

  isSortColumn(column: string): boolean {
    return this.sortBy === column;
  }

  getSortIcon(column: string): string {
    if (!this.isSortColumn(column)) {
      return '';
    }
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  onOrderClick(order: Order) {
    this.selectedOrder = order;
  }

  /**
   * Lädt alle Bestellungen neu und führt danach die gewünschte Aktion aus.
   * So wird immer mit aktuellen Daten gearbeitet (Details, Drucken, Bearbeiten).
   */
  private getOrderAfterReload(orderId: number): Order | undefined {
    return this.orders.find(o => o.order_id === orderId);
  }

  /** Erst Bestellungen neu laden, dann Details anzeigen. */
  openDetailsAfterReload(order: Order): void {
    this.loadOrders().subscribe({
      next: () => {
        const refreshed = this.getOrderAfterReload(order.order_id) ?? order;
        this.onOrderClick(refreshed);
      }
    });
  }

  /** Erst Bestellungen neu laden, dann PDF drucken. */
  printAfterReload(order: Order): void {
    this.loadOrders().subscribe({
      next: () => {
        const refreshed = this.getOrderAfterReload(order.order_id) ?? order;
        this.generatePdf(refreshed);
      }
    });
  }

  /** Erst Bestellungen neu laden, dann Bearbeiten ausführen. */
  editOrderAfterReload(order: Order): void {
    this.loadOrders().subscribe({
      next: () => {
        const refreshed = this.getOrderAfterReload(order.order_id) ?? order;
        this.editOrder(refreshed);
      }
    });
  }

  closeOrderDetails() {
    this.selectedOrder = null;
  }

  generatePdf(order: Order) {
    const doc = new jsPDF();
    let pageCount = 1;
    let totalPages = 1; // Wird später berechnet

    // Moderne Farbpalette
    const colors = {
      primary: [41, 128, 185],      // Blau
      secondary: [52, 73, 94],      // Dunkelgrau
      accent: [46, 204, 113],       // Grün
      light: [236, 240, 241],       // Hellgrau
      dark: [44, 62, 80],           // Sehr dunkelgrau
      white: [255, 255, 255]        // Weiß
    };

    // Hilfsfunktion zum Zeichnen der Seitenzahl
    const drawPageNumber = (currentPage: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text(`${currentPage} von ${totalPages}`, 190, 290, { align: 'right' });
    };

    // Hinweis: Kein Rechnungsdokument
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);

    // Bestellnummer Badge
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('#' + order.order_id.toString(), 170, 12);

    // Bestellinformationen in modernen Karten (kompakter)
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    
    let yPos = 28;
    // Kartenhöhe anpassen, wenn Uhrzeit vorhanden ist
    const hasTime = order.delivery_date && order.delivery_date.includes('T');
    const cardHeight = hasTime ? 25 : 20;
    const leftCardWidth = 90;
    const rightCardWidth = 90;
    const cardSpacing = 10;

    // Datum und Uhrzeit konvertieren
    const orderDateFormatted = new Date(order.order_date).toLocaleDateString();
    const createdAtFormatted = new Date(order.created_at).toLocaleTimeString();

    // Linke Karte - Bestelldetails
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('BESTELLDETAILS', 20, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.text('Datum: ' + orderDateFormatted, 20, yPos + 11);
    doc.text('Erstellt: ' + createdAtFormatted, 20, yPos + 16);

    // Rechte Karte - Lieferdetails
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('LIEFERDETAILS', 120, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.text('Art: ' + (order.fulfillment_type === 'delivery' ? 'Lieferung' : 'Abholung'), 120, yPos + 11);
    
    // Datum und Uhrzeit extrahieren
    const deliveryDate = new Date(order.delivery_date);
    const dateStr = this.formatDate(order.delivery_date);
    
    // Prüfe ob eine Uhrzeit im delivery_date vorhanden ist (ISO-Format mit 'T')
    if (order.delivery_date && order.delivery_date.includes('T')) {
      const timeStr = deliveryDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      doc.text('Datum: ' + dateStr, 120, yPos + 16);
      
      // Bei Abholung die Uhrzeit fett anzeigen
      if (order.fulfillment_type === 'pickup') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Uhrzeit: ' + timeStr + ' Uhr', 120, yPos + 21);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
      } else {
        doc.text('Uhrzeit: ' + timeStr + ' Uhr', 120, yPos + 21);
      }
    } else {
      doc.text('Datum: ' + dateStr, 120, yPos + 16);
    }

    yPos += cardHeight + 10;

    // Kunde Karte mit allen Informationen
    const customerName = this.getCustomerDisplayName(order);
    const customerNumber = order.customer_number || '';
    
    // Sammle alle Kundeninformationen
    const customerLines: string[] = [];
    
    // Kundennummer
    if (customerNumber) {
      customerLines.push(customerNumber);
    }
    
    // Firmenname/Name
    if (customerName) {
      customerLines.push(customerName);
    }
    
    // Versuche vollständige Kundendaten zu holen
    const customerKey = String(customerNumber).trim();
    const fullCustomer = this.customersByNumber[customerKey];
    
    // Namenszusatz (z.B. "Inh. Özlem Özmeneroglu")
    if (fullCustomer && fullCustomer.name_addition) {
      customerLines.push(fullCustomer.name_addition);
    }
    
    // Adresse aus vollständigen Kundendaten
    if (fullCustomer) {
      if (fullCustomer.street) {
        customerLines.push(fullCustomer.street);
      }
      
      // PLZ und Stadt
      if (fullCustomer.postal_code || fullCustomer.city) {
        const cityLine = `${fullCustomer.postal_code || ''} ${fullCustomer.city || ''}`.trim();
        if (cityLine) {
          customerLines.push(cityLine);
        }
      }
    } else if (order.shipping_address) {
      // Fallback: Nutze shipping_address wenn vollständige Kundendaten nicht verfügbar sind
      const addressLines = order.shipping_address.split('\n').filter(line => line.trim());
      customerLines.push(...addressLines);
    }

    // Kundenanmerkung (customer_notes) unter "KUNDE" anzeigen, falls vorhanden
    const customerNotes = (order.customer_notes || '').trim();
    if (customerNotes) {
      customerLines.push(`Anmerkung: ${customerNotes}`);
    }
    
    // Berechne die Höhe der Karte basierend auf Anzahl der Zeilen
    const lineHeight = 5;
    const padding = 10;
    const customerCardHeight = Math.max(30, customerLines.length * lineHeight + padding);
    
    // Kunde Karte nutzt volle Breite
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('KUNDE', 20, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    
    let textY = yPos + 12;
    customerLines.forEach((line, index) => {
      if (line && line.trim()) {
        const splitLines = doc.splitTextToSize(line, 175);
        splitLines.forEach((splitLine: string) => {
          doc.text(splitLine, 20, textY);
          textY += lineHeight;
        });
      }
    });

    yPos += customerCardHeight + 10;

    // Moderne Trennlinie
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(2);
    doc.line(15, yPos, 195, yPos);

    // Moderne Artikeltabelle
    const tableStartY = yPos + 15;
    const tableWidth = 180;
    const headerHeight = 10;
    const rowHeight = 8;
    
    // Tabellenüberschrift mit modernem Design
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.roundedRect(15, tableStartY, tableWidth, headerHeight, 3, 3, 'F');
    
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    // Spaltenbreiten
    const col1 = 18;   // Pos
    const col2 = 28;   // Menge
    const col3 = 45;   // Artikel (mehr Platz)
    const col4 = 135;  // Artikelnr.
    const col5 = 160;  // Preis
    const col6 = 180;  // Gesamt
    
    // Überschriften
    doc.text('Pos', col1, tableStartY + 6);
    doc.text('Menge', col2, tableStartY + 6);
    doc.text('Artikel', col3, tableStartY + 6);
    doc.text('Artikelnr.', col4, tableStartY + 6);
    doc.text('Preis', col5, tableStartY + 6);
    doc.text('Gesamt', col6, tableStartY + 6);

    // Moderne Artikelzeilen
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    let currentY = tableStartY + headerHeight;
    const pageHeight = 297;
    const bottomMargin = 40;

    order.items.forEach((product, index) => {
      // Seitenumbruch prüfen
      if (currentY + rowHeight > pageHeight - bottomMargin) {
        doc.addPage();
        pageCount++;
        currentY = 20;
        
        // Hinweis auf neuer Seite wiederholen: Kein Rechnungsdokument
        doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);
        
        // Bestellnummer Badge
        doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
        doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
        doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('#' + order.order_id.toString(), 170, 12);
        
        currentY = 25;
        
        // Tabellenüberschrift auf neuer Seite wiederholen
        doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.roundedRect(15, currentY, tableWidth, headerHeight, 3, 3, 'F');
        
        doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Pos', col1, currentY + 6);
        doc.text('Menge', col2, currentY + 6);
        doc.text('Artikel', col3, currentY + 6);
        doc.text('Artikelnr.', col4, currentY + 6);
        doc.text('Preis', col5, currentY + 6);
        doc.text('Gesamt', col6, currentY + 6);
        
        currentY += headerHeight;
        
        doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
      }

      // Artikelname - vollständig anzeigen, mit automatischem Zeilenumbruch falls nötig
      const productName = product.product_name;
      const maxWidth = col4 - col3 - 2; // Verfügbarer Platz für Artikelname
      
      // Text umbrechen falls zu lang
      const splitName = doc.splitTextToSize(productName, maxWidth);
      
      // Zeilenhöhe dynamisch anpassen basierend auf Textzeilen
      const lineHeight = Math.max(rowHeight, splitName.length * 4 + 2);

      // Zebra-Streifen für bessere Lesbarkeit (mit dynamischer Höhe)
      if (index % 2 === 0) {
        doc.setFillColor(248, 249, 250);
        doc.rect(15, currentY, tableWidth, lineHeight, 'F');
      }

      // Trennlinien zwischen den Artikeln
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(15, currentY, 195, currentY);

      // Artikeldaten
      doc.text((index + 1).toString(), col1, currentY + 6); // Positionsnummer
      doc.text(String(product.quantity), col2 + 3, currentY + 6); // Menge näher zu Artikel
      doc.text(splitName, col3, currentY + 6);
      
      doc.text(product.product_article_number, col4, currentY + 6);
      
      // Preis anzeigen (kundenspezifisch oder normal)
      const displayPrice = product.different_price || product.price;
      const priceText = parseFloat(displayPrice).toFixed(2) + ' €';
      doc.text(priceText, col5, currentY + 6);
      
      // Gesamtpreis für diesen Artikel
      const itemTotal = parseFloat(displayPrice) * product.quantity;
      doc.text(itemTotal.toFixed(2) + ' €', col6, currentY + 6);

      // Verwende die dynamische Zeilenhöhe
      currentY += lineHeight;
    });

    // Moderne Gesamtbetrag-Sektion
    if (order.total_price) {
      currentY += 10;
      
      // Rahmen für Gesamtbetrag mit modernem Design
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(1);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      
      // Nettobetrag berechnen (total_price ist bereits Netto)
      const netPrice = parseFloat(order.total_price);
      
      // Bruttobetrag berechnen (alle Artikel summieren mit MwSt)
      const grossPrice = this.getOrderTotalGross(order);
      
      // Positionierung für beide Beträge
      const leftMargin = 25;
      const rightMargin = 120;
      
      // Nettobetrag links
      doc.text('Nettobetrag: ' + netPrice.toFixed(2) + ' €', leftMargin, currentY + 10);
      
      // Bruttobetrag rechts
      doc.text('Bruttobetrag: ' + grossPrice.toFixed(2) + ' €', rightMargin, currentY + 10);
      
      currentY += 25;
    }

    // Moderner Footer
    const footerY = pageHeight - 20;
    
    // Footer-Linie
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(1);
    doc.line(15, footerY, 195, footerY);
    
    // Footer-Text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    
    const currentDate = new Date().toLocaleDateString();
    const currentTime = new Date().toLocaleTimeString();
    
    doc.text('Erstellt am ' + currentDate + ' um ' + currentTime, 15, footerY + 8);

    // Gesamtseitenzahl berechnen
    totalPages = pageCount;

    // Seitenzahl für alle Seiten hinzufügen
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawPageNumber(i, totalPages);
    }

    // Zurück zur ersten Seite
    doc.setPage(1);

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

  getFullCustomerInfo(order: Order): string {
    const key = String(order.customer_number ?? '').trim();
    if (!key) {
      if (this.isEmployee(order)) {
        return '-';
      }
      return order.name || '-';
    }

    const customer = this.customersByNumber[key];
    if (!customer) {
      return this.getCustomerDisplayName(order);
    }

    const parts: string[] = [];
    
    // Name/Firmenname
    const name = customer.last_name_company || customer.name || '';
    if (name) {
      parts.push(name);
    }
    
    // Namenszusatz
    if (customer.name_addition) {
      parts.push(customer.name_addition);
    }
    
    // Adresse
    if (customer.street) {
      parts.push(customer.street);
    }
    
    // PLZ und Stadt
    if (customer.postal_code || customer.city) {
      const cityLine = `${customer.postal_code || ''} ${customer.city || ''}`.trim();
      if (cityLine) {
        parts.push(cityLine);
      }
    }

    // Fallback: Wenn keine vollständigen Daten vorhanden sind, nutze shipping_address
    if (parts.length === 0 && order.shipping_address) {
      return order.shipping_address;
    }

    return parts.length > 0 ? parts.join('\n') : this.getCustomerDisplayName(order);
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
    
    // Kategorie-Sortierung entfernt - ursprüngliche Reihenfolge der Positionen wird beibehalten
    console.log('ℹ️ [LOAD-ORDER] Ursprüngliche Reihenfolge der Positionen wird beibehalten');

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

    // Prüfe, ob die Bestellung bereits von jemandem bearbeitet wird
    this.checkOrderProcessingStatusBeforeEdit(order);
  }

  // Neue Methode zum Prüfen des Bearbeitungsstatus vor dem Editieren
  private checkOrderProcessingStatusBeforeEdit(order: Order): void {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ [EDIT-ORDER] Kein Token gefunden');
      return;
    }

    console.log('🔍 [EDIT-ORDER] Prüfe Bearbeitungsstatus für Bestellung:', order.order_id);
    
    this.orderService.checkOrderProcessingStatus(order.order_id, token).subscribe({
      next: (response) => {
        console.log('✅ [EDIT-ORDER] Bearbeitungsstatus erhalten:', response);
        
        if (response.isBeingProcessed) {
          // Zeige Warnung an, dass die Bestellung bereits bearbeitet wird
          this.showOrderBeingProcessedWarning(order, response.message);
        } else {
          // Bestellung kann bearbeitet werden
          this.proceedWithOrderEdit(order);
        }
      },
      error: (error) => {
        console.error('❌ [EDIT-ORDER] Fehler beim Prüfen des Bearbeitungsstatus:', error);
        // Bei Fehler trotzdem fortfahren (Fallback-Verhalten)
        this.proceedWithOrderEdit(order);
      }
    });
  }

  // Methode zum Fortfahren mit der Bearbeitung (nach Statusprüfung)
  private proceedWithOrderEdit(order: Order): void {
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

    // Kategorie-Sortierung entfernt - ursprüngliche Reihenfolge der Positionen wird beibehalten
    console.log('ℹ️ [EDIT-ORDER] Ursprüngliche Reihenfolge der Positionen wird beibehalten');

    // Speichere die Bestelldaten im localStorage für die Customer Orders Komponente
    localStorage.setItem('pendingOrderData', JSON.stringify(orderData));
    
    console.log('💾 [EDIT-ORDER] Bestelldaten im localStorage gespeichert (Bearbeitungsmodus)');
    
    // Navigiere zur Customer Orders Seite
    this.router.navigate(['/customer-orders']);
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  goToCustomerOrders(): void {
    this.router.navigate(['/customer-orders']);
  }

  // Methode zum Anzeigen der Warnung bei bereits bearbeiteten Bestellungen
  private showOrderBeingProcessedWarning(order: Order, message: string): void {
    this.processingOrderId = order.order_id;
    this.processingWarningMessage = message;
    this.showProcessingWarning = true;
    console.warn('⚠️ [EDIT-ORDER] Bestellung wird bereits bearbeitet:', order.order_id);
  }

  // Methode zum Schließen der Bearbeitungswarnung
  closeProcessingWarning(): void {
    this.showProcessingWarning = false;
    this.processingWarningMessage = '';
    this.processingOrderId = null;
    
    // Lade die Bestellungen neu, um den aktuellen Status zu aktualisieren
    console.log('🔄 [CLOSE-WARNING] Lade Bestellungen neu nach Warnung...');
    this.loadOrders().subscribe();
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
    if (!order || !order.items || order.items.length === 0) {
      return 0;
    }
    return order.items.reduce((sum, item) => {
      const netPrice = parseFloat(item.different_price || item.price || '0');
      const grossPrice = this.getGrossPrice(netPrice, item.tax_code);
      const quantity = Number(item.quantity) || 0;
      return sum + (grossPrice * quantity);
    }, 0);
  }

  // Datumsfilter-Methoden
  clearDateFilter(): void {
    this.dateFrom = '';
    this.dateTo = '';
    // Lösche die Datumswerte aus LocalStorage
    localStorage.removeItem('orderOverviewDateFrom');
    localStorage.removeItem('orderOverviewDateTo');
  }
  
  // Lade Datumsfilter aus LocalStorage
  private loadDateFiltersFromLocalStorage(): void {
    const savedDateFrom = localStorage.getItem('orderOverviewDateFrom');
    const savedDateTo = localStorage.getItem('orderOverviewDateTo');
    
    if (savedDateFrom) {
      this.dateFrom = savedDateFrom;
      console.log('📅 [ORDER-OVERVIEW] Datum Von aus LocalStorage geladen:', this.dateFrom);
    }
    
    if (savedDateTo) {
      this.dateTo = savedDateTo;
      console.log('📅 [ORDER-OVERVIEW] Datum Bis aus LocalStorage geladen:', this.dateTo);
    }
  }
  
  // Event-Handler für Datum Von Änderung
  onDateFromChange(value: string): void {
    if (value) {
      localStorage.setItem('orderOverviewDateFrom', value);
      console.log('💾 [ORDER-OVERVIEW] Datum Von in LocalStorage gespeichert:', value);
    } else {
      localStorage.removeItem('orderOverviewDateFrom');
    }
  }
  
  // Event-Handler für Datum Bis Änderung
  onDateToChange(value: string): void {
    if (value) {
      localStorage.setItem('orderOverviewDateTo', value);
      console.log('💾 [ORDER-OVERVIEW] Datum Bis in LocalStorage gespeichert:', value);
    } else {
      localStorage.removeItem('orderOverviewDateTo');
    }
  }

  focusDateInput(field: 'dateFrom' | 'dateTo'): void {
    const inputId = field === 'dateFrom' ? 'dateFrom' : 'dateTo';
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.focus();
      input.showPicker?.();
    }
  }

  openDatePicker(field: 'dateFrom' | 'dateTo'): void {
    const inputId = field === 'dateFrom' ? 'dateFrom' : 'dateTo';
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.focus();
      input.showPicker?.();
    }
  }

  toggleArchived(): void {
    this.showArchived = !this.showArchived;
  }
} 