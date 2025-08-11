import { Component, OnInit } from '@angular/core';
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
  
  // Report-Daten
  reportData: {
    totalOrders: number;
    totalProducts: number;
    gemueseProducts: { [key: string]: number };
    obstProducts: { [key: string]: number };
    gemueseTotal: number;
    obstTotal: number;
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
    customerSummary: Array<{
      customerName: string;
      customerNumber: string;
      company: string;
      gemueseTotal: number;
      obstTotal: number;
      totalProducts: number;
      orders: number[];
    }>;
  } = {
    totalOrders: 0,
    totalProducts: 0,
    gemueseProducts: {},
    obstProducts: {},
    gemueseTotal: 0,
    obstTotal: 0,
    gemueseProductList: [],
    obstProductList: [],
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
    this.selectedDate = this.getTodayDate();
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

      this.http.get<OrdersResponse>('https://multi-mandant-ecommerce.onrender.com/api/orders/all-orders', { headers })
        .subscribe({
          next: (response) => {
            this.orders = response.orders || [];
            this.generateReport();
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
    this.filteredOrders = this.orders.filter(order => {
      const orderDate = new Date(order.created_at).toISOString().split('T')[0];
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
          const category = this.getProductCategory(item.product_name);
          if (category === 'GEMÜSE' || category === 'OBST') {
            allProducts.push({
              name: item.product_name,
              quantity: item.quantity,
              orderId: order.order_id,
              category: category,
              customerName: order.name,
              customerNumber: order.customer_number,
              company: order.company
            });
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

    // Gesamtmengen berechnen
    this.reportData.gemueseTotal = this.reportData.gemueseProductList.reduce(
      (sum, product) => sum + product.quantity, 0
    );
    
    this.reportData.obstTotal = this.reportData.obstProductList.reduce(
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
      totalProducts: number;
      orders: number[];
    }>();

    // Alle Produkte durchgehen und Kunden-Statistiken sammeln
    [...this.reportData.gemueseProductList, ...this.reportData.obstProductList].forEach(product => {
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
            totalProducts: customer.quantity,
            orders: [customer.orderId]
          });
        }

        // Kategorie-spezifische Mengen aktualisieren
        const customerData = customerMap.get(key)!;
        if (this.reportData.gemueseProductList.some(p => p.name === product.name)) {
          customerData.gemueseTotal += customer.quantity;
        } else {
          customerData.obstTotal += customer.quantity;
        }
      });
    });

    this.reportData.customerSummary = Array.from(customerMap.values())
      .sort((a, b) => b.totalProducts - a.totalProducts); // Nach Gesamtmenge sortieren
  }

  getCustomerCompany(customerNumber: string): string {
    const order = this.filteredOrders.find(o => o.customer_number === customerNumber);
    return order?.company || '-';
  }

  getProductCategory(productName: string): string {
    // Check for PFAND products (beverages, drinks, etc.) to exclude them from GEMÜSE/OBST
    const pfandKeywords = [
      'fanta', 'coca-cola', 'coca cola', 'pepsi', 'sprite', '7up', 'dr pepper',
      'red bull', 'monster', 'rockstar', 'burn', 'powerade', 'gatorade',
      'ice tea', 'eistee', 'fuze tea', 'durstlöscher', 'apfelschorle', 'orangensaft',
      'cola', 'limonade', 'saft', 'getränk', 'getraenk', 'drink', 'beverage',
      'bier', 'wein', 'cocktail', 'margarita', 'mojito', 'gin tonic',
      'whiskey', 'vodka', 'rum', 'tequila', 'schnaps', 'likör', 'likoer',
      'wasser', 'mineralwasser', 'stilles wasser', 'sprudel', 'kohlensäure',
      'kohlensaeure', 'koffeinfrei', 'ohne koffein',
      'dose', 'flasche', 'pet', 'glas', 'aluminium', 'blechdose', 'getränkedose',
      'pfand', 'einweg', 'mehrweg', 'returnable', 'deposit'
    ];
    
    const gemueseKeywords = [
      'gemüse', 'gemuese', 'tomate', 'gurke', 'paprika', 'zwiebel', 'karotte', 
      'kartoffel', 'brokkoli', 'blumenkohl', 'spinat', 'salat', 'kohl', 'möhre',
      'lauch', 'sellerie', 'radieschen', 'rettich', 'kürbis', 'aubergine', 'zucchini',
      'möhre', 'karotte', 'kartoffel', 'zwiebel', 'knoblauch', 'ingwer', 'chili',
      'basilikum', 'oregano', 'thymian', 'rosmarin', 'salbei', 'petersilie', 'dill',
      'kartoffeln', 'zwiebeln', 'möhren', 'karotten', 'tomaten', 'gurken', 'paprikas',
      'salat', 'rucola', 'endivie', 'chicorée', 'chicoree', 'feldsalat', 'kopfsalat',
      'eisbergsalat', 'romana', 'batavia', 'lollo rosso', 'lollo bionda'
    ];
    
    const obstKeywords = [
      'obst', 'apfel', 'banane', 'orange', 'birne', 'traube', 'erdbeere', 
      'himbeere', 'brombeere', 'pfirsich', 'aprikose', 'pflaume', 'kirsche',
      'ananas', 'mango', 'kiwi', 'zitrone', 'limette', 'grapefruit', 'mandarine',
      'clementine', 'tangerine', 'pampelmuse', 'pomelo', 'blutorange', 'blutorange',
      'äpfel', 'bananen', 'orangen', 'birnen', 'trauben', 'erdbeeren', 'himbeeren',
      'brombeeren', 'pfirsiche', 'aprikosen', 'pflaumen', 'kirschen', 'ananas',
      'mangos', 'kiwis', 'zitronen', 'limetten', 'grapefruits', 'mandarinen',
      'nectarine', 'pfirsich', 'aprikose', 'pflaume', 'kirsche', 'weintraube',
      'stachelbeere', 'johannisbeere', 'heidelbeere', 'preiselbeere', 'cranberry'
    ];
    
    const lowerName = productName.toLowerCase();
    
    // First check for specific PFAND products (only the problematic ones)
    const specificPfandProducts = [
      'fanta mango dragonfruit', 'hot blood ice tea', 'durstlöscher zitrone', 
      'durstlöscher eistee', 'fuze tea zitrone', 'fuze tea pfirsich'
    ];
    
    if (specificPfandProducts.some(product => lowerName.includes(product))) {
      return 'SONSTIGES';
    }
    
    // Check for general PFAND keywords only if they're clearly beverages
    if (pfandKeywords.some(keyword => lowerName.includes(keyword))) {
      // But allow some exceptions for food products that might contain these words
      if (lowerName.includes('saft') && (lowerName.includes('gemüse') || lowerName.includes('gemuese'))) {
        // Gemüsesaft should be GEMÜSE
        return 'GEMÜSE';
      }
      if (lowerName.includes('saft') && (lowerName.includes('obst') || lowerName.includes('frucht'))) {
        // Obstsaft should be OBST
        return 'OBST';
      }
      // For other PFAND products, exclude them
      return 'SONSTIGES';
    }
    
    if (gemueseKeywords.some(keyword => lowerName.includes(keyword))) {
      return 'GEMÜSE';
    } else if (obstKeywords.some(keyword => lowerName.includes(keyword))) {
      return 'OBST';
    }
    
    return 'SONSTIGES';
  }

  resetReportData() {
    this.reportData = {
      totalOrders: 0,
      totalProducts: 0,
      gemueseProducts: {},
      obstProducts: {},
      gemueseTotal: 0,
      obstTotal: 0,
      gemueseProductList: [],
      obstProductList: [],
      customerSummary: []
    };
  }

  exportToCSV() {
    if (!this.filteredOrders.length) return;

    const csvContent = this.generateCSVContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `report_${this.selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  generateCSVContent(): string {
    const headers = ['Produktname', 'Kategorie', 'Gesamtmenge', 'Anzahl Bestellungen', 'Bestellnummern', 'Kunden'];
    const rows: string[][] = [];

    // GEMÜSE Produkte
    this.reportData.gemueseProductList.forEach(product => {
      const customers = product.customers.map(c => `${c.name} (${c.customerNumber})`).join('; ');
      rows.push([
        product.name,
        'GEMÜSE',
        product.quantity.toString(),
        product.orders.length.toString(),
        product.orders.join(', '),
        customers
      ]);
    });

    // OBST Produkte
    this.reportData.obstProductList.forEach(product => {
      const customers = product.customers.map(c => `${c.name} (${c.customerNumber})`).join('; ');
      rows.push([
        product.name,
        'OBST',
        product.quantity.toString(),
        product.orders.length.toString(),
        product.orders.join(', '),
        customers
      ]);
    });

    return [headers, ...rows]
      .map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(','))
      .join('\n');
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
