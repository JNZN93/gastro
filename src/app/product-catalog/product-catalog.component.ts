import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent, ZXingScannerModule],
  templateUrl: './product-catalog.component.html',
  styleUrl: './product-catalog.component.scss',
})
export class ProductCatalogComponent implements OnInit {
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

  // Eigenschaften für Image Modal
  showImageModal: boolean = false;
  selectedImageUrl: string = '';
  selectedImageProduct: any = null;
  isImageZoomed: boolean = false;

  // Eigenschaften für Toast-Benachrichtigung
  showToast: boolean = false;
  toastMessage: string = '';
  toastType: 'success' | 'error' = 'success';

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    public globalService: GlobalService
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    const loadedWarenkorb = localStorage.getItem('warenkorb')

    if(loadedWarenkorb) {
      this.globalService.warenkorb = JSON.parse(loadedWarenkorb);
    }

    if (token) {
      // Benutzer ist angemeldet - normale Funktionalität
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          // Benutzerrolle und Name im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
          this.globalService.setUserLoggedIn(true);
          this.currentUserId = response.user.id;
          
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            
            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            // Erstelle zusätzliches pfand-array für Artikel mit category "PFAND" (nur initial, da PFAND-Artikel statisch sind)
            this.globalService.setPfandArtikels(this.globalArtikels);
            this.artikelData = this.globalArtikels;
            
            // Log Artikel-Kategorien für angemeldete Benutzer
            this.logArticleCategories('Angemeldeter Benutzer');
            
            this.collectOrderData(response);
            this.globalService.orderData = this.orderData;
            this.isVisible = false;
          });
        },
        error: (error) => {
          // Token ungültig - als Gast behandeln
          this.loadAsGuest();
        },
      });
    } else {
      // Kein Token - als Gast laden
      this.loadAsGuest();
    }
  }

  loadAsGuest(): void {
    console.log('Lade als Gast...');
    this.globalService.setUserLoggedIn(false);
    this.globalService.isAdmin = false;
    
    this.artikelService.getData().subscribe((res) => {
      // Für Gäste nur normale Artikel anzeigen (keine SCHNELLVERKAUF)
      this.globalArtikels = res.filter((artikel: any) => artikel.category !== 'SCHNELLVERKAUF');
      // Erstelle zusätzliches pfand-array für Artikel mit category "PFAND" (nur initial, da PFAND-Artikel statisch sind)
      this.globalService.setPfandArtikels(this.globalArtikels);
      this.artikelData = this.globalArtikels;
      
      // Log Artikel-Kategorien für Gäste
      this.logArticleCategories('Gast');
      
      this.isVisible = false;
    });
  }

  // Neue Methode zum Laden der letzten Bestellungen
  loadLastOrders(): void {
    if (!this.currentUserId) {
      console.error('Keine User ID verfügbar');
      return;
    }

    this.isLoadingLastOrders = true;
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.error('Kein Token verfügbar');
      this.isLoadingLastOrders = false;
      return;
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    console.log('🔄 [LAST-ORDERS] Lade letzte Bestellungen für User:', this.currentUserId);

    this.http.get<CustomerArticlePrice[]>(`https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/user`, { headers })
      .subscribe({
        next: (data) => {
          console.log('✅ [LAST-ORDERS] Daten erfolgreich geladen:', data);
          console.log('📊 [LAST-ORDERS] Anzahl Bestellungen:', Array.isArray(data) ? data.length : 'Kein Array');
          
          if (Array.isArray(data)) {
            this.lastOrders = data;
            console.log('💾 [LAST-ORDERS] Bestellungen gespeichert:', this.lastOrders.length);
          } else {
            console.warn('⚠️ [LAST-ORDERS] Daten sind kein Array:', data);
            this.lastOrders = [];
          }
          
          this.isLoadingLastOrders = false;
        },
        error: (error) => {
          console.error('❌ [LAST-ORDERS] Fehler beim Laden der letzten Bestellungen:', error);
          console.error('❌ [LAST-ORDERS] Fehler Details:', {
            message: error.message,
            status: error.status,
            statusText: error.statusText
          });
          this.lastOrders = [];
          this.isLoadingLastOrders = false;
        }
      });
  }

  // Methode zum Umschalten der letzten Bestellungen
  toggleLastOrders(): void {
    this.showLastOrders = !this.showLastOrders;
    
    if (this.showLastOrders && this.lastOrders.length === 0) {
      console.log('🔄 [TOGGLE] Lade letzte Bestellungen...');
      this.loadLastOrders();
    } else if (this.showLastOrders) {
      console.log('📊 [TOGGLE] Zeige', this.lastOrders.length, 'Bestellungen');
    } else {
      console.log('❌ [TOGGLE] Modal geschlossen');
    }
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isFavorite(artikel: any): boolean {
    const favs = localStorage.getItem('favoriteItems') || '[]';
    return JSON.parse(favs).some((item: any) => item.article_number === artikel.article_number);
    
  }

  toggleFavorite(event: Event, artikel: any): void {
    let favorites = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
  
    const index = favorites.findIndex((item: any) => item.article_number === artikel.article_number);
  
    if (index > -1) {
      // Artikel existiert -> Entfernen
      favorites.splice(index, 1);
    } else {
      // Artikel hinzufügen
      favorites.push(artikel);
    }
    // Alphabetisch sortieren nach artikel.name (case-insensitive)
    favorites.sort((a: any, b: any) => 
      a.article_text.localeCompare(b.article_text, undefined, { sensitivity: 'base' })
    );

    localStorage.setItem('favoriteItems', JSON.stringify(favorites));
  }

  
  filteredArtikelData() {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    this.artikelData = this.globalArtikels;
    if (this.searchTerm) {
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
    // Torch ausschalten
    if (this.scanner) {
      this.scanner.torch = false;
    }
    this.scanner?.reset(); // stoppt Kamera & löst Vorschau
  }

  playBeep(): void {
  const audio = new Audio('beep.mp3');
  audio.volume = 0.5;
  audio.play().catch(err => console.error('Fehler beim Abspielen des Tons:', err));
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
    console.error(`❌ [BILD-FEHLER] Kategorie "${category}" - Bild konnte nicht geladen werden:`, img.src);
    
    // Fallback auf Standard-Bild
    img.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
  }

  // Image Modal Methoden
  openImageModal(artikel: any): void {
    console.log('openImageModal called with:', artikel);
    console.log('artikel.main_image_url:', artikel.main_image_url);
    if (artikel.main_image_url) {
      this.selectedImageUrl = artikel.main_image_url;
      this.selectedImageProduct = artikel;
      this.showImageModal = true;
      // Body scroll verhindern
      document.body.style.overflow = 'hidden';
    } else {
      console.log('No main_image_url found for this article');
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

  filterCategory(event: Event) {
    const category = (event.target as HTMLSelectElement).value; // Wert aus Event holen
    this.selectedCategory = category; // Kategorie speichern
    // Seite nach oben scrollen
    window.scrollTo({ top: 0});

    if (this.selectedCategory == "FAVORITEN") {
        this.artikelData = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
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

    if (category === "FAVORITEN") {
        this.artikelData = JSON.parse(localStorage.getItem('favoriteItems') || '[]');
        return;
    }
    if (category === "") {
      // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
      this.artikelData = this.globalArtikels;
      return;
    }
    this.getItemsFromCategory(category);
  }

  // Methode um alle Kategorien anzuzeigen
  showAllCategories() {
    this.selectedCategory = "";
    this.artikelData = this.globalArtikels;
    window.scrollTo({ top: 0});
  }

  // Methode um passende Stock-Bilder für Kategorien zu erhalten
  getCategoryImage(category: string): string {
    const categoryImages: { [key: string]: string } = {
      // Favoriten - Herz/Stern Symbol in Essen
      'FAVORITEN': 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // === DEINE ECHTEN KATEGORIEN === //
      
      // PFAND - Pfandflaschen und Mehrwegbehälter
      'PFAND': 'https://c7.alamy.com/comp/JFBEJ5/lemonade-crates-stacked-blue-JFBEJ5.jpg',
      
      // LEBENSMITTEL - Allgemeine Lebensmittel
      'LEBENSMITTEL': 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // VERPACKUNGEN - Verpackungsmaterial
      'VERPACKUNGEN': 'https://img.freepik.com/premium-photo/non-plastic-boxes-food-delivery-white-background_186260-1466.jpg?ga=GA1.1.551023853.1754094495&semt=ais_hybrid&w=740&q=80',
      
      // TIEFKÜHL - Tiefkühlprodukte
      'TIEFKÜHL': '/tiefkühl.jpg',
      
      // DROGERIE - Drogerieartikel und Kosmetik
      'DROGERIE': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // GETRÄNKE - Verschiedene Getränke
      'GETRÄNKE': '/getränke.jpg',
      
      // GEWÜRZ - Gewürze und Kräuter
      'GEWÜRZ': '/gewürz.jpg',
      
      // ALKOHOLISCHE GETRÄNKE - Alkohol
      'ALKOHOLISCHE GETRÄNKE': '/alkohol.jpg',
      
      // KONSERVEN - Konservendosen
      'KONSERVEN': '/konserven.jpg',
      
      // ENTSORGUNG - Müllbeutel und Entsorgung
      'ENTSORGUNG': 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // GEMÜSE - Frisches Gemüse
      'GEMÜSE': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // HYGIENEARTIKEL - Hygiene und Körperpflege
      'HYGIENEARTIKEL': '/hygiene.jpg',
      
      // KRÄUTER - Frische Kräuter
      'KRÄUTER': '/kräuter.jpg',
      
      // OBST - Frisches Obst
      'OBST': 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // PARFÜM - Parfüm und Düfte
      'PARFÜM': 'https://images.unsplash.com/photo-1541643600914-78b084683601?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // KÜCHENBEDARF - Küchenutensilien
      'KÜCHENBEDARF': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // FOLIEN - Verpackungsfolien
      'FOLIEN': '/folien.jpg',
      
      // MOLKEREIPRODUKTE - Milchprodukte
      'MOLKEREIPRODUKTE': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // PUTZMITTEL - Reinigungsmittel
      'PUTZMITTEL': 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      
      // BROT & BACKWAREN - Brot und Backprodukte
      'BROT & BACKWAREN': '/brot.jpg'
    };

    // Standard-Bild für unbekannte Kategorien - Allgemeine Lebensmittel
    const defaultImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
    
    // Bereinige die Kategorie von Leerzeichen und normalisiere sie
    const categoryKey = category.trim().toUpperCase();
    console.log(`🔍 [BILD] Original Kategorie: "${category}"`);
    console.log(`🔍 [BILD] Normalisierte Kategorie: "${categoryKey}"`);
    console.log(`🔍 [BILD] Kategorie Länge: ${categoryKey.length}`);
    console.log(`🔍 [BILD] Verfügbare Kategorie Länge: ${categoryImages['ALKOHOLISCHE GETRÄNKE'] ? 'ALKOHOLISCHE GETRÄNKE'.length : 'NICHT GEFUNDEN'}`);
    
    // Versuche direkten Zugriff
    let foundImage = categoryImages[categoryKey];
    
    // Falls nicht gefunden, versuche alternative Schreibweisen
    if (!foundImage) {
      console.log(`🔄 [BILD] Versuche alternative Schreibweisen für "${categoryKey}"`);
      
      // Versuche ohne Leerzeichen
      const noSpaces = categoryKey.replace(/\s+/g, '');
      foundImage = categoryImages[noSpaces];
      if (foundImage) {
        console.log(`✅ [BILD] Gefunden mit "noSpaces": ${noSpaces}`);
      }
      
      // Versuche mit Unterstrich
      if (!foundImage) {
        const withUnderscore = categoryKey.replace(/\s+/g, '_');
        foundImage = categoryImages[withUnderscore];
        if (foundImage) {
          console.log(`✅ [BILD] Gefunden mit "withUnderscore": ${withUnderscore}`);
        }
      }
      
      // Versuche exakte Suche in allen verfügbaren Kategorien
      if (!foundImage) {
        const availableCategories = Object.keys(categoryImages);
        const exactMatch = availableCategories.find(cat => cat.trim() === categoryKey.trim());
        if (exactMatch) {
          foundImage = categoryImages[exactMatch];
          console.log(`✅ [BILD] Exakte Übereinstimmung gefunden: "${exactMatch}"`);
        }
      }
      
      // Versuche partielle Übereinstimmung
      if (!foundImage) {
        const availableCategories = Object.keys(categoryImages);
        const partialMatch = availableCategories.find(cat => 
          cat.includes('ALKOHOL') && categoryKey.includes('ALKOHOL') ||
          cat.includes('BROT') && categoryKey.includes('BROT')
        );
        if (partialMatch) {
          foundImage = categoryImages[partialMatch];
          console.log(`✅ [BILD] Partielle Übereinstimmung gefunden: "${partialMatch}"`);
        }
      }
    }
    
    if (foundImage) {
      console.log(`🖼️ [BILD] Kategorie "${category}" -> Bild gefunden: ${foundImage}`);
    } else {
      console.log(`⚠️ [BILD] Kategorie "${category}" -> KEIN spezifisches Bild, verwende Standard-Bild`);
      console.log(`🔍 [BILD] Gesuchte Kategorie: "${category}"`);
      console.log(`🔍 [BILD] Verfügbare Kategorien:`, Object.keys(categoryImages));
    }
    
    return foundImage || defaultImage;
  }

  // Methode zum Loggen der Artikel-Kategorien
  logArticleCategories(userType: string): void {
    console.log(`📊 [ARTIKEL-KATEGORIEN] Benutzertyp: ${userType}`);
    console.log(`📊 [ARTIKEL-KATEGORIEN] Gesamtzahl Artikel: ${this.globalArtikels.length}`);
    
    // Zähle Artikel pro Kategorie
    const categoryCount: { [key: string]: number } = {};
    this.globalArtikels.forEach(artikel => {
      if (artikel.category) {
        categoryCount[artikel.category] = (categoryCount[artikel.category] || 0) + 1;
      }
    });
    
    console.log('📊 [ARTIKEL-KATEGORIEN] Artikel pro Kategorie:', categoryCount);
    
    // Zeige auch einige Beispiel-Artikel
    const sampleArticles = this.globalArtikels.slice(0, 5).map(artikel => ({
      name: artikel.article_text,
      category: artikel.category,
      number: artikel.article_number
    }));
    console.log('📊 [ARTIKEL-KATEGORIEN] Beispiel-Artikel:', sampleArticles);
  }

  getItemsFromCategory(category:string) {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    this.artikelData = this.globalArtikels
    this.artikelData = this.artikelData.map((article)=> article).filter((article)=> article?.category == category)
  }


  get categories(): string[] {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    const uniqueCategories = [
      ...new Set(
        this.globalArtikels?.map((a) => a.category).filter((cat) => cat)
      ),
    ];
    
    // Log alle gefundenen Kategorien
    console.log('🏷️ [KATEGORIEN] Gefundene Kategorien:', uniqueCategories);
    console.log('🏷️ [KATEGORIEN] Anzahl Kategorien:', uniqueCategories.length);
    console.log('🏷️ [KATEGORIEN] PFAND in Kategorien:', uniqueCategories.includes('PFAND'));
    console.log('🏷️ [KATEGORIEN] ALKOHOLISCHE GETRÄNKE in Kategorien:', uniqueCategories.includes('ALKOHOLISCHE GETRÄNKE'));
    console.log('🏷️ [KATEGORIEN] Alle Kategorien mit "ALKOHOL":', uniqueCategories.filter(cat => cat.includes('ALKOHOL')));
    console.log('🏷️ [KATEGORIEN] Alle Kategorien mit "GETRÄNKE":', uniqueCategories.filter(cat => cat.includes('GETRÄNKE')));
    console.log('🏷️ [KATEGORIEN] Alle Artikel mit Kategorien:', this.globalArtikels?.map(a => ({ article_number: a.article_number, category: a.category })));
    
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
      console.warn('⚠️ [MODAL-CART] Artikel nicht verfügbar:', order.product_id);
      return;
    }

    // Finde den entsprechenden Artikel im globalArtikels Array
    const artikel = this.globalArtikels.find(art => art.article_number === order.product_id);
    
    if (!artikel) {
      console.error('❌ [MODAL-CART] Artikel nicht gefunden:', order.product_id);
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
      console.log('🔄 [MODAL-CART] Menge erhöht für Artikel:', artikelToAdd.article_number);
    } else {
      // Neuen Artikel hinzufügen
      this.globalService.warenkorb = [
        ...this.globalService.warenkorb,
        { ...artikelToAdd, quantity: Number(artikelToAdd.quantity) },
      ];
      console.log('✅ [MODAL-CART] Neuer Artikel hinzugefügt:', artikelToAdd.article_number);
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
    
    console.log('💾 [MODAL-CART] Warenkorb aktualisiert:', this.globalService.warenkorb.length, 'Artikel');
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
}
