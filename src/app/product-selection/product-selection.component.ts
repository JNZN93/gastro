import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';

interface Product {
  id: number;
  article_number: string;
  article_text: string;
  ean?: string;
  brand?: string;
  category?: string;
  price?: number;
}

@Component({
  selector: 'app-product-selection',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './product-selection.component.html',
  styleUrls: ['./product-selection.component.scss']
})
export class ProductSelectionComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  selectedProducts: Product[] = [];
  selectedProduct: Product | null = null;
  searchTerm: string = '';
  isLoading: boolean = false;
  isSelectionOpen: boolean = false;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  historyBack(): void {
    window.history.back();
  }

  loadProducts(): void {
    this.isLoading = true;
    this.http.get<Product[]>('https://multi-mandant-ecommerce.onrender.com/api/products').subscribe({
      next: (data) => {
        this.products = data;
        this.filteredProducts = [...this.products];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
        this.isLoading = false;
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
      product.article_text.toLowerCase().includes(searchTermLower) ||
      (product.ean && product.ean.toLowerCase().includes(searchTermLower))
    );
  }

  toggleSelection(product: Product): void {
    if (this.selectedProduct?.id === product.id) {
      this.isSelectionOpen = !this.isSelectionOpen;
    } else {
      this.selectedProduct = product;
      this.isSelectionOpen = true;
    }
  }

  addToCart(product: Product): void {
    if (!this.isProductSelected(product)) {
      this.selectedProducts.push(product);
    }
    this.isSelectionOpen = false;
    this.selectedProduct = null;
  }

  removeFromCart(productId: number): void {
    this.selectedProducts = this.selectedProducts.filter(p => p.id !== productId);
  }

  clearCart(): void {
    this.selectedProducts = [];
  }

  generatePdf(): void {
    if (this.selectedProducts.length === 0) {
      alert('Bitte wählen Sie mindestens ein Produkt aus.');
      return;
    }

    const doc = new jsPDF();

    // Titel
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Produktauswahl', 14, 20);

    // Datum
    const currentDate = new Date().toLocaleDateString('de-DE');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Erstellt am: ${currentDate}`, 14, 35);

    // Trennlinie
    doc.line(14, 40, 200, 40);

    // Tabellenüberschrift
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Artikelnummer', 14, 55);
    doc.text('Artikelname', 60, 55);
    doc.text('EAN', 140, 55);

    // Trennlinie unter Überschrift
    doc.line(14, 58, 200, 58);

    // Produkte
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    let yPosition = 68;
    const lineHeight = 8;
    const pageHeight = 297; // A4 in mm
    const bottomMargin = 20;

    this.selectedProducts.forEach((product, index) => {
      // Wenn yPosition zu weit unten ist, neue Seite
      if (yPosition + lineHeight > pageHeight - bottomMargin) {
        doc.addPage();
        yPosition = 20;

        // Tabellenüberschrift auf neuer Seite wiederholen
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Artikelnummer', 14, yPosition);
        doc.text('Artikelname', 60, yPosition);
        doc.text('EAN', 140, yPosition);
        
        doc.line(14, yPosition + 3, 200, yPosition + 3);
        
        yPosition += 13;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
      }

      // Produktdaten
      doc.text(product.article_number, 14, yPosition);
      
      // Artikelname kürzen falls zu lang
      const maxNameLength = 50;
      const articleName = product.article_text.length > maxNameLength 
        ? product.article_text.substring(0, maxNameLength) + '...'
        : product.article_text;
      doc.text(articleName, 60, yPosition);
      
      doc.text(product.ean || 'N/A', 140, yPosition);

      yPosition += lineHeight;
    });

    // Gesamtanzahl
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gesamtanzahl Produkte: ${this.selectedProducts.length}`, 14, yPosition + 10);

    // PDF öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  formatProductName(product: Product): string {
    // Format: "brand product_name article_number"
    const brand = product.brand || 'avery zweckform';
    const name = product.article_text;
    const articleNumber = product.article_number;
    
    return `${brand} ${name} ${articleNumber}`;
  }

  trackByProductId(index: number, product: Product): number {
    return product.id;
  }

  isProductSelected(product: Product): boolean {
    return this.selectedProducts.some(p => p.id === product.id);
  }

  getSelectButtonText(product: Product): string {
    return this.isProductSelected(product) ? 'Ausgewählt' : 'Auswählen';
  }

  getAddToCartButtonText(product: Product): string {
    return this.isProductSelected(product) ? 'Bereits im Warenkorb' : 'Zum Warenkorb hinzufügen';
  }
}
