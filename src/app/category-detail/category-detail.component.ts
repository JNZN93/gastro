import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { WarenkorbComponent } from '../warenkorb/warenkorb.component';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-category-detail',
  imports: [CommonModule, FormsModule, RouterModule, WarenkorbComponent, UploadLoadingComponent],
  templateUrl: './category-detail.component.html',
  styleUrl: './category-detail.component.scss',
})
export class CategoryDetailComponent implements OnInit {
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  categoryName: string = '';
  artikelData: any[] = [];
  globalArtikels: any[] = [];
  isVisible: boolean = true;
  searchTerm: string = '';
  filteredData: any[] = [];

  // Eigenschaften für Image Modal
  showImageModal: boolean = false;
  selectedImageUrl: string = '';
  selectedImageProduct: any = null;
  isImageZoomed: boolean = false;

  // Eigenschaften für Toast-Benachrichtigung
  showToast: boolean = false;
  toastMessage: string = '';
  toastType: 'success' | 'error' = 'success';

  constructor(
    private authService: AuthService,
    public globalService: GlobalService
  ) {}

  ngOnInit(): void {
    // Kategorie-Name aus der URL holen
    this.route.params.subscribe(params => {
      this.categoryName = decodeURIComponent(params['categoryName']);
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
    // Produkte der spezifischen Kategorie filtern
    this.artikelData = this.globalArtikels.filter(artikel => 
      artikel.category === this.categoryName
    );
    this.filteredData = [...this.artikelData];
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
    this.router.navigate(['/products']);
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

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    // Fallback auf Standard-Bild
    img.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60';
  }
}
