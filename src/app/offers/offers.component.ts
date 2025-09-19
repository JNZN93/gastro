import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OffersService, Offer, OfferWithProducts, OfferProduct, CreateOfferRequest, AddProductRequest } from '../offers.service';
import { ForceActiveService } from '../force-active.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from '../../environments/environment';
// import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-offers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './offers.component.html',
  styleUrls: ['./offers.component.scss']
})
export class OffersComponent implements OnInit {
  offers: OfferWithProducts[] = [];
  loading = false;
  showCreateForm = false;
  showAddProductForm = false;
  selectedOffer: OfferWithProducts | null = null;
  // track selected flyer page per offer id (zero-based)
  selectedFlyerPageIndexByOfferId: Record<number, number> = {};
  
  // Modal properties
  showRemoveProductModal = false;
  selectedProductForRemoval: OfferProduct | null = null;
  selectedOfferForRemoval: OfferWithProducts | null = null;
  
  // Product search properties
  productSearchResults: any[] = [];
  selectedProduct: any = null;
  isSearching = false;
  showSearchResults = false;
  selectedIndex = -1;
  globalArtikels: any[] = []; // Neue Property für lokale Artikel-Daten
  
  createOfferForm: FormGroup;
  addProductForm: FormGroup;

  // Image upload helper
  private http = inject(HttpClient);

  // Force Active Service
  forceActiveService = inject(ForceActiveService);
  currentForceActiveOfferId: number | null = null;

  constructor(
    private offersService: OffersService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.createOfferForm = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      discount_percentage: [null],
      discount_amount: [null],
      offer_type: ['fixed_amount', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      is_active: [true]
    });

    this.addProductForm = this.fb.group({
      productSearch: ['', Validators.required],
      offerPrice: [null],
      useOfferPrice: [false],
      minQuantity: [null],
      maxQuantity: [null]
    });
  }

  ngOnInit(): void {
    // Debug: Teste verschiedene Endpunkte
    this.testApiEndpoints();
    this.testProductsApi();
    this.loadOffers();
    this.loadGlobalArtikels(); // Lade lokale Artikel-Daten
    this.loadForceActiveStatus(); // Lade force_active Status
  }

  // Neue Methode zum Laden der lokalen Artikel-Daten
  private loadGlobalArtikels(): void {
    // Lade alle verfügbaren Artikel für lokale Suche
    this.offersService.searchProducts('').subscribe({
      next: (response: any) => {
        if (response && Array.isArray(response)) {
          this.globalArtikels = response;
          console.log('📦 Lokale Artikel-Daten geladen:', this.globalArtikels.length);
        }
      },
      error: (error: any) => {
        console.error('❌ Fehler beim Laden der lokalen Artikel:', error);
      }
    });
  }

  // Methode zum Laden des force_active Status
  private loadForceActiveStatus(): void {
    const activeOffer = this.forceActiveService.getActiveOffer();
    this.currentForceActiveOfferId = activeOffer ? activeOffer.offerId : null;
    console.log('🔥 Force Active Status geladen:', this.currentForceActiveOfferId);
  }

  // Methode zum Toggle des force_active Status für ein Angebot
  toggleForceActive(offer: OfferWithProducts): void {
    if (this.isOfferForceActive(offer.id!)) {
      // Angebot ist bereits force_active, deaktivieren
      this.forceActiveService.deactivateOffer();
      this.currentForceActiveOfferId = null;
      console.log('❌ Force Active für Angebot deaktiviert:', offer.name);
    } else {
      // Angebot als force_active aktivieren
      this.forceActiveService.activateOffer(offer.id!, offer.name);
      this.currentForceActiveOfferId = offer.id!;
      console.log('🔥 Force Active für Angebot aktiviert:', offer.name);
    }
  }

  // Prüft ob ein Angebot als force_active markiert ist
  isOfferForceActive(offerId: number): boolean {
    return this.forceActiveService.isOfferForceActive(offerId);
  }

  toggleProductsSection(offer: OfferWithProducts): void {
    offer.isProductsExpanded = !offer.isProductsExpanded;
  }

  confirmRemoveProduct(offer: OfferWithProducts, product: OfferProduct): void {
    this.selectedProductForRemoval = product;
    this.selectedOfferForRemoval = offer;
    this.showRemoveProductModal = true;
  }

  closeRemoveProductModal(): void {
    this.showRemoveProductModal = false;
    this.selectedProductForRemoval = null;
    this.selectedOfferForRemoval = null;
  }

  confirmRemoveProductAction(): void {
    if (this.selectedProductForRemoval && this.selectedOfferForRemoval) {
      this.removeProductFromOffer(this.selectedOfferForRemoval.id!, this.selectedProductForRemoval.product_id);
      this.closeRemoveProductModal();
    }
  }

  onProductSearch(): void {
    const searchTerm = this.addProductForm.get('productSearch')?.value;
    console.log('🔍 Produktsuche gestartet mit Term:', searchTerm);
    
    // Wenn bereits ein Produkt ausgewählt ist und der Suchbegriff dem ausgewählten Produkt entspricht, 
    // keine neue Suche starten
    if (this.selectedProduct && 
        (this.selectedProduct.article_text === searchTerm || 
         this.selectedProduct.article_number === searchTerm ||
         this.selectedProduct.article_text?.toLowerCase() === searchTerm.toLowerCase() ||
         this.selectedProduct.article_number?.toLowerCase() === searchTerm.toLowerCase())) {
      console.log('🔍 Produkt bereits ausgewählt, keine neue Suche nötig');
      return;
    }
    
    if (!searchTerm || searchTerm.length < 1) {
      console.log('🔍 Suchbegriff leer, breche ab');
      this.productSearchResults = [];
      this.showSearchResults = false;
      this.selectedIndex = -1;
      return;
    }

    this.isSearching = true;
    this.showSearchResults = true;
    console.log('🔍 Starte lokale Suche...');

    // Verwende die verbesserte Suchlogik aus Customer Orders
    this.performLocalSearch(searchTerm);
  }

  // Neue Methode für lokale Suche (basierend auf Customer Orders)
  private performLocalSearch(searchTerm: string): void {
    const trimmedTerm = searchTerm.trim();
    
    // Mindestlänge prüfen (außer bei EAN)
    const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
    if (!isEanSearch && trimmedTerm.length < 3) {
      this.isSearching = false;
      this.productSearchResults = [];
      this.showSearchResults = false;
      this.selectedIndex = -1;
      return; // Suche abbrechen
    }

    if (isEanSearch) {
      // EAN-Suche: Zuerst in lokalen Artikeln suchen
      const localEanResults = this.globalArtikels.filter(artikel =>
        artikel.ean?.toLowerCase() === trimmedTerm.toLowerCase()
      );

      if (localEanResults.length > 0) {
        this.productSearchResults = localEanResults;
        this.showSearchResults = true;
        this.selectedIndex = -1;
        this.isSearching = false;

        console.log('🔍 [EAN-LOCAL] EAN in lokalen Artikeln gefunden:', this.productSearchResults.length);
      } else {
        // EAN nicht gefunden → API-Suche
        this.searchEanInApi(trimmedTerm);
        return;
      }
    } else {
      // Normale Text-Suche
      const terms = trimmedTerm.toLowerCase().split(/\s+/);

      const filtered = this.globalArtikels.filter((artikel) =>
        terms.every((term) =>
          artikel.article_text.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      );

      // Sortierlogik aus Customer Orders
      this.productSearchResults = filtered.sort((a, b) => {
        const searchTermLower = trimmedTerm.toLowerCase();
        const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
        const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
        const aArticleTextExact = a.article_text.toLowerCase() === searchTermLower;
        const bArticleTextExact = b.article_text.toLowerCase() === searchTermLower;
        const aEanExact = a.ean?.toLowerCase() === searchTermLower;
        const bEanExact = b.ean?.toLowerCase() === searchTermLower;

        const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
        const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
        const aArticleTextStartsWith = a.article_text.toLowerCase().startsWith(searchTermLower);
        const bArticleTextStartsWith = b.article_text.toLowerCase().startsWith(searchTermLower);
        const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
        const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);

        if (aArticleNumberExact && !bArticleNumberExact) return -1;
        if (!aArticleNumberExact && bArticleNumberExact) return 1;
        if (aArticleTextExact && !bArticleTextExact) return -1;
        if (!aArticleTextExact && bArticleTextExact) return 1;
        if (aEanExact && !bEanExact) return -1;
        if (!aEanExact && bEanExact) return 1;
        if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
        if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
        if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
        if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
        if (aEanStartsWith && !bEanStartsWith) return -1;
        if (!aEanStartsWith && bEanStartsWith) return 1;

        const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
        if (articleNumberComparison !== 0) {
          return articleNumberComparison;
        }
        return a.article_text.localeCompare(b.article_text);
      });

      this.showSearchResults = this.productSearchResults.length > 0;
      this.selectedIndex = -1;
      this.isSearching = false;
      
      console.log('🔍 Lokale Suche abgeschlossen:', this.productSearchResults.length);
    }
  }

  // Neue Methode für EAN-API-Suche (basierend auf Customer Orders)
  private searchEanInApi(eanCode: string): void {
    const token = localStorage.getItem('token');
    
    this.http.get(`${environment.apiUrl}/api/product-eans/ean/${eanCode}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          // EAN in products_ean Tabelle gefunden
          const foundArticleNumber = response.data.article_number;
          
          // Prüfe ob dieser Artikel bereits in globalArtikels existiert
          const existingProduct = this.globalArtikels.find(artikel => 
            artikel.article_number === foundArticleNumber
          );
          
          if (existingProduct) {
            // Artikel existiert bereits - zeige ihn an
            this.productSearchResults = [existingProduct];
            this.showSearchResults = true;
            this.selectedIndex = -1;
            this.isSearching = false;
            
            console.log('🔍 [EAN-API] EAN gefunden und Artikel in globalArtikels vorhanden:', existingProduct.article_text);
          } else {
            // Artikel existiert nicht in globalArtikels - keine Ergebnisse
            this.productSearchResults = [];
            this.showSearchResults = false;
            this.isSearching = false;
            
            console.log('🔍 [EAN-API] EAN gefunden aber Artikel nicht in globalArtikels:', foundArticleNumber);
          }
        } else {
          // EAN nicht in products_ean Tabelle gefunden
          this.productSearchResults = [];
          this.showSearchResults = false;
          this.isSearching = false;
          
          console.log('🔍 [EAN-API] EAN nicht in products_ean Tabelle gefunden:', eanCode);
        }
      },
      error: (error: any) => {
        console.error('Error searching EAN in API:', error);
        // Bei Fehler: normale lokale Suche durchführen
        this.performLocalSearch(this.addProductForm.get('productSearch')?.value || '');
      }
    });
  }

  // Neue Methode zum Vergleichen von Artikelnummern (aus Customer Orders)
  private compareArticleNumbers(a: string | undefined, b: string | undefined): number {
    // Behandle undefined/null Werte
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    
    // Versuche numerischen Vergleich für reine Zahlen
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    
    // Wenn beide Artikelnummern reine Zahlen sind, vergleiche sie numerisch
    if (!isNaN(aNum) && !isNaN(bNum) && a.toString() === aNum.toString() && b.toString() === bNum.toString()) {
      return aNum - bNum;
    }
    
    // Ansonsten alphabetischen Vergleich
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  selectProduct(product: any): void {
    this.selectedProduct = product;
    this.addProductForm.patchValue({
      productSearch: product.article_text
    });
    this.showSearchResults = false;
    this.productSearchResults = [];
    this.selectedIndex = -1;
    
    // Stoppe alle laufenden Suchen
    this.isSearching = false;
    
    console.log('✅ Produkt ausgewählt:', product.article_text);
  }

  onProductSearchKeyDown(event: KeyboardEvent): void {
    // Handle Enter key even when no dropdown is shown (for better UX)
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      
      // If dropdown is shown, select the highlighted product
      if (this.showSearchResults && this.productSearchResults.length > 0) {
        if (this.selectedIndex === -1) {
          this.selectedIndex = 0;
        }
        if (this.selectedIndex >= 0 && this.selectedIndex < this.productSearchResults.length) {
          const selectedProduct = this.productSearchResults[this.selectedIndex];
          this.selectProduct(selectedProduct);
          console.log('✅ Produkt aus Dropdown ausgewählt:', selectedProduct.article_text);
        }
        return;
      }
      
      // If no dropdown but there's text, try to search and select first result
      const searchTerm = this.addProductForm.get('productSearch')?.value;
      if (searchTerm && searchTerm.trim().length > 0) {
        console.log('🔍 Suche nach Produkt und wähle erstes Ergebnis...');
        this.searchAndSelectFirstProduct(searchTerm);
        return;
      }
      
      return;
    }
    
    if (!this.showSearchResults || this.productSearchResults.length === 0) {
      // Allow normal typing when no dropdown is shown
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedIndex === -1) {
          this.selectedIndex = 0;
        } else {
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.productSearchResults.length - 1);
        }
        this.scrollToSelectedProduct();
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedIndex === -1) {
          this.selectedIndex = this.productSearchResults.length - 1;
        } else {
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        }
        this.scrollToSelectedProduct();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.hideProductSearchResults();
        break;
      case 'Tab':
        // Allow tab to close dropdown and move to next field
        this.hideProductSearchResults();
        break;
    }
  }

  private searchAndSelectFirstProduct(searchTerm: string): void {
    // Search for products and automatically select the first result
    this.offersService.searchProducts(searchTerm).subscribe({
      next: (response: any) => {
        if (response && Array.isArray(response)) {
          // Verwende die lokale Suchlogik
          this.performLocalSearch(searchTerm);
          if (this.productSearchResults.length > 0) {
            // Select the first product automatically
            this.selectProduct(this.productSearchResults[0]);
            // Show a brief success message
            console.log('✅ Produkt automatisch ausgewählt:', this.productSearchResults[0].article_text);
          } else {
            console.log('ℹ️ Keine Produkte für den Suchbegriff gefunden');
          }
        }
      },
      error: (error: any) => {
        console.error('Fehler bei der automatischen Produktsuche:', error);
      }
    });
  }

  private scrollToSelectedProduct(): void {
    // Warte kurz, damit Angular die DOM-Änderungen verarbeitet hat
    setTimeout(() => {
      // Try modal first, then fallback to regular dropdown
      const selectedElement = document.querySelector('.modal-search-result-item.selected') || 
                             document.querySelector('.search-result-item.selected');
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }, 50);
  }

  hideProductSearchResults(): void {
    // Wenn bereits ein Produkt ausgewählt ist, nicht die Ergebnisse verstecken
    if (this.selectedProduct) {
      return;
    }
    
    this.showSearchResults = false;
    this.productSearchResults = [];
    this.selectedIndex = -1;
  }

  onProductSearchBlur(): void {
    // Verzögerung, damit der Klick auf ein Suchergebnis noch funktioniert
    setTimeout(() => {
      // Wenn bereits ein Produkt ausgewählt ist, nicht die Ergebnisse verstecken
      if (!this.selectedProduct) {
        this.hideProductSearchResults();
      }
    }, 200);
  }

  // Debug-Methode zum Testen des Dropdowns
  testDropdown(): void {
    console.log('🧪 Teste Dropdown...');
    console.log('🧪 productSearchResults:', this.productSearchResults);
    console.log('🧪 showSearchResults:', this.showSearchResults);
    console.log('🧪 isSearching:', this.isSearching);
    
    // Simuliere ein Suchergebnis
    this.productSearchResults = [
      {
        id: 1,
        article_number: 'TEST001',
        article_text: 'Test Produkt',
        category: 'TEST',
        sale_price: 10.00,
        ean: '12345678'
      }
    ];
    this.showSearchResults = true;
    this.selectedIndex = -1;
    
    console.log('🧪 Nach Test-Update:');
    console.log('🧪 productSearchResults:', this.productSearchResults);
    console.log('🧪 showSearchResults:', this.showSearchResults);
    
    // Überprüfe DOM nach kurzer Verzögerung
    setTimeout(() => {
      this.checkDOMStatus();
    }, 100);
  }

  private checkDOMStatus(): void {
    console.log('🔍 Überprüfe DOM-Status...');
    
    // Suche nach dem Dropdown-Element
    const dropdown = document.querySelector('.search-results') as HTMLElement;
    if (dropdown) {
      console.log('✅ Dropdown-Element gefunden:', dropdown);
      console.log('✅ Dropdown sichtbar:', dropdown.offsetParent !== null);
      console.log('✅ Dropdown Position:', {
        top: dropdown.offsetTop,
        left: dropdown.offsetLeft,
        width: dropdown.offsetWidth,
        height: dropdown.offsetHeight
      });
      console.log('✅ Dropdown Styles:', {
        display: window.getComputedStyle(dropdown).display,
        visibility: window.getComputedStyle(dropdown).visibility,
        opacity: window.getComputedStyle(dropdown).opacity,
        zIndex: window.getComputedStyle(dropdown).zIndex
      });
    } else {
      console.log('❌ Dropdown-Element nicht gefunden!');
    }
  }

  clearProductSelection(): void {
    this.selectedProduct = null;
    this.addProductForm.patchValue({
      productSearch: ''
    });
    this.productSearchResults = [];
    this.showSearchResults = false;
    this.selectedIndex = -1;
    this.isSearching = false;
    
    console.log('🧹 Produktauswahl gelöscht');
  }

  private testApiEndpoints(): void {
    console.log('Teste API-Endpunkte...');
    
    // Teste einfachen Endpunkt
    this.offersService.getAllOffers().subscribe({
      next: (response: Offer[]) => console.log('✅ /api/offers/ funktioniert:', response),
      error: (error: any) => console.log('❌ /api/offers/ fehlgeschlagen:', error)
    });

    // Teste aktive Angebote
    this.offersService.getActiveOffers().subscribe({
      next: (response: Offer[]) => console.log('✅ /api/offers/active funktioniert:', response),
      error: (error: any) => console.log('❌ /api/offers/active fehlgeschlagen:', error)
    });
  }

  private testProductsApi(): void {
    console.log('🔍 Teste Products API...');
    
    this.offersService.searchProducts('test').subscribe({
      next: (response: any) => {
        console.log('✅ /api/products funktioniert:', response);
        console.log('✅ Anzahl Produkte:', response?.length);
        console.log('✅ Erste 3 Produkte:', response?.slice(0, 3));
      },
      error: (error: any) => {
        console.log('❌ /api/products fehlgeschlagen:', error);
      }
    });
  }

  loadOffers(): void {
    this.loading = true;
    // Verwende den korrekten Endpunkt aus der README
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response: any) => {
        console.log('API Response:', response);
        
        // Laut README: { success: true, data: [...], total: number }
        if (response && response.success && response.data && Array.isArray(response.data)) {
          this.offers = response.data;
          console.log(`✅ ${response.total} Angebote geladen`);
        } else {
          console.warn('Unerwartetes Response-Format:', response);
          this.offers = [];
        }
        
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Fehler beim Laden der Angebote:', error);
        this.loading = false;
        // Zeige Fehlermeldung an
        alert('Fehler beim Laden der Angebote. Bitte überprüfen Sie die API-Verbindung.');
      }
    });
  }

  // ===== Flyer Navigation statt PDF =====
  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = '/assets/placeholder-product.svg';
    }
  }

  // Methode um CORS-Probleme mit externen Bildern zu umgehen
  private async preloadImagesForPDF(products: any[]): Promise<void> {
    // Einfache Lösung: Verwende die URLs direkt
    // Die Bilder werden beim PDF-Rendering von html2canvas geladen
    console.log('Bilder werden direkt von html2canvas geladen');
    return Promise.resolve();
  }

  private preloadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = src;
    });
  }

  openFlyer(offer: OfferWithProducts): void {
    if (!offer.id) return;
    try {
      console.log('➡️ Navigiere zum Flyer mit Angebot:', {
        id: offer.id,
        name: offer.name,
        products: offer.products?.length
      });
    } catch {}
    const pageIndex = this.selectedFlyerPageIndexByOfferId[offer.id] ?? 0;
    this.router.navigate([`/offers/${offer.id}/flyer`], { state: { offer, pageIndex }, queryParams: { pageIndex } });
  }

  // compute number of pages for an offer (page size = 9)
  getFlyerPageCount(offer: OfferWithProducts): number {
    const total = offer?.products?.length || 0;
    return Math.max(1, Math.ceil(total / 9));
  }

  // handle page selection change for a given offer
  onFlyerPageChange(offer: OfferWithProducts, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const idx = Number(target.value);
    if (!Number.isNaN(idx) && offer.id) {
      this.selectedFlyerPageIndexByOfferId[offer.id] = idx;
    }
  }

  private waitForImagesToLoad(element: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const images = element.querySelectorAll('img');
      if (images.length === 0) {
        resolve();
        return;
      }

      let loadedCount = 0;
      const totalImages = images.length;
      const timeout = setTimeout(() => {
        console.warn('Timeout beim Laden der Bilder, generiere PDF trotzdem...');
        resolve();
      }, 10000); // 10 Sekunden Timeout

      images.forEach((img: HTMLImageElement) => {
        if (img.complete && img.naturalHeight !== 0) {
          loadedCount++;
          if (loadedCount === totalImages) {
            clearTimeout(timeout);
            resolve();
          }
        } else {
          img.onload = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
              clearTimeout(timeout);
              resolve();
            }
          };
          img.onerror = () => {
            console.warn('Bild konnte nicht geladen werden:', img.src);
            loadedCount++;
            if (loadedCount === totalImages) {
              clearTimeout(timeout);
              resolve();
            }
          };
        }
      });
    });
  }

  // Entfernte PDF-Generierung (jsPDF) – Navigation ersetzt die Funktionalität



  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (this.showCreateForm) {
      this.createOfferForm.reset({
        offer_type: 'fixed_amount',
        is_active: true
      });
    }
  }

  goBackToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  toggleAddProductForm(offer: OfferWithProducts): void {
    this.selectedOffer = offer;
    this.showAddProductForm = !this.showAddProductForm;
    if (this.showAddProductForm) {
      this.addProductForm.reset({
        useOfferPrice: true  // Standardmäßig auf true gesetzt
      });
      this.clearProductSelection();
      
      // Stelle sicher, dass alle Suchzustände zurückgesetzt werden
      this.isSearching = false;
      this.showSearchResults = false;
    }
  }

  closeAddProductModal(): void {
    this.showAddProductForm = false;
    this.selectedOffer = null;
    this.clearProductSelection();
    
    // Stelle sicher, dass alle Suchzustände zurückgesetzt werden
    this.isSearching = false;
    this.showSearchResults = false;
  }

  onSubmitCreateOffer(): void {
    if (this.createOfferForm.valid) {
      const formData = this.createOfferForm.value;
      const createOfferRequest: CreateOfferRequest = {
        name: formData.name,
        description: formData.description,
        offer_type: formData.offer_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_active: formData.is_active
      };

      if (formData.offer_type === 'percentage' && formData.discount_percentage) {
        createOfferRequest.discount_percentage = formData.discount_percentage;
      } else if (formData.offer_type === 'fixed_amount' && formData.discount_amount) {
        createOfferRequest.discount_amount = formData.discount_amount;
      }

      this.offersService.createOffer(createOfferRequest).subscribe({
        next: (newOffer: any) => {
          console.log('Angebot erfolgreich erstellt:', newOffer);
          this.createOfferForm.reset({
            offer_type: 'fixed_amount',
            is_active: true
          });
          this.showCreateForm = false;
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Erstellen des Angebots:', error);
          alert('Fehler beim Erstellen des Angebots. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  onSubmitAddProduct(): void {
    if (this.addProductForm.valid && this.selectedOffer && this.selectedProduct) {
      const formData = this.addProductForm.value;
      const addProductRequest: AddProductRequest = {
        offerId: this.selectedOffer.id!,
        productId: this.selectedProduct.id,
        offerPrice: formData.offerPrice || undefined,
        useOfferPrice: formData.useOfferPrice,
        minQuantity: formData.minQuantity || undefined,
        maxQuantity: formData.maxQuantity || undefined
      };

      this.offersService.addProductToOffer(addProductRequest).subscribe({
        next: (response: any) => {
          console.log('Produkt erfolgreich zum Angebot hinzugefügt:', response);
          this.closeAddProductModal();
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Hinzufügen des Produkts:', error);
          alert('Fehler beim Hinzufügen des Produkts. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  removeProductFromOffer(offerId: number, productId: number): void {
    this.offersService.removeProductFromOffer(offerId, productId).subscribe({
      next: (response: any) => {
        console.log('Produkt erfolgreich aus Angebot entfernt:', response);
        this.loadOffers();
      },
      error: (error: any) => {
        console.error('Fehler beim Entfernen des Produkts:', error);
        alert('Fehler beim Entfernen des Produkts. Bitte versuchen Sie es erneut.');
      }
    });
  }

  deleteOffer(offerId: number): void {
    if (confirm('Sind Sie sicher, dass Sie dieses Angebot löschen möchten?')) {
      this.offersService.deleteOffer(offerId).subscribe({
        next: (response: any) => {
          console.log('Angebot erfolgreich gelöscht:', response);
          this.loadOffers();
        },
        error: (error: any) => {
          console.error('Fehler beim Löschen des Angebots:', error);
          alert('Fehler beim Löschen des Angebots. Bitte versuchen Sie es erneut.');
        }
      });
    }
  }

  getOfferTypeLabel(type: string): string {
    switch (type) {
      case 'percentage': return 'Prozentual';
      case 'fixed_amount': return 'Fester Betrag';
      case 'buy_x_get_y': return 'Kauf X bekomme Y';
      default: return type;
    }
  }

  getDiscountDisplay(offer: Offer): string {
    if (offer.discount_percentage) {
      return `${offer.discount_percentage}%`;
    } else if (offer.discount_amount) {
      return `€${offer.discount_amount.toFixed(2)}`;
    }
    return '-';
  }

  isOfferActive(offer: Offer): boolean {
    const now = new Date();
    const startDate = new Date(offer.start_date);
    const endDate = new Date(offer.end_date);
    return offer.is_active && now >= startDate && now <= endDate;
  }

  getStatusClass(offer: Offer): string {
    if (!offer.is_active) return 'inactive';
    if (this.isOfferActive(offer)) return 'active';
    return 'expired';
  }

  // === Image Assign (reuse endpoint from product-management) ===
  onProductImageClick(product: any): void {
    const productId = product?.id ?? product?.product_id;
    if (!productId) {
      console.error('Kein Produkt-ID für Bild-Upload gefunden', product);
      alert('Fehlende Produkt-ID für Bild-Upload.');
      return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const selectedFile = target.files[0];
        const formData = new FormData();
        formData.append('image', selectedFile);

        this.http.post(`${environment.apiUrl}/api/product-images/${productId}/images`, formData)
          .subscribe({
            next: () => {
              // Refresh offers to show updated image
              this.loadOffers();
            },
            error: (error) => {
              console.error('Error uploading image:', error);
              alert('Fehler beim Hochladen des Bildes.');
            }
          });
      }

      document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
  }
}
