import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, HostListener } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-product-management',
  imports: [CommonModule, FormsModule, RouterModule, UploadLoadingComponent, ZXingScannerModule, HttpClientModule],
  templateUrl: './product-management.component.html',
  styleUrl: './product-management.component.scss',
})
export class ProductManagementComponent implements OnInit {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
  
  products: any[] = [];
  filteredProducts: any[] = [];
  searchTerm: string = '';
  imageFilter: 'all' | 'with-image' | 'without-image' = 'all';
  isVisible: boolean = true;
  isScanning = false;
  isTorchOn = false;
  
  // Mobile filter dropdown properties
  isFilterDropdownOpen: boolean = false;
  
  // Image upload properties
  selectedProduct: any = null;
  selectedImage: File | null = null;
  isUploading: boolean = false;
  isUploadSectionOpen: boolean = false;
  
  // Modal properties
  isModalOpen: boolean = false;
  modalImageUrl: string = '';
  modalImageAlt: string = '';
  modalProductId: number | null = null;
  
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
  ) {}

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    
    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response: any) => {
          // Benutzerrolle im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          
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

  // Handle ESC key to close modal
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.isModalOpen) {
      this.closeModal();
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
    
    // Close filter dropdown when clicking outside
    if (this.isFilterDropdownOpen) {
      const target = event.target as HTMLElement;
      if (!target.closest('.filter-dropdown-container')) {
        this.closeFilterDropdown();
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

  setupScanner(): void {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      // 🎯 Wähle Kamera mit "back" im Namen, aber NICHT "wide", "ultra", "tele"
      console.log("videoDevices");
      console.log(videoDevices);
      // body mitschicken
      const token = localStorage.getItem('token');
      fetch('https://multi-mandant-ecommerce.onrender.com/camera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          devices: videoDevices
        })
      })
      .then(response => response.json())
      .then(data => console.log(data));

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
    this.http.get('https://multi-mandant-ecommerce.onrender.com/api/products').subscribe({
      next: (data: any) => {
        this.products = data;
        this.filteredProducts = [...this.products];
        this.isVisible = false; // Verstecke Loading-Screen nach erfolgreichem Laden
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
    if (this.searchTerm.trim()) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      filtered = filtered.filter(product =>
        terms.every((term) =>
          product.article_text?.toLowerCase().includes(term) ||
          product.article_number?.toLowerCase().includes(term) ||
          product.ean?.toLowerCase().includes(term)
        )
      );
      
      // Sortiere nach Prioritätsreihenfolge
      filtered = filtered.sort((a, b) => {
        const searchTermLower = this.searchTerm.toLowerCase();
        
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

  toggleFilterDropdown(): void {
    this.isFilterDropdownOpen = !this.isFilterDropdownOpen;
  }

  closeFilterDropdown(): void {
    this.isFilterDropdownOpen = false;
  }

  getFilterLabel(): string {
    switch (this.imageFilter) {
      case 'all':
        return 'Alle';
      case 'with-image':
        return 'Mit Bild';
      case 'without-image':
        return 'Ohne Bild';
      default:
        return 'Alle';
    }
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
    } else {
      this.selectedProduct = product;
      this.isUploadSectionOpen = true;
    }
    this.selectedImage = null;
  }

  onImageSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedImage = input.files[0];
    }
  }

  uploadImage(): void {
    if (this.selectedProduct && this.selectedImage) {
      this.isUploading = true;
      
      const formData = new FormData();
      formData.append('image', this.selectedImage);

      this.http.post(`https://multi-mandant-ecommerce.onrender.com/api/product-images/${this.selectedProduct.id}/images`, formData)
        .subscribe({
          next: (response) => {
            console.log('Image uploaded successfully:', response);
            this.isUploading = false;
            this.selectedImage = null;
            this.isUploadSectionOpen = false;
            this.loadProducts(); // Refresh the product list
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
      this.http.delete(`https://multi-mandant-ecommerce.onrender.com/api/product-images/${productId}/images/remove-main`)
        .subscribe({
          next: () => {
            console.log('Main image removed successfully');
            this.loadProducts(); // Refresh the product list
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
} 