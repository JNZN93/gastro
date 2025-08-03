import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ViewChild, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { HttpClient } from '@angular/common/http';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';

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
  
  categoryName: string = '';
  artikelData: any[] = [];
  globalArtikels: any[] = [];
  isVisible: boolean = true;
  searchTerm: string = '';
  filteredData: any[] = [];

  // Performance-Optimierungen
  private scrollTimeout: any;
  private imageLoadPromises: Promise<void>[] = [];
  private virtualScrollConfig = {
    itemHeight: 300, // Geschätzte Höhe pro Produktkarte
    viewportHeight: 800,
    bufferSize: 5
  };

  // Eigenschaften für Image Modal
  showImageModal: boolean = false;
  selectedImageUrl: string = '';
  selectedImageProduct: any = null;
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

  ngOnInit(): void {
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
    });
  }

  filterCategoryProducts(): void {
    // Spezielle Behandlung für "alle-produkte" Kategorie
    if (this.categoryName === 'alle-produkte' || this.categoryName === 'Gastro Depot Worms - Alle Produkte') {
      // Alle Produkte anzeigen (außer PFAND und SCHNELLVERKAUF)
      this.artikelData = this.globalArtikels.filter(artikel => 
        artikel.category !== 'PFAND' && artikel.category !== 'SCHNELLVERKAUF'
      );
    } else {
      // Produkte der spezifischen Kategorie filtern
      this.artikelData = this.globalArtikels.filter(artikel => 
        artikel.category === this.categoryName
      );
    }
    
    this.filteredData = [...this.artikelData];
    
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

  filteredArtikelData(): void {
    if (!this.searchTerm.trim()) {
      this.filteredData = [...this.artikelData];
      return;
    }

    const terms = this.searchTerm.toLowerCase().split(/\s+/);
    this.filteredData = this.artikelData.filter(artikel =>
      terms.every((term) =>
        artikel.article_text?.toLowerCase().includes(term) ||
        artikel.article_number?.toLowerCase().includes(term) ||
        artikel.ean?.toLowerCase().includes(term)
      )
    );
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filteredData = [...this.artikelData];
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
    
    // Toast nach 3 Sekunden automatisch ausblenden
    setTimeout(() => {
      this.showToast = false;
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
    } else {
      favorites.push(artikel);
    }
    
    localStorage.setItem('favoriteItems', JSON.stringify(favorites));
  }

  // Image Modal Methoden
  openImageModal(artikel: any): void {
    if (artikel.main_image_url) {
      this.selectedImageUrl = artikel.main_image_url;
      this.selectedImageProduct = artikel;
      this.showImageModal = true;
      // Body scroll verhindern
      document.body.style.overflow = 'hidden';
    }
  }

  closeImageModal(): void {
    this.showImageModal = false;
    this.selectedImageUrl = '';
    this.selectedImageProduct = null;
    this.isImageZoomed = false;
    // Body scroll wieder erlauben
    document.body.style.overflow = 'auto';
  }

  toggleImageZoom(): void {
    this.isImageZoomed = !this.isImageZoomed;
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
