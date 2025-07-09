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
  sale_price?: number;
  tax_code?: number;
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
    doc.text('Etikettendruck - Produktauswahl', 14, 20);


    // Grid-Layout Einstellungen
    const startY = 50;
    const cardWidth = 85;
    const cardHeight = 45; // Höher für mehr Inhalt
    const marginX = 10;
    const marginY = 8;
    const cardsPerRow = 2;
    const startX = 14;

    let currentX = startX;
    let currentY = startY;
    let cardIndex = 0;

    this.selectedProducts.forEach((product, index) => {
      // Neue Seite wenn nötig
      if (currentY + cardHeight > 270) {
        doc.addPage();
        currentY = startY;
        currentX = startX;
        cardIndex = 0;
      }

      // Produktkarte zeichnen
      // Rahmen
      doc.setLineWidth(0.5);
      doc.rect(currentX, currentY, cardWidth, cardHeight);

      // Produktname (Etikettenformat)
      const labelFormat = `${product.article_text}`
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      
      // Text umbrechen falls zu lang
      const maxWidth = cardWidth - 6;
      const lines = doc.splitTextToSize(labelFormat, maxWidth);
      
      let textY = currentY + 8;
      lines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < 2) { // Maximal 2 Zeilen
          doc.text(line, currentX + 3, textY);
          textY += 5;
        }
      });

      // Artikelnummer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Art.-Nr.: ${product.article_number}`, currentX + 3, currentY + 20);

      // EAN falls vorhanden
      if (product.ean) {
        doc.setFontSize(7);
        doc.text(`EAN: ${product.ean}`, currentX + 3, currentY + 25);
      }

      // Preis und MwSt.
      let priceY = currentY + (product.ean ? 30 : 25);
      
      // Netto-Preis
      if (product.sale_price) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`€ ${product.sale_price.toFixed(2)}`, currentX + 3, priceY);
        priceY += 4;
      }

      // MwSt.-Information
      if (product.tax_code) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        const taxText = product.tax_code === 1 ? 'zzgl. 19% MwSt.' : 
                       product.tax_code === 2 ? 'zzgl. 7% MwSt.' : 
                       ` zzgl. ${product.tax_code}% MwSt.`;
        doc.text(taxText, currentX + 3, priceY);
      }

      // Kleine Trennlinie
      doc.setLineWidth(0.2);

      // Index/Nummer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');

      // Nächste Position berechnen
      cardIndex++;
      if (cardIndex % cardsPerRow === 0) {
        // Neue Zeile
        currentX = startX;
        currentY += cardHeight + marginY;
      } else {
        // Nächste Spalte
        currentX += cardWidth + marginX;
      }
    });

    // Gesamtanzahl am Ende
    if (currentY > startY) {
      currentY += cardHeight + 10;
    }
    if (currentY > 270) {
      doc.addPage();
      currentY = 50;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');

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
