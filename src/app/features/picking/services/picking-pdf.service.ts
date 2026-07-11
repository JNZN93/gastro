import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PickItemState, PickingOrder } from '../models/picking.models';

@Injectable({ providedIn: 'root' })
export class PickingPdfService {
  generateKommissionierungsschein(
    order: PickingOrder,
    items: PickItemState[],
    options: { customerLabel: string; includePalettenschein?: boolean } = { customerLabel: '' }
  ): void {
    const doc = new jsPDF();
    const fulfillment = this.getFulfillmentLabel(order.fulfillment_type);
    const deliveryLabel = this.formatDeliveryDateTime(order.delivery_date || order.order_date);
    const notes = (order.customer_notes || '').trim();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Kommissionierungsschein', 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text('Kein Rechnungsdokument – nur für Kommissionierung / Übergabe', 14, 22);
    doc.setTextColor(0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${order.order_id}`, 196, 16, { align: 'right' });

    let y = 30;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(options.customerLabel || order.company || order.name || 'Kunde', 14, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (order.customer_number) {
      doc.text(`Kd.-Nr. ${order.customer_number}`, 14, y);
      y += 5;
    }
    doc.text(`${fulfillment} · ${deliveryLabel}`, 14, y);
    y += 5;
    if (order.shipping_address) {
      const addressLines = doc.splitTextToSize(order.shipping_address.replace(/\n/g, ', '), 180);
      doc.text(addressLines, 14, y);
      y += addressLines.length * 4.5 + 1;
    }
    if (notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Hinweis:', 14, y);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(notes, 160);
      doc.text(noteLines, 32, y);
      y += Math.max(5, noteLines.length * 4.5) + 2;
    }

    const rows = items.map((item) => [
      item.articleNumber,
      item.replacementArticleNumber
        ? `${item.productName}\nErsatz: ${item.replacementArticleNumber}${
            item.replacementArticleName ? ` – ${item.replacementArticleName}` : ''
          }`
        : item.productName,
      String(item.targetQuantity),
      item.status === 'unavailable' ? '—' : String(item.pickedQuantity),
      this.getItemStatusLabel(item.status),
      item.note || '',
    ]);

    autoTable(doc, {
      startY: y + 2,
      head: [['Art.-Nr.', 'Artikel', 'Soll', 'Ist', 'Status', 'Notiz']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 24 },
        5: { cellWidth: 32 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') {
          return;
        }
        const status = String(rows[data.row.index]?.[4] || '');
        if (status === 'Nicht verfügbar') {
          data.cell.styles.textColor = [185, 28, 28];
        } else if (status === 'Fertig') {
          data.cell.styles.textColor = [21, 128, 61];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 10;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      `Erstellt ${new Date().toLocaleString('de-DE')}${
        order.picker_user_name ? ` · Kommissioniert von ${order.picker_user_name}` : ''
      }`,
      14,
      Math.min(finalY + 8, 285)
    );

    if (options.includePalettenschein) {
      this.addPalettenscheinPage(doc, order, options.customerLabel, fulfillment, deliveryLabel, notes);
    }

    doc.save(`Kommissionierungsschein_${order.order_id}.pdf`);
  }

  private addPalettenscheinPage(
    doc: jsPDF,
    order: PickingOrder,
    customerLabel: string,
    fulfillment: string,
    deliveryLabel: string,
    notes: string
  ): void {
    doc.addPage();
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Palettenschein – Warenübergabe', 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text('Bestätigung der Warenübergabe (kein Rechnungsdokument)', 14, 24);
    doc.setTextColor(0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${order.order_id}`, 196, 18, { align: 'right' });

    let y = 36;
    doc.setFontSize(12);
    doc.text(customerLabel || order.company || order.name || 'Kunde', 14, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (order.customer_number) {
      doc.text(`Kd.-Nr. ${order.customer_number}`, 14, y);
      y += 6;
    }
    doc.text(`${fulfillment} · ${deliveryLabel}`, 14, y);
    y += 8;
    if (order.shipping_address) {
      const lines = doc.splitTextToSize(order.shipping_address, 180);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 4;
    }
    if (notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Anmerkung', 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(notes, 180);
      doc.text(noteLines, 14, y);
      y += noteLines.length * 5 + 8;
    }

    y = Math.max(y, 90);
    const boxTop = y;
    doc.setDrawColor(180);
    doc.roundedRect(14, boxTop, 182, 70, 3, 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Übergabe', 20, boxTop + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Datum: ____________________    Uhrzeit: __________', 20, boxTop + 24);
    doc.text('Empfänger: ____________________________________________', 20, boxTop + 38);
    doc.text('Unterschrift: __________________________________________', 20, boxTop + 52);
    doc.text('Paletten / Kolli: ____________', 20, boxTop + 64);
  }

  private getFulfillmentLabel(type?: string): string {
    if (type === 'delivery') {
      return 'Lieferung';
    }
    if (type === 'pickup') {
      return 'Abholung';
    }
    return type || '—';
  }

  private getItemStatusLabel(status: string): string {
    switch (status) {
      case 'picked':
        return 'Fertig';
      case 'partial':
        return 'Teilweise';
      case 'unavailable':
        return 'Nicht verfügbar';
      default:
        return 'Offen';
    }
  }

  private formatDeliveryDateTime(value?: string): string {
    if (!value) {
      return 'Kein Datum';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const datePart = date.toLocaleDateString('de-DE');
    if (value.includes('T')) {
      const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return `${datePart} · ${timePart}`;
    }
    return datePart;
  }
}
