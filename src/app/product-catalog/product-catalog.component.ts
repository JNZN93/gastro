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
          // Benutzerrolle im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserLoggedIn(true);
          this.currentUserId = response.user.id;
          
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            
            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            this.artikelData = this.globalArtikels;
            
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
      this.artikelData = this.globalArtikels;
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

  getItemsFromCategory(category:string) {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    this.artikelData = this.globalArtikels
    this.artikelData = this.artikelData.map((article)=> article).filter((article)=> article?.category == category)
  }


  get categories(): string[] {
    // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
    return [
      ...new Set(
        this.globalArtikels?.map((a) => a.category).filter((cat) => cat)
      ),
    ];
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
