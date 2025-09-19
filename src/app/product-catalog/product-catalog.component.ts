import { CommonModule, ViewportScroller } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild, inject, HostListener } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { OffersService, OfferWithProducts } from '../offers.service';

// Interface für die letzten Bestellungen
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
  quantity?: string; // Für die Menge im Modal
}

@Component({
  selector: 'app-product-catalog',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, ZXingScannerModule],
  templateUrl: './product-catalog.component.html',
  styleUrl: './product-catalog.component.scss',
})
export class ProductCatalogComponent implements OnInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
  
  artikelData: any[] = [];
  warenkorb: any[] = [];
  orderData: any = {};
  searchTerm: string = '';
  selectedCategory: string = '';
  globalArtikels: any[] = [];
  filteredData: any[] = [];
  isVisible: boolean = true;
  isScanning = false;
  isTorchOn = false;
  availableDevices: MediaDeviceInfo[] = [];
  selectedDevice?: MediaDeviceInfo;

  // Neue Eigenschaften für letzte Bestellungen
  lastOrders: CustomerArticlePrice[] = [];
  showLastOrders: boolean = false;
  isLoadingLastOrders: boolean = false;
  currentUserId: string = '';

  // Eigenschaft für Loading-Overlay während Navigation
  showLoadingOverlay: boolean = false;

  // Neue Eigenschaft für Loading-Screen-Typ
  isFromCategoryDetail: boolean = false;

  // Eigenschaften für Image Modal
  showImageModal: boolean = false;
  selectedImageUrl: string = '';
  selectedImageProduct: any = null;
  isImageZoomed: boolean = false;

  // Eigenschaften für Toast-Benachrichtigung
  showToast: boolean = false;
  toastMessage: string = '';
  toastType: 'success' | 'error' = 'success';

  // Neue Eigenschaften für Angebote
  activeOffers: OfferWithProducts[] = [];
  isLoadingOffers: boolean = false;

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    public globalService: GlobalService,
    private viewportScroller: ViewportScroller,
    private offersService: OffersService
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    const loadedWarenkorb = localStorage.getItem('warenkorb')

    if(loadedWarenkorb) {
      this.globalService.warenkorb = JSON.parse(loadedWarenkorb);
    }

    // Prüfe, ob wir von der Category-Detail-Seite kommen
    this.isFromCategoryDetail = this.route.snapshot.queryParams['scrollToCategories'] === 'true';

    if (token) {
      // Benutzer ist angemeldet - normale Funktionalität
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          // Benutzerrolle und Name im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
          this.globalService.setUserLoggedIn(true);
          this.currentUserId = response.user.id;
          
          // Keine automatische Weiterleitung für Employee-Benutzer - sie bleiben auf der Produktkatalog-Seite
          // Employee-Benutzer können über das seitliche Menü zum Dashboard navigieren
          
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            
            // PFAND-Artikel BEVOR der Filterung speichern (damit sie in anderen Komponenten verfügbar sind)
            this.globalService.setPfandArtikels(res);
            
            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            // PFAND und SCHNELLVERKAUF-Artikel aus der Hauptliste filtern
            this.globalArtikels = this.globalArtikels.filter((artikel: any) => artikel.category !== 'PFAND' && artikel.category !== 'SCHNELLVERKAUF');
            this.artikelData = this.globalArtikels;
            
            // Keine Kategorie ausgewählt - Hauptseite wird angezeigt
            this.selectedCategory = '';
            
            this.collectOrderData(response);
            this.globalService.orderData = this.orderData;
            
            // Überprüfe Query-Parameter für automatisches Scrollen zu Kategorien
            this.checkScrollToCategories();
            
            // Loading-Screen mit angepasster Verzögerung basierend auf Navigation
            this.hideLoadingScreenWithDelay(this.isFromCategoryDetail ? 500 : 1000);
            
            // Lade aktive Angebote
            this.loadActiveOffers();
          });
        },
        error: (error) => {
          // Token ungültig - als Gast behandeln
          this.loadAsGuest();
        }
      });
    } else {
      // Kein Token - als Gast laden
      this.loadAsGuest();
    }
  }

  loadAsGuest(): void {
    this.globalService.setUserLoggedIn(false);
    this.globalService.isAdmin = false;
    
    this.artikelService.getData().subscribe((res) => {
      // PFAND-Artikel BEVOR der Filterung speichern (damit sie in anderen Komponenten verfügbar sind)
      this.globalService.setPfandArtikels(res);
      
      // Für Gäste nur normale Artikel anzeigen (keine SCHNELLVERKAUF und keine PFAND)
      this.globalArtikels = res.filter((artikel: any) => artikel.category !== 'SCHNELLVERKAUF' && artikel.category !== 'PFAND');
      this.artikelData = this.globalArtikels;
      
      // Keine Kategorie ausgewählt - Hauptseite wird angezeigt
      this.selectedCategory = '';
      
      // Überprüfe Query-Parameter für automatisches Scrollen zu Kategorien
      this.checkScrollToCategories();
      
      // Loading-Screen mit angepasster Verzögerung basierend auf Navigation
      this.hideLoadingScreenWithDelay(this.isFromCategoryDetail ? 500 : 1000);
      
      // Lade aktive Angebote auch für Gäste
      this.loadActiveOffers();
    });
  }

  // Neue Methode zum Laden der letzten Bestellungen
  loadLastOrders(): void {
    console.log('🔄 [LAST-ORDERS] loadLastOrders aufgerufen...');
    console.log('👤 [LAST-ORDERS] currentUserId:', this.currentUserId);
    
    if (!this.currentUserId) {
      console.log('❌ [LAST-ORDERS] Keine currentUserId vorhanden');
      return;
    }

    this.isLoadingLastOrders = true;
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('❌ [LAST-ORDERS] Kein Token gefunden');
      this.isLoadingLastOrders = false;
      return;
    }

    console.log('✅ [LAST-ORDERS] Token vorhanden, starte API-Aufruf...');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get<CustomerArticlePrice[]>(`${environment.apiUrl}/api/customer-article-prices/user`, { headers })
      .subscribe({
        next: (data) => {
          console.log('📡 [LAST-ORDERS] API Response erhalten:', data);
          console.log('📊 [LAST-ORDERS] Response Typ:', typeof data);
          console.log('📊 [LAST-ORDERS] Ist Array:', Array.isArray(data));
          console.log('📊 [LAST-ORDERS] Anzahl Einträge:', Array.isArray(data) ? data.length : 'Kein Array');
          
          if (Array.isArray(data)) {
            console.log('📋 [LAST-ORDERS] Erste 3 Einträge:', data.slice(0, 3));
            
            if (data.length > 0) {
              console.log('🔍 [LAST-ORDERS] Beispiel-Eintrag:', data[0]);
              console.log('🔍 [LAST-ORDERS] Verfügbare Felder:', Object.keys(data[0]));
            }
            
            this.lastOrders = data;
            console.log('✅ [LAST-ORDERS] lastOrders gesetzt:', this.lastOrders);
          } else {
            console.log('❌ [LAST-ORDERS] Response ist kein Array');
            this.lastOrders = [];
          }
          
          this.isLoadingLastOrders = false;
          console.log('🏁 [LAST-ORDERS] Loading abgeschlossen');
        },
        error: (error) => {
          console.error('❌ [LAST-ORDERS] API Fehler:', error);
          console.error('❌ [LAST-ORDERS] Fehler Details:', {
            status: error.status,
            statusText: error.statusText,
            message: error.message,
            url: error.url
          });
          this.lastOrders = [];
          this.isLoadingLastOrders = false;
          console.log('🏁 [LAST-ORDERS] Loading mit Fehler abgeschlossen');
        }
      });
  }

  // Neue Methode zum Laden aktiver Angebote
  loadActiveOffers(): void {
    this.isLoadingOffers = true;
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('Alle Angebote von API:', response.data);
          
          // Debug: Zeige Datumsdetails
          response.data.forEach((offer, index) => {
            const startDate = new Date(offer.start_date);
            const endDate = new Date(offer.end_date);
            const now = new Date();
            console.log(`Angebot ${index + 1}:`, {
              name: offer.name,
              is_active: offer.is_active,
              start_date: offer.start_date,
              end_date: offer.end_date,
              startDate: startDate,
              endDate: endDate,
              now: now,
              startValid: startDate <= now,
              endValid: endDate >= now,
              wouldBeActive: offer.is_active && startDate <= now && endDate >= now
            });
          });
          
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
          
          console.log('Aktive Angebote nach Filterung:', this.activeOffers);
        }
        this.isLoadingOffers = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Angebote:', error);
        this.isLoadingOffers = false;
      }
    });
  }

  // Hilfsmethode für die Anzeige des Rabatts
  getDiscountDisplay(product: any): string {
    if (product.use_offer_price && product.offer_price) {
      return `Angebotspreis: ${product.offer_price}€`;
    }
    
    if (product.discount_percentage) {
      return `${product.discount_percentage}% Rabatt`;
    }
    
    if (product.discount_amount) {
      return `${product.discount_amount}€ Rabatt`;
    }
    
    return 'Sonderangebot';
  }



  // Methode zum Umschalten der letzten Bestellungen
  toggleLastOrders(): void {
    this.showLastOrders = !this.showLastOrders;
    
    if (this.showLastOrders) {
      // iOS Safari kompatible Body scroll Verhinderung
      this.preventBodyScroll();
      
      if (this.lastOrders.length === 0) {
        this.loadLastOrders();
      }
    } else {
      // Body scroll wieder erlauben
      this.restoreBodyScroll();
    }
  }

  // Methode zum Verstecken des Loading-Screens mit konfigurierbarer Verzögerung
  private hideLoadingScreenWithDelay(delay: number = 1000): void {
    setTimeout(() => {
      this.isVisible = false;
    }, delay); // Standard: 1 Sekunde, kann angepasst werden
  }

  // Methode zum Finden der Artikel-Details basierend auf product_id
  getArticleDetails(productId: string): any {
    return this.globalArtikels.find(artikel => artikel.article_number === productId);
  }

  // Methode zum Formatieren des Datums
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // Hilfsmethode für das früheste Startdatum aller aktiven Angebote
  getEarliestStartDate(): string {
    if (this.activeOffers.length === 0) return '';
    
    const startDates = this.activeOffers.map(offer => new Date(offer.start_date));
    const earliestDate = startDates.reduce((earliest, current) => 
      current < earliest ? current : earliest
    );
    return earliestDate.toISOString();
  }

  // Hilfsmethode für das späteste Enddatum aller aktiven Angebote
  getLatestEndDate(): string {
    if (this.activeOffers.length === 0) return '';
    
    const endDates = this.activeOffers.map(offer => new Date(offer.end_date));
    const latestDate = endDates.reduce((latest, current) => 
      current > latest ? current : latest
    );
    return latestDate.toISOString();
  }

  // Hilfsmethode für den Namen des aktiven Angebots
  getActiveOfferName(): string {
    if (this.activeOffers.length === 0) return '';
    
    // Wenn alle Angebote den gleichen Namen haben, zeige diesen an
    const firstOfferName = this.activeOffers[0].name;
    const allSameName = this.activeOffers.every(offer => offer.name === firstOfferName);
    
    if (allSameName) {
      return firstOfferName;
    }
    
    // Wenn verschiedene Namen, zeige "Mehrere Angebote" an
    return 'Mehrere Angebote';
  }

  // Hilfsmethode für die Beschreibung des aktiven Angebots
  getActiveOfferDescription(): string {
    if (this.activeOffers.length === 0) return '';
    
    // Wenn alle Angebote die gleiche Beschreibung haben, zeige diese an
    const firstOfferDescription = this.activeOffers[0].description;
    const allSameDescription = this.activeOffers.every(offer => offer.description === firstOfferDescription);
    
    if (allSameDescription) {
      return firstOfferDescription;
    }
    
    // Wenn verschiedene Beschreibungen, zeige eine allgemeine Beschreibung an
    return 'Verschiedene Sonderangebote verfügbar';
  }

  isFavorite(artikel: any): boolean {
    return this.globalService.isFavorite(artikel.id);
  }

  toggleFavorite(event: Event, artikel: any): void {
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
      if (this.selectedCategory === 'FAVORITEN') {
        this.artikelData = this.artikelData.filter(item => item.id !== artikel.id);
        
        // Wenn keine Favoriten mehr vorhanden sind, zur Hauptseite zurückkehren
        if (this.artikelData.length === 0) {
          this.selectedCategory = '';
          this.artikelData = this.globalArtikels;
        }
      }
    } else {
      // Favorit hinzufügen
      this.globalService.addFavorite(artikel.id);
      this.showToastNotification(`⭐ "${artikel.article_text}" zu Favoriten hinzugefügt`, 'success');
    }
  }

  
  filteredArtikelData() {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    this.artikelData = this.globalArtikels;
    
    if (this.searchTerm) {
      // Bei Suche: Kategorieauswahl zurücksetzen, damit durch alle Produkte gesucht wird
      this.selectedCategory = '';
      
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      this.artikelData = this.artikelData.filter((artikel) =>
      terms.every((term) =>
        artikel.article_text.toLowerCase().includes(term) ||
        artikel.article_number?.toLowerCase().includes(term) ||
        artikel.ean?.toLowerCase().includes(term)
      )
    );
    }
    window.scrollTo({ top: 0});
  }

  // Getter für Suchmodus
  get isSearching(): boolean {
    return !!(this.searchTerm && this.searchTerm.trim().length > 0);
  }



  clearSearch() {
    this.searchTerm = '';
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    this.filteredArtikelData();
  }

/*FILTER BY SCANNING*/

  onCodeResult(result: string) {
    this.playBeep();
    this.stopScanner(); // optional Kamera nach Scan stoppen
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  startScanner() {
    this.isScanning = true;
    // iOS Safari kompatible Body scroll Verhinderung
    this.preventBodyScroll();
    
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      // 🎯 Wähle Kamera mit "back" im Namen, aber NICHT "wide", "ultra", "tele"
      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      // Fallback: Erste Kamera
      this.selectedDevice = preferredCam || videoDevices[0];
    });
    this.scanner?.scanStart(); // aktiviert Kamera

    // Torch einschalten
    if (this.scanner) {
      this.scanner.torch = true;
    }
  }


  stopScanner() {
    this.isScanning = false;
    // Body scroll wieder erlauben
    this.restoreBodyScroll();
    
    // Torch ausschalten
    if (this.scanner) {
      this.scanner.torch = false;
    }
    this.scanner?.reset(); // stoppt Kamera & löst Vorschau
  }

  playBeep(): void {
  const audio = new Audio('beep.mp3');
  audio.volume = 0.5;
  audio.play().catch(err => {
    // Silent error handling
  });
}

  // Methode zum Anzeigen der Toast-Benachrichtigung
  showToastNotification(message: string, type: 'success' | 'error' = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    
    // Toast nach 3 Sekunden automatisch ausblenden
    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/placeholder-product.svg';
  }

  onCategoryImageError(event: Event, category: string): void {
    const img = event.target as HTMLImageElement;
    
    // Fallback auf Standard-Bild
    img.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
  }

  // Image Modal Methoden
  openImageModal(artikel: any): void {
    if (artikel.main_image_url) {
      this.selectedImageUrl = artikel.main_image_url;
      this.selectedImageProduct = artikel;
      this.showImageModal = true;
      // iOS Safari kompatible Body scroll Verhinderung
      this.preventBodyScroll();
    }
  }

  closeImageModal(): void {
    this.showImageModal = false;
    this.selectedImageUrl = '';
    this.selectedImageProduct = null;
    this.isImageZoomed = false;
    // Body scroll wieder erlauben
    this.restoreBodyScroll();
  }

  // iOS Safari kompatible Methoden für Body Scroll Control
  private preventBodyScroll(): void {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.classList.add('modal-open');
  }

  private restoreBodyScroll(): void {
    const scrollY = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.classList.remove('modal-open');
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  toggleImageZoom(): void {
    this.isImageZoomed = !this.isImageZoomed;
  }

  filterCategory(event: Event) {
    const category = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    this.selectedCategory = category; // Kategorie speichern
    // Seite nach oben scrollen
    window.scrollTo({ top: 0});

    if (this.selectedCategory == "FAVORITEN") {
        if (this.globalService.isUserLoggedIn) {
          this.artikelData = this.globalService.favoriteItems;
        } else {
          this.artikelData = [];
          this.showToastNotification('Bitte melden Sie sich an, um Ihre Favoriten zu sehen', 'error');
        }
        return
    }
    if (this.selectedCategory == "") {
      // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
      this.artikelData = this.globalArtikels;
      return;
    }
    this.getItemsFromCategory(category);
  }

  // Neue Methode für Kategorie-Auswahl über Karten
  selectCategory(category: string) {
    this.selectedCategory = category;
    // Seite nach oben scrollen
    window.scrollTo({ top: 0});

    if (category === "" || category === "alle-produkte") {
      // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
      this.artikelData = this.globalArtikels;
      return;
    }
    this.getItemsFromCategory(category);
  }

  // Methode um alle Kategorien anzuzeigen
  showAllCategories() {
    this.router.navigate(['/category', 'alle-produkte']);
  }

  // Methode um passende Stock-Bilder für Kategorien zu erhalten
  getCategoryImage(category: string): string {
    const categoryImages: { [key: string]: string } = {
      // === ZULETZT GEKAUFT === //
      '🕒 ZULETZT GEKAUFT': 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // === FAVORITEN === //
      '⭐ FAVORITEN': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // === DEINE ECHTEN KATEGORIEN === //
      
      // PFAND - Pfandflaschen und Mehrwegbehälter
      'PFAND': 'https://c7.alamy.com/comp/JFBEJ5/lemonade-crates-stacked-blue-JFBEJ5.jpg',
      
      // LEBENSMITTEL - Allgemeine Lebensmittel
      'LEBENSMITTEL': 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // VERPACKUNGEN - Verpackungsmaterial
      'VERPACKUNGEN': 'https://img.freepik.com/premium-photo/non-plastic-boxes-food-delivery-white-background_186260-1466.jpg?ga=GA1.1.551023853.1754094495&semt=ais_hybrid&w=740&q=80',
      
      // TIEFKÜHL - Tiefkühlprodukte
      'TIEFKÜHL': '/tiefkuehl.jpg',
      
      // DROGERIE - Drogerieartikel und Kosmetik
      'DROGERIE': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // GETRÄNKE - Verschiedene Getränke
      'GETRÄNKE': '/getraenke.jpg',
      
      // GEWÜRZ - Gewürze und Kräuter
      'GEWÜRZ': '/gewuerz.jpg',
      
      // ALKOHOLISCHE GETRÄNKE - Alkohol
      'ALKOHOL': '/alkohol.jpg',

      // Frische Hähnchen
      'FRISCHE HÄHNCHEN': '/chicken.jpg',
      
      // KONSERVEN - Konservendosen
      'KONSERVEN': '/konserven.jpg',
      
      // ENTSORGUNG - Müllbeutel und Entsorgung
      'ENTSORGUNG': 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // GEMÜSE - Frisches Gemüse
      'GEMÜSE': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // HYGIENEARTIKEL - Hygiene und Körperpflege
      'HYGIENEARTIKEL': '/hygiene.jpg',
      
      // KRÄUTER - Frische Kräuter
      'KRÄUTER': '/kraeuter.jpg',
      
      // OBST - Frisches Obst
      'OBST': 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // PARFÜM - Parfüm und Düfte
      'PARFÜM': '/water-feature.jpg',
      
      // KÜCHENBEDARF - Küchenutensilien
      'KÜCHENBEDARF': '/kuechenbedarf.jpg',
      
      // FOLIEN - Verpackungsfolien
      'FOLIEN': '/folien.jpg',
      
      // MOLKEREIPRODUKTE - Milchprodukte
      'MOLKEREIPRODUKTE': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // PUTZMITTEL - Reinigungsmittel
      'PUTZMITTEL': 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // BROT & BACKWAREN - Brot und Backprodukte
      'BROT & BACKWAREN': '/brot.jpg',
    };

    // Standard-Bild für unbekannte Kategorien - Allgemeine Lebensmittel
    const defaultImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
    
    // Hilfsfunktion zum Normalisieren von Kategorienamen
    const normalizeCategory = (cat: string): string => {
      return cat
        .trim()
        .toUpperCase()
        // Entferne alle unsichtbaren Zeichen (non-breaking spaces, zero-width spaces, etc.)
        .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
        // Normalisiere Leerzeichen
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    // Normalisiere die eingegebene Kategorie
    const normalizedCategory = normalizeCategory(category);
    
    // Versuche direkten Zugriff mit normalisiertem Namen
    let foundImage = categoryImages[normalizedCategory];
    
    // Falls nicht gefunden, versuche alternative Schreibweisen
    if (!foundImage) {
      // Versuche ohne Leerzeichen
      const noSpaces = normalizedCategory.replace(/\s+/g, '');
      foundImage = categoryImages[noSpaces];
      
      // Versuche mit Unterstrich
      if (!foundImage) {
        const withUnderscore = normalizedCategory.replace(/\s+/g, '_');
        foundImage = categoryImages[withUnderscore];
      }
      
      // Versuche exakte Suche in allen verfügbaren Kategorien (normalisiert)
      if (!foundImage) {
        const availableCategories = Object.keys(categoryImages);
        const exactMatch = availableCategories.find(cat => 
          normalizeCategory(cat) === normalizedCategory
        );
        if (exactMatch) {
          foundImage = categoryImages[exactMatch];
        }
      }
      
      // Versuche partielle Übereinstimmung für spezielle Fälle
      if (!foundImage) {''
        const availableCategories = Object.keys(categoryImages);
        const partialMatch = availableCategories.find(cat => {
          const normalizedCat = normalizeCategory(cat);
          return (
            (normalizedCat.includes('ALKOHOL') && normalizedCategory.includes('ALKOHOL')) ||
            (normalizedCat.includes('BROT') && normalizedCategory.includes('BROT')) ||
            (normalizedCat.includes('FRISCHE') && normalizedCategory.includes('FRISCHE') && 
             normalizedCat.includes('HAEHNCHEN') && normalizedCategory.includes('HAEHNCHEN'))
          );
        });
        if (partialMatch) {
          foundImage = categoryImages[partialMatch];
        }
      }
    }
    
    return foundImage || defaultImage;
  }

  // Methode zum Loggen der Artikel-Kategorien
  logArticleCategories(userType: string): void {
  }

  getItemsFromCategory(category:string) {
    console.log('🔄 [PRODUCT-CATALOG] getItemsFromCategory aufgerufen für Kategorie:', category);
    
    if (category === '🕒 Zuletzt gekauft') {
      console.log('🕒 [PRODUCT-CATALOG] Lade zuletzt gekaufte Artikel...');
      // Zuletzt gekaufte Artikel laden
      this.loadLastOrders();
      console.log('📊 [PRODUCT-CATALOG] lastOrders nach loadLastOrders:', this.lastOrders);
      
      // Produkte mit zuletzt gekauften Preisen anzeigen
      this.artikelData = this.lastOrders.map(order => {
        console.log('🔍 [PRODUCT-CATALOG] Verarbeite Order:', order);
        
        const artikel = this.getArticleDetails(order.product_id);
        console.log('🔍 [PRODUCT-CATALOG] Gefundener Artikel für product_id', order.product_id, ':', artikel);
        
        if (artikel) {
          const enrichedArtikel = {
            ...artikel,
            customer_price_net: order.unit_price_net,
            customer_price_gross: order.unit_price_gross,
            customer_vat: order.vat_percentage,
            last_order_date: order.invoice_date,
            invoice_id: order.invoice_id
          };
          console.log('✅ [PRODUCT-CATALOG] Angereicherter Artikel:', enrichedArtikel);
          return enrichedArtikel;
        } else {
          console.log('❌ [PRODUCT-CATALOG] Kein Artikel gefunden für product_id:', order.product_id);
          return null;
        }
      }).filter(item => item !== null);
      
      console.log('📊 [PRODUCT-CATALOG] Finale artikelData für zuletzt gekaufte Artikel:', this.artikelData);
      console.log('📊 [PRODUCT-CATALOG] Anzahl verarbeiteter Artikel:', this.artikelData.length);
    } else if (category === '⭐ Favoriten') {
      console.log('⭐ [PRODUCT-CATALOG] Lade Favoriten...');
      if (this.globalService.isUserLoggedIn) {
        this.artikelData = this.globalService.favoriteItems;
      } else {
        this.artikelData = [];
        this.showToastNotification('Bitte melden Sie sich an, um Ihre Favoriten zu sehen', 'error');
      }
      console.log('📊 [PRODUCT-CATALOG] Favoriten geladen:', this.artikelData);
    } else if (category === 'alle-produkte') {
      console.log('🏢 [PRODUCT-CATALOG] Lade alle Produkte...');
      this.artikelData = this.globalArtikels;
      console.log('📊 [PRODUCT-CATALOG] Alle Produkte geladen:', this.artikelData.length, 'Artikel');
    } else {
      console.log('📂 [PRODUCT-CATALOG] Lade Kategorie:', category);
      // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
      this.artikelData = this.globalArtikels
      this.artikelData = this.artikelData.map((article)=> article).filter((article)=> article?.category == category)
      console.log('📊 [PRODUCT-CATALOG] Kategorie', category, 'geladen:', this.artikelData.length, 'Artikel');
    }
  }


  get categories(): string[] {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF und PFAND)
    const uniqueCategories = [
      ...new Set(
        this.globalArtikels?.map((a) => a.category).filter((cat) => cat && cat !== 'PFAND' && cat !== 'SCHNELLVERKAUF')
      ),
    ];
    
    // Favoriten-Kategorie hinzufügen, wenn Benutzer angemeldet ist und Favoriten vorhanden sind
    if (this.globalService.isUserLoggedIn && this.globalService.favoriteItems.length > 0) {
      uniqueCategories.unshift('⭐ Favoriten');
    }
    
    // Zuletzt gekauft-Kategorie hinzufügen, wenn Benutzer angemeldet ist
    if (this.globalService.isUserLoggedIn && this.currentUserId) {
      uniqueCategories.unshift('🕒 Zuletzt gekauft');
    }
    
    return uniqueCategories;
  }

  addToCart(event: Event, artikel: any): void {

    // Sicherstellen, dass die Menge korrekt ist
    if (
      !artikel.quantity ||
      isNaN(Number(artikel.quantity)) ||
      Number(artikel.quantity) < 1
    ) {
      artikel.quantity = 1; // Standardmenge setzen
    }

    // Menge für Toast-Benachrichtigung speichern (bevor sie zurückgesetzt wird)
    const addedQuantity = Number(artikel.quantity);

    // Überprüfen, ob der Artikel bereits im Warenkorb ist
    const existingItem = this.globalService.warenkorb.find(
      (item) => item.article_number == artikel.article_number
    );

    if (existingItem) {
      // Falls der Artikel existiert, die Menge erhöhen
      existingItem.quantity += Number(artikel.quantity);
    } else {
      // Neuen Artikel hinzufügen
      this.globalService.warenkorb = [
        ...this.globalService.warenkorb,
        { ...artikel, quantity: Number(artikel.quantity) },
      ];
    }

    // Eingabefeld für Menge zurücksetzen
    artikel.quantity = '';

    const button = event.target as HTMLElement;

    // Klasse entfernen, dann mit requestAnimationFrame neu hinzufügen, um die Animation zu triggern
    button.classList.remove('clicked');
    
    // Animation zurücksetzen
    requestAnimationFrame(() => {
        button.classList.add('clicked'); // Füge die Klasse wieder hinzu
    });

    // Sofort Hintergrundfarbe ändern
    button.style.backgroundColor = "#10b981"; // Grün statt Orange

    // Button vergrößern und danach wieder auf Normalgröße setzen
    button.style.transform = "scale(1.1)";
    
    // Nach 500ms zurücksetzen
    setTimeout(() => {
      button.style.transform = "scale(1)"; // Zurück auf Ausgangsgröße
      button.style.backgroundColor = "#10b981"; // Zurück zu Grün
    }, 500);

    this.getTotalPrice();
    //Warenkorb und Endsumme speichern LocalStorage
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
    
    // Toast-Benachrichtigung anzeigen
    const totalQuantity = existingItem ? existingItem.quantity : addedQuantity;
    
    let message: string;
    if (existingItem && existingItem.quantity > addedQuantity) {
      // Artikel war bereits im Warenkorb und Menge wurde erhöht
      message = `${addedQuantity}x "${artikel.article_text}" hinzugefügt (${totalQuantity} insgesamt im Warenkorb)`;
    } else if (addedQuantity > 1) {
      // Neuer Artikel mit mehreren Stück
      message = `${addedQuantity}x "${artikel.article_text}" zum Warenkorb hinzugefügt`;
    } else {
      // Neuer Artikel mit 1 Stück
      message = `"${artikel.article_text}" zum Warenkorb hinzugefügt`;
    }
    this.showToastNotification(message, 'success');
}

  // Methode zum Prüfen, ob ein Artikel zum Warenkorb hinzugefügt werden kann
  canAddToCart(productId: string): boolean {
    // Prüfe, ob der Artikel im globalArtikels Array existiert
    const artikel = this.globalArtikels.find(art => art.article_number === productId);
    return !!artikel;
  }

  // Methode zum Hinzufügen eines Artikels aus dem Modal zum Warenkorb
  addToCartFromModal(event: Event, order: CustomerArticlePrice): void {
    // Prüfe zuerst, ob der Artikel verfügbar ist
    if (!this.canAddToCart(order.product_id)) {
      return;
    }

    // Finde den entsprechenden Artikel im globalArtikels Array
    const artikel = this.globalArtikels.find(art => art.article_number === order.product_id);
    
    if (!artikel) {
      return;
    }

    // Erstelle eine Kopie des Artikels mit der Menge aus dem Modal
    const artikelToAdd = {
      ...artikel,
      quantity: order.quantity || 1
    };

    // Sicherstellen, dass die Menge korrekt ist
    if (
      !artikelToAdd.quantity ||
      isNaN(Number(artikelToAdd.quantity)) ||
      Number(artikelToAdd.quantity) < 1
    ) {
      artikelToAdd.quantity = 1; // Standardmenge setzen
    }

    // Menge für Toast-Benachrichtigung speichern
    const addedQuantity = Number(artikelToAdd.quantity);

    // Überprüfen, ob der Artikel bereits im Warenkorb ist
    const existingItem = this.globalService.warenkorb.find(
      (item) => item.article_number == artikelToAdd.article_number
    );

    if (existingItem) {
      // Falls der Artikel existiert, die Menge erhöhen
      existingItem.quantity += Number(artikelToAdd.quantity);
    } else {
      // Neuen Artikel hinzufügen
      this.globalService.warenkorb = [
        ...this.globalService.warenkorb,
        { ...artikelToAdd, quantity: Number(artikelToAdd.quantity) },
      ];
    }

    // Eingabefeld für Menge zurücksetzen
    order.quantity = '';

    const button = event.target as HTMLElement;

    // Klasse entfernen, dann mit requestAnimationFrame neu hinzufügen, um die Animation zu triggern
    button.classList.remove('clicked');
    
    // Animation zurücksetzen
    requestAnimationFrame(() => {
        button.classList.add('clicked'); // Füge die Klasse wieder hinzu
    });

    // Sofort Hintergrundfarbe ändern
    button.style.backgroundColor = "#10b981"; // Grün statt Orange

    // Button vergrößern und danach wieder auf Normalgröße setzen
    button.style.transform = "scale(1.1)";
    
    // Nach 500ms zurücksetzen
    setTimeout(() => {
      button.style.transform = "scale(1)"; // Zurück auf Ausgangsgröße
      button.style.backgroundColor = "#10b981"; // Zurück zu Grün
    }, 500);

    this.getTotalPrice();
    //Warenkorb und Endsumme speichern LocalStorage
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
    
    // Toast-Benachrichtigung anzeigen
    const totalQuantity = existingItem ? existingItem.quantity : addedQuantity;
    
    let message: string;
    if (existingItem && existingItem.quantity > addedQuantity) {
      // Artikel war bereits im Warenkorb und Menge wurde erhöht
      message = `${addedQuantity}x "${artikelToAdd.article_text}" hinzugefügt (${totalQuantity} insgesamt im Warenkorb)`;
    } else if (addedQuantity > 1) {
      // Neuer Artikel mit mehreren Stück
      message = `${addedQuantity}x "${artikelToAdd.article_text}" zum Warenkorb hinzugefügt`;
    } else {
      // Neuer Artikel mit 1 Stück
      message = `"${artikelToAdd.article_text}" zum Warenkorb hinzugefügt`;
    }
    this.showToastNotification(message, 'success');
    
  }


  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
  }


  collectOrderData(response: any) {
    this.orderData.user_id = response.user.id;
    this.orderData.email = response.user.email;
  }

  openLoginPrompt() {
    // Dispatch custom event to trigger header login modal
    const event = new CustomEvent('openLoginModal');
    window.dispatchEvent(event);
  }

  getFeaturedProducts(): any[] {
    // Nur Produkte aus aktiven Angeboten anzeigen
    if (this.activeOffers.length > 0) {
      const offerProducts: any[] = [];
      
      // Sammle alle Produkte aus aktiven Angeboten
      this.activeOffers.forEach(offer => {
        offer.products.forEach(product => {
          // Normalisiere das Produkt auf das Standard-Schema
          const normalizedProduct = {
            // Standard-Produktfelder (wie normale Produkte)
            id: product.product_id || product.id,
            article_number: product.article_number || product.ean || product.product_id?.toString(),
            article_text: product.article_text || 'Produkt',
            main_image_url: product.main_image_url,
            sale_price: product.offer_price || product.sale_price || product.gross_price || 0,
            cost_price: product.cost_price || 0,
            category: product.category || 'Angebot',
            unit: product.unit || 'Stück',
            ean: product.ean || '',
            is_active: product.is_active !== undefined ? product.is_active : true,
            
            // Angebotsinformationen
            offer_name: offer.name,
            offer_description: offer.description,
            discount_percentage: offer.discount_percentage,
            discount_amount: offer.discount_amount,
            offer_type: offer.offer_type,
            start_date: offer.start_date,
            end_date: offer.end_date,
            offer_price: product.offer_price,
            use_offer_price: product.use_offer_price,
            
            // Zusätzliche Felder für Kompatibilität
            product_id: product.product_id,
            article_notes: product.article_notes || '',
            article_type: product.article_type || '',
            custom_field_1: product.custom_field_1 || '',
            db_index: product.db_index || 0,
            tax_code: product.tax_code || 0,
            sale_price_2: product.sale_price_2 || 0,
            sale_price_3: product.sale_price_3 || 0,
            sale_price_quantity_2: product.sale_price_quantity_2 || 0,
            sale_price_quantity_3: product.sale_price_quantity_3 || 0
          };
          
          offerProducts.push(normalizedProduct);
        });
      });
      
      // Filtere nur Duplikate heraus
      const uniqueProducts = offerProducts.filter((product, index, self) => 
        index === self.findIndex(p => p.product_id === product.product_id)
      );
      
      return uniqueProducts;
    }
    
    // Keine Fallback-Produkte mehr - leeres Array zurückgeben
    return [];
  }





  scrollToCategories(): void {
    const categoriesSection = document.querySelector('.categories-section');
    if (categoriesSection) {
      categoriesSection.scrollIntoView({ behavior: 'auto' });
    }
  }

  checkScrollToCategories(): void {
    this.route.queryParams.subscribe(params => {
      if (params['scrollToCategories'] === 'true') {
        // Body scroll verhindern
        document.body.style.overflow = 'hidden';
        
        // Loading-Overlay anzeigen
        this.showLoadingOverlay = true;
        this.isFromCategoryDetail = true; // Setze den neuen Flag
        
        // Query-Parameter aus der URL entfernen
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
        
        // Kurze Verzögerung für bessere UX, dann scrollen
        setTimeout(() => {
          this.scrollToCategoriesImmediate();
          
          // Loading-Overlay nach längerer Verzögerung sanft ausblenden
          setTimeout(() => {
            // Sanfte Ausblendung mit CSS-Transition
            const overlay = document.querySelector('.loading-overlay') as HTMLElement;
            if (overlay) {
              overlay.classList.add('fade-out');
              setTimeout(() => {
                this.showLoadingOverlay = false;
                this.isFromCategoryDetail = false; // Zurücksetzen des Flags
                // Body scroll wiederherstellen
                document.body.style.overflow = '';
              }, 400); // Warte auf CSS-Transition
            } else {
              this.showLoadingOverlay = false;
              this.isFromCategoryDetail = false; // Zurücksetzen des Flags
              document.body.style.overflow = '';
            }
          }, 300); // Reduziert von 800ms auf 300ms für schnellere Navigation von category detail
        }, 200);
      }
    });
  }

  // Neue Methode für sofortiges Scrollen ohne Animation
  scrollToCategoriesImmediate(): void {
    const categoriesSection = document.querySelector('.categories-section');
    if (categoriesSection) {
      // Sofortige Position ohne Animation
      categoriesSection.scrollIntoView({ behavior: 'instant' });
    } else {
      // Fallback: ViewportScroller verwenden
      this.viewportScroller.scrollToPosition([0, 800]);
    }
  }

  scrollToContact(): void {
    // Scroll to bottom of page for contact info
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    // Cleanup: Body scroll wiederherstellen falls Modal noch offen ist
    this.restoreBodyScroll();
  }

}
