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
    gemueseProductList: Array<{ 
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    obstProductList: Array<{ 
      name: string; 
      quantity: number; 
      orders: number[];
      customers: Array<{ name: string; customerNumber: string; quantity: number; orderId: number }>;
    }>;
    schnellverkaufProductList: Array<{ 
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
    gemueseProductList: [],
    obstProductList: [],
    schnellverkaufProductList: [],
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
    // Lade alle Artikel für die Kategorie-Erkennung
    this.http.get<any[]>('${environment.apiUrl}/api/products')
      .subscribe({
        next: (response) => {
          this.globalArtikels = response || [];
          // Wenn Bestellungen bereits geladen sind, generiere den Report
          if (this.orders.length > 0) {
            this.generateReport();
          }
        },
        error: (error) => {
          console.error('Fehler beim Laden der Artikel:', error);
        }
      });
  }

  loadCustomers() {
    // Lade alle Kunden für die Zusammenfassung
    this.http.get<any[]>('${environment.apiUrl}/api/customers')
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

      this.http.get<OrdersResponse>('${environment.apiUrl}/api/orders/all-orders', { headers })
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
    }> = [];
    
    this.filteredOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: OrderItem) => {
          // Hole die echte Kategorie aus globalArtikels anstatt sie zu erraten
          const artikel = this.globalArtikels.find(
            a => a.article_number === item.product_article_number
          );
          
          if (artikel && artikel.category) {
            // Nur Artikel mit den gewünschten Kategorien hinzufügen
            if (artikel.category === 'GEMÜSE' || artikel.category === 'OBST' || 
                artikel.category === 'SCHNELLVERKAUF') {
              allProducts.push({
                name: item.product_name,
                quantity: item.quantity,
                orderId: order.order_id,
                category: artikel.category, // Echte Kategorie verwenden
                customerName: order.name,
                customerNumber: order.customer_number,
                company: order.company
              });
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

    allProducts.forEach(product => {
      if (product.category === 'GEMÜSE') {
        if (gemueseMap.has(product.name)) {
          const existing = gemueseMap.get(product.name)!;
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
          gemueseMap.set(product.name, { 
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
        if (obstMap.has(product.name)) {
          const existing = obstMap.get(product.name)!;
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
          obstMap.set(product.name, { 
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
        if (schnellverkaufMap.has(product.name)) {
          const existing = schnellverkaufMap.get(product.name)!;
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
          schnellverkaufMap.set(product.name, { 
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

    // Maps zu Arrays konvertieren
    this.reportData.gemueseProductList = Array.from(gemueseMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      orders: data.orders,
      customers: data.customers
    }));

    this.reportData.obstProductList = Array.from(obstMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      orders: data.orders,
      customers: data.customers
    }));

    this.reportData.schnellverkaufProductList = Array.from(schnellverkaufMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      orders: data.orders,
      customers: data.customers
    }));

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
      totalProducts: number;
      orders: number[];
    }>();

    // Alle Produkte durchgehen und Kunden-Statistiken sammeln
    [...this.reportData.gemueseProductList, ...this.reportData.obstProductList, 
     ...this.reportData.schnellverkaufProductList].forEach(product => {
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
            totalProducts: customer.quantity,
            orders: [customer.orderId]
          });
        }

        // Kategorie-spezifische Mengen aktualisieren
        const customerData = customerMap.get(key)!;
        if (this.reportData.gemueseProductList.some(p => p.name === product.name)) {
          customerData.gemueseTotal += customer.quantity;
        } else if (this.reportData.obstProductList.some(p => p.name === product.name)) {
          customerData.obstTotal += customer.quantity;
        } else if (this.reportData.schnellverkaufProductList.some(p => p.name === product.name)) {
          customerData.schnellverkaufTotal += customer.quantity;
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
      gemueseProductList: [],
      obstProductList: [],
      schnellverkaufProductList: [],
      customerSummary: []
    };
  }

  exportToPDF() {
    if (!this.filteredOrders.length) return;

    // Import jsPDF dynamically
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        this.generatePDF(jsPDF, autoTable);
      });
    });
  }

  private generatePDF(jsPDF: any, autoTable: any) {
    const doc = new jsPDF();
    
    // Header
    const date = new Date(this.selectedDate).toLocaleDateString('de-DE');
    doc.setFontSize(20);
    doc.text('Gemüse & Obst', 20, 30);
    doc.setFontSize(14);
    doc.text(`Datum: ${date}`, 20, 45);
    
    // Produktdaten für Tabelle vorbereiten
    const tableData: any[] = [];
    
    // GEMÜSE Produkte
    this.reportData.gemueseProductList.forEach(product => {
      tableData.push([
        product.name,
        product.quantity.toString().replace('.', ',')
      ]);
    });
    
    // OBST Produkte
    this.reportData.obstProductList.forEach(product => {
      tableData.push([
        product.name,
        product.quantity.toString().replace('.', ',')
      ]);
    });
    
    // DIVERS Produkte
    this.reportData.schnellverkaufProductList.forEach(product => {
      tableData.push([
        product.name,
        product.quantity.toString().replace('.', ',')
      ]);
    });
    
    // Tabelle erstellen
    autoTable(doc, {
      head: [['Produktname', 'Menge']],
      body: tableData,
      startY: 60,
      styles: {
        fontSize: 12,
        cellPadding: 5
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 120 }, // Produktname (breiter ohne Kategorie)
        1: { cellWidth: 40 }   // Menge
      }
    });
    
    // PDF speichern
    doc.save(`produkt-report_${this.selectedDate}.pdf`);
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
