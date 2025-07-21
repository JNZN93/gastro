import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { Router } from '@angular/router';
import JsBarcode from 'jsbarcode';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';

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
  imports: [CommonModule, FormsModule, HttpClientModule, MatDialogModule],
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

  private readonly CART_STORAGE_KEY = 'product-selection-cart';

  constructor(private http: HttpClient, private router: Router, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.loadProducts();
    this.loadCartFromLocalStorage();
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
        // After loading products, restore cart items that are still available
        this.restoreCartItems();
      },
      error: (error) => {
        console.error('Fehler beim Laden der Produkte:', error);
        this.isLoading = false;
      }
    });
  }

  // Save cart to localStorage
  private saveCartToLocalStorage(): void {
    try {
      localStorage.setItem(this.CART_STORAGE_KEY, JSON.stringify(this.selectedProducts));
    } catch (error) {
      console.error('Fehler beim Speichern des Warenkorbs:', error);
    }
  }

  // Load cart from localStorage
  private loadCartFromLocalStorage(): void {
    try {
      const savedCart = localStorage.getItem(this.CART_STORAGE_KEY);
      if (savedCart) {
        this.selectedProducts = JSON.parse(savedCart);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Warenkorbs:', error);
      this.selectedProducts = [];
    }
  }

  // Restore cart items that are still available in the products list
  private restoreCartItems(): void {
    if (this.selectedProducts.length > 0 && this.products.length > 0) {
      const availableProductIds = this.products.map(p => p.id);
      this.selectedProducts = this.selectedProducts.filter(item => 
        availableProductIds.includes(item.id)
      );
      this.saveCartToLocalStorage();
    }
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
    this.selectedProducts.push(product);
    this.saveCartToLocalStorage();
  }

  removeFromCart(productId: number): void {
    const index = this.selectedProducts.findIndex(p => p.id === productId);
    if (index !== -1) {
      this.selectedProducts.splice(index, 1);
      this.saveCartToLocalStorage();
    }
  }

  clearCart(): void {
    const dialogRef = this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Warenkorb leeren',
        message: 'Sind Sie sicher, dass Sie den Warenkorb leeren möchten? Diese Aktion kann nicht rückgängig gemacht werden.',
        isConfirmation: true,
        confirmLabel: 'Leeren',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '400px',
      minWidth: '300px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.selectedProducts = [];
        this.saveCartToLocalStorage();
      }
    });
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

  generateFullPagePdf(): void {
    if (this.selectedProducts.length === 0) {
      alert('Bitte wählen Sie mindestens ein Produkt aus.');
      return;
    }

    const doc = new jsPDF('landscape'); // Querformat (Landscape)

    this.selectedProducts.forEach((product, index) => {
      // Neue Seite für jedes Produkt (außer dem ersten)
      if (index > 0) {
        doc.addPage();
      }

      // DIN A4 Querformat: 297mm x 210mm
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 20;
      const contentWidth = pageWidth - (2 * margin);
      const contentHeight = pageHeight - (2 * margin);

      // Rahmen für die gesamte Seite
      doc.setLineWidth(1);
      doc.rect(margin, margin, contentWidth, contentHeight);

      // Produktname (dynamische Schriftgröße für eine Zeile)
      doc.setFont('helvetica', 'bold');
      const productName = product.article_text;
      const maxNameWidth = contentWidth - 20;
      
      // Dynamische Schriftgröße: Starte mit 48 und reduziere bis es passt
      let fontSize = 48;
      let nameLines: string[] = [];
      
      while (fontSize > 8) {
        doc.setFontSize(fontSize);
        nameLines = doc.splitTextToSize(productName, maxNameWidth);
        if (nameLines.length <= 1) {
          break; // Text passt in eine Zeile
        }
        fontSize -= 2; // Reduziere Schriftgröße um 2
      }
      
      // Verwende die gefundene Schriftgröße
      doc.setFontSize(fontSize);
      let nameY = margin + 40;
      nameLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < 1) { // Nur eine Zeile
          doc.text(line, margin + 10, nameY);
        }
      });

      // Artikelnummer (mittelgroß)
      doc.setFontSize(18);
      doc.setFont('helvetica', 'normal');
      doc.text(`Artikelnummer: ${product.article_number}`, margin + 10, nameY + 20);

      // EAN falls vorhanden
      if (product.ean) {
        doc.setFontSize(16);
        doc.text(`EAN: ${product.ean}`, margin + 10, nameY + 40);
        
        // EAN Barcode (größer für DIN A4)
        const barcodeDataUrl = this.generateEanBarcode(product.ean);
        if (barcodeDataUrl) {
          const barcodeWidth = 80;
          const barcodeHeight = 20;
          doc.addImage(barcodeDataUrl, 'PNG', margin + 10, nameY + 50, barcodeWidth, barcodeHeight);
        }
      }

      // Preis (sehr groß und prominent)
      if (product.sale_price) {
        doc.setFontSize(96);
        doc.setFont('helvetica', 'bold');
        const priceText = `€ ${product.sale_price.toFixed(2).replace('.', ',')}`;
        const priceWidth = doc.getTextWidth(priceText);
        const priceX = pageWidth - margin - priceWidth - 10;
        const priceY = pageHeight - margin - 60;
        doc.text(priceText, priceX, priceY);
        
        // MwSt.-Information unter dem Preis
        if (product.tax_code) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'normal');
          const taxText = product.tax_code === 1 ? 'zzgl. 19% MwSt.' : 
                         product.tax_code === 2 ? 'zzgl. 7% MwSt.' : 
                         `zzgl. ${product.tax_code}% MwSt.`;
          const taxWidth = doc.getTextWidth(taxText);
          const taxX = pageWidth - margin - taxWidth - 10;
          doc.text(taxText, taxX, priceY + 15);
        }
      }

      // Zusätzliche Produktinformationen (falls vorhanden)
      let infoY = nameY + 80;
      
      if (product.brand) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Marke: ${product.brand}`, margin + 10, infoY);
        infoY += 15;
      }

      if (product.category) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Kategorie: ${product.category}`, margin + 10, infoY);
        infoY += 15;
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

  getProductCount(product: Product): number {
    return this.selectedProducts.filter(p => p.id === product.id).length;
  }

  getUniqueProductCount(): number {
    const uniqueIds = new Set(this.selectedProducts.map(p => p.id));
    return uniqueIds.size;
  }

  toggleCart(): void {
    this.isCartExpanded = !this.isCartExpanded;
  }

  getAddToCartButtonText(product: Product): string {
    const count = this.getProductCount(product);
    if (count === 0) {
      return 'Hinzufügen';
    } else if (count === 1) {
      return 'Hinzugefügt';
    } else {
      return `Hinzugefügt (${count})`;
    }
  }
}
