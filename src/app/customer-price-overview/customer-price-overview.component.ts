import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../authentication.service';
import { GlobalService } from '../global.service';

interface CustomerArticlePrice {
  id: number;
  customer_id: string;
  product_id: string;
  invoice_id: number;
  unit_price_net: number | string;
  unit_price_gross: number | string;
  article_text?: string | null;
  invoice_date: string;
  created_at: string;
  updated_at: string;
}

interface PriceGroup {
  price: number;
  count: number;
  customers: string[];
  invoice_info: {
    customer_id: string;
    invoice_id: number;
    invoice_date: string;
  }[];
}

interface ProductPriceOverview {
  product_id: string;
  article_text: string;
  price_groups: PriceGroup[];
  total_customers: number;
}

type ArticleSortMode = 'count' | 'price' | 'date';

@Component({
  selector: 'app-customer-price-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-price-overview.component.html',
  styleUrl: './customer-price-overview.component.scss'
})
export class CustomerPriceOverviewComponent implements OnInit {
  customerPrices: CustomerArticlePrice[] = [];
  productOverviews: ProductPriceOverview[] = [];
  private productNameByArticleNumber = new Map<string, string>();
  loading = false;
  error: string | null = null;
  searchTerm = '';
  
  // Customer Details Modal Properties
  showCustomerModal = false;
  selectedCustomer: any = null;
  selectedCustomerInvoices: any[] = [];
  selectedProductContext: { product_id: string, article_text: string } | null = null;
  isLoadingCustomer = false;
  customerError: string | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadCustomerPrices();
  }

  checkUserRole(): void {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        if (response?.user?.role !== 'admin' && response?.user?.role !== 'employee') {
          this.router.navigate(['/login']);
        }
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      }
    });
  }

  loadCustomerPrices(): void {
    this.loading = true;
    this.error = null;

    const token = localStorage.getItem('token');
    if (!token) {
      this.error = 'Kein gültiger Token gefunden';
      this.loading = false;
      return;
    }

    forkJoin({
      prices: this.http.get<CustomerArticlePrice[]>(`${environment.apiUrl}/api/customer-article-prices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }),
      products: this.http.get<Array<{ article_number?: string; article_text?: string }>>(
        `${environment.apiUrl}/api/products`
      )
    }).subscribe({
      next: ({ prices, products }) => {
        this.productNameByArticleNumber = new Map(
          products
            .filter(product => product.article_number && product.article_text?.trim())
            .map(product => [product.article_number!, product.article_text!.trim()])
        );
        this.customerPrices = prices;
        this.processPriceData();
        this.loading = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Kundenpreise:', error);
        this.error = 'Fehler beim Laden der Kundenpreise';
        this.loading = false;
      }
    });
  }

  private resolveArticleText(productId: string, prices: CustomerArticlePrice[]): string {
    const priceText = prices
      .map(price => (price.article_text || '').trim())
      .find(text => text.length > 0);

    if (priceText) {
      return priceText;
    }

    const productText = (this.productNameByArticleNumber.get(productId) || '').trim();
    return productText || 'Unbekannter Artikel';
  }

  processPriceData(): void {
    // Gruppiere die Preise nach Produkt-ID
    const productGroups = new Map<string, CustomerArticlePrice[]>();
    
    this.customerPrices.forEach(price => {
      if (!productGroups.has(price.product_id)) {
        productGroups.set(price.product_id, []);
      }
      productGroups.get(price.product_id)!.push(price);
    });

    // Verarbeite jede Produktgruppe
    this.productOverviews = Array.from(productGroups.entries()).map(([productId, prices]) => {
      // Gruppiere nach identischen Preisen (unit_price_net)
      const priceGroups = new Map<number, CustomerArticlePrice[]>();
      
      prices.forEach(price => {
        // Konvertiere den Preis zu einer Zahl, falls es ein String ist
        const netPrice = typeof price.unit_price_net === 'string' 
          ? parseFloat(price.unit_price_net) 
          : price.unit_price_net;
        
        // Überspringe ungültige Preise
        if (isNaN(netPrice)) return;
        
        if (!priceGroups.has(netPrice)) {
          priceGroups.set(netPrice, []);
        }
        priceGroups.get(netPrice)!.push(price);
      });

      // Erstelle PriceGroup Objekte
      const priceGroupArray: PriceGroup[] = Array.from(priceGroups.entries()).map(([price, priceList]) => ({
        price: price,
        count: priceList.length,
        customers: priceList.map(p => p.customer_id).sort(),
        invoice_info: priceList.map(p => ({
          customer_id: p.customer_id,
          invoice_id: p.invoice_id,
          invoice_date: p.invoice_date
        }))
      })).sort((a, b) => b.count - a.count); // Sortiere nach Anzahl absteigend

      const articleText = this.resolveArticleText(productId, prices);

      return {
        product_id: productId,
        article_text: articleText,
        price_groups: priceGroupArray,
        total_customers: prices.length
      };
    }).sort((a, b) => a.article_text.localeCompare(b.article_text)); // Sortiere nach Artikeltext

    // Preload customer details for all unique customers
    const allCustomers = new Set<string>();
    this.customerPrices.forEach(price => {
      allCustomers.add(price.customer_id);
    });
    this.preloadCustomerDetails(Array.from(allCustomers));
  }

  get filteredProductOverviews(): ProductPriceOverview[] {
    let filtered = this.productOverviews;

    if (this.searchTerm.trim()) {
      const trimmedTerm = this.searchTerm.trim();
      
      // Mindestlänge prüfen (außer bei EAN)
      const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
      if (!isEanSearch && trimmedTerm.length < 3) {
        return [];
      }

      const searchLower = trimmedTerm.toLowerCase();
      
      // Erweiterte Suche mit mehreren Kriterien (wie in Customer Orders)
      const terms = searchLower.split(/\s+/); // Mehrere Suchbegriffe unterstützen
      
      filtered = filtered.filter(overview => {
        // Alle Suchbegriffe müssen in mindestens einem Feld gefunden werden
        return terms.every(term => {
          // Suche in Produkt-ID
          const productIdMatch = overview.product_id.toLowerCase().includes(term);
          
          // Suche in Artikeltext/Beschreibung
          const articleTextMatch = overview.article_text.toLowerCase().includes(term);
          
          // Suche in Kundennummern (alle Kundennummern aller Preisgruppen)
          const customerNumbersMatch = overview.price_groups.some(group => 
            group.customers.some(customer => 
              customer.toLowerCase().includes(term)
            )
          );
          
          // Suche in Preisen (als String)
          const priceMatch = overview.price_groups.some(group => 
            group.price.toString().includes(term) ||
            group.price.toFixed(2).includes(term)
          );
          
          return productIdMatch || articleTextMatch || customerNumbersMatch || priceMatch;
        });
      });

      // Intelligente Sortierung wie in Customer Orders
      filtered = filtered.sort((a, b) => {
        const aProductIdExact = a.product_id.toLowerCase() === searchLower;
        const bProductIdExact = b.product_id.toLowerCase() === searchLower;
        const aArticleTextExact = a.article_text.toLowerCase() === searchLower;
        const bArticleTextExact = b.article_text.toLowerCase() === searchLower;

        const aProductIdStartsWith = a.product_id.toLowerCase().startsWith(searchLower);
        const bProductIdStartsWith = b.product_id.toLowerCase().startsWith(searchLower);
        const aArticleTextStartsWith = a.article_text.toLowerCase().startsWith(searchLower);
        const bArticleTextStartsWith = b.article_text.toLowerCase().startsWith(searchLower);

        // Exakte Matches zuerst
        if (aProductIdExact && !bProductIdExact) return -1;
        if (!aProductIdExact && bProductIdExact) return 1;
        if (aArticleTextExact && !bArticleTextExact) return -1;
        if (!aArticleTextExact && bArticleTextExact) return 1;
        
        // Starts-with Matches
        if (aProductIdStartsWith && !bProductIdStartsWith) return -1;
        if (!aProductIdStartsWith && bProductIdStartsWith) return 1;
        if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
        if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
        
        // Alphabetische Sortierung
        return a.article_text.localeCompare(b.article_text);
      });
    } else {
      // Wenn kein Suchbegriff eingegeben wurde, zeige keine Artikel an
      filtered = [];
    }

    return filtered;
  }

  formatPrice(price: number | string): string {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '€0.00';
    return `€${numPrice.toFixed(2)}`;
  }

  formatInvoiceDate(dateString: string): string {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('de-DE');
    } catch {
      return dateString;
    }
  }

  getInvoiceArticles(invoiceId: number): any[] {
    return this.selectedCustomerInvoices.filter(invoice => invoice.invoice_id === invoiceId);
  }

  refreshData(): void {
    this.loadCustomerPrices();
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  // Hilfsmethode um zu prüfen, ob gerade gesucht wird
  get isSearching(): boolean {
    return this.searchTerm.trim().length > 0;
  }

  // Hilfsmethode um zu prüfen, ob ein Artikel mehrere unterschiedliche Preise hat
  hasMultiplePrices(overview: ProductPriceOverview): boolean {
    return overview.price_groups.length > 1;
  }

  // Hilfsmethode um den häufigsten Preis zu finden
  getMostCommonPrice(overview: ProductPriceOverview): PriceGroup {
    return overview.price_groups[0]; // Bereits nach count sortiert
  }

  // Hilfsmethode um Preisunterschiede zu berechnen
  getPriceDifference(overview: ProductPriceOverview): number {
    if (overview.price_groups.length < 2) return 0;
    const prices = overview.price_groups.map(g => g.price);
    const highest = Math.max(...prices);
    const lowest = Math.min(...prices);
    return highest - lowest;
  }

  // Expandable/Collapsible State Management
  expandedArticles = new Set<string>();

  toggleArticleExpansion(articleText: string): void {
    if (this.expandedArticles.has(articleText)) {
      this.expandedArticles.delete(articleText);
    } else {
      this.expandedArticles.add(articleText);
    }
  }

  isArticleExpanded(articleText: string): boolean {
    return this.expandedArticles.has(articleText);
  }

  // Sortierung State Management
  articleSortMode = new Map<string, ArticleSortMode>();

  readonly articleSortOptions: { value: ArticleSortMode; label: string }[] = [
    { value: 'count', label: 'Kundenanzahl' },
    { value: 'price', label: 'Preis' },
    { value: 'date', label: 'Datum (neueste)' }
  ];

  setArticleSortMode(productId: string, mode: ArticleSortMode): void {
    this.articleSortMode.set(productId, mode);
  }

  getArticleSortMode(productId: string): ArticleSortMode {
    return this.articleSortMode.get(productId) || 'count';
  }

  getLatestInvoiceDate(group: PriceGroup): string | null {
    let latestDate: string | null = null;
    let latestTimestamp = 0;

    group.invoice_info.forEach(info => {
      if (!info.invoice_date) {
        return;
      }

      const timestamp = new Date(info.invoice_date).getTime();
      if (!Number.isNaN(timestamp) && timestamp >= latestTimestamp) {
        latestTimestamp = timestamp;
        latestDate = info.invoice_date;
      }
    });

    return latestDate;
  }

  private getLatestInvoiceTimestamp(group: PriceGroup): number {
    const latestDate = this.getLatestInvoiceDate(group);
    if (!latestDate) {
      return 0;
    }

    const timestamp = new Date(latestDate).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  getSortedPriceGroups(overview: ProductPriceOverview): PriceGroup[] {
    const sortMode = this.getArticleSortMode(overview.product_id);
    
    if (sortMode === 'price') {
      return [...overview.price_groups].sort((a, b) => a.price - b.price);
    }

    if (sortMode === 'date') {
      return [...overview.price_groups].sort(
        (a, b) => this.getLatestInvoiceTimestamp(b) - this.getLatestInvoiceTimestamp(a)
      );
    }

    return overview.price_groups;
  }

  // Store customer details for quick access
  customerDetailsMap = new Map<string, any>();

  loadCustomerDetail(customerId: string): void {
    if (this.customerDetailsMap.has(customerId)) {
      return; // Already loaded
    }

    this.http.get<any[]>(`${environment.apiUrl}/api/customers`, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).subscribe({
      next: (customers) => {
        const customer = customers.find(c => c.customer_number === customerId);
        if (customer) {
          this.customerDetailsMap.set(customerId, customer);
        }
      },
      error: (error) => {
        console.error('Fehler beim Laden der Kundendetails:', error);
      }
    });
  }

  getCustomerDetail(customerId: string): any {
    return this.customerDetailsMap.get(customerId);
  }

  // Preload customer details for visible customers
  preloadCustomerDetails(customerIds: string[]): void {
    customerIds.forEach(customerId => {
      this.loadCustomerDetail(customerId);
    });
  }

  // Get invoice information for a specific customer in a price group
  getInvoiceInfoForCustomer(customerId: string, group: PriceGroup): { customer_id: string, invoice_id: number, invoice_date: string } | undefined {
    return group.invoice_info.find(info => info.customer_id === customerId);
  }

  // Methode zum Laden der Kundendetails
  loadCustomerDetails(customerId: string): void {
    console.log('👤 [LOAD-CUSTOMER-DETAILS] Lade Details für Kunde:', customerId);
    
    this.isLoadingCustomer = true;
    this.customerError = null;
    this.showCustomerModal = true;

    this.http.get<any[]>(`${environment.apiUrl}/api/customers`, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).subscribe({
      next: (customers) => {
        // Finde den spezifischen Kunden
        const customer = customers.find(c => c.customer_number === customerId);
        if (customer) {
          this.selectedCustomer = customer;
          console.log('✅ [LOAD-CUSTOMER-DETAILS] Kundendetails geladen:', customer);
        } else {
          this.customerError = `Kunde ${customerId} nicht gefunden`;
          console.warn('⚠️ [LOAD-CUSTOMER-DETAILS] Kunde nicht gefunden:', customerId);
        }
        this.isLoadingCustomer = false;
      },
      error: (error) => {
        console.error('❌ [LOAD-CUSTOMER-DETAILS] Fehler beim Laden der Kundendetails:', error);
        this.customerError = 'Fehler beim Laden der Kundendetails';
        this.isLoadingCustomer = false;
      }
    });
  }

  // Methode zum Schließen des Customer Modals
  closeCustomerModal(): void {
    this.showCustomerModal = false;
    this.selectedCustomer = null;
    this.selectedCustomerInvoices = [];
    this.selectedProductContext = null;
    this.customerError = null;
    this.isLoadingCustomer = false;
  }

  // Methode zum Navigieren zu einem Kunden in der Customer Orders Komponente
  navigateToCustomer(customerId: string, productContext?: { product_id: string, article_text: string }): void {
    console.log('👤 [NAVIGATE-CUSTOMER] Zeige Kundendetails für:', customerId, 'mit Artikel:', productContext);
    
    this.selectedProductContext = productContext || null;
    
    // Sammle Rechnungsinformationen nur für den spezifischen Artikel, falls Kontext vorhanden
    this.selectedCustomerInvoices = [];
    
    if (productContext) {
      // Finde den spezifischen Artikel
      const productOverview = this.productOverviews.find(overview => overview.product_id === productContext.product_id);
      if (productOverview) {
        productOverview.price_groups.forEach(group => {
          group.invoice_info.forEach(invoice => {
            if (invoice.customer_id === customerId) {
              this.selectedCustomerInvoices.push({
                invoice_id: invoice.invoice_id,
                invoice_date: invoice.invoice_date,
                product_id: productOverview.product_id,
                article_text: productOverview.article_text,
                price: group.price
              });
            }
          });
        });
        
        // Entferne Duplikate basierend auf invoice_id
        this.selectedCustomerInvoices = this.selectedCustomerInvoices.filter((invoice, index, self) => 
          index === self.findIndex(i => i.invoice_id === invoice.invoice_id)
        );
        
        // Sortiere nach Rechnungsdatum absteigend
        this.selectedCustomerInvoices.sort((a, b) => 
          new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
        );
      }
    }
    
    this.loadCustomerDetails(customerId);
  }
}
