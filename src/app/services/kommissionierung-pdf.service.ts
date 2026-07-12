import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';

export interface KommissionierungPdfItem {
  product_id?: number;
  quantity: number;
  price: string;
  different_price?: string | null;
  product_name: string;
  product_article_number: string;
  tax_code?: number;
}

export interface KommissionierungPdfOrder {
  order_id: number;
  customer_number?: string;
  company?: string;
  name?: string;
  role?: string;
  total_price?: string;
  fulfillment_type?: string;
  order_date?: string;
  created_at?: string;
  shipping_address?: string;
  customer_notes?: string;
  delivery_date?: string;
  items: KommissionierungPdfItem[];
}

export interface KommissionierungPdfContext {
  customerNameByNumber: Record<string, string>;
  customersByNumber: Record<string, any>;
  allArtikels: any[];
}

@Injectable({ providedIn: 'root' })
export class KommissionierungPdfService {
  generate(order: KommissionierungPdfOrder, includePalettenschein: boolean, context: KommissionierungPdfContext): void {
    const doc = new jsPDF();
    let pageCount = 1;
    let totalPages = 1; // Wird später berechnet

    // Moderne Farbpalette
    const colors = {
      primary: [41, 128, 185],      // Blau
      secondary: [52, 73, 94],      // Dunkelgrau
      accent: [46, 204, 113],       // Grün
      light: [236, 240, 241],       // Hellgrau
      dark: [44, 62, 80],           // Sehr dunkelgrau
      white: [255, 255, 255]        // Weiß
    };

    // Hilfsfunktion zum Zeichnen der Seitenzahl
    const drawPageNumber = (currentPage: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text(`${currentPage} von ${totalPages}`, 190, 290, { align: 'right' });
    };

    // Hinweis: Kein Rechnungsdokument
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);

    // Bestellnummer Badge
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('#' + order.order_id.toString(), 170, 12);

    // Bestellinformationen in modernen Karten (kompakter)
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    
    let yPos = 28;
    // Kartenhöhe anpassen, wenn Uhrzeit vorhanden ist
    const hasTime = order.delivery_date && order.delivery_date.includes('T');
    const cardHeight = hasTime ? 25 : 20;
    const leftCardWidth = 90;
    const rightCardWidth = 90;
    const cardSpacing = 10;

    // Datum und Uhrzeit konvertieren
    const orderDateFormatted = order.order_date ? new Date(order.order_date).toLocaleDateString() : '';
    const createdAtFormatted = order.created_at ? new Date(order.created_at).toLocaleTimeString() : '';

    // Linke Karte - Bestelldetails
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('BESTELLDETAILS', 20, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.text('Datum: ' + orderDateFormatted, 20, yPos + 11);
    doc.text('Erstellt: ' + createdAtFormatted, 20, yPos + 16);

    // Rechte Karte - Lieferdetails
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('LIEFERDETAILS', 120, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.text('Art: ' + (order.fulfillment_type === 'delivery' ? 'Lieferung' : 'Abholung'), 120, yPos + 11);
    
    // Datum und Uhrzeit extrahieren
    const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : new Date();
    const dateStr = this.formatDate(order.delivery_date);
    
    // Prüfe ob eine Uhrzeit im delivery_date vorhanden ist (ISO-Format mit 'T')
    if (order.delivery_date && order.delivery_date.includes('T')) {
      const timeStr = deliveryDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      doc.text('Datum: ' + dateStr, 120, yPos + 16);
      
      // Bei Abholung die Uhrzeit fett anzeigen
      if (order.fulfillment_type === 'pickup') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Uhrzeit: ' + timeStr + ' Uhr', 120, yPos + 21);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
      } else {
        doc.text('Uhrzeit: ' + timeStr + ' Uhr', 120, yPos + 21);
      }
    } else {
      doc.text('Datum: ' + dateStr, 120, yPos + 16);
    }

    yPos += cardHeight + 10;

    // Kunde Karte mit allen Informationen
    const customerName = this.getCustomerDisplayName(order, context);
    const customerNumber = order.customer_number || '';
    
    // Sammle alle Kundeninformationen
    const customerLines: string[] = [];
    
    // Kundennummer
    if (customerNumber) {
      customerLines.push(customerNumber);
    }
    
    // Firmenname/Name
    if (customerName) {
      customerLines.push(customerName);
    }
    
    // Versuche vollständige Kundendaten zu holen
    const customerKey = String(customerNumber).trim();
    const fullCustomer = context.customersByNumber[customerKey];
    
    // Namenszusatz (z.B. "Inh. Özlem Özmeneroglu")
    if (fullCustomer && fullCustomer.name_addition) {
      customerLines.push(fullCustomer.name_addition);
    }
    
    // Adresse aus vollständigen Kundendaten
    if (fullCustomer) {
      if (fullCustomer.street) {
        customerLines.push(fullCustomer.street);
      }
      
      // PLZ und Stadt
      if (fullCustomer.postal_code || fullCustomer.city) {
        const cityLine = `${fullCustomer.postal_code || ''} ${fullCustomer.city || ''}`.trim();
        if (cityLine) {
          customerLines.push(cityLine);
        }
      }
    } else if (order.shipping_address) {
      // Fallback: Nutze shipping_address wenn vollständige Kundendaten nicht verfügbar sind
      const addressLines = order.shipping_address.split('\n').filter(line => line.trim());
      customerLines.push(...addressLines);
    }

    // Kundenanmerkung (customer_notes) unter "KUNDE" anzeigen, falls vorhanden
    const customerNotes = (order.customer_notes || '').trim();
    if (customerNotes) {
      customerLines.push(`Anmerkung: ${customerNotes}`);
    }
    
    // Berechne die Höhe der Karte basierend auf Anzahl der Zeilen
    const lineHeight = 5;
    const padding = 10;
    const customerCardHeight = Math.max(30, customerLines.length * lineHeight + padding);
    
    // Kunde Karte nutzt volle Breite
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5, 'F');
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.text('KUNDE', 20, yPos + 6);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    
    let textY = yPos + 12;
    customerLines.forEach((line, index) => {
      if (line && line.trim()) {
        const splitLines = doc.splitTextToSize(line, 175);
        splitLines.forEach((splitLine: string) => {
          doc.text(splitLine, 20, textY);
          textY += lineHeight;
        });
      }
    });

    yPos += customerCardHeight + 10;

    // Moderne Trennlinie
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(2);
    doc.line(15, yPos, 195, yPos);

    // Moderne Artikeltabelle
    const tableStartY = yPos + 15;
    const tableWidth = 180;
    const headerHeight = 10;
    const rowHeight = 8;
    
    // Tabellenüberschrift mit modernem Design
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.roundedRect(15, tableStartY, tableWidth, headerHeight, 3, 3, 'F');
    
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    // Spaltenbreiten
    const col1 = 18;   // Pos
    const col2 = 28;   // Menge
    const col3 = 45;   // Artikel (mehr Platz)
    const col4 = 135;  // Artikelnr.
    const col5 = 160;  // Preis
    const col6 = 180;  // Gesamt
    
    // Überschriften
    doc.text('Pos', col1, tableStartY + 6);
    doc.text('Menge', col2, tableStartY + 6);
    doc.text('Artikel', col3, tableStartY + 6);
    doc.text('Artikelnr.', col4, tableStartY + 6);
    doc.text('Preis', col5, tableStartY + 6);
    doc.text('Gesamt', col6, tableStartY + 6);

    // Moderne Artikelzeilen
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    let currentY = tableStartY + headerHeight;
    const pageHeight = 297;
    const bottomMargin = 40;

    order.items.forEach((product, index) => {
      // Seitenumbruch prüfen
      if (currentY + rowHeight > pageHeight - bottomMargin) {
        doc.addPage();
        pageCount++;
        currentY = 20;
        
        // Hinweis auf neuer Seite wiederholen: Kein Rechnungsdokument
        doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);
        
        // Bestellnummer Badge
        doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
        doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
        doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('#' + order.order_id.toString(), 170, 12);
        
        currentY = 25;
        
        // Tabellenüberschrift auf neuer Seite wiederholen
        doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.roundedRect(15, currentY, tableWidth, headerHeight, 3, 3, 'F');
        
        doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Pos', col1, currentY + 6);
        doc.text('Menge', col2, currentY + 6);
        doc.text('Artikel', col3, currentY + 6);
        doc.text('Artikelnr.', col4, currentY + 6);
        doc.text('Preis', col5, currentY + 6);
        doc.text('Gesamt', col6, currentY + 6);
        
        currentY += headerHeight;
        
        doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
      }

      // Artikelname - vollständig anzeigen, mit automatischem Zeilenumbruch falls nötig
      const productName = product.product_name;
      const maxWidth = col4 - col3 - 2; // Verfügbarer Platz für Artikelname
      
      // Text umbrechen falls zu lang
      const splitName = doc.splitTextToSize(productName, maxWidth);
      
      // Zeilenhöhe dynamisch anpassen basierend auf Textzeilen
      const lineHeight = Math.max(rowHeight, splitName.length * 4 + 2);

      // Zebra-Streifen für bessere Lesbarkeit (mit dynamischer Höhe)
      if (index % 2 === 0) {
        doc.setFillColor(248, 249, 250);
        doc.rect(15, currentY, tableWidth, lineHeight, 'F');
      }

      // Trennlinien zwischen den Artikeln
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(15, currentY, 195, currentY);

      // Artikeldaten
      doc.text((index + 1).toString(), col1, currentY + 6); // Positionsnummer
      doc.text(String(product.quantity), col2 + 3, currentY + 6); // Menge näher zu Artikel
      doc.text(splitName, col3, currentY + 6);
      
      doc.text(product.product_article_number, col4, currentY + 6);
      
      // Preis anzeigen (kundenspezifisch oder normal)
      const displayPrice = product.different_price || product.price;
      const priceText = parseFloat(displayPrice).toFixed(2) + ' €';
      doc.text(priceText, col5, currentY + 6);
      
      // Gesamtpreis für diesen Artikel
      const itemTotal = parseFloat(displayPrice) * product.quantity;
      doc.text(itemTotal.toFixed(2) + ' €', col6, currentY + 6);

      // Verwende die dynamische Zeilenhöhe
      currentY += lineHeight;
    });

    // Moderne Gesamtbetrag-Sektion
    if (order.total_price) {
      currentY += 10;
      
      // Rahmen für Gesamtbetrag mit modernem Design
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(1);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      
      // Nettobetrag berechnen (total_price ist bereits Netto)
      const netPrice = parseFloat(order.total_price);
      
      // Bruttobetrag berechnen (alle Artikel summieren mit MwSt)
      const grossPrice = this.getOrderTotalGross(order);
      
      // Positionierung für beide Beträge
      const leftMargin = 25;
      const rightMargin = 120;
      
      // Nettobetrag links
      doc.text('Nettobetrag: ' + netPrice.toFixed(2) + ' €', leftMargin, currentY + 10);
      
      // Bruttobetrag rechts
      doc.text('Bruttobetrag: ' + grossPrice.toFixed(2) + ' €', rightMargin, currentY + 10);
      
      currentY += 25;
    }

    // Moderner Footer
    const footerY = pageHeight - 20;
    
    // Footer-Linie
    doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setLineWidth(1);
    doc.line(15, footerY, 195, footerY);
    
    // Footer-Text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    
    const currentDate = new Date().toLocaleDateString();
    const currentTime = new Date().toLocaleTimeString();
    
    doc.text('Erstellt am ' + currentDate + ' um ' + currentTime, 15, footerY + 8);

    // Optional: Palettenschein als zusätzliche Seite anhängen
    if (includePalettenschein) {
      doc.addPage();
      pageCount++;
      const extraPalettenscheinPages = this.drawPalettenschein(doc, order, colors, context);
      pageCount += extraPalettenscheinPages;
    }

    // Gesamtseitenzahl berechnen
    totalPages = pageCount;

    // Seitenzahl für alle Seiten hinzufügen
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawPageNumber(i, totalPages);
    }

    // Zurück zur ersten Seite
    doc.setPage(1);

    // PDF-Dokument öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  private getCustomerDisplayName(order: KommissionierungPdfOrder, context: KommissionierungPdfContext): string {
    const key = String(order.customer_number ?? '').trim();
    if (key) {
      const mapped = context.customerNameByNumber[key];
      if (mapped && mapped.trim()) {
        return mapped;
      }
      return `Kunde ${key}`;
    }
    if (this.isEmployee(order)) {
      return '-';
    }
    return order.name || '';
  }

  private isEmployee(order: KommissionierungPdfOrder): boolean {
    return order.role === 'admin' || order.role === 'employee';
  }

  private getTaxRate(taxCode?: number): number {
    switch (taxCode) {
      case 1: return 0.19;
      case 2: return 0.07;
      case 3: return 0.00;
      default: return 0.19;
    }
  }

  private getGrossPrice(netPrice: number, taxCode?: number): number {
    const taxRate = this.getTaxRate(taxCode);
    return netPrice * (1 + taxRate);
  }

  private getOrderTotalGross(order: KommissionierungPdfOrder): number {
    if (!order || !order.items || order.items.length === 0) {
      return 0;
    }
    return order.items.reduce((sum, item) => {
      const netPrice = parseFloat(item.different_price || item.price || '0');
      const grossPrice = this.getGrossPrice(netPrice, item.tax_code);
      const quantity = Number(item.quantity) || 0;
      return sum + (grossPrice * quantity);
    }, 0);
  }

  private getCoolingItems(order: KommissionierungPdfOrder, context: KommissionierungPdfContext): KommissionierungPdfItem[] {
    if (!order || !order.items || order.items.length === 0) {
      return [];
    }

    const coolCategories = new Set(['TIEFKÜHL', 'MILCHPRODUKTE', 'FLEISCH', 'FISCH']);
    const normalize = (value: any): string =>
      String(value ?? '').trim().toUpperCase();

    return order.items.filter((item) => {
      const articleNumber = item.product_article_number;
      if (!articleNumber) return false;

      const globalArtikel = context.allArtikels?.find(
        (a) => a.article_number === articleNumber
      );

      const category = normalize(globalArtikel?.category);
      return coolCategories.has(category);
    });
  }

  private drawPalettenschein(doc: jsPDF, order: KommissionierungPdfOrder, colors: { [key: string]: number[] }, context: KommissionierungPdfContext): number {
    const pageWidth = 210;
    const pageHeight = 297;
    const footerReserve = 30; // Mindestabstand zum unteren Seitenrand (für Footer)
    const pageBottomLimit = pageHeight - footerReserve;
    let extraPages = 0;

    // Footer am unteren Seitenrand der aktuellen Seite zeichnen
    const drawFooter = () => {
      const footerY = pageHeight - 20;
      doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
      doc.setLineWidth(1);
      doc.line(15, footerY, pageWidth - 15, footerY);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);

      const currentDate = new Date().toLocaleDateString('de-DE');
      const currentTime = new Date().toLocaleTimeString('de-DE');
      doc.text('Erstellt am ' + currentDate + ' um ' + currentTime, 15, footerY + 8);
    };

    // Mini-Header auf Folgeseiten
    const drawContinuationHeader = () => {
      doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Palettenschein – Fortsetzung', 15, 12);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Fortsetzung der Tiefkühl- & Kühlware-Checkliste.', 15, 16.5);

      // Bestellnummer Badge
      doc.setFillColor(colors['accent'][0], colors['accent'][1], colors['accent'][2]);
      doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
      doc.setTextColor(colors['white'][0], colors['white'][1], colors['white'][2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('#' + order.order_id.toString(), 170, 12);
    };

    // Stellt sicher, dass `needed` mm Platz vorhanden sind. Falls nicht, wird die Seite
    // umgebrochen und die neue Start-Y-Position zurückgegeben. Sonst wird `currentY`
    // unverändert zurückgegeben.
    const ensureSpace = (currentY: number, needed: number): number => {
      if (currentY + needed > pageBottomLimit) {
        drawFooter();
        doc.addPage();
        extraPages++;
        drawContinuationHeader();
        return 25;
      }
      return currentY;
    };

    // Kopfbereich: Hinweis
    doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Palettenschein – Warenübergabe', 15, 12);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Dieses Dokument dient ausschließlich der Bestätigung der Warenübergabe.', 15, 16.5);

    // Bestellnummer Badge
    doc.setFillColor(colors['accent'][0], colors['accent'][1], colors['accent'][2]);
    doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
    doc.setTextColor(colors['white'][0], colors['white'][1], colors['white'][2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('#' + order.order_id.toString(), 170, 12);

    // Titel
    doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PALETTENSCHEIN', pageWidth / 2, 30, { align: 'center' });

    // Trennlinie unter Titel
    doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
    doc.setLineWidth(1.2);
    doc.line(15, 35, pageWidth - 15, 35);

    let yPos = 45;
    const leftCardWidth = 90;
    const rightCardWidth = 90;
    const cardSpacing = 10;

    // Bestelldaten + Lieferdaten in zwei Karten
    const hasTime = !!(order.delivery_date && order.delivery_date.includes('T'));
    const topCardHeight = hasTime ? 30 : 25;

    // Linke Karte: Bestelldetails
    doc.setFillColor(colors['light'][0], colors['light'][1], colors['light'][2]);
    doc.roundedRect(15, yPos, leftCardWidth, topCardHeight, 5, 5, 'F');
    doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, leftCardWidth, topCardHeight, 5, 5);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
    doc.text('BESTELLDETAILS', 20, yPos + 7);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
    doc.text('Bestellnummer: ' + order.order_id.toString(), 20, yPos + 14);
    const orderDateFormatted = order.order_date ? new Date(order.order_date).toLocaleDateString('de-DE') : '-';
    doc.text('Bestelldatum: ' + orderDateFormatted, 20, yPos + 20);

    // Rechte Karte: Lieferdetails
    doc.setFillColor(colors['light'][0], colors['light'][1], colors['light'][2]);
    doc.roundedRect(115, yPos, rightCardWidth, topCardHeight, 5, 5, 'F');
    doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(115, yPos, rightCardWidth, topCardHeight, 5, 5);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
    doc.text('LIEFERDETAILS', 120, yPos + 7);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
    doc.text('Art: ' + (order.fulfillment_type === 'delivery' ? 'Lieferung' : 'Abholung'), 120, yPos + 14);

    const deliveryDateStr = this.formatDate(order.delivery_date);
    if (hasTime) {
      const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : new Date();
      const timeStr = deliveryDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      doc.text('Datum: ' + deliveryDateStr, 120, yPos + 20);
      doc.setFont('helvetica', 'bold');
      doc.text('Uhrzeit: ' + timeStr + ' Uhr', 120, yPos + 26);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text('Datum: ' + deliveryDateStr, 120, yPos + 20);
    }

    yPos += topCardHeight + 10;

    // Kunde / Empfänger Karte
    const customerName = this.getCustomerDisplayName(order, context);
    const customerNumber = order.customer_number || '';
    const customerKey = String(customerNumber).trim();
    const fullCustomer = context.customersByNumber[customerKey];

    // Adress-Zeilen (kleinere Schrift, unter dem Namen)
    const addressLines: string[] = [];
    if (fullCustomer && fullCustomer.name_addition) {
      addressLines.push(fullCustomer.name_addition);
    }
    if (fullCustomer) {
      if (fullCustomer.street) {
        addressLines.push(fullCustomer.street);
      }
      if (fullCustomer.postal_code || fullCustomer.city) {
        const cityLine = `${fullCustomer.postal_code || ''} ${fullCustomer.city || ''}`.trim();
        if (cityLine) {
          addressLines.push(cityLine);
        }
      }
    } else if (order.shipping_address) {
      const fallbackLines = order.shipping_address.split('\n').filter(line => line.trim());
      addressLines.push(...fallbackLines);
    }

    const addressFontSize = 14;
    const addressLineHeight = 7;
    const customerCardWidth = leftCardWidth + rightCardWidth + cardSpacing;

    // Höhe dynamisch: Header + sehr großer Name (ggf. mehrzeilig) + Kundennummer + Adresszeilen
    const nameFontSize = 26;
    const nameLineSpacing = 11; // vertikaler Abstand zwischen mehrzeiligem Namen
    const customerNumberHeight = customerNumber ? 9 : 0;
    const addressBlockHeight = addressLines.length * addressLineHeight;

    // Anzahl Zeilen für den Namen vorab berechnen, damit die Karte hoch genug ist
    doc.setFontSize(nameFontSize);
    doc.setFont('helvetica', 'bold');
    const nameLines = doc.splitTextToSize(customerName || '-', customerCardWidth - 10);
    const nameBlockHeight = Math.max(nameFontSize * 0.5, nameLines.length * nameLineSpacing);

    const customerCardHeight = Math.max(
      55,
      14 + nameBlockHeight + 6 + customerNumberHeight + addressBlockHeight + 8
    );

    doc.setFillColor(colors['light'][0], colors['light'][1], colors['light'][2]);
    doc.roundedRect(15, yPos, customerCardWidth, customerCardHeight, 5, 5, 'F');
    doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, yPos, customerCardWidth, customerCardHeight, 5, 5);

    // Überschrift
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
    doc.text('EMPFÄNGER', 20, yPos + 7);

    let textY = yPos + 14 + nameFontSize * 0.45;

    // Empfängername SEHR GROSS
    doc.setFontSize(nameFontSize);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
    nameLines.forEach((nameLine: string, idx: number) => {
      doc.text(nameLine, 20, textY);
      if (idx < nameLines.length - 1) {
        textY += nameLineSpacing;
      }
    });
    textY += 9;

    // Kundennummer
    if (customerNumber) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
      doc.text('Kundennr.: ' + customerNumber, 20, textY);
      textY += addressLineHeight + 2;
    }

    // Adresse
    doc.setFontSize(addressFontSize);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
    addressLines.forEach((line) => {
      if (line && line.trim()) {
        const splitLines = doc.splitTextToSize(line, customerCardWidth - 10);
        splitLines.forEach((splitLine: string) => {
          doc.text(splitLine, 20, textY);
          textY += addressLineHeight;
        });
      }
    });

    yPos += customerCardHeight + 14;

    // Spaltenbreiten für die Kühlware-Tabelle (auch in Page-Break-Helpern verwendet)
    const colCheckX = 20;
    const colCheckSize = 5;
    const colQtyX = 32;
    const colNameX = 50;
    const colArtNrX = 150;
    const coolRowHeight = 10;

    // Zeichnet den Spaltenkopf der Kühlware-Tabelle an der gegebenen Y-Position
    const drawCoolTableHeader = (y: number): number => {
      doc.setFillColor(243, 244, 246);
      doc.rect(15, y, customerCardWidth, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
      doc.text('OK', colCheckX, y + 5);
      doc.text('Menge', colQtyX, y + 5);
      doc.text('Artikel', colNameX, y + 5);
      doc.text('Artikelnr.', colArtNrX, y + 5);
      return y + 7;
    };

    // Kühlware-Checkliste (noch zu holende Tiefkühl- & Kühlware)
    const coolItems = this.getCoolingItems(order, context);

    // Vor dem Tabellenstart sicherstellen, dass mindestens Header + Hinweis + Spaltenkopf
    // + 1 Datenzeile auf die aktuelle Seite passen, sonst neue Seite beginnen.
    yPos = ensureSpace(yPos, 10 + 8 + 7 + coolRowHeight);

    // Header der Kühlware-Sektion
    doc.setFillColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
    doc.roundedRect(15, yPos, customerCardWidth, 10, 3, 3, 'F');
    doc.setTextColor(colors['white'][0], colors['white'][1], colors['white'][2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('NOCH ZU HOLENDE TIEFKÜHL- & KÜHLWARE', 20, yPos + 7);
    yPos += 10;

    // Hinweistext
    doc.setFillColor(255, 247, 237); // sehr helles Orange
    doc.rect(15, yPos, customerCardWidth, 8, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(180, 83, 9);
    doc.text('Hinweis: Wegen Kühlkette erst kurz vor Abfahrt holen und abhaken.', 20, yPos + 5.5);
    yPos += 8;

    // Spaltenkopf der Tabelle
    yPos = drawCoolTableHeader(yPos);

    // Start-Y des Rahmens für den aktuellen Seitenabschnitt der Tabelle
    let tableSectionStartY = yPos;

    // Zeichnet den Rahmen um den aktuellen Tabellen-Seitenabschnitt
    const finalizeTableSection = (endY: number) => {
      doc.setDrawColor(colors['primary'][0], colors['primary'][1], colors['primary'][2]);
      doc.setLineWidth(0.5);
      doc.rect(15, tableSectionStartY, customerCardWidth, endY - tableSectionStartY);
    };

    // Stellt sicher, dass eine weitere Tabellenzeile passt. Falls nicht, wird der
    // aktuelle Tabellenrahmen abgeschlossen, eine neue Seite begonnen und der
    // Spaltenkopf auf der neuen Seite erneut gezeichnet.
    const ensureRowSpace = (currentY: number): number => {
      if (currentY + coolRowHeight > pageBottomLimit) {
        finalizeTableSection(currentY);
        drawFooter();
        doc.addPage();
        extraPages++;
        drawContinuationHeader();
        let newY = 25;
        newY = drawCoolTableHeader(newY);
        tableSectionStartY = newY;
        return newY;
      }
      return currentY;
    };

    if (coolItems.length > 0) {
      // Datenzeilen
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);

      coolItems.forEach((item, index) => {
        yPos = ensureRowSpace(yPos);

        // Zebra-Streifen
        if (index % 2 === 0) {
          doc.setFillColor(248, 249, 250);
          doc.rect(15, yPos, customerCardWidth, coolRowHeight, 'F');
        }

        // Checkbox
        doc.setDrawColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
        doc.setLineWidth(0.5);
        doc.rect(colCheckX, yPos + 2.5, colCheckSize, colCheckSize);

        // Menge
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);
        doc.text(String(item.quantity) + ' x', colQtyX, yPos + 7);

        // Artikelname (mit Umbruch falls zu lang)
        doc.setFont('helvetica', 'normal');
        const nameMaxWidth = colArtNrX - colNameX - 2;
        const splitName = doc.splitTextToSize(item.product_name || '-', nameMaxWidth);
        doc.text(splitName[0] || '-', colNameX, yPos + 7);

        // Artikelnummer
        doc.setFontSize(9);
        doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
        doc.text(item.product_article_number || '-', colArtNrX, yPos + 7);
        doc.setFontSize(10);
        doc.setTextColor(colors['dark'][0], colors['dark'][1], colors['dark'][2]);

        // Trennlinie
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(15, yPos + coolRowHeight, 15 + customerCardWidth, yPos + coolRowHeight);

        yPos += coolRowHeight;
      });
    } else {
      // Keine kühlpflichtigen Artikel automatisch erkannt – leere Zeilen zum manuellen Eintragen
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
      doc.text('Keine kühlpflichtigen Artikel automatisch erkannt – bitte ggf. manuell eintragen:', 20, yPos + 5);
      yPos += 8;

      const emptyRows = 6;
      for (let i = 0; i < emptyRows; i++) {
        yPos = ensureRowSpace(yPos);

        if (i % 2 === 0) {
          doc.setFillColor(248, 249, 250);
          doc.rect(15, yPos, customerCardWidth, coolRowHeight, 'F');
        }
        // Checkbox
        doc.setDrawColor(colors['secondary'][0], colors['secondary'][1], colors['secondary'][2]);
        doc.setLineWidth(0.5);
        doc.rect(colCheckX, yPos + 2.5, colCheckSize, colCheckSize);

        // Ausfülllinie
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(colQtyX, yPos + 8, 15 + customerCardWidth - 5, yPos + 8);

        // Untere Trennlinie
        doc.setDrawColor(220, 220, 220);
        doc.line(15, yPos + coolRowHeight, 15 + customerCardWidth, yPos + coolRowHeight);

        yPos += coolRowHeight;
      }
    }

    // Abschließenden Tabellenrahmen für den letzten Seitenabschnitt zeichnen
    finalizeTableSection(yPos);

    // Footer auf der letzten Seite
    drawFooter();

    return extraPages;
  }

  private formatDate(dateString?: string): string {
    if (!dateString) return '';

    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
  }
}