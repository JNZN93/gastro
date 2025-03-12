import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { OrderService } from '../order.service';
import { jsPDF } from 'jspdf';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';

@Component({
  selector: 'app-admin',
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  orders: any[] = [];
  xmlContent: any;
  showModal = false;
  selectedOrder: any = null;
  newStatus: string = '';
  isLoading: boolean = true;

  constructor(
    private router: Router,
    private orderService: OrderService,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
        console.log(response);
        if (response?.user?.role !== 'admin') {
          this.router.navigate(['/login']);
        }
      },
      error: (error) => {
        console.error(error);
        this.router.navigate(['/login']);
      },
      complete: () => {
        this.isLoading = false; // Sobald abgeschlossen, lade HTML
      },
    });
  }

  loadOrders() {
    this.orderService.getAllOrders().subscribe({
      next: (response) => {
        console.log(response.orders);
        this.orders = response.orders;
      },
      error: (error) => {
        console.error(error);
      },
    });
  }

  generatePdf(
    company: string,
    shippingAddress: string,
    paymentStatus: string,
    orderDate: string,
    createdAt: string,
    fulfillmentType: string,
    name: string,
    email: string,
    orderId: string,
    totalPrice: number,
    products: {
      price: number;
      product_article_number: string;
      product_id: number;
      product_name: string;
      quantity: number;
    }[]
  ) {
    const doc = new jsPDF();

    // Titel
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Kommissionierungsschein', 14, 20);

    // Bestellinformationen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    // Bestellnummer und weitere Infos
    doc.text('Bestellnummer: ' + orderId, 14, 40);

    // Datum und Uhrzeit konvertieren
    const orderDateFormatted = new Date(orderDate).toLocaleDateString(); // Datum
    const createdAtFormatted = new Date(createdAt).toLocaleTimeString(); // Uhrzeit

    doc.text('Datum: ' + orderDateFormatted, 14, 50); // Datum
    doc.text('Erstellt um: ' + createdAtFormatted, 14, 60); // Uhrzeit
    doc.text('Kunde: ' + name, 14, 70);
    doc.text('E-Mail: ' + email, 14, 80);
    doc.text('Gesamtpreis: €' + Number(totalPrice).toFixed(2), 14, 90);
    doc.text('Lieferart: ' + fulfillmentType, 14, 100);

    // Zusätzliche Bestellinformationen
    doc.text('Firma: ' + (company ? company : 'Keine Angabe'), 14, 110);
    doc.text(
      'Lieferadresse: ' + (shippingAddress ? shippingAddress : 'Keine Angabe'),
      14,
      120
    );
    doc.text('Zahlstatus: ' + paymentStatus, 14, 130);

    // Trennlinie
    doc.line(14, 135, 200, 135);

    // Artikelüberschrift
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Artikelnummer', 14, 145);
    doc.text('Artikel', 60, 145);
    doc.text('Menge', 120, 145);
    doc.text('Preis', 160, 145);

    // Artikel und Mengen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let yPosition = 155;
    products.forEach((product) => {
      doc.text(product.product_article_number, 14, yPosition); // Artikelnummer
      doc.text(product.product_name, 60, yPosition); // Artikelname
      doc.text(String(product.quantity), 120, yPosition); // Menge
      doc.text('€' + product.price, 160, yPosition); // Preis
      yPosition += 10; // Abstand zwischen den Zeilen
    });

    // Gesamtbetrag unten
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamtbetrag: €' + Number(totalPrice).toFixed(2), 14, yPosition + 10);

    // PDF-Dokument öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  generateSelectedPdf() {
    const doc = new jsPDF();

    this.orders.forEach((order, index) => {
      if (index !== 0) doc.addPage(); // Neue Seite für jede Bestellung (außer der ersten)

      // Titel
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Kommissionierungsschein', 14, 20);

      // Bestellinformationen
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');

      // Bestellnummer und weitere Infos
      const orderDateFormatted = new Date(
        order.order_date
      ).toLocaleDateString(); // Datum
      const createdAtFormatted = new Date(
        order.created_at
      ).toLocaleTimeString(); // Uhrzeit

      doc.text('Bestellnummer: ' + order.order_id, 14, 40);
      doc.text('Datum: ' + orderDateFormatted, 14, 50); // Datum
      doc.text('Erstellt um: ' + createdAtFormatted, 14, 60); // Uhrzeit

      // Firma (optional)
      doc.text(
        'Firma: ' + (order.company ? order.company : 'Keine Angabe'),
        14,
        70
      );
      doc.text('Kunde: ' + order.name, 14, 80);
      doc.text('E-Mail: ' + order.email, 14, 90);
      doc.text('Gesamtpreis: €' + Number(order.total_price).toFixed(2), 14, 100);
      doc.text('Lieferart: ' + order.fulfillment_type, 14, 110);
      doc.text('Zahlstatus: ' + order.payment_status, 14, 120);

      // Trennlinie
      doc.line(14, 125, 200, 125);

      // Tabellenüberschriften (fett, größere Schrift)
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Artikelnummer', 14, 135);
      doc.text('Artikel', 60, 135);
      doc.text('Menge', 120, 135);
      doc.text('Preis', 160, 135);

      // Tabelleninhalte (normaler Text)
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');

      let yPosition = 145;
      order.items.forEach((product: any) => {
        doc.text(product.product_article_number, 14, yPosition); // Artikelnummer
        doc.text(product.product_name, 60, yPosition); // Produktname
        doc.text(String(product.quantity), 120, yPosition); // Menge
        doc.text('€' + product.price, 160, yPosition); // Preis
        yPosition += 10; // Abstand zwischen den Zeilen
      });

      // Gesamtbetrag unten, größere Schriftart für den Endbetrag
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Gesamtbetrag: €' + Number(order.total_price).toFixed(2), 14, yPosition + 10);
    });

    // Öffnen des Druckdialogs
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  onUploadClick() {
    const file = this.fileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.http
        .post(
          'https://multi-mandant-ecommerce.onrender.com/api/products/upload',
          formData
        )
        .subscribe({
          next: (res) => alert('Datei erfolgreich hochgeladen!'),
          error: (err) => console.log('Fehler beim Hochladen!', err),
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onStatusChange(event: Event, order: any) {
    const newStatus = (event.target as HTMLSelectElement).value;
    if (newStatus == 'open') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus )
      return;
    }
    // Wenn der Status auf "In Bearbeitung" geändert wird
    if (newStatus == 'in_progress') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus )
      return;
    }
    // Wenn der Status auf "Fertig" geändert wird, öffne das Modal
    if (newStatus === 'completed') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.showModal = true;
    }
  }

  updateOrderStatus(order: any, status: string) {
    order.status = status;
    console.log(`Bestellung ${order.order_id} hat jetzt den Status: ${status}`);

    // Hier wird die API zur Statusaktualisierung aufgerufen
    this.orderService
      .updateStatus(order.order_id, status, localStorage.getItem('token'))
      .subscribe({
        next: (response) => {
          console.log(response);
          this.loadOrders();
        },
        error: (error) => {
          console.error('Fehler beim Aktualisieren des Status:', error);
          alert(
            'Fehler beim Aktualisieren des Status. Bitte versuche es später erneut.'
          );
        },
      });
  }

  confirmCompletion() {
    if (this.selectedOrder && this.newStatus === 'completed') {
      this.updateOrderStatus(this.selectedOrder, this.newStatus);
    }
    this.showModal = false;
    this.selectedOrder = null;
  }

  cancelCompletion() {
    if (this.selectedOrder) {
      this.selectedOrder.status = 'in_progress';
    }
    this.showModal = false;
    this.selectedOrder = null;
  }
}
