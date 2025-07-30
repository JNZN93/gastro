import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { OrderService } from '../order.service';
import { jsPDF } from 'jspdf';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { UploadLoadingComponent } from "../upload-loading/upload-loading.component";

@Component({
  selector: 'app-admin',
  imports: [RouterModule, CommonModule, FormsModule, UploadLoadingComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  @ViewChild('customerFileInput') customerFileInput!: ElementRef;
  @ViewChild('customerArticlePricesFileInput') customerArticlePricesFileInput!: ElementRef;
  @ViewChild('articlesFileInput') articlesFileInput!: ElementRef;
  orders: any[] = [];
  xmlContent: any;
  showModal = false;
  showUploadModal = false;
  selectedOrder: any = null;
  newStatus: string = '';
  isLoading: boolean = true;
  isVisible: boolean = true;
  isUploading: boolean = false;
  searchTerm: string = '';
  
  // Properties für ausgewählte Dateien
  selectedCustomerFile: string = '';
  selectedCustomerArticlePricesFile: string = '';
  selectedArticlesFile: string = '';

  constructor(
    private router: Router,
    private orderService: OrderService,
    private http: HttpClient,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.checkUserRole();
    this.loadOrders();
    setInterval(() => {
      this.loadOrders();
    }, 1000 * 60)
  }

  // Getter für gefilterte Bestellungen
  get filteredOrders() {
    if (!this.searchTerm) {
      return this.orders;
    }
    return this.orders.filter(order => 
      order.order_id?.toString().includes(this.searchTerm) ||
      order.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.company?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      order.email?.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  // Methoden für Side-Modal
  toggleUploadModal() {
    this.showUploadModal = !this.showUploadModal;
  }

  closeUploadModal() {
    this.showUploadModal = false;
  }

  // Methoden für Status-Filterung
  getOrdersByStatus(status: string) {
    return this.orders.filter(order => order.status === status);
  }

  checkUserRole() {
    this.authService.checkToken(localStorage.getItem('token')).subscribe({
      next: (response) => {
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
    delivery_date: string,
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
    doc.text('Lieferart: ' + (fulfillmentType == 'delivery' ? 'Lieferung' : 'Abholung'), 14, 100);

    // Zusätzliche Bestellinformationen
    doc.text('Firma: ' + (company ? company : 'Keine Angabe'), 14, 110);
    doc.text(
      'Lieferadresse: ' + (shippingAddress ? shippingAddress : 'Keine Angabe'),
      14,
      120
    );
    doc.text('Liefer-/ Abholdatum ' + this.formatDate(delivery_date), 14, 130);

    // Trennlinie
    doc.line(14, 135, 200, 135);

    // Artikelüberschrift
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Menge', 14, 145);
    doc.text('Artikel', 40, 145);
    doc.text('Artikelnr.', 160, 145);

    // Artikel und Mengen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let yPosition = 155;
    const lineHeight = 10;
    const pageHeight = 297; // A4 in mm
    const bottomMargin = 20;

    products.forEach((product, index) => {
  // Wenn yPosition zu weit unten ist, neue Seite
  if (yPosition + lineHeight > pageHeight - bottomMargin) {
    doc.addPage();
    doc.text('Bestellnummer: ' + orderId, 14, 40);
    yPosition = 60;

    // Tabellenüberschrift auf neuer Seite wiederholen (optional)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Menge', 14, yPosition);
    doc.text('Artikel', 40, yPosition);
    doc.text('Artikelnr.', 160, yPosition);
    yPosition += 10;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
  }

  // Artikeldaten
  doc.text(String(product.quantity), 14, yPosition);
  doc.text(product.product_name, 40, yPosition);
  doc.text(product.product_article_number, 160, yPosition);

  yPosition += lineHeight;
});

    // Gesamtbetrag unten
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');

    // PDF-Dokument öffnen
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }


  
formatDate(dateString: string): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');   // TT
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // MM (0-basiert)
  const year = date.getFullYear(); // JJJJ

  return `${day}.${month}.${year}`;
}



  // Event-Handler für Dateiauswahl
  onCustomerFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedCustomerFile = file.name;
    } else {
      this.selectedCustomerFile = '';
    }
  }

  onCustomerArticlePricesFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedCustomerArticlePricesFile = file.name;
    } else {
      this.selectedCustomerArticlePricesFile = '';
    }
  }

  onArticlesFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedArticlesFile = file.name;
    } else {
      this.selectedArticlesFile = '';
    }
  }

  onCustomerUploadClick() {
    const file = this.customerFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          'https://multi-mandant-ecommerce.onrender.com/api/customers/upload',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Kundendatei erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Kundendatei. Bitte versuchen Sie es erneut.');
          },
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onCustomerArticlePricesUploadClick() {
    const file = this.customerArticlePricesFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          'https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/upload',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Kunden Artikel Preise erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Kunden Artikel Preise. Bitte versuchen Sie es erneut.');
          },
        });
    } else {
      alert('Bitte eine gültige XML-Datei hochladen.');
    }
  }

  onArticlesUploadClick() {
    const file = this.articlesFileInput.nativeElement.files[0];

    if (file && file.type === 'text/xml') {
      const formData = new FormData();
      formData.append('file', file);

      this.isUploading = true;

      // Token aus dem localStorage holen
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Kein gültiger Token gefunden. Bitte melden Sie sich erneut an.');
        this.isUploading = false;
        return;
      }

      this.http
        .post(
          'https://multi-mandant-ecommerce.onrender.com/api/products/upload',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
        .subscribe({
          next: (res) => {
            alert('Artikeldaten erfolgreich hochgeladen!'),
              this.isUploading = false; // Upload-Loading ausblenden
            this.isVisible = false; // Upload-Komponente ausblenden
          },
          error: (err) => {
            console.log('Fehler beim Hochladen!', err),
              this.isUploading = false;
            alert('Fehler beim Hochladen der Artikeldaten. Bitte versuchen Sie es erneut.');
          },
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
      this.updateOrderStatus(this.selectedOrder, newStatus)
      return;
    }
    // Wenn der Status auf "In Bearbeitung" geändert wird
    if (newStatus == 'in_progress') {
      this.selectedOrder = order;
      this.newStatus = newStatus;
      this.updateOrderStatus(this.selectedOrder, newStatus)
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
      this.updateOrderStatus(this.selectedOrder, this.selectedOrder.status);
    }
    this.showModal = false;
    this.selectedOrder = null;
  }
}
