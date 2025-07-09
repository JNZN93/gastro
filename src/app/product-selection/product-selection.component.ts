import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';
import JsBarcode from 'jsbarcode';

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
  searchTerm: string = '';
  isLoading: boolean = false;
  isCartExpanded: boolean = true; // Cart starts expanded by default

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

  addToCart(product: Product): void {
    if (!this.isProductSelected(product)) {
      this.selectedProducts.push(product);
    }
  }

  removeFromCart(productId: number): void {
    this.selectedProducts = this.selectedProducts.filter(p => p.id !== productId);
  }

  clearCart(): void {
    this.selectedProducts = [];
  }

  generateEanBarcode(ean: string): string {
    const canvas = document.createElement('canvas');
    try {
      // EAN-Code bereinigen (nur Zahlen)
      const cleanEan = ean.replace(/\D/g, '');
      
      // Format basierend auf der Länge bestimmen
      let format: string;
      let width: number;
      
      switch (cleanEan.length) {
        case 8:
          format = 'EAN8';
          width = 1.2;
          break;
        case 12:
          format = 'UPC';
          width = 1.5;
          break;
        case 13:
          format = 'EAN13';
          width = 1.5;
          break;
        default:
          // Fallback für andere Längen - versuche CODE128
          format = 'CODE128';
          width = 1.0;
          break;
      }
      
      JsBarcode(canvas, cleanEan, {
        format: format,
        width: width,
        height: 30,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000'
      });
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error generating barcode for EAN:', ean, error);
      return '';
    }
  }

  generatePdf(): void {
    if (this.selectedProducts.length === 0) {
      alert('Bitte wählen Sie mindestens ein Produkt aus.');
      return;
    }

    const doc = new jsPDF();

    // Grid-Layout Einstellungen für 7x2 Grid (14 Etiketten pro Seite)
    const startY = 20;
    const cardWidth = 85;
    const cardHeight = 35; // Erhöht für Barcode
    const marginX = 10;
    const marginY = 4; // Reduzierter Abstand zwischen Reihen
    const cardsPerRow = 2;
    const rowsPerPage = 6; // 6 Reihen pro Seite (reduziert wegen größerer Karten)
    const cardsPerPage = cardsPerRow * rowsPerPage; // 12 Etiketten pro Seite
    const startX = 14;

    let currentX = startX;
    let currentY = startY;
    let cardIndex = 0;

    this.selectedProducts.forEach((product, index) => {
      // Neue Seite nach 12 Etiketten (6 Reihen x 2 Spalten)
      if (index > 0 && index % cardsPerPage === 0) {
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
      
      let textY = currentY + 6;
      lines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < 2) { // Maximal 2 Zeilen
          doc.text(line, currentX + 3, textY);
          textY += 4;
        }
      });

      // Artikelnummer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Art.-Nr.: ${product.article_number}`, currentX + 3, currentY + 16);

      // EAN falls vorhanden
      if (product.ean) {
        doc.setFontSize(7);
        doc.text(`EAN: ${product.ean}`, currentX + 3, currentY + 20);
        
        // EAN Barcode generieren und hinzufügen
        const barcodeDataUrl = this.generateEanBarcode(product.ean);
        if (barcodeDataUrl) {
          const barcodeWidth = 30;
          const barcodeHeight = 6;
          doc.addImage(barcodeDataUrl, 'PNG', currentX + 3, currentY + 22, barcodeWidth, barcodeHeight);
        }
      }

      // Preis rechts platzieren
      if (product.sale_price) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const priceText = `€ ${product.sale_price.toFixed(2).replace('.', ',')}`;
        const priceWidth = doc.getTextWidth(priceText);
        doc.text(priceText, currentX + cardWidth - priceWidth - 3, currentY + 24);
        
        // MwSt.-Information unter dem Preis
        if (product.tax_code) {
          doc.setFontSize(6);
          doc.setFont('helvetica', 'normal');
          const taxText = product.tax_code === 1 ? 'zzgl. 19% MwSt.' : 
                         product.tax_code === 2 ? 'zzgl. 7% MwSt.' : 
                         ` zzgl. ${product.tax_code}% MwSt.`;
          const taxWidth = doc.getTextWidth(taxText);
          doc.text(taxText, currentX + cardWidth - taxWidth - 3, currentY + 28);
        }
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


    // PDF öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  formatProductName(product: Product): string {
    // Format: "brand product_name article_number"
    const name = product.article_text;
    const articleNumber = product.article_number;
    
    return `${name} ${articleNumber}`;
  }

  trackByProductId(index: number, product: Product): number {
    return product.id;
  }

  isProductSelected(product: Product): boolean {
    return this.selectedProducts.some(p => p.id === product.id);
  }

  toggleCart(): void {
    this.isCartExpanded = !this.isCartExpanded;
  }

  getAddToCartButtonText(product: Product): string {
    return this.isProductSelected(product) ? 'Hinzugefügt' : 'Hinzufügen';
  }
}
