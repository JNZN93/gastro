import { Component, OnInit } from '@angular/core';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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

interface PickingStatRow {
  picker_user_id: number | null;
  picker_user_name: string;
  order_count: number;
  total_amount: number;
}

interface PickingDayStat {
  date: string;
  order_count: number;
  total_amount: number;
}

interface PickingStatsResponse {
  from: string;
  to: string;
  totals: {
    orders: number;
    amount: number;
  };
  pickers: PickingStatRow[];
  days: PickingDayStat[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule],
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

  activeSection: 'picking' | 'products' = 'products';
  productSection: 'overview' | 'customers' | 'assortment' | 'chicken' = 'overview';
  pickingPeriod: 'day' | 'week' = 'day';
  pickingDate: string = '';
  pickingStatsLoading: boolean = false;
  pickingStatsError: string = '';
  pickingStats: PickingStatsResponse = {
    from: '',
    to: '',
    totals: { orders: 0, amount: 0 },
    pickers: [],
    days: []
  };
  
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
      customers: Array<{ name: string; customerNumber: string; company?: string; quantity: number; orderId: number }>;
    }>;
    frischeHaehnchenByCustomer: Array<{
      customerName: string;
      itemsLabel: string;
      items: Array<{ quantity: number; name: string }>;
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
    frischeHaehnchenByCustomer: [],
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
    this.pickingDate = this.getLocalToday();
    this.loadPickingStats();
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
          if (this.orders.length > 0 && this.globalArtikels.length > 0) {
            this.generateReport();
          }
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

  private getLocalToday(): string {
    return this.formatIsoDate(new Date());
  }

  private formatIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseIsoDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  formatGermanDate(value: string): string {
    if (!value) {
      return '';
    }
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }

  get maxPickerOrders(): number {
    return this.pickingStats.pickers.reduce((max, picker) => Math.max(max, picker.order_count), 0);
  }

  get maxPickerAmount(): number {
    return this.pickingStats.pickers.reduce((max, picker) => Math.max(max, picker.total_amount), 0);
  }

  get maxDayOrders(): number {
    return this.pickingStats.days.reduce((max, day) => Math.max(max, day.order_count), 0);
  }

  barPercent(value: number, max: number): number {
    if (!max) {
      return 0;
    }
    return Math.max(0, Math.min(100, (Number(value) / max) * 100));
  }

  weekdayLabel(value: string): string {
    const labels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return labels[this.parseIsoDate(value).getDay()] || '';
  }

  formatAmount(value: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(Number(value) || 0);
  }

  get pickingFrom(): string {
    if (this.pickingPeriod === 'week') {
      return this.startOfWeek(this.pickingDate);
    }
    return this.pickingDate;
  }

  get pickingTo(): string {
    if (this.pickingPeriod === 'week') {
      return this.endOfWeek(this.pickingDate);
    }
    return this.pickingDate;
  }

  get pickingRangeLabel(): string {
    if (this.pickingPeriod === 'week') {
      return `${this.formatGermanDate(this.pickingFrom)} – ${this.formatGermanDate(this.pickingTo)}`;
    }
    return this.formatGermanDate(this.pickingDate);
  }

  setActiveSection(section: 'picking' | 'products'): void {
    this.activeSection = section;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setProductSection(section: 'overview' | 'customers' | 'assortment' | 'chicken'): void {
    this.productSection = section;
    if (section === 'customers') {
      this.isCustomerSummaryCollapsed = false;
    }
    if (section === 'assortment') {
      this.isProductCategoryCollapsed = false;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setPickingPeriod(period: 'day' | 'week'): void {
    if (this.pickingPeriod === period) {
      return;
    }
    this.pickingPeriod = period;
    this.loadPickingStats();
  }

  onPickingDateChange(): void {
    this.loadPickingStats();
  }

  private startOfWeek(value: string): string {
    const date = this.parseIsoDate(value);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return this.formatIsoDate(date);
  }

  private endOfWeek(value: string): string {
    const date = this.parseIsoDate(this.startOfWeek(value));
    date.setDate(date.getDate() + 6);
    return this.formatIsoDate(date);
  }

  loadPickingStats(): void {
    const token = localStorage.getItem('token');
    if (!token || !this.pickingDate) {
      return;
    }

    this.pickingStatsLoading = true;
    this.pickingStatsError = '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    const from = this.pickingFrom;
    const to = this.pickingTo;

    this.http.get<PickingStatsResponse>(
      `${environment.apiUrl}/api/orders/picking-stats`,
      { headers, params: { from, to } }
    ).subscribe({
      next: (response) => {
        this.pickingStats = {
          from: response?.from || from,
          to: response?.to || to,
          totals: {
            orders: Number(response?.totals?.orders) || 0,
            amount: Number(response?.totals?.amount) || 0
          },
          pickers: response?.pickers || [],
          days: (response?.days || []).map((day) => ({
            date: day.date,
            order_count: Number(day.order_count) || 0,
            total_amount: Number(day.total_amount) || 0
          }))
        };
        this.pickingStatsLoading = false;
      },
      error: () => {
        this.pickingStats = {
          from,
          to,
          totals: { orders: 0, amount: 0 },
          pickers: [],
          days: []
        };
        this.pickingStatsError = 'Die Kommissionierung konnte nicht geladen werden.';
        this.pickingStatsLoading = false;
      }
    });
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
      customers: Array<{ name: string; customerNumber: string; company?: string; quantity: number; orderId: number }>;
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
            company: product.company,
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
              company: product.company,
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
    this.reportData.frischeHaehnchenByCustomer = this.buildFrischeHaehnchenByCustomer();

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
      frischeHaehnchenByCustomer: [],
      customerSummary: []
    };
  }

  /** Pro Kunde die Hähnchen-Artikel, z. B. „abis Hähnchengrill: 2x Hähnchen, 2x Hähnchenkeule“. */
  private buildFrischeHaehnchenByCustomer(): Array<{ customerName: string; itemsLabel: string; items: Array<{ quantity: number; name: string }> }> {
    const byCustomer = new Map<string, { customerName: string; items: Array<{ quantity: number; name: string }> }>();

    for (const product of this.reportData.frischeHaehnchenProductList) {
      for (const customer of product.customers) {
        const customerName = this.resolveChickenCustomerName(customer);
        const key = `${customer.customerNumber}::${customerName}`;
        let entry = byCustomer.get(key);
        if (!entry) {
          entry = { customerName, items: [] };
          byCustomer.set(key, entry);
        }
        const existingItem = entry.items.find(item => item.name === product.name);
        if (existingItem) {
          existingItem.quantity += customer.quantity;
        } else {
          entry.items.push({ quantity: customer.quantity, name: product.name });
        }
      }
    }

    return Array.from(byCustomer.values())
      .map(entry => {
        const items = [...entry.items].sort((a, b) => a.name.localeCompare(b.name, 'de'));
        return {
          customerName: entry.customerName,
          items,
          itemsLabel: items
            .map(item => `${this.formatQuantity(item.quantity)}x ${item.name}`)
            .join(', ')
        };
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));
  }

  private resolveChickenCustomerName(customer: { name: string; customerNumber: string; company?: string }): string {
    const fromMaster = this.getCustomerCompany(customer.customerNumber);
    if (fromMaster && fromMaster !== '-') return fromMaster;
    const company = (customer.company || '').trim();
    if (company) return company;
    const name = (customer.name || '').trim();
    if (name) return name;
    return customer.customerNumber || '-';
  }

  private formatQuantity(quantity: number): string {
    return quantity % 1 === 0 ? String(quantity) : quantity.toFixed(2).replace('.', ',');
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

  exportPickingPdf() {
    if (this.pickingStatsLoading || this.pickingStatsError) {
      return;
    }

    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        this.generatePickingPdf(jsPDF, autoTable);
      });
    });
  }

  exportHaehnchenKundenPdf() {
    if (!this.filteredOrders.length) return;

    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        this.generateHaehnchenKundenPdf(jsPDF, autoTable);
      });
    });
  }

  private generatePickingPdf(jsPDF: any, autoTable: any) {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const periodLabel = this.pickingPeriod === 'week' ? 'Woche' : 'Tag';
    const rows = this.pickingStats.pickers;
    let y = 18;

    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Kommissionierung', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(`${periodLabel}: ${this.pickingRangeLabel}`, margin, y);
    y += 6;
    doc.text(
      `Summe: ${this.pickingStats.totals.orders} Bestellungen, ${this.formatPdfAmount(this.pickingStats.totals.amount)}`,
      margin,
      y
    );
    y += 10;

    if (rows.length > 0) {
      const gap = 8;
      const columnWidth = (contentWidth - gap) / 2;
      const orderItems = rows.map((picker) => ({
        label: this.pdfText(picker.picker_user_name),
        value: picker.order_count,
        text: String(picker.order_count)
      }));
      const amountItems = rows.map((picker) => ({
        label: this.pdfText(picker.picker_user_name),
        value: picker.total_amount,
        text: this.formatPdfAmount(picker.total_amount)
      }));
      const chartHeight = Math.max(
        this.measurePdfBarChart(orderItems.length),
        this.measurePdfBarChart(amountItems.length)
      );
      y = this.ensurePdfSpace(doc, y, chartHeight, pageHeight, margin);
      this.drawPdfBarChart(doc, {
        x: margin,
        y,
        width: columnWidth,
        title: 'Bestellungen',
        color: [21, 101, 192],
        items: orderItems
      });
      this.drawPdfBarChart(doc, {
        x: margin + columnWidth + gap,
        y,
        width: columnWidth,
        title: 'Betrag',
        color: [5, 150, 105],
        items: amountItems
      });
      y += chartHeight + 8;
    }

    if (this.pickingPeriod === 'week' && this.pickingStats.totals.orders > 0) {
      const dayHeight = 62;
      y = this.ensurePdfSpace(doc, y, dayHeight, pageHeight, margin);
      this.drawPdfDayChart(doc, {
        x: margin,
        y,
        width: contentWidth,
        days: this.pickingStats.days
      });
      y += dayHeight + 6;
    }

    const body = rows.length === 0
      ? [['Keine Kommissionierungen in diesem Zeitraum', '', '']]
      : rows.map((picker) => [
          this.pdfText(picker.picker_user_name),
          String(picker.order_count),
          this.formatPdfAmount(picker.total_amount)
        ]);

    if (rows.length > 0) {
      body.push([
        'Gesamt',
        String(this.pickingStats.totals.orders),
        this.formatPdfAmount(this.pickingStats.totals.amount)
      ]);
    }

    doc.setTextColor(17, 24, 39);
    autoTable(doc, {
      head: [['Mitarbeiter', 'Anzahl Bestellungen', 'Betrag']],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 10,
        cellPadding: 3,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [17, 24, 39]
      },
      headStyles: {
        fillColor: [21, 101, 192],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' }
      },
      didParseCell: (data: { row: { index: number }; section: string; cell: { styles: { fontStyle: string; fillColor: number[] } } }) => {
        if (rows.length > 0 && data.section === 'body' && data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [239, 246, 255];
        }
      }
    });

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  private measurePdfBarChart(rowCount: number): number {
    return 8 + Math.max(rowCount, 1) * 8;
  }

  private ensurePdfSpace(doc: any, y: number, needed: number, pageHeight: number, margin: number): number {
    if (y + needed <= pageHeight - margin) {
      return y;
    }
    doc.addPage();
    return margin + 6;
  }

  private drawPdfBarChart(
    doc: any,
    options: {
      x: number;
      y: number;
      width: number;
      title: string;
      color: [number, number, number];
      items: Array<{ label: string; value: number; text: string }>;
    }
  ): number {
    const { x, y, width, title, color, items } = options;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(title, x, y + 4);

    const max = items.reduce((highest, item) => Math.max(highest, item.value), 0);
    const labelWidth = 24;
    const valueWidth = 34;
    const barX = x + labelWidth;
    const barWidth = Math.max(8, width - labelWidth - valueWidth);
    let rowY = y + 8;

    items.forEach((item) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(17, 24, 39);
      doc.text(this.fitPdfText(doc, item.label, labelWidth - 2), x, rowY + 4);

      doc.setFillColor(243, 244, 246);
      doc.roundedRect(barX, rowY + 1, barWidth, 3.2, 1, 1, 'F');
      const fillWidth = max > 0 ? Math.max(item.value > 0 ? 1.2 : 0, (item.value / max) * barWidth) : 0;
      if (fillWidth > 0) {
        doc.setFillColor(color[0], color[1], color[2]);
        doc.roundedRect(barX, rowY + 1, fillWidth, 3.2, 1, 1, 'F');
      }

      doc.setFontSize(8);
      doc.text(item.text, x + width, rowY + 4, { align: 'right' });
      rowY += 8;
    });

    return this.measurePdfBarChart(items.length);
  }

  private drawPdfDayChart(
    doc: any,
    options: {
      x: number;
      y: number;
      width: number;
      days: Array<{ date: string; order_count: number; total_amount: number }>;
    }
  ): void {
    const { x, y, width, days } = options;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text('Verlauf der Woche', x, y + 4);

    const max = days.reduce((highest, day) => Math.max(highest, day.order_count), 0);
    const slot = width / Math.max(days.length, 1);
    const barMaxHeight = 32;
    const baseY = y + 44;

    days.forEach((day, index) => {
      const center = x + slot * index + slot / 2;
      const barWidth = Math.min(10, slot - 4);
      const barHeight = max > 0 ? (day.order_count / max) * barMaxHeight : 0;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(center - barWidth / 2, baseY - barMaxHeight, barWidth, barMaxHeight, 1, 1, 'F');
      if (barHeight > 0) {
        doc.setFillColor(21, 101, 192);
        doc.roundedRect(center - barWidth / 2, baseY - barHeight, barWidth, barHeight, 1, 1, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(17, 24, 39);
      doc.text(String(day.order_count), center, baseY - barMaxHeight - 2, { align: 'center' });
      doc.text(this.weekdayLabel(day.date), center, baseY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(107, 114, 128);
      doc.text(this.formatPdfAmount(day.total_amount), center, baseY + 9, { align: 'center' });
    });
  }

  private fitPdfText(doc: any, value: string, maxWidth: number): string {
    if (doc.getTextWidth(value) <= maxWidth) {
      return value;
    }
    let trimmed = value;
    while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}...`) > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}...`;
  }

  private formatPdfAmount(value: number): string {
    const formatted = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
    return `${formatted} EUR`;
  }

  private pdfText(value: string): string {
    const text = String(value || '').replace(/[^\u0000-\u00ff]/g, '').trim();
    return text || 'Unbekannt';
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

    // Nach Artikelnummer sortieren
    tableData.sort((a, b) => (a[1] || '').localeCompare(b[1] || '', undefined, { numeric: true }));

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

  /** PDF: eine Zeile pro Artikel, Spalten Name, Menge, Artikelbezeichnung. */
  private generateHaehnchenKundenPdf(jsPDF: any, autoTable: any) {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const date = new Date(this.selectedDate).toLocaleDateString('de-DE');
    const rows = this.reportData.frischeHaehnchenByCustomer;

    doc.setFontSize(16);
    doc.text('Frische Hähnchen – je Kunde', 14, 18);
    doc.setFontSize(10);
    doc.text(`Datum: ${date}`, 14, 28);

    const pageInnerWidth = 182;
    const mengeWidth = 18;
    const minArtikelWidth = 70;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    let nameWidth = 46;
    for (const row of rows) {
      const needed = doc.getTextWidth(row.customerName) + 8;
      if (needed > nameWidth) nameWidth = needed;
    }
    nameWidth = Math.min(Math.ceil(nameWidth), pageInnerWidth - mengeWidth - minArtikelWidth);
    const artikelWidth = pageInnerWidth - mengeWidth - nameWidth;

    const body: any[] = [];
    if (rows.length === 0) {
      body.push(['–', '–', 'Keine Hähnchen-Positionen für dieses Datum']);
    } else {
      rows.forEach((row, index) => {
        const fillColor = index % 2 === 0 ? [255, 251, 235] : [255, 255, 255];
        row.items.forEach((item, itemIndex) => {
          body.push([
            {
              content: itemIndex === 0 ? row.customerName : '',
              styles: { fontStyle: 'bold', fillColor }
            },
            {
              content: this.formatQuantity(item.quantity),
              styles: { halign: 'right', fontStyle: 'bold', fillColor }
            },
            {
              content: item.name,
              styles: { fillColor }
            }
          ]);
        });
      });
    }

    autoTable(doc, {
      head: [['Name', 'Menge', 'Artikelbezeichnung']],
      body,
      startY: 36,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 11,
        cellPadding: 3,
        overflow: 'linebreak',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [180, 83, 9],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: nameWidth, overflow: 'linebreak' },
        1: { cellWidth: mengeWidth, halign: 'right' },
        2: { cellWidth: artikelWidth }
      }
    });

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
