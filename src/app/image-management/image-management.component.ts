import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { ArtikelDataService } from '../artikel-data.service';

@Component({
  selector: 'app-image-management',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './image-management.component.html',
  styleUrls: ['./image-management.component.css']
})
export class ImageManagementComponent implements OnInit {
  products: any[] = [];
  filteredProducts: any[] = [];
  selectedProduct: any = null;
  selectedImage: File | null = null;
  isUploading: boolean = false;
  isUploadSectionOpen: boolean = false;
  searchTerm: string = '';

  constructor(
    private artikelService: ArtikelDataService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.artikelService.getData().subscribe({
      next: (data) => {
        this.products = data;
        this.filteredProducts = [...this.products];
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
      }
    });
  }

  filterProducts(): void {
    if (!this.searchTerm.trim()) {
      this.filteredProducts = [...this.products];
      return;
    }

    const searchTermLower = this.searchTerm.toLowerCase().trim();
    this.filteredProducts = this.products.filter(product => 
      product.article_number.toLowerCase().includes(searchTermLower) ||
      product.article_text.toLowerCase().includes(searchTermLower)
    );
  }

  toggleUploadSection(product: any): void {
    if (this.selectedProduct?.article_number === product.article_number) {
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
      formData.append('productId', this.selectedProduct.id);

      this.http.post('http://localhost:3000/product-image', formData)
        .subscribe({
          next: (response) => {
            console.log('Image uploaded successfully:', response);
            this.isUploading = false;
            this.selectedImage = null;
            this.isUploadSectionOpen = false;
            // Optional: Refresh the product list or update the UI
          },
          error: (error) => {
            console.error('Error uploading image:', error);
            this.isUploading = false;
          }
        });
    }
  }
} 