import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-customer-order-public',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-order-public.component.html',
  styleUrl: './customer-order-public.component.scss'
})
export class CustomerOrderPublicComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);

  customerNumber: string = '';
  customer: any = null;
  customerArticlePrices: any[] = [];
  isLoading: boolean = true;
  error: string = '';
  isSubmitting: boolean = false;
  successMessage: string = '';
  showOrderModal: boolean = false;

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.customerNumber = params['customerNumber'];
      this.loadCustomerData();
    });
  }

  loadCustomerData() {
    this.isLoading = true;
    console.log('🔍 [PUBLIC-ORDER] Starte Laden der Kundendaten für Nummer:', this.customerNumber);
    
    // Neuer Endpoint: Kundendaten + Artikel mit Preisen in einem Call
    const apiUrl = 'https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/customer-without-auth';
    const requestBody = { customerNumber: this.customerNumber };
    
    console.log('🔍 [PUBLIC-ORDER] Lade Daten von:', apiUrl, 'mit Body:', requestBody);
    
    this.http.post(apiUrl, requestBody).subscribe({
        next: (data: any) => {
          console.log('🔍 [PUBLIC-ORDER] API Response erhalten:', data);
          
          // Extrahiere Artikel (der Endpoint gibt ein Array von Artikeln zurück)
          if (Array.isArray(data)) {
            this.customerArticlePrices = data.filter((price: any) => {
              return price.article_text && price.unit_price_net;
            }).map((price: any) => ({
              ...price,
              tempQuantity: null  // Initialisiere tempQuantity mit null
            }));
            
            // Erstelle einen minimalen Kunden mit der Kundennummer aus dem ersten Artikel
            if (this.customerArticlePrices.length > 0) {
              const firstArticle = this.customerArticlePrices[0];
              this.customer = {
                id: 0,
                customer_number: firstArticle.customer_id,
                last_name_company: `Kunde ${firstArticle.customer_id}`,
                name_addition: '',
                email: '',
                street: '',
                city: '',
                postal_code: '',
                _country_code: ''
              };
            } else {
              // Fallback wenn keine Artikel vorhanden
              this.customer = {
                id: 0,
                customer_number: this.customerNumber,
                last_name_company: `Kunde ${this.customerNumber}`,
                name_addition: '',
                email: '',
                street: '',
                city: '',
                postal_code: '',
                _country_code: ''
              };
            }
            
            console.log('🔍 [PUBLIC-ORDER] Kunde erstellt:', this.customer);
            console.log('🔍 [PUBLIC-ORDER] Artikel geladen:', this.customerArticlePrices.length);
          } else {
            this.error = 'Ungültige API-Response: Artikel fehlen';
          }
          
          this.isLoading = false;
        },
        error: (error: any) => {
          console.error('❌ [PUBLIC-ORDER] Fehler beim Laden der Daten:', error);
          console.error('❌ [PUBLIC-ORDER] Fehler Details:', error?.message, error?.status, error?.statusText);
          
          if (error?.status === 404) {
            this.error = `Kunde mit Nummer ${this.customerNumber} nicht gefunden.`;
          } else if (error?.status === 400) {
            this.error = 'Ungültige Anfrage. Bitte überprüfen Sie die Kundennummer.';
          } else if (error?.status === 500) {
            this.error = 'Server-Fehler. Bitte versuchen Sie es später erneut.';
          } else {
            this.error = `Fehler beim Laden der Daten: ${error?.message || 'Unbekannter Fehler'}`;
          }
          
          this.isLoading = false;
        }
      });
  }

  submitOrder() {
    // Sammle alle Artikel mit Mengen > 0
    const itemsWithQuantity = this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .map(article => ({
        product_id: article.product_id,
        article_text: article.article_text,
        article_number: article.article_number,
        quantity: Number(article.tempQuantity),
        unit_price: Number(article.unit_price_net) || 0,
        total_price: (Number(article.unit_price_net) || 0) * Number(article.tempQuantity)
      }));

    if (itemsWithQuantity.length === 0) {
      alert('Bitte geben Sie mindestens eine Menge für einen Artikel ein.');
      return;
    }

    this.isSubmitting = true;
    
    const orderData = {
      customer_number: this.customer.customer_number,
      customer_street: this.customer.street || '',
      customer_country_code: this.customer._country_code || 'DE',
      customer_postal_code: this.customer.postal_code || '',
      customer_city: this.customer.city || '',
      different_company_name: this.customer.last_name_company || '',
      status: 'open',
      customer_notes: '',
      shipping_address: '',
      fulfillment_type: 'delivery',
      total_price: itemsWithQuantity.reduce((total, item) => total + item.total_price, 0),
      delivery_date: new Date().toISOString().split('T')[0] // Heute als Standard
    };

    const completeOrder = {
      orderData: orderData,
      orderItems: itemsWithQuantity.map(item => ({
        id: item.product_id,
        quantity: item.quantity,
        sale_price: item.unit_price,
        description: item.article_text
      }))
    };

    // Verwende den neuen Endpoint ohne Auth
    this.http.post('https://multi-mandant-ecommerce.onrender.com/api/orders/without-auth', completeOrder).subscribe({
      next: (response: any) => {
        this.successMessage = 'Bestellung erfolgreich eingereicht! Vielen Dank für Ihre Bestellung.';
        
        // Alle Mengen zurücksetzen
        this.customerArticlePrices.forEach(article => {
          article.tempQuantity = null;
        });
        
        this.isSubmitting = false;
        
        // Nach 3 Sekunden zur Bestätigungsseite weiterleiten
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 3000);
      },
      error: (error: any) => {
        console.error('Fehler beim Absenden der Bestellung:', error);
        alert('Fehler beim Absenden der Bestellung. Bitte versuchen Sie es erneut.');
        this.isSubmitting = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  // Modal-Methoden
  showOrderConfirmation() {
    this.showOrderModal = true;
  }

  closeOrderModal() {
    this.showOrderModal = false;
  }

  confirmAndSubmitOrder() {
    this.closeOrderModal();
    this.submitOrder();
  }

  getOrderItems() {
    return this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .map(article => ({
        product_id: article.product_id,
        article_text: article.article_text,
        article_number: article.article_number,
        quantity: Number(article.tempQuantity),
        unit_price: Number(article.unit_price_net) || 0,
        total_price: (Number(article.unit_price_net) || 0) * Number(article.tempQuantity),
        invoice_date: article.invoice_date
      }));
  }

  // Plus-Button: Menge erhöhen
  increaseQuantity(article: any) {
    if (!article.tempQuantity || article.tempQuantity <= 0) {
      article.tempQuantity = 1;
    } else {
      article.tempQuantity = Number(article.tempQuantity) + 1;
    }
  }

  // Minus-Button: Menge verringern
  decreaseQuantity(article: any) {
    if (article.tempQuantity && article.tempQuantity > 0) {
      article.tempQuantity = Number(article.tempQuantity) - 1;
    } else {
      article.tempQuantity = null;
    }
  }

  getOrderTotal(): number {
    return this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .reduce((total, article) => {
        const quantity = Number(article.tempQuantity) || 0;
        const price = Number(article.unit_price_net) || 0;
        return total + (price * quantity);
      }, 0);
  }

  // Hilfsmethode zum Konvertieren von Strings zu Zahlen
  toNumber(value: any): number {
    return Number(value) || 0;
  }

  // Prüft, ob mindestens ein Artikel eine Menge hat
  hasAnyQuantity(): boolean {
    return this.customerArticlePrices.some(article => 
      article.tempQuantity && article.tempQuantity > 0
    );
  }
}
