import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { OrderService } from '../order.service';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-admin',
  imports: [RouterModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {

  orders: any[] = [];

  constructor(private router: Router, private orderService: OrderService) {}

  ngOnInit(): void {
    this.orderService.getAllOrders().subscribe({
      next: (response) => {
        console.log(response.orders);
        
        this.orders = response.orders;
      },
      error: (error) => {
        console.error( error);
      }
    });
  }

  generatePdf(name: string, email: string, orderId: string, totalPrice: number, products: { price: number, product_article_number: string, product_id: number, product_name: string, quantity: number }[]) {
    const doc = new jsPDF();
  
    // Titel
    doc.setFontSize(18);
    doc.text('Kommissionierungsschein', 14, 20);
  
    // Bestellinformationen
    doc.setFontSize(12);
    doc.text('Bestellnummer: ' + orderId, 14, 40);
    doc.text('Datum: ' + new Date().toLocaleDateString(), 14, 50);
    doc.text('Kunde: ' + name, 14, 60);
    doc.text('E-Mail: ' + email, 14, 70);
    doc.text('Gesamtpreis: €' + totalPrice, 14, 80);
  
    // Trennlinie
    doc.line(14, 85, 200, 85);
  
    // Artikelüberschrift
    doc.text('Artikelnummer', 14, 95);
    doc.text('Artikel', 60, 95);
    doc.text('Menge', 120, 95);
    doc.text('Preis', 160, 95);
  
    // Artikel und Mengen
    let yPosition = 105;
    products.forEach(product => {
      doc.text(product.product_article_number, 14, yPosition); // Artikelnummer
      doc.text(product.product_name, 60, yPosition); // Artikelname
      doc.text(String(product.quantity), 120, yPosition); // Menge
      doc.text('€' + product.price, 160, yPosition); // Preis
      yPosition += 10; // Abstand zwischen den Zeilen
    });
  
    // Gesamtpreis unten
    doc.setFontSize(14);
    doc.text('Gesamtbetrag: €' + totalPrice, 14, yPosition + 10);
  
    // PDF-Dokument öffnen
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }
  

/*  price
: 
13
product_article_number
: 
"00apfe"
product_id
: 
8
product_name
: 
"APFEL Jonagold 10Kg"
quantity
: 
2 */

}
