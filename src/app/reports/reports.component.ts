import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../authentication.service';
import { GlobalService } from '../global.service';
import { Router } from '@angular/router';

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
  role?: string;
  items: OrderItem[];
}

interface OrdersResponse {
  orders: Order[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit {
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  selectedDate: string = '';
  isLoading: boolean = true;
  isVisible: boolean = true;
  isCustomerSummaryCollapsed: boolean = true; // Initially collapsed
  isProductCategoryCollapsed: boolean = false; // Initially expanded
  
  // Artikel-Daten für echte Kategorien
  globalArtikels: any[] = [];
  
  // Kunden-Daten für die Zusammenfassung
  customers: any[] = [];

  /** Artikelnummern, die immer in "FRISCHE HÄHNCHEN" erscheinen (unabhängig von Kategorie/Name). Hier eintragen. */
  readonly frischeHaehnchenArticleNumbers: string[] = [
    'hähn900geh.',
    'hähn950geh.',
    'hähn950gest.',
    'hähn1000geh.',
    'hähn1000gest.',
    'hähn1050gest.',
    'hähn1100gest.',
    'hähnkeule',
    'putkeule'
  ];

  // Report-Daten
  reportData: {
    totalOrders: number;
    totalProducts: number;
    gemueseProducts: { [key: string]: number };
    obstProducts: { [key: string]: number };
    schnellverkaufProducts: { [key: string]: number };
    gemueseTotal: number;
    obstTotal: number;
    schnellverkaufTotal: number;
    frischeHaehnchenTotal: number;
    gemueseProductList: Array<{ 
      articleNumber: string;
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    obstProductList: Array<{ 
      articleNumber: string;
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    schnellverkaufProductList: Array<{ 
      articleNumber: string;
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    frischeHaehnchenProductList: Array<{ 
      articleNumber: string;
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    customerSummary: Array<{
      customerName: string;
      customerNumber: string;
      company: string;
      gemueseTotal: number;
      obstTotal: number;
      schnellverkaufTotal: number;
      frischeHaehnchenTotal: number;
      totalProducts: number;
      orders: number[];
    }>;
  } = {
    totalOrders: 0,
    totalProducts: 0,
    gemueseProducts: {},
    obstProducts: {},
    schnellverkaufProducts: {},
    gemueseTotal: 0,
    obstTotal: 0,
    schnellverkaufTotal: 0,
    frischeHaehnchenTotal: 0,
    gemueseProductList: [],
    obstProductList: [],
    schnellverkaufProductList: [],
    frischeHaehnchenProductList: [],
    customerSummary: []
  };

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    public globalService: GlobalService
  ) { }

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
    this.loadArtikels();
    this.loadCustomers();
    this.selectedDate = this.getTodayDate();
  }

  loadArtikels() {
    this.http.get<any[]>(`${environment.apiUrl}/api/products`)
      .subscribe({
        next: (response) => {
          this.globalArtikels = response || [];
          const categories = [...new Set((this.globalArtikels as any[]).map((a: any) => a.category).filter(Boolean))].sort();
          console.log('[Reports] Kategorien vom Backend (exakt):', categories);
          if (this.orders.length > 0) this.generateReport();
        },
        error: (error) => console.error('Fehler beim Laden der Artikel:', error)
      });
  }

  loadCustomers() {
    // Lade alle Kunden für die Zusammenfassung
    this.http.get<any[]>(`${environment.apiUrl}/api/customers`)
      .subscribe({
        next: (response) => {
          this.customers = response || [];
        },
        error: (error) => {
          console.error('Fehler beim Laden der Kunden:', error);
        }
      });
  }

  getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /** Kategorie-String normalisieren für Vergleiche (Umlaute, Leerzeichen, Unicode). */
  private normalizeCategoryForCompare(cat: string): string {
    if (!cat) return '';
    return cat
      .normalize('NFC')
      .trim()
      .toUpperCase()
      .replace(/\u00C4/g, 'AE')
      .replace(/\u00E4/g, 'AE');
  }

  /** Prüft, ob die Kategorie „FRISCHE HÄHNCHEN“ ist (alle Schreibweisen inkl. „Chicken“). */
  private isCategoryFrischeHaehnchen(category: string): boolean {
    const n = this.normalizeCategoryForCompare(category);
    return n === 'FRISCHE HAENCHEN' || n.includes('CHICKEN') ||
      (n.includes('FRISCHE') && n.includes('HAENCHEN'));
  }

  /** Prüft, ob der Produktname auf „Frische Hähnchen“ hindeutet (z. B. bei fehlender/inaktiver Stammdaten). */
  private productNameSuggestsFrischeHaehnchen(name: string | null | undefined): boolean {
    if (!name || typeof name !== 'string') return false;
    const n = name.trim().toUpperCase().replace(/\u00C4/g, 'AE').replace(/\u00E4/g, 'AE');
    return n.includes('HAENCHEN') || n.includes('HAHNCHEN') || n.includes('CHICKEN');
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        if (response?.user?.role !== 'admin' && response?.user?.role !== 'employee') {
          this.router.navigate(['/login']);
        }
        this.globalService.setUserRole(response.user.role);
        this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
        this.globalService.setUserLoggedIn(true);
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  loadOrders() {
    const token = localStorage.getItem('token');
    if (token) {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      this.http.get<OrdersResponse>(`${environment.apiUrl}/api/orders/all-orders`, { headers })
        .subscribe({
          next: (response) => {
            this.orders = response.orders || [];
            // Wenn Artikel bereits geladen sind, generiere den Report
            if (this.globalArtikels.length > 0) {
              this.generateReport();
            }
          },
          error: (error) => {
            console.error('Fehler beim Laden der Bestellungen:', error);
          }
        });
    }
  }

  onDateChange() {
    this.generateReport();
  }

  generateReport() {
    if (!this.selectedDate) {
      this.filteredOrders = [];
      this.resetReportData();
      return;
    }

    // Bestellungen für das ausgewählte Datum filtern
    // Nur nach order_date filtern, nicht nach created_at
    this.filteredOrders = this.orders.filter(order => {
      if (!order.order_date) return false; // Überspringe Bestellungen ohne order_date
      
      const orderDate = new Date(order.order_date).toISOString().split('T')[0];
      return orderDate === this.selectedDate;
    });

    this.analyzeOrders();
  }

  analyzeOrders() {
    this.resetReportData();
    
    this.reportData.totalOrders = this.filteredOrders.length;
    
    // Alle Produkte aus den gefilterten Bestellungen sammeln
    const allProducts: Array<{ 
      name: string; 
      quantity: number; 
      orderId: number; 
      category: string;
      customerName: string;
      customerNumber: string;
      company: string;
      articleNumber: string;
    }> = [];
    
    this.filteredOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: OrderItem) => {
          const artNr = (item.product_article_number != null) ? String(item.product_article_number).trim() : '';
          let added = false;

          // 1) Harte Zuordnung per Artikelnummer: nur diese Artikel gehören zu FRISCHE HÄHNCHEN
          const isInFrischeHaehnchenList = artNr !== '' && this.frischeHaehnchenArticleNumbers.some(
            num => (num != null ? String(num).trim() : '') === artNr
          );
          if (isInFrischeHaehnchenList) {
            allProducts.push({
              name: item.product_name,
              quantity: item.quantity,
              orderId: order.order_id,
              category: 'FRISCHE HÄHNCHEN',
              customerName: order.name,
              customerNumber: order.customer_number,
              company: order.company,
              articleNumber: artNr
            });
            added = true;
          }

          // 2) Sonst normale Kategorie-Zuordnung (ohne weitere FRISCHE-HÄHNCHEN-Erkennung)
          if (!added) {
            const artikel = this.globalArtikels.find(
              a => (a.article_number != null ? String(a.article_number).trim() : '') === artNr
            );

            if (artikel && artikel.category) {
              const cat = (artikel.category || '').toString().trim();
              if (cat === 'GEMÜSE' || cat === 'OBST' || cat === 'SCHNELLVERKAUF') {
                allProducts.push({
                  name: item.product_name,
                  quantity: item.quantity,
                  orderId: order.order_id,
                  category: cat,
                  customerName: order.name,
                  customerNumber: order.customer_number,
                  company: order.company,
                  articleNumber: artNr
                });
                added = true;
              }
            }
          }
        });
      }
    });

    this.reportData.totalProducts = allProducts.length;

    // Produkte nach Kategorien gruppieren und Mengen zusammenfassen
    const gemueseMap = new Map<string, { 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>();
    const obstMap = new Map<string, { 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>();
    const schnellverkaufMap = new Map<string, { 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>();
    const frischeHaehnchenMap = new Map<string, { 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>();

    allProducts.forEach(product => {
      const key = `${product.articleNumber || ''}::${product.name}`;
      if (product.category === 'GEMÜSE') {
        if (gemueseMap.has(key)) {
          const existing = gemueseMap.get(key)!;
          existing.quantity += product.quantity;
          if (!existing.orders.includes(product.orderId)) {
            existing.orders.push(product.orderId);
          }
          existing.customers.push({
            name: product.customerName,
            customerNumber: product.customerNumber,
            quantity: product.quantity,
            orderId: product.orderId
          });
        } else {
          gemueseMap.set(key, { 
            quantity: product.quantity, 
            orders: [product.orderId],
            customers: [{
              name: product.customerName,
              customerNumber: product.customerNumber,
              quantity: product.quantity,
              orderId: product.orderId
            }]
          });
        }
      } else if (product.category === 'OBST') {
        if (obstMap.has(key)) {
          const existing = obstMap.get(key)!;
          existing.quantity += product.quantity;
          if (!existing.orders.includes(product.orderId)) {
            existing.orders.push(product.orderId);
          }
          existing.customers.push({
            name: product.customerName,
            customerNumber: product.customerNumber,
            quantity: product.quantity,
            orderId: product.orderId
          });
        } else {
          obstMap.set(key, { 
            quantity: product.quantity, 
            orders: [product.orderId],
            customers: [{
              name: product.customerName,
              customerNumber: product.customerNumber,
              quantity: product.quantity,
              orderId: product.orderId
            }]
          });
        }
      } else if (product.category === 'SCHNELLVERKAUF') {
        if (schnellverkaufMap.has(key)) {
          const existing = schnellverkaufMap.get(key)!;
          existing.quantity += product.quantity;
          if (!existing.orders.includes(product.orderId)) {
            existing.orders.push(product.orderId);
          }
          existing.customers.push({
            name: product.customerName,
            customerNumber: product.customerNumber,
            quantity: product.quantity,
            orderId: product.orderId
          });
        } else {
          schnellverkaufMap.set(key, { 
            quantity: product.quantity, 
            orders: [product.orderId],
            customers: [{
              name: product.customerName,
              customerNumber: product.customerNumber,
              quantity: product.quantity,
              orderId: product.orderId
            }]
          });
        }
      } else if (product.category === 'FRISCHE HÄHNCHEN') {
        if (frischeHaehnchenMap.has(key)) {
          const existing = frischeHaehnchenMap.get(key)!;
          existing.quantity += product.quantity;
          if (!existing.orders.includes(product.orderId)) {
            existing.orders.push(product.orderId);
          }
          existing.customers.push({
            name: product.customerName,
            customerNumber: product.customerNumber,
            quantity: product.quantity,
            orderId: product.orderId
          });
        } else {
          frischeHaehnchenMap.set(key, { 
            quantity: product.quantity, 
            orders: [product.orderId],
            customers: [{
              name: product.customerName,
              customerNumber: product.customerNumber,
              quantity: product.quantity,
              orderId: product.orderId
            }]
          });
        }
      }
    });

    // Maps zu Arrays konvertieren (Key = "articleNumber::name" → articleNumber und name getrennt)
    const mapEntryToProduct = ([key, data]: [string, { quantity: number; orders: number[]; customers: any[] }]) => {
      const idx = key.indexOf('::');
      const articleNumber = idx >= 0 ? key.slice(0, idx) : '';
      const name = idx >= 0 ? key.slice(idx + 2) : key;
      return { articleNumber, name, quantity: data.quantity, orders: data.orders, customers: data.customers };
    };

    this.reportData.gemueseProductList = Array.from(gemueseMap.entries()).map(mapEntryToProduct);
    this.reportData.obstProductList = Array.from(obstMap.entries()).map(mapEntryToProduct);
    this.reportData.schnellverkaufProductList = Array.from(schnellverkaufMap.entries()).map(mapEntryToProduct);
    this.reportData.frischeHaehnchenProductList = Array.from(frischeHaehnchenMap.entries()).map(mapEntryToProduct);

    // Gesamtmengen berechnen
    this.reportData.gemueseTotal = this.reportData.gemueseProductList.reduce(
      (sum, product) => sum + product.quantity, 0
    );
    
    this.reportData.obstTotal = this.reportData.obstProductList.reduce(
      (sum, product) => sum + product.quantity, 0
    );

    // SCHNELLVERKAUF Gesamt berechnen
    this.reportData.schnellverkaufTotal = this.reportData.schnellverkaufProductList.reduce(
      (sum, product) => sum + product.quantity, 0
    );

    // FRISCHE HÄHNCHEN Gesamt berechnen
    this.reportData.frischeHaehnchenTotal = this.reportData.frischeHaehnchenProductList.reduce(
      (sum, product) => sum + product.quantity, 0
    );

    // Kunden-Zusammenfassung erstellen
    this.createCustomerSummary();
  }

  createCustomerSummary() {
    const customerMap = new Map<string, {
      customerName: string;
      customerNumber: string;
      company: string;
      gemueseTotal: number;
      obstTotal: number;
      schnellverkaufTotal: number;
      frischeHaehnchenTotal: number;
      totalProducts: number;
      orders: number[];
    }>();

    // Alle Produkte durchgehen und Kunden-Statistiken sammeln
    [...this.reportData.gemueseProductList, ...this.reportData.obstProductList, 
     ...this.reportData.schnellverkaufProductList, ...this.reportData.frischeHaehnchenProductList].forEach(product => {
      product.customers.forEach(customer => {
        const key = `${customer.customerNumber}-${customer.name}`;
        
        if (customerMap.has(key)) {
          const existing = customerMap.get(key)!;
          existing.totalProducts += customer.quantity;
          if (!existing.orders.includes(customer.orderId)) {
            existing.orders.push(customer.orderId);
          }
        } else {
          customerMap.set(key, {
            customerName: customer.name,
            customerNumber: customer.customerNumber,
            company: this.getCustomerCompany(customer.customerNumber),
            gemueseTotal: 0,
            obstTotal: 0,
            schnellverkaufTotal: 0,
            frischeHaehnchenTotal: 0,
            totalProducts: customer.quantity,
            orders: [customer.orderId]
          });
        }

        // Kategorie-spezifische Mengen aktualisieren
        const customerData = customerMap.get(key)!;
        if (this.reportData.gemueseProductList.some(p => p.articleNumber === product.articleNumber && p.name === product.name)) {
          customerData.gemueseTotal += customer.quantity;
        } else if (this.reportData.obstProductList.some(p => p.articleNumber === product.articleNumber && p.name === product.name)) {
          customerData.obstTotal += customer.quantity;
        } else if (this.reportData.schnellverkaufProductList.some(p => p.articleNumber === product.articleNumber && p.name === product.name)) {
          customerData.schnellverkaufTotal += customer.quantity;
        } else if (this.reportData.frischeHaehnchenProductList.some(p => p.articleNumber === product.articleNumber && p.name === product.name)) {
          customerData.frischeHaehnchenTotal += customer.quantity;
        }
      });
    });

    this.reportData.customerSummary = Array.from(customerMap.values())
      .sort((a, b) => b.totalProducts - a.totalProducts); // Nach Gesamtmenge sortieren
  }

  getCustomerCompany(customerNumber: string): string {
    const customer = this.customers.find(c => c.customer_number === customerNumber);
    return customer?.last_name_company || customer?.company || '-';
  }

  resetReportData() {
    this.reportData = {
      totalOrders: 0,
      totalProducts: 0,
      gemueseProducts: {},
      obstProducts: {},
      schnellverkaufProducts: {},
      gemueseTotal: 0,
      obstTotal: 0,
      schnellverkaufTotal: 0,
      frischeHaehnchenTotal: 0,
      gemueseProductList: [],
      obstProductList: [],
      schnellverkaufProductList: [],
      frischeHaehnchenProductList: [],
      customerSummary: []
    };
  }

  exportToPDF(category: 'ALL' | 'GEMUESE' | 'OBST' | 'DIVERS' | 'FRISCHE_HAEHNCHEN') {
    if (!this.filteredOrders.length) return;

    // Import jsPDF dynamically
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        this.generatePDF(jsPDF, autoTable, category);
      });
    });
  }

  private generatePDF(jsPDF: any, autoTable: any, category: 'ALL' | 'GEMUESE' | 'OBST' | 'DIVERS' | 'FRISCHE_HAEHNCHEN') {
    const doc = new jsPDF();
    
    // Header
    const date = new Date(this.selectedDate).toLocaleDateString('de-DE');
    const categoryLabelMap: Record<string, string> = {
      ALL: 'Alle Kategorien',
      GEMUESE: 'GEMÜSE',
      OBST: 'OBST',
      DIVERS: 'DIVERS',
      FRISCHE_HAEHNCHEN: 'FRISCHE HÄHNCHEN'
    };
    const categoryLabel = categoryLabelMap[category] || categoryLabelMap['ALL'];

    doc.setFontSize(16);
    doc.text('Produkt-Report', 20, 30);
    doc.setFontSize(10);
    doc.text(`Datum: ${date}`, 20, 45);
    doc.text(`Kategorie: ${categoryLabel}`, 20, 52);
    
    // Produktdaten für Tabelle vorbereiten
    const tableData: any[] = [];
    
    const addProductsToTable = (products: Array<{ articleNumber: string; name: string; quantity: number }>) => {
      products.forEach(product => {
        tableData.push([
          product.quantity.toString().replace('.', ','),
          product.articleNumber,
          product.name
        ]);
      });
    };

    // Nach ausgewählter Kategorie filtern
    if (category === 'ALL' || category === 'GEMUESE') {
      addProductsToTable(this.reportData.gemueseProductList);
    }

    if (category === 'ALL' || category === 'OBST') {
      addProductsToTable(this.reportData.obstProductList);
    }

    if (category === 'ALL' || category === 'DIVERS') {
      addProductsToTable(this.reportData.schnellverkaufProductList);
    }

    if (category === 'ALL' || category === 'FRISCHE_HAEHNCHEN') {
      addProductsToTable(this.reportData.frischeHaehnchenProductList);
    }
    
    // Tabelle erstellen (kleinere Schrift, damit Inhalt in eine Zeile passt)
    autoTable(doc, {
      head: [['Menge', 'Artikelnummer', 'Produktname']],
      body: tableData,
      startY: 60,
      styles: {
        fontSize: 8,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { cellWidth: 130 }
      }
    });
    
    // PDF in neuem Tab öffnen (Druckansicht/Drucken vom Tab aus möglich)
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  toggleCustomerSummary() {
    this.isCustomerSummaryCollapsed = !this.isCustomerSummaryCollapsed;
  }

  toggleProductCategory() {
    this.isProductCategoryCollapsed = !this.isProductCategoryCollapsed;
  }

  goBack() {
    this.router.navigate(['/admin']);
  }
}
