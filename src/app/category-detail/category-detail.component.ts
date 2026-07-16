import { CommonModule, ViewportScroller } from '@angular/common';
import { Component, OnInit, inject, ViewChild, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';
import { OffersService, OfferWithProducts, OfferProduct } from '../offers.service';
import { environment } from '../../environments/environment';
import { showCameraScanner } from '../core/platform';

// Interface für kundenspezifische Preise
interface CustomerArticlePrice {
  id: number;
  customer_id: string;
  product_id: string;
  invoice_id: number;
  unit_price_net: string;
  unit_price_gross: string;
  vat_percentage: string;
  invoice_date: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-category-detail',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent, ZXingScannerModule],
  templateUrl: './category-detail.component.html',
  styleUrl: './category-detail.component.scss',
})
export class CategoryDetailComponent implements OnInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private viewportScroller = inject(ViewportScroller);
  
  categoryName: string = '';
  artikelData: any[] = [];
  globalArtikels: any[] = [];
  isVisible: boolean = true;
  searchTerm: string = '';
  filteredData: any[] = [];
  
  // Pagination properties
  currentPage: number = 1;
  itemsPerPage: number = 50;
  paginatedData: any[] = [];

  // Performance-Optimierungen
  private scrollTimeout: any;
  private imageLoadPromises: Promise<void>[] = [];
  private virtualScrollConfig = {
    itemHeight: 300, // Geschätzte Höhe pro Produktkarte
    viewportHeight: 800,
    bufferSize: 5
  };

  // Modal properties
  isModalOpen: boolean = false;
  modalImageUrl: string = '';
  modalImageAlt: string = '';
  modalProductId: number | null = null;
  isImageZoomed: boolean = false;

  // Eigenschaften für Toast-Benachrichtigung
  showToast: boolean = false;
  toastMessage: string = '';
  toastType: 'success' | 'error' = 'success';
  toastTopPosition: number = 20;

  // Scanner-Eigenschaften
  readonly showCameraScanner = showCameraScanner();
  isScanning = false;
  isTorchOn = false;
  availableDevices: MediaDeviceInfo[] = [];
  selectedDevice?: MediaDeviceInfo;
  formatsEnabled: BarcodeFormat[] = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF
  ];

  // Eigenschaften für Angebote
  activeOffers: OfferWithProducts[] = [];
  isLoadingOffers: boolean = false;
  offerProductsMap: Map<string, OfferProduct> = new Map();

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  constructor(
    private authService: AuthService,
    public globalService: GlobalService,
    private offersService: OffersService
  ) {}

  private scrollToTop(): void {
    // Scroll the scrollable-content container to top - instant
    const scrollableContent = document.querySelector('.scrollable-content') as HTMLElement;
    if (scrollableContent) {
      scrollableContent.scrollTop = 0;
    } else {
      // Fallback: scroll the entire page if container not found
      const scrollPosition = 0;
      this.viewportScroller.scrollToPosition([0, scrollPosition]);
      window.scrollTo(0, scrollPosition);
      document.documentElement.scrollTop = scrollPosition;
      document.body.scrollTop = scrollPosition;
    }
  }

  ngOnInit(): void {
    // Scroll to top immediately when component initializes
    this.scrollToTop();
    
    // Warenkorb aus localStorage laden (wie in product-catalog)
    const loadedWarenkorb = localStorage.getItem('warenkorb');
    if (loadedWarenkorb) {
      this.globalService.warenkorb = JSON.parse(loadedWarenkorb);
    }
    
    // Kategorie-Name aus der URL holen
    this.route.params.subscribe(params => {
      this.categoryName = decodeURIComponent(params['categoryName']);
      
      // Spezielle Behandlung für "alle-produkte" Kategorie
      if (this.categoryName === 'alle-produkte') {
        this.categoryName = 'Gastro Depot Worms - Alle Produkte';
      }
      
      this.loadCategoryProducts();
    });
    
    // Event-Listener für Scroll-Events (für Toast-Position) nach dem Laden der Daten hinzufügen
    setTimeout(() => {
      const scrollableContent = document.querySelector('.scrollable-content');
      if (scrollableContent) {
        scrollableContent.addEventListener('scroll', () => {
          if (this.showToast) {
            this.calculateToastPosition();
            this.cdr.detectChanges();
          }
        });
      }
    }, 500);
  }

  loadCategoryProducts(): void {
    this.isVisible = true;

    const token = localStorage.getItem('token');

    if (token) {
      // Benutzer ist angemeldet
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
          this.globalService.setUserLoggedIn(true);

          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }

            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            this.globalService.setPfandArtikels(this.globalArtikels);

            // Aktive Angebote laden für Angebotspreise
            this.loadActiveOffers();

            // WICHTIG: Kundenspezifische Preise laden (falls Benutzer angemeldet)
            if (this.categoryName !== '🕒 Zuletzt gekauft') {
              this.loadCustomerPricesForAllArticles();
            } else {
              // Produkte der spezifischen Kategorie filtern
              this.filterCategoryProducts();
            }

            this.isVisible = false;

            // Scroll to top after data is loaded
            setTimeout(() => this.scrollToTop(), 100);
          });
        },
        error: (error) => {
          this.loadAsGuest();
        },
      });
    } else {
      this.loadAsGuest();
    }
  }

  loadAsGuest(): void {
    this.globalService.setUserLoggedIn(false);
    this.globalService.isAdmin = false;

    this.artikelService.getData().subscribe((res) => {
      // Für Gäste nur normale Artikel anzeigen (keine SCHNELLVERKAUF)
      this.globalArtikels = res.filter((artikel: any) => artikel.category !== 'SCHNELLVERKAUF');
      this.globalService.setPfandArtikels(this.globalArtikels);

      // Aktive Angebote laden für Angebotspreise (auch für Gäste)
      this.loadActiveOffers();

      // Produkte der spezifischen Kategorie filtern
      this.filterCategoryProducts();
      this.isVisible = false;

      // Scroll to top after data is loaded
      setTimeout(() => this.scrollToTop(), 100);
    });
  }

  // Methode zum Laden aktiver Angebote
  loadActiveOffers(): void {
    this.isLoadingOffers = true;
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('Alle Angebote von API:', response.data);

          // Filtere nur aktive Angebote
          this.activeOffers = response.data.filter(offer => {
            const startDate = new Date(offer.start_date);
            const endDate = new Date(offer.end_date);
            const now = new Date();

            // Setze die Zeit auf Mitternacht für besseren Vergleich
            const startDateMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endDateMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const isActive = offer.is_active &&
                           startDateMidnight <= nowMidnight &&
                           endDateMidnight >= nowMidnight;

            console.log(`Filterung für "${offer.name}":`, {
              is_active: offer.is_active,
              startDateMidnight,
              endDateMidnight,
              nowMidnight,
              isActive
            });

            return isActive;
          });

          // Erstelle eine Map der Angebotspreise für schnellen Zugriff
          this.offerProductsMap.clear();
          this.activeOffers.forEach(offer => {
            offer.products.forEach(product => {
              if (product.product_id && product.use_offer_price && product.offer_price) {
                this.offerProductsMap.set(product.product_id.toString(), product);
              }
            });
          });

          console.log('Aktive Angebote nach Filterung:', this.activeOffers);
          console.log('Angebotspreise Map erstellt:', this.offerProductsMap.size, 'Einträge');
        }
        this.isLoadingOffers = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Angebote:', error);
        this.isLoadingOffers = false;
      }
    });
  }

  // Handle ESC key to close modal
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.isModalOpen) {
      this.closeModal();
    }
    if (event.key === 'Escape' && this.isScanning) {
      this.stopScanner();
    }
  }

  // Handle click outside modal to close
  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event) {
    if (this.isModalOpen) {
      const target = event.target as HTMLElement;
      if (target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    }
  }

  filterCategoryProducts(): void {
    console.log('🔄 [FILTER] filterCategoryProducts aufgerufen für Kategorie:', this.categoryName);
    console.log('🔄 [FILTER] Kategorie Vergleich:', {
      categoryName: this.categoryName,
      isZuletztGekauft: this.categoryName === '🕒 Zuletzt gekauft',
      isZuletztGekauftAlt: this.categoryName === 'Zuletzt gekauft'
    });
    
    // Spezielle Behandlung für "alle-produkte" Kategorie
    if (this.categoryName === 'alle-produkte' || this.categoryName === 'Gastro Depot Worms - Alle Produkte') {
      // Alle Produkte anzeigen (außer PFAND und SCHNELLVERKAUF)
      this.artikelData = this.globalArtikels.filter(artikel => 
        artikel.category !== 'PFAND' && artikel.category !== 'SCHNELLVERKAUF'
      );
      console.log('📊 [FILTER] Alle Produkte geladen:', this.artikelData.length);
    } else if (this.categoryName === '⭐ Favoriten') {
      // Favoriten aus API laden
      if (this.globalService.isUserLoggedIn) {
        this.artikelData = this.globalService.favoriteItems;
      } else {
        this.artikelData = [];
        this.showToastNotification('Bitte melden Sie sich an, um Ihre Favoriten zu sehen', 'error');
      }
      console.log('📊 [FILTER] Favoriten geladen:', this.artikelData.length);
    } else if (this.categoryName === '🕒 Zuletzt gekauft') {
      // Zuletzt gekaufte Artikel laden (asynchron)
      console.log('🕒 [FILTER] Lade zuletzt gekaufte Artikel (asynchron)...');
      // Warten bis globalArtikels geladen ist
      if (this.globalArtikels.length > 0) {
        this.loadCustomerPrices();
      } else {
        // Wenn globalArtikels noch nicht geladen ist, warten wir kurz
        setTimeout(() => {
          this.loadCustomerPrices();
        }, 100);
      }
      return; // Nicht weiter machen, da loadCustomerPrices asynchron ist
    } else {
      // Produkte der spezifischen Kategorie filtern
      this.artikelData = this.globalArtikels.filter(artikel => 
        artikel.category === this.categoryName
      );
      console.log('📊 [FILTER] Kategorie', this.categoryName, 'geladen:', this.artikelData.length);
    }
    
    this.updateFilteredData();
  }

  // Neue Methode zum Aktualisieren der gefilterten Daten
  private updateFilteredData(): void {
    console.log('🔄 [FILTER] updateFilteredData aufgerufen');
    console.log('📊 [FILTER] artikelData vor updateFilteredData:', this.artikelData.length);
    
    this.filteredData = [...this.artikelData];
    
    console.log('📊 [FILTER] filteredData nach updateFilteredData:', this.filteredData.length);
    
    // Initialize pagination
    this.currentPage = 1;
    this.updatePagination();
    
    // Preload wichtige Bilder für bessere Performance
    this.preloadImages();
    
    // Scroll to top when data is updated
    this.scrollToTop();
  }

  // Neue Methode: Preload wichtige Bilder
  private preloadImages(): void {
    const imagesToPreload = this.artikelData
      .filter(artikel => artikel.main_image_url)
      .slice(0, 10) // Nur die ersten 10 Bilder preloaden
      .map(artikel => artikel.main_image_url);
    
    imagesToPreload.forEach(imageUrl => {
      const img = new Image();
      img.src = imageUrl;
      this.imageLoadPromises.push(
        new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Auch bei Fehler auflösen
        })
      );
    });
  }

  // Neue Methode: Kundenspezifische Preise für alle Artikel laden (außer "Zuletzt gekauft")
  loadCustomerPricesForAllArticles(): void {
    console.log('🔄 [CUSTOMER-PRICES-ALL] Starte Laden der kundenspezifischen Preise für alle Artikel...');
    
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('❌ [CUSTOMER-PRICES-ALL] Kein Token gefunden, verwende Standard-Preise');
      this.filterCategoryProducts();
      return;
    }

    // Prüfen ob globalArtikels geladen sind
    if (this.globalArtikels.length === 0) {
      console.log('⚠️ [CUSTOMER-PRICES-ALL] globalArtikels noch nicht geladen, warte...');
      setTimeout(() => {
        this.loadCustomerPricesForAllArticles();
      }, 200);
      return;
    }

    console.log('✅ [CUSTOMER-PRICES-ALL] Token vorhanden, starte API-Aufruf...');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get<CustomerArticlePrice[]>(`${environment.apiUrl}/api/customer-article-prices/user`, { headers })
      .subscribe({
        next: (data) => {
          console.log('📡 [CUSTOMER-PRICES-ALL] API Response erhalten:', data);
          
          if (Array.isArray(data) && data.length > 0) {
            console.log('🔍 [CUSTOMER-PRICES-ALL] Kundenspezifische Preise gefunden:', data.length);
            
            // Erstelle eine Map der kundenspezifischen Preise für schnellen Zugriff
            const customerPricesMap = new Map<string, CustomerArticlePrice>();
            data.forEach(price => {
              customerPricesMap.set(price.product_id, price);
            });
            
            // Produkte der spezifischen Kategorie filtern
            this.filterCategoryProducts();
            
            // Jetzt alle Artikel mit kundenspezifischen Preisen anreichern
            this.artikelData = this.artikelData.map(artikel => {
              const customerPrice = customerPricesMap.get(artikel.article_number);
              
              if (customerPrice) {
                console.log(`✅ [CUSTOMER-PRICES-ALL] Kundenspezifischer Preis für ${artikel.article_text}: ${customerPrice.unit_price_net}€`);
                
                return {
                  ...artikel,
                  customer_price_net: customerPrice.unit_price_net,
                  customer_price_gross: customerPrice.unit_price_gross,
                  customer_vat: customerPrice.vat_percentage,
                  last_order_date: customerPrice.invoice_date,
                  invoice_id: customerPrice.invoice_id,
                  // WICHTIG: different_price auf kundenspezifischen Preis setzen (wie in customer-orders)
                  different_price: parseFloat(customerPrice.unit_price_net) || 0
                };
              } else {
                // Kein kundenspezifischer Preis verfügbar
                return artikel;
              }
            });
            
            console.log('📊 [CUSTOMER-PRICES-ALL] Artikel mit kundenspezifischen Preisen angereichert:', this.artikelData.length);
            
            // Jetzt filteredData aktualisieren
            this.updateFilteredData();
          } else {
            console.log('❌ [CUSTOMER-PRICES-ALL] Keine kundenspezifischen Preise gefunden, verwende Standard-Preise');
            this.filterCategoryProducts();
          }
        },
        error: (error) => {
          console.error('❌ [CUSTOMER-PRICES-ALL] API Fehler:', error);
          console.log('⚠️ [CUSTOMER-PRICES-ALL] Verwende Standard-Preise bei Fehler');
          this.filterCategoryProducts();
        }
      });
  }

  // Methode zum Laden der zuletzt gekauften Artikel
  loadCustomerPrices(): void {
    console.log('🔄 [CUSTOMER-PRICES] Starte Laden der zuletzt gekauften Artikel...');
    console.log('📊 [CUSTOMER-PRICES] globalArtikels Länge:', this.globalArtikels.length);
    
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('❌ [CUSTOMER-PRICES] Kein Token gefunden');
      this.artikelData = [];
      this.updateFilteredData();
      return;
    }

    // Prüfen ob globalArtikels geladen sind
    if (this.globalArtikels.length === 0) {
      console.log('⚠️ [CUSTOMER-PRICES] globalArtikels noch nicht geladen, warte...');
      setTimeout(() => {
        this.loadCustomerPrices();
      }, 200);
      return;
    }

    console.log('✅ [CUSTOMER-PRICES] Token vorhanden, starte API-Aufruf...');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get<CustomerArticlePrice[]>(`${environment.apiUrl}/api/customer-article-prices/user`, { headers })
      .subscribe({
        next: (data) => {
          console.log('📡 [CUSTOMER-PRICES] API Response erhalten:', data);
          console.log('📊 [CUSTOMER-PRICES] Response Typ:', typeof data);
          console.log('📊 [CUSTOMER-PRICES] Ist Array:', Array.isArray(data));
          console.log('📊 [CUSTOMER-PRICES] Anzahl Einträge:', Array.isArray(data) ? data.length : 'Kein Array');
          
          if (Array.isArray(data)) {
            console.log('📋 [CUSTOMER-PRICES] Erste 3 Einträge:', data.slice(0, 3));
            
            if (data.length > 0) {
              console.log('🔍 [CUSTOMER-PRICES] Beispiel-Eintrag:', data[0]);
              console.log('🔍 [CUSTOMER-PRICES] Verfügbare Felder:', Object.keys(data[0]));
              console.log('🔍 [CUSTOMER-PRICES] product_id:', data[0].product_id);
              console.log('🔍 [CUSTOMER-PRICES] unit_price_net:', data[0].unit_price_net);
              console.log('🔍 [CUSTOMER-PRICES] unit_price_gross:', data[0].unit_price_gross);
              console.log('🔍 [CUSTOMER-PRICES] vat_percentage:', data[0].vat_percentage);
              console.log('🔍 [CUSTOMER-PRICES] invoice_date:', data[0].invoice_date);
              console.log('🔍 [CUSTOMER-PRICES] invoice_id:', data[0].invoice_id);
            }
            
            // Produkte mit kundenspezifischen Preisen anzeigen
            this.artikelData = data.map(order => {
              console.log('🔍 [CUSTOMER-PRICES] Verarbeite Order:', order);
              console.log('🔍 [CUSTOMER-PRICES] Suche nach product_id:', order.product_id);
              console.log('🔍 [CUSTOMER-PRICES] Verfügbare Artikel:', this.globalArtikels.map(a => a.article_number).slice(0, 5));
              
              const artikel = this.globalArtikels.find(art => art.article_number === order.product_id);
              console.log('🔍 [CUSTOMER-PRICES] Gefundener Artikel für product_id', order.product_id, ':', artikel);
              
              if (artikel) {
                const enrichedArtikel = {
                  ...artikel,
                  customer_price_net: order.unit_price_net,
                  customer_price_gross: order.unit_price_gross,
                  customer_vat: order.vat_percentage,
                  last_order_date: order.invoice_date,
                  invoice_id: order.invoice_id,
                  // WICHTIG: different_price auf kundenspezifischen Preis setzen (wie in customer-orders)
                  different_price: parseFloat(order.unit_price_net) || 0
                };
                console.log('✅ [CUSTOMER-PRICES] Angereicherter Artikel mit different_price:', enrichedArtikel);
                return enrichedArtikel;
              } else {
                console.log('❌ [CUSTOMER-PRICES] Kein Artikel gefunden für product_id:', order.product_id);
                return null;
              }
            }).filter(item => item !== null);
            
            console.log('📊 [CUSTOMER-PRICES] Finale artikelData:', this.artikelData);
            console.log('📊 [CUSTOMER-PRICES] Anzahl verarbeiteter Artikel:', this.artikelData.length);
            
            // Jetzt filteredData aktualisieren
            this.updateFilteredData();
          } else {
            console.log('❌ [CUSTOMER-PRICES] Response ist kein Array');
            this.artikelData = [];
            this.updateFilteredData();
          }
        },
        error: (error) => {
          console.error('❌ [CUSTOMER-PRICES] API Fehler:', error);
          console.error('❌ [CUSTOMER-PRICES] Fehler Details:', {
            status: error.status,
            statusText: error.statusText,
            message: error.message,
            url: error.url
          });
          this.artikelData = [];
          this.updateFilteredData();
        }
      });
  }

  // Optimierte Suchfunktion mit Debouncing
  @HostListener('window:scroll', ['$event'])
  onScroll(): void {
    // Debouncing für Scroll-Events
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.scrollTimeout = setTimeout(() => {
      // Hier könnten weitere Scroll-Optimierungen hinzugefügt werden
      this.cdr.detectChanges();
    }, 16); // ~60fps
  }

  // TrackBy-Funktion für bessere ngFor Performance
  trackByArticleNumber(index: number, artikel: any): string {
    return artikel.article_number || index;
  }

  // Optimierte Bildlade-Strategie
  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.classList.add('loaded');
  }

  // Optimierte Bildfehler-Behandlung
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    // Fallback auf Standard-Bild
    img.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
    img.classList.add('error');
  }

  // Methode zum Formatieren des Rechnungsdatums
  formatInvoiceDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // Berechnet den Preisunterschied zwischen Kundenpreis und normalem Preis
  calculatePriceDifference(artikel: any): { difference: number; percentage: number; isLower: boolean } {
    if (!artikel.customer_price_net || !artikel.price) {
      return { difference: 0, percentage: 0, isLower: false };
    }

    const customerPrice = parseFloat(artikel.customer_price_net);
    const normalPrice = parseFloat(artikel.price);
    
    if (isNaN(customerPrice) || isNaN(normalPrice)) {
      return { difference: 0, percentage: 0, isLower: false };
    }

    const difference = customerPrice - normalPrice;
    const percentage = normalPrice > 0 ? (difference / normalPrice) * 100 : 0;
    const isLower = customerPrice < normalPrice;

    return { difference: Math.abs(difference), percentage: Math.abs(percentage), isLower };
  }

  // Formatiert den Preisunterschied für die Anzeige
  formatPriceDifference(artikel: any): string {
    const priceInfo = this.calculatePriceDifference(artikel);
    
    if (priceInfo.difference === 0) return '';
    
    const sign = priceInfo.isLower ? '-' : '+';
    return `${sign}€${priceInfo.difference.toFixed(2)} (${sign}${priceInfo.percentage.toFixed(1)}%)`;
  }

  filteredArtikelData(): void {
    if (!this.searchTerm.trim()) {
      this.filteredData = [...this.artikelData];
    } else {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      this.filteredData = this.artikelData.filter(artikel =>
        terms.every((term) =>
          artikel.article_text?.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      );
    }
    
    // Reset to first page when filtering
    this.currentPage = 1;
    this.updatePagination();
    
    // Scroll to top when searching
    this.scrollToTop();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filteredData = [...this.artikelData];
    this.currentPage = 1;
    this.updatePagination();
    
    // Scroll to top when clearing search
    this.scrollToTop();
  }

  // Pagination methods
  get totalPages(): number {
    return Math.ceil(this.filteredData.length / this.itemsPerPage);
  }

  updatePagination(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      this.scrollToTop();
    }
  }

  goToPage(page: number | string): void {
    const pageNumber = typeof page === 'string' ? parseInt(page, 10) : page;
    if (pageNumber >= 1 && pageNumber <= this.totalPages && pageNumber !== this.currentPage) {
      this.currentPage = pageNumber;
      this.updatePagination();
      this.scrollToTop();
    }
  }

  getVisiblePages(): (number | string)[] {
    const totalPages = this.totalPages;
    const currentPage = this.currentPage;
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      // Show all pages if total is 7 or less
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage <= 4) {
        // Show pages 2, 3, 4, 5, ..., last
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        if (totalPages > 5) {
          pages.push('...');
          pages.push(totalPages);
        }
      } else if (currentPage >= totalPages - 3) {
        // Show first, ..., last-4, last-3, last-2, last-1, last
        if (totalPages > 5) {
          pages.push('...');
        }
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Show first, ..., current-1, current, current+1, ..., last
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  }

  goBack(): void {
    this.router.navigate(['/products'], { queryParams: { scrollToCategories: 'true' } });
  }

  openLoginPrompt(): void {
    // Dispatch custom event to trigger header login modal
    const event = new CustomEvent('openLoginModal');
    window.dispatchEvent(event);
  }

  // Warenkorb-Methoden
  addToCart(event: Event, artikel: any): void {
    if (!artikel.quantity || isNaN(Number(artikel.quantity)) || Number(artikel.quantity) < 1) {
      artikel.quantity = 1;
    }

    const addedQuantity = Number(artikel.quantity);
    const existingItem = this.globalService.warenkorb.find(
      (item) => item.article_number == artikel.article_number
    );

    if (existingItem) {
      existingItem.quantity += Number(artikel.quantity);
    } else {
      this.globalService.warenkorb = [
        ...this.globalService.warenkorb,
        { ...artikel, quantity: Number(artikel.quantity) },
      ];
    }

    artikel.quantity = '';
    this.getTotalPrice();
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
    
    const totalQuantity = existingItem ? existingItem.quantity : addedQuantity;
    let message: string;
    if (existingItem && existingItem.quantity > addedQuantity) {
      message = `${addedQuantity}x "${artikel.article_text}" hinzugefügt (${totalQuantity} insgesamt im Warenkorb)`;
    } else if (addedQuantity > 1) {
      message = `${addedQuantity}x "${artikel.article_text}" zum Warenkorb hinzugefügt`;
    } else {
      message = `"${artikel.article_text}" zum Warenkorb hinzugefügt`;
    }
    this.showToastNotification(message, 'success');
  }

  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  }

  showToastNotification(message: string, type: 'success' | 'error' = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    
    // Toast-Position basierend auf aktueller Scroll-Position berechnen
    this.calculateToastPosition();
    
    // Force change detection
    this.cdr.detectChanges();
    
    // Toast nach 3 Sekunden automatisch ausblenden
    setTimeout(() => {
      this.showToast = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  private calculateToastPosition(): void {
    // Scroll-Position des scrollable-content Containers ermitteln
    const scrollableContent = document.querySelector('.scrollable-content') as HTMLElement;
    if (scrollableContent) {
      const scrollTop = scrollableContent.scrollTop;
      const viewportHeight = window.innerHeight;
      const fixedSearchHeight = 350; // Noch höhere Höhe des fixed-search-container für mehr Abstand
      
      // Toast-Position berechnen: Scroll-Position + noch größerer Abstand vom oberen Rand
      this.toastTopPosition = Math.max(100, scrollTop + 100);
      
      // Sicherstellen, dass der Toast nicht unter dem fixed-search-container erscheint
      if (this.toastTopPosition < fixedSearchHeight + 100) {
        this.toastTopPosition = fixedSearchHeight + 100;
      }
      
      // Sicherstellen, dass der Toast nicht unter dem unteren Rand verschwindet
      const maxTopPosition = scrollTop + viewportHeight - 150; // 150px Abstand vom unteren Rand
      if (this.toastTopPosition > maxTopPosition) {
        this.toastTopPosition = maxTopPosition;
      }
    } else {
      // Fallback: Verwende eine feste Position, falls der Container nicht gefunden wird
      this.toastTopPosition = 350; // Noch höhere Fallback-Position
    }
  }

  // Favoriten-Methoden
  isFavorite(artikel: any): boolean {
    return this.globalService.isFavorite(artikel.id);
  }

  toggleFavorite(event: Event, artikel: any): void {
    event.stopPropagation();
    
    if (!this.globalService.isUserLoggedIn) {
      this.showToastNotification('Bitte melden Sie sich an, um Favoriten zu verwenden', 'error');
      return;
    }

    const isCurrentlyFavorite = this.globalService.isFavorite(artikel.id);

    if (isCurrentlyFavorite) {
      // Favorit entfernen
      this.globalService.removeFavorite(artikel.id);
      this.showToastNotification(`⭐ "${artikel.article_text}" aus Favoriten entfernt`, 'success');
      
      // Wenn wir uns in der Favoriten-Kategorie befinden, Artikel sofort aus der Anzeige entfernen
      if (this.categoryName === '⭐ Favoriten') {
        this.artikelData = this.artikelData.filter(item => item.id !== artikel.id);
        this.updateFilteredData();
        
        // Wenn keine Favoriten mehr vorhanden sind, zur Hauptseite zurückkehren
        if (this.artikelData.length === 0) {
          this.router.navigate(['/products']);
        }
      }
    } else {
      // Favorit hinzufügen
      this.globalService.addFavorite(artikel.id);
      this.showToastNotification(`⭐ "${artikel.article_text}" zu Favoriten hinzugefügt`, 'success');
    }
  }

  // Modal methods
  openModal(imageUrl: string, imageAlt: string, productId: number): void {
    console.log('🔍 [MODAL] openModal called with:', { imageUrl, imageAlt, productId });
    this.modalImageUrl = imageUrl;
    this.modalImageAlt = imageAlt;
    this.modalProductId = productId;
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    console.log('🔍 [MODAL] Modal state after opening:', {
      isModalOpen: this.isModalOpen,
      modalImageUrl: this.modalImageUrl,
      modalImageAlt: this.modalImageAlt
    });
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.modalImageUrl = '';
    this.modalImageAlt = '';
    this.modalProductId = null;
    this.isImageZoomed = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  toggleImageZoom(): void {
    this.isImageZoomed = !this.isImageZoomed;
  }

  onModalImageLoad(): void {
    console.log('🔍 [MODAL] Image loaded successfully:', this.modalImageUrl);
  }

  // Scanner-Methoden
  onCodeResult(result: string) {
    console.log('🔍 [SCANNER] Code scanned:', result);
    this.playBeep();
    this.stopScanner();
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  onScanError(error: any) {
    console.error('🔍 [SCANNER] Scan error:', error);
  }

  startScanner() {
    console.log('🔍 [SCANNER] startScanner() called');
    
    // Set scanning state first
    this.isScanning = true;
    console.log('🔍 [SCANNER] isScanning set to:', this.isScanning);
    
    // Force change detection immediately
    this.cdr.detectChanges();
    
    // Initialize devices first
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;
      console.log('🔍 [SCANNER] Available devices:', videoDevices.length);

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      this.selectedDevice = preferredCam || videoDevices[0];
      console.log('🔍 [SCANNER] Selected device:', this.selectedDevice?.label);
      
      // Force change detection after devices are loaded
      this.cdr.detectChanges();
      
      // Wait for modal to be rendered, then start scanner
      setTimeout(() => {
        console.log('🔍 [SCANNER] Modal should be rendered now');
        
        // Check if scanner component exists
        if (this.scanner) {
          console.log('🔍 [SCANNER] Scanner component found');
          
          // Start scanner
          setTimeout(() => {
            console.log('🔍 [SCANNER] Starting scanner...');
            try {
              this.scanner.scanStart();
              this.scanner.torch = true;
              console.log('🔍 [SCANNER] Scanner started successfully');
            } catch (error) {
              console.error('🔍 [SCANNER] Error starting scanner:', error);
            }
          }, 100);
          
        } else {
          console.error('🔍 [SCANNER] Scanner component not found!');
        }
      }, 500);
      
    }).catch(error => {
      console.error('🔍 [SCANNER] Error enumerating devices:', error);
    });
    
    this.preventBodyScroll();
  }



  stopScanner() {
    console.log('🔍 [SCANNER] stopScanner() called');
    this.isScanning = false;
    this.restoreBodyScroll();
    
    if (this.scanner) {
      try {
        this.scanner.torch = false;
        this.scanner.reset();
        console.log('🔍 [SCANNER] Scanner stopped successfully');
      } catch (error) {
        console.error('🔍 [SCANNER] Error stopping scanner:', error);
      }
    }
    
    // Force change detection
    this.cdr.detectChanges();
  }

  playBeep(): void {
    const audio = new Audio('beep.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => {
      // Silent error handling
    });
  }

  private preventBodyScroll(): void {
    document.body.style.overflow = 'hidden';
  }

  private restoreBodyScroll(): void {
    document.body.style.overflow = '';
  }

  // Methode zum Prüfen, ob ein Produkt in einem aktiven Angebot ist
  getProductOfferPrice(product: any): { hasOffer: boolean; offerPrice?: number; originalPrice?: number; offerName?: string } {
    if (!product || !product.id) {
      return { hasOffer: false };
    }

    const offerProduct = this.offerProductsMap.get(product.id.toString());
    if (offerProduct && offerProduct.use_offer_price && offerProduct.offer_price) {
      // Finde das entsprechende Angebot für den Namen
      const offer = this.activeOffers.find(o =>
        o.products.some(p => p.product_id === offerProduct.product_id)
      );

      return {
        hasOffer: true,
        offerPrice: parseFloat(offerProduct.offer_price.toString()),
        originalPrice: product.sale_price || product.price || 0,
        offerName: offer ? offer.name : 'Angebot'
      };
    }

    return { hasOffer: false };
  }

  // Methode zum Formatieren des Rabatts
  getOfferDiscountDisplay(product: any): string {
    const offerInfo = this.getProductOfferPrice(product);

    if (!offerInfo.hasOffer || !offerInfo.offerPrice || !offerInfo.originalPrice) {
      return '';
    }

    const discount = offerInfo.originalPrice - offerInfo.offerPrice;
    const percentage = offerInfo.originalPrice > 0 ? (discount / offerInfo.originalPrice) * 100 : 0;

    if (percentage >= 1) {
      return `${percentage.toFixed(0)}% Rabatt`;
    } else {
      return `€${discount.toFixed(2)} Rabatt`;
    }
  }

  ngOnDestroy(): void {
    this.stopScanner();

    // Cleanup Performance-Optimierungen
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Cleanup Bild-Promises
    this.imageLoadPromises = [];
  }

}
