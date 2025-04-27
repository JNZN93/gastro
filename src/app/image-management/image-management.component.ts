import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArtikelDataService } from '../artikel-data.service';

@Component({
  selector: 'app-image-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-management.component.html',
  styleUrls: ['./image-management.component.css']
})
export class ImageManagementComponent implements OnInit {
  products: any[] = [];
  selectedProduct: any = null;
  selectedImage: File | null = null;
  isUploading: boolean = false;

  constructor(private artikelService: ArtikelDataService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.artikelService.getData().subscribe({
      next: (data) => {
        this.products = data;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
      }
    });
  }

  onProductSelect(product: any): void {
    this.selectedProduct = product;
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
      // Implement image upload logic here
      console.log('Uploading image for product:', this.selectedProduct);
      // After successful upload, you might want to refresh the product list
      setTimeout(() => {
        this.isUploading = false;
        this.selectedImage = null;
      }, 2000); // Simulated upload time
    }
  }
} 