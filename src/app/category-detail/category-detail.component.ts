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

  // Scanner-Eigenschaften
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

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  constructor(
    private authService: AuthService,
    public globalService: GlobalService
  ) {}

  private scrollToTop(): void {
    // Multiple methods to ensure scroll to top works
    this.viewportScroller.scrollToPosition([0, 0]);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  ngOnInit(): void {
    // Scroll to top immediately when component initializes
    this.scrollToTop();
    
    // Kategorie-Name aus der URL holen
    this.route.params.subscribe(params => {
      this.categoryName = decodeURIComponent(params['categoryName']);
      
      // Spezielle Behandlung für "alle-produkte" Kategorie
      if (this.categoryName === 'alle-produkte') {
        this.categoryName = 'Gastro Depot Worms - Alle Produkte';
      }
      
      this.loadCategoryProducts();
    });
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
            
            // Produkte der spezifischen Kategorie filtern
            this.filterCategoryProducts();
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
      
      // Produkte der spezifischen Kategorie filtern
      this.filterCategoryProducts();
      this.isVisible = false;
      
      // Scroll to top after data is loaded
      setTimeout(() => this.scrollToTop(), 100);
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
    
    // Spezielle Behandlung für "alle-produkte" Kategorie
    if (this.categoryName === 'alle-produkte' || this.categoryName === 'Gastro Depot Worms - Alle Produkte') {
      // Alle Produkte anzeigen (außer PFAND und SCHNELLVERKAUF)
      this.artikelData = this.globalArtikels.filter(artikel => 
        artikel.category !== 'PFAND' && artikel.category !== 'SCHNELLVERKAUF'
      );
      console.log('📊 [FILTER] Alle Produkte geladen:', this.artikelData.length);
    } else if (this.categoryName === '⭐ Favoriten') {
      // Favoriten aus localStorage laden
      const favorites = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
      this.artikelData = favorites;
      console.log('📊 [FILTER] Favoriten geladen:', this.artikelData.length);
    } else if (this.categoryName === '💰 Kundenspezifische Preise') {
      // Kundenspezifische Preise laden (asynchron)
      console.log('💰 [FILTER] Lade kundenspezifische Preise (asynchron)...');
      this.loadCustomerPrices();
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

  // Methode zum Laden der kundenspezifischen Preise
  loadCustomerPrices(): void {
    console.log('🔄 [CUSTOMER-PRICES] Starte Laden der kundenspezifischen Preise...');
    
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('❌ [CUSTOMER-PRICES] Kein Token gefunden');
      this.artikelData = [];
      return;
    }

    console.log('✅ [CUSTOMER-PRICES] Token vorhanden, starte API-Aufruf...');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get<CustomerArticlePrice[]>(`https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/user`, { headers })
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
              
              const artikel = this.globalArtikels.find(art => art.article_number === order.product_id);
              console.log('🔍 [CUSTOMER-PRICES] Gefundener Artikel für product_id', order.product_id, ':', artikel);
              
              if (artikel) {
                const enrichedArtikel = {
                  ...artikel,
                  customer_price_net: order.unit_price_net,
                  customer_price_gross: order.unit_price_gross,
                  customer_vat: order.vat_percentage,
                  last_order_date: order.invoice_date,
                  invoice_id: order.invoice_id
                };
                console.log('✅ [CUSTOMER-PRICES] Angereicherter Artikel:', enrichedArtikel);
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
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filteredData = [...this.artikelData];
    this.currentPage = 1;
    this.updatePagination();
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
    
    // Force change detection
    this.cdr.detectChanges();
    
    // Toast nach 3 Sekunden automatisch ausblenden
    setTimeout(() => {
      this.showToast = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  // Favoriten-Methoden
  isFavorite(artikel: any): boolean {
    const favorites = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
    return favorites.some((fav: any) => fav.article_number === artikel.article_number);
  }

  toggleFavorite(event: Event, artikel: any): void {
    event.stopPropagation();
    const favorites = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
    const existingIndex = favorites.findIndex((fav: any) => fav.article_number === artikel.article_number);
    
    if (existingIndex > -1) {
      favorites.splice(existingIndex, 1);
      
      // Toast-Benachrichtigung für entfernten Artikel
      this.showToastNotification(`⭐ "${artikel.article_text}" aus Favoriten entfernt`, 'success');
    } else {
      favorites.push(artikel);
      
      // Toast-Benachrichtigung für hinzugefügten Artikel
      this.showToastNotification(`⭐ "${artikel.article_text}" zu Favoriten hinzugefügt`, 'success');
    }
    
    localStorage.setItem('favoriteItems', JSON.stringify(favorites));
    
    // Wenn wir uns in der Favoriten-Kategorie befinden, aktualisieren wir die Anzeige
    if (this.categoryName === '⭐ Favoriten') {
      this.filterCategoryProducts();
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
