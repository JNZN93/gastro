import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
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
  isVisible: boolean = true;
  isScanning = false;
  isTorchOn = false;
  
  // Image upload properties
  selectedProduct: any = null;
  selectedImage: File | null = null;
  isUploading: boolean = false;
  isUploadSectionOpen: boolean = false;
  
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
    this.loadProducts();
    this.setupScanner();
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

      if (preferredCam) {
        this.selectedDevice = preferredCam;
      } else if (videoDevices.length > 0) {
        this.selectedDevice = videoDevices[0];
      }
    });
  }

  loadProducts(): void {
    this.http.get('https://multi-mandant-ecommerce.onrender.com/api/products').subscribe({
      next: (data: any) => {
        this.products = data;
        this.filteredProducts = [...this.products];
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
      }
    });
  }

  updateFilteredData(): void {
    if (!this.searchTerm.trim()) {
      this.filteredProducts = [...this.products];
      return;
    }

    const searchTermLower = this.searchTerm.toLowerCase().trim();
    this.filteredProducts = this.products.filter(product => 
      product.article_number?.toLowerCase().includes(searchTermLower) ||
      product.article_text?.toLowerCase().includes(searchTermLower)
    );
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.updateFilteredData();
  }

  onCodeResult(result: string): void {
    this.playBeep();
    this.searchTerm = result;
    this.updateFilteredData();
    this.stopScanner();
  }

  startScanner(): void {
    this.isScanning = true;
    this.isVisible = false;
  }

  stopScanner(): void {
    this.isScanning = false;
    this.isVisible = true;
  }

  playBeep(): void {
    const audio = new Audio('/beep.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
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

  hasImage(product: any): boolean {
    return product.main_image_url && product.main_image_url.trim() !== '';
  }
} 