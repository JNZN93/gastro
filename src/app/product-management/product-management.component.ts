import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, HostListener, OnDestroy, AfterViewInit } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { showCameraScanner } from '../core/platform';

@Component({
  selector: 'app-product-management',
  imports: [CommonModule, FormsModule, RouterModule, UploadLoadingComponent, ZXingScannerModule, HttpClientModule],
  templateUrl: './product-management.component.html',
  styleUrl: './product-management.component.scss',
})
export class ProductManagementComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  @ViewChild('eanScanner') eanScanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
  
  products: any[] = [];
  filteredProducts: any[] = [];
  searchTerm: string = '';
  imageFilter: 'all' | 'with-image' | 'without-image' = 'all';
  isVisible: boolean = true;
  readonly showCameraScanner = showCameraScanner();
  isScanning = false;
  isTorchOn = false;
  

  
  // Image upload properties
  selectedProduct: any = null;
  selectedImage: File | null = null;
  selectedImagePreviewUrl: string | null = null;
  isUploading: boolean = false;
  isUploadSectionOpen: boolean = false;
  
  // Modal properties
  isModalOpen: boolean = false;
  modalImageUrl: string = '';
  modalImageAlt: string = '';
  modalProductId: number | null = null;
  
  // EAN Assignment properties
  isEanModalOpen: boolean = false;
  eanAssignmentProduct: any = null;
  eanCode: string = '';
  isEanScanning: boolean = false;
  isAssigningEan: boolean = false;
  eanErrorMessage: string = '';
  eanSuccessMessage: string = '';
  existingEans: Array<{id: number, ean: string}> = [];
  isLoadingEans: boolean = false;
  
  // Product to search for after operation
  productToSearchFor: any = null;
  
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
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: "environment" }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    public globalService: GlobalService
  ) {
    // Listen to navigation events to scroll to top when entering this component
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      // Small delay to ensure component is fully loaded
      setTimeout(() => {
        this.scrollToTop();
      }, 100);
    });
  }

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    
    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response: any) => {
          // Benutzerrolle und Name im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
          
          if(response.user.role == 'admin') {
            this.globalService.isAdmin = true;
          }
          
          this.loadProducts();
          this.setupScanner();
          this.isVisible = false;
        },
        error: (error: any) => {
          this.isVisible = false;
          console.error('Token ungültig oder Fehler:', error);
          this.router.navigate(['/login']);
        },
      });
    } else {
      this.isVisible = false;
      console.log('Kein Token gefunden.');
      this.router.navigate(['/login']);
    }
  }

  ngAfterViewInit(): void {
    // Scroll to top without animation when component loads
    this.scrollToTop();
  }

  private scrollToTop(): void {
    // Multiple approaches to ensure scroll to top works
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  ngOnDestroy(): void {
    this.clearImagePreview();
  }

  // Handle ESC key to close modal
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.isModalOpen) {
      this.closeModal();
    }
    if (event.key === 'Escape' && this.isEanModalOpen) {
      this.closeEanModal();
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
    
    if (this.isEanModalOpen) {
      const target = event.target as HTMLElement;
      if (target.classList.contains('ean-modal-overlay')) {
        this.closeEanModal();
      }
    }
    

  }

  openModal(imageUrl: string, imageAlt: string, productId: number): void {
    this.modalImageUrl = imageUrl;
    this.modalImageAlt = imageAlt;
    this.modalProductId = productId;
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  closeModal(): void {
    this.isModalOpen = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  // EAN Assignment Methods
  openEanModal(product: any): void {
    this.eanAssignmentProduct = product;
    this.eanCode = '';
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
    this.isEanModalOpen = true;
    this.isEanScanning = false;
    this.existingEans = [];
    this.isLoadingEans = true;
    document.body.style.overflow = 'hidden';
    
    // Load existing EANs for this product
    this.loadExistingEans(product.article_number);
  }

  closeEanModal(): void {
    this.isEanModalOpen = false;
    this.eanAssignmentProduct = null;
    this.eanCode = '';
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
    this.isEanScanning = false;
    document.body.style.overflow = '';
  }

  startEanScanner(): void {
    this.isEanScanning = true;
    this.eanCode = '';
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
  }

  stopEanScanner(): void {
    this.isEanScanning = false;
  }

  onEanCodeResult(result: string): void {
    this.playBeep();
    this.stopEanScanner();
    this.eanCode = result;
    this.eanErrorMessage = '';
  }

  loadExistingEans(articleNumber: string): void {
    const token = localStorage.getItem('token');
    
    this.http.get(`${environment.apiUrl}/api/product-eans/article/${articleNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).subscribe({
      next: (response: any) => {
        this.isLoadingEans = false;
        if (response.success && response.data) {
          this.existingEans = response.data.map((item: any) => ({
            id: item.id,
            ean: item.ean
          }));
        } else {
          this.existingEans = [];
        }
      },
      error: (error: any) => {
        this.isLoadingEans = false;
        console.error('Error loading existing EANs:', error);
        this.existingEans = [];
      }
    });
  }

  copyEanToClipboard(ean: string): void {
    navigator.clipboard.writeText(ean).then(() => {
      // Optional: Show a brief success message
      console.log('EAN copied to clipboard:', ean);
    }).catch(err => {
      console.error('Failed to copy EAN to clipboard:', err);
    });
  }

  deleteEan(eanId: number, eanCode: string): void {
    if (!confirm(`Möchten Sie den EAN-Code "${eanCode}" wirklich löschen?`)) {
      return;
    }

    const token = localStorage.getItem('token');
    
    this.http.delete(`${environment.apiUrl}/api/product-eans/${eanId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          // Remove the deleted EAN from the list
          this.existingEans = this.existingEans.filter(ean => ean.id !== eanId);
          this.eanSuccessMessage = `EAN-Code "${eanCode}" erfolgreich gelöscht!`;
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            this.eanSuccessMessage = '';
          }, 3000);
        } else {
          this.eanErrorMessage = response.message || 'Fehler beim Löschen des EAN-Codes.';
        }
      },
      error: (error: any) => {
        console.error('Error deleting EAN:', error);
        this.eanErrorMessage = error.error?.message || 'Fehler beim Löschen des EAN-Codes.';
      }
    });
  }

  assignEan(): void {
    if (!this.eanCode.trim()) {
      this.eanErrorMessage = 'Bitte geben Sie einen EAN-Code ein.';
      return;
    }

    if (this.eanCode.length !== 8 && this.eanCode.length !== 13) {
      this.eanErrorMessage = 'EAN-Code muss 8 oder 13 Ziffern enthalten.';
      return;
    }

    this.isAssigningEan = true;
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';

    const token = localStorage.getItem('token');
    const payload = {
      article_number: this.eanAssignmentProduct.article_number,
      ean: this.eanCode
    };

    this.http.post(`${environment.apiUrl}/api/product-eans/assign`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }).subscribe({
      next: (response: any) => {
        this.isAssigningEan = false;
        if (response.success) {
          this.eanSuccessMessage = 'EAN-Code erfolgreich zugeordnet!';
          this.loadProducts(); // Refresh products to show updated EAN
          // Reload existing EANs after successful assignment
          this.loadExistingEans(this.eanAssignmentProduct.article_number);
          setTimeout(() => {
            this.closeEanModal();
          }, 2000);
        } else {
          this.eanErrorMessage = response.message || 'Fehler beim Zuordnen des EAN-Codes.';
        }
      },
      error: (error: any) => {
        this.isAssigningEan = false;
        console.error('Error assigning EAN:', error);
        this.eanErrorMessage = error.error?.message || 'Fehler beim Zuordnen des EAN-Codes.';
      }
    });
  }

  setupScanner(): void {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

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
  }

  loadProducts(): void {
    this.isVisible = true; // Zeige Loading-Screen während des Ladens
    this.http.get(`${environment.apiUrl}/api/products`).subscribe({
      next: (data: any) => {
        this.products = data;
        // Initial: keine Produkte anzeigen, bis Suche erfolgt
        this.filteredProducts = [];
        this.isVisible = false; // Verstecke Loading-Screen nach erfolgreichem Laden
        
        // Scroll to top after products are loaded
        setTimeout(() => {
          this.scrollToTop();
        }, 50);
        
        // Search for product if specified
        if (this.productToSearchFor) {
          setTimeout(() => {
            this.searchForProduct(this.productToSearchFor);
            this.productToSearchFor = null; // Reset after searching
          }, 100); // Small delay to ensure DOM is updated
        }
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
        this.isVisible = false; // Verstecke Loading-Screen auch bei Fehlern
      }
    });
  }

  updateFilteredData(): void {
    let filtered = [...this.products];

    // Apply image filter
    if (this.imageFilter !== 'all') {
      filtered = filtered.filter(product => {
        const hasImageProduct = this.hasImage(product);
        return this.imageFilter === 'with-image' ? hasImageProduct : !hasImageProduct;
      });
    }

    // Apply search filter
    const trimmedSearch = this.searchTerm.trim();
    if (!trimmedSearch) {
      // Ohne Suchbegriff: nur Bild-Filter anwenden; 'all' zeigt nichts an
      this.filteredProducts = this.imageFilter === 'all' ? [] : filtered;
      return;
    }

    if (trimmedSearch) {
      // Check if search term is an 8 or 13 digit EAN code
      const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedSearch);

      // Only start normal text search from 3rd character
      if (!isEanSearch && trimmedSearch.length < 3) {
        // Bei <3 Zeichen: nur Bild-Filter anzeigen; 'all' zeigt nichts
        this.filteredProducts = this.imageFilter === 'all' ? [] : filtered;
        return;
      }
      
      if (isEanSearch) {
        // EAN-Suche: Zuerst in lokalen Produkten suchen
        const localEanResults = filtered.filter(product =>
          product.ean?.toLowerCase() === trimmedSearch.toLowerCase()
        );
        
        if (localEanResults.length > 0) {
          // EAN in lokalen Produkten gefunden
          filtered = localEanResults;
        } else {
          // EAN nicht in lokalen Produkten gefunden - API-Suche
          this.searchEanInApi(trimmedSearch);
          return; // Warte auf API-Ergebnis
        }
      } else {
        // Normale Text-Suche
        const terms = trimmedSearch.toLowerCase().split(/\s+/);
        filtered = filtered.filter(product =>
          terms.every((term) =>
            product.article_text?.toLowerCase().includes(term) ||
            product.article_number?.toLowerCase().includes(term) ||
            product.ean?.toLowerCase().includes(term)
          )
        );
        
        // Sortiere nach Prioritätsreihenfolge
        filtered = filtered.sort((a, b) => {
          const searchTermLower = trimmedSearch.toLowerCase();
          
          // Prüfe exakte Übereinstimmungen für jede Prioritätsstufe
          const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
          const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
          const aArticleTextExact = a.article_text?.toLowerCase() === searchTermLower;
          const bArticleTextExact = b.article_text?.toLowerCase() === searchTermLower;
          const aEanExact = a.ean?.toLowerCase() === searchTermLower;
          const bEanExact = b.ean?.toLowerCase() === searchTermLower;
          
          // Prüfe Teilübereinstimmungen (beginnend mit Suchbegriff)
          const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
          const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
          const aArticleTextStartsWith = a.article_text?.toLowerCase().startsWith(searchTermLower);
          const bArticleTextStartsWith = b.article_text?.toLowerCase().startsWith(searchTermLower);
          const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
          const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);
          
          // Priorität 1: Exakte Übereinstimmung in article_number
          if (aArticleNumberExact && !bArticleNumberExact) return -1;
          if (!aArticleNumberExact && bArticleNumberExact) return 1;
          
          // Priorität 2: Exakte Übereinstimmung in article_text
          if (aArticleTextExact && !bArticleTextExact) return -1;
          if (!aArticleTextExact && bArticleTextExact) return 1;
          
          // Priorität 3: Exakte Übereinstimmung in ean
          if (aEanExact && !bEanExact) return -1;
          if (!aEanExact && bEanExact) return 1;
          
          // Priorität 4: Beginnt mit Suchbegriff in article_number
          if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
          if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
          
          // Priorität 5: Beginnt mit Suchbegriff in article_text
          if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
          if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
          
          // Priorität 6: Beginnt mit Suchbegriff in ean
          if (aEanStartsWith && !bEanStartsWith) return -1;
          if (!aEanStartsWith && bEanStartsWith) return 1;
          
          // Bei gleicher Priorität: zuerst nach article_number sortieren, dann nach article_text
          const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
          if (articleNumberComparison !== 0) {
            return articleNumberComparison;
          }
          return a.article_text.localeCompare(b.article_text);
        });
      }
    }

    this.filteredProducts = filtered;
  }

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
          
          // Prüfe ob dieser Artikel bereits in globalArtikels (products) existiert
          const existingProduct = this.products.find(product => 
            product.article_number === foundArticleNumber
          );
          
          if (existingProduct) {
            // Artikel existiert bereits - zeige ihn an
            this.filteredProducts = [existingProduct];
          } else {
            // Artikel existiert nicht in globalArtikels - keine Ergebnisse
            this.filteredProducts = [];
          }
        } else {
          // EAN nicht in products_ean Tabelle gefunden
          this.filteredProducts = [];
        }
      },
      error: (error: any) => {
        console.error('Error searching EAN in API:', error);
        // Bei Fehler: normale lokale Suche durchführen
        this.performLocalSearch();
      }
    });
  }

  private performLocalSearch(): void {
    let filtered = [...this.products];

    // Apply image filter
    if (this.imageFilter !== 'all') {
      filtered = filtered.filter(product => {
        const hasImageProduct = this.hasImage(product);
        return this.imageFilter === 'with-image' ? hasImageProduct : !hasImageProduct;
      });
    }

    // Apply search filter
    if (this.searchTerm.trim()) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      filtered = filtered.filter(product =>
        terms.every((term) =>
          product.article_text?.toLowerCase().includes(term) ||
          product.article_number?.toLowerCase().includes(term) ||
          product.ean?.toLowerCase().includes(term)
        )
      );
    }

    this.filteredProducts = filtered;
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.updateFilteredData();
  }

  setImageFilter(filter: 'all' | 'with-image' | 'without-image'): void {
    this.imageFilter = filter;
    this.updateFilteredData();
  }



  /*FILTER BY SCANNING*/

  onCodeResult(result: string) {
    this.playBeep();
    this.stopScanner(); // optional Kamera nach Scan stoppen
    this.searchTerm = result;
    this.updateFilteredData();
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

  toggleUploadSection(product: any): void {
    if (this.selectedProduct?.id === product.id) {
      this.isUploadSectionOpen = !this.isUploadSectionOpen;
      if (!this.isUploadSectionOpen) {
        this.selectedImage = null;
        this.clearImagePreview();
      }
    } else {
      this.selectedProduct = product;
      this.isUploadSectionOpen = true;
      this.selectedImage = null;
      this.clearImagePreview();
    }
  }

  selectImageDirectly(product: any): void {
    // Erstelle ein verstecktes File Input Element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    
    // Event Listener für die Dateiauswahl
    fileInput.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.selectedProduct = product;
        this.selectedImage = target.files[0];
        this.selectedImagePreviewUrl = URL.createObjectURL(this.selectedImage);
        this.isUploadSectionOpen = true; // Zeige Upload-Sektion mit Button
      }
      // Entferne das temporäre Input Element
      document.body.removeChild(fileInput);
    });
    
    // Füge das Input Element zum DOM hinzu und triggere den Klick
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  removeSelectedImage(): void {
    this.selectedImage = null;
    this.clearImagePreview();
    this.isUploadSectionOpen = false;
  }

  onImageSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedImage = input.files[0];
      this.selectedImagePreviewUrl = URL.createObjectURL(this.selectedImage);
    }
  }

  private clearImagePreview(): void {
    if (this.selectedImagePreviewUrl) {
      URL.revokeObjectURL(this.selectedImagePreviewUrl);
      this.selectedImagePreviewUrl = null;
    }
  }

  uploadImage(): void {
    if (this.selectedProduct && this.selectedImage) {
      this.isUploading = true;
      
      const formData = new FormData();
      formData.append('image', this.selectedImage);

      this.http.post(`${environment.apiUrl}/api/product-images/${this.selectedProduct.id}/images`, formData)
        .subscribe({
          next: (response) => {
            console.log('Image uploaded successfully:', response);
            this.isUploading = false;
            this.selectedImage = null;
            this.clearImagePreview();
            this.isUploadSectionOpen = false;
            this.loadProducts(); // Refresh the product list
            this.productToSearchFor = this.selectedProduct; // Set product to search for
          },
          error: (error) => {
            console.error('Error uploading image:', error);
            this.isUploading = false;
          }
        });
    }
  }

  removeImage(productId: number): void {
    if (confirm('Möchten Sie das Hauptbild dieses Produkts wirklich entfernen?')) {
      // Finde das Produkt in der aktuellen Liste
      const productToRemove = this.products.find(p => p.id === productId);
      
      this.http.delete(`${environment.apiUrl}/api/product-images/${productId}/images/remove-main`)
        .subscribe({
          next: () => {
            console.log('Main image removed successfully');
            this.loadProducts(); // Refresh the product list
            this.productToSearchFor = productToRemove; // Set product to search for
          },
          error: (error) => {
            console.error('Error removing main image:', error);
          }
        });
    }
  }

  hasImage(product: any): boolean {
    return product.main_image_url && product.main_image_url.trim() !== '';
  }

  /**
   * Sucht nach einem spezifischen Produkt nach Upload/Löschung
   * @param product Das Produkt, nach dem gesucht werden soll
   */
  private searchForProduct(product: any): void {
    // Setze Suchbegriff auf Artikelnummer oder Artikeltext
    if (product.article_number) {
      this.searchTerm = product.article_number;
    } else if (product.article_text) {
      this.searchTerm = product.article_text;
    } else if (product.ean) {
      this.searchTerm = product.ean;
    }
    
    // Aktualisiere die gefilterten Daten
    this.updateFilteredData();
  }

  /**
   * Vergleicht zwei Artikelnummern intelligent (numerisch und alphabetisch)
   * @param a Erste Artikelnummer
   * @param b Zweite Artikelnummer
   * @returns -1 wenn a < b, 0 wenn a = b, 1 wenn a > b
   */
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

  // Methode um nur Zahlen in EAN-Eingabefeld zu erlauben
  onEanInput(event: any): void {
    const input = event.target;
    const value = input.value;
    
    // Entferne alle nicht-numerischen Zeichen
    const numericValue = value.replace(/[^0-9]/g, '');
    
    // Begrenze auf maximal 13 Ziffern
    const limitedValue = numericValue.slice(0, 13);
    
    // Aktualisiere den Wert nur wenn er sich geändert hat
    if (value !== limitedValue) {
      input.value = limitedValue;
      this.eanCode = limitedValue;
    }
  }
} 