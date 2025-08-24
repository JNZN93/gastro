import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OffersService, Offer, OfferWithProducts, OfferProduct, CreateOfferRequest, AddProductRequest } from '../offers.service';

@Component({
  selector: 'app-offers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './offers.component.html',
  styleUrls: ['./offers.component.scss']
})
export class OffersComponent implements OnInit {
  offers: OfferWithProducts[] = [];
  loading = false;
  showCreateForm = false;
  showAddProductForm = false;
  selectedOffer: OfferWithProducts | null = null;
  
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
  
  createOfferForm: FormGroup;
  addProductForm: FormGroup;

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
    
    if (!searchTerm || searchTerm.length < 1) {
      console.log('🔍 Suchbegriff leer, breche ab');
      this.productSearchResults = [];
      this.showSearchResults = false;
      this.selectedIndex = -1;
      return;
    }

    this.isSearching = true;
    this.showSearchResults = true;
    console.log('🔍 Starte API-Aufruf...');

    // API-Aufruf für Produktsuche - verwende api/products Endpunkt
    this.offersService.searchProducts(searchTerm).subscribe({
      next: (response: any) => {
        this.isSearching = false;
        console.log('🔍 API Response für Produktsuche:', response);
        console.log('🔍 Response Type:', typeof response);
        console.log('🔍 Is Array:', Array.isArray(response));
        console.log('🔍 Response Length:', response?.length);
        
        // Der api/products Endpunkt gibt direkt ein Array von Produkten zurück
        if (response && Array.isArray(response)) {
          console.log('🔍 Alle Produkte von API:', response.length);
          
          // Filtere die Ergebnisse basierend auf dem Suchbegriff
          const filteredResults = this.filterProductsBySearchTerm(response, searchTerm);
          this.productSearchResults = filteredResults.slice(0, 10); // Maximal 10 Ergebnisse
          this.selectedIndex = -1; // Reset selection
          
          console.log('🔍 Gefilterte Produkte:', this.productSearchResults.length);
          console.log('🔍 Erste 3 gefilterte Produkte:', this.productSearchResults.slice(0, 3));
          
          // Debug: Überprüfe Dropdown-Status
          console.log('🔍 showSearchResults vor Update:', this.showSearchResults);
          console.log('🔍 productSearchResults Länge:', this.productSearchResults.length);
          
          // Stelle sicher, dass das Dropdown angezeigt wird
          if (this.productSearchResults.length > 0) {
            this.showSearchResults = true;
            console.log('🔍 Dropdown wird angezeigt:', this.showSearchResults);
          } else {
            this.showSearchResults = false;
            console.log('🔍 Keine Ergebnisse, Dropdown versteckt');
          }
        } else {
          console.warn('❌ Unerwartetes Response-Format:', response);
          this.productSearchResults = [];
          this.showSearchResults = false;
        }
      },
      error: (error: any) => {
        console.error('❌ Fehler bei der Produktsuche:', error);
        this.isSearching = false;
        this.productSearchResults = [];
      }
    });
  }

  private filterProductsBySearchTerm(products: any[], searchTerm: string): any[] {
    const trimmedTerm = searchTerm.trim().toLowerCase();
    console.log('🔍 Filtere mit Suchbegriff:', `"${trimmedTerm}"`);
    console.log('🔍 Anzahl Produkte vor Filterung:', products.length);
    
    const filtered = products.filter(product => {
      const articleText = (product.article_text || '').toLowerCase();
      const articleNumber = (product.article_number || '').toLowerCase();
      const category = (product.category || '').toLowerCase();
      const ean = (product.ean || '').toLowerCase();
      
      const matchesText = articleText.includes(trimmedTerm);
      const matchesNumber = articleNumber.includes(trimmedTerm);
      const matchesCategory = category.includes(trimmedTerm);
      const matchesEan = ean.includes(trimmedTerm);
      
      const matches = matchesText || matchesNumber || matchesCategory || matchesEan;
      
      // Debug für die ersten paar Produkte
      if (products.indexOf(product) < 3) {
        console.log(`🔍 Produkt ${product.article_number} (${product.article_text}):`, {
          articleText,
          articleNumber,
          category,
          ean,
          matchesText,
          matchesNumber,
          matchesCategory,
          matchesEan,
          matches
        });
      }
      
      return matches;
    });
    
    console.log('🔍 Anzahl Produkte nach Filterung:', filtered.length);
    
    return filtered.sort((a, b) => {
      // Priorität: exakte Übereinstimmungen zuerst
      const aExact = a.article_text?.toLowerCase() === trimmedTerm || 
                     a.article_number?.toLowerCase() === trimmedTerm;
      const bExact = b.article_text?.toLowerCase() === trimmedTerm || 
                     b.article_number?.toLowerCase() === trimmedTerm;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Dann nach article_text sortieren
      return a.article_text?.localeCompare(b.article_text || '') || 0;
    });
  }

  selectProduct(product: any): void {
    this.selectedProduct = product;
    this.addProductForm.patchValue({
      productSearch: product.article_text
    });
    this.showSearchResults = false;
    this.productSearchResults = [];
    this.selectedIndex = -1;
  }

  onProductSearchKeyDown(event: KeyboardEvent): void {
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
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.productSearchResults.length) {
          this.selectProduct(this.productSearchResults[this.selectedIndex]);
        }
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
    this.showSearchResults = false;
    this.productSearchResults = [];
    this.selectedIndex = -1;
  }

  onProductSearchBlur(): void {
    // Verzögerung, damit der Klick auf ein Suchergebnis noch funktioniert
    setTimeout(() => {
      this.hideProductSearchResults();
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
        useOfferPrice: false
      });
      this.clearProductSelection();
    }
  }

  closeAddProductModal(): void {
    this.showAddProductForm = false;
    this.selectedOffer = null;
    this.clearProductSelection();
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
}
