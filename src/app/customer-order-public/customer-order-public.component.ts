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

  customerId: string = '';
  customer: any = null;
  customerArticlePrices: any[] = [];
  orderItems: any[] = [];
  isLoading: boolean = true;
  error: string = '';
  isSubmitting: boolean = false;
  successMessage: string = '';

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.customerId = params['customerId'];
      this.loadCustomerData();
    });
  }

  async loadCustomerData() {
    try {
      this.isLoading = true;
      
      // Lade Kundendaten
      const customerResponse = await this.http.get(`https://multi-mandant-ecommerce.onrender.com/api/customers/${this.customerId}`).toPromise();
      this.customer = customerResponse;
      
      // Lade kundenspezifische Preise
      const pricesResponse = await this.http.get(`https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/${this.customerId}`).toPromise();
      let allPrices = pricesResponse as any[];
      
      // Filtere nach verfügbaren Artikeln (wie im Modal)
      this.customerArticlePrices = allPrices.filter(price => {
        return price.article_text && price.unit_price_net;
      });
      
      console.log('Geladene kundenspezifische Preise:', this.customerArticlePrices.length);
      
      this.isLoading = false;
    } catch (error) {
      console.error('Fehler beim Laden der Kundendaten:', error);
      this.error = 'Kunde nicht gefunden oder Fehler beim Laden der Daten.';
      this.isLoading = false;
    }
  }

  addToOrder(article: any) {
    if (!article.tempQuantity || article.tempQuantity <= 0) {
      alert('Bitte geben Sie eine gültige Menge ein.');
      return;
    }

    const existingItem = this.orderItems.find(item => item.product_id === article.product_id);
    
    if (existingItem) {
      existingItem.quantity += parseInt(article.tempQuantity);
      existingItem.total_price = existingItem.unit_price * existingItem.quantity;
    } else {
      this.orderItems.push({
        product_id: article.product_id,
        article_text: article.article_text,
        article_number: article.article_number,
        quantity: parseInt(article.tempQuantity),
        unit_price: article.unit_price_net,
        total_price: article.unit_price_net * parseInt(article.tempQuantity)
      });
    }

    // Reset temp quantity
    article.tempQuantity = '';
  }

  removeFromOrder(index: number) {
    this.orderItems.splice(index, 1);
  }

  updateQuantity(index: number, event: any) {
    const newQuantity = parseInt(event.target?.value || '0');
    if (newQuantity <= 0) {
      this.removeFromOrder(index);
    } else {
      this.orderItems[index].quantity = newQuantity;
      this.orderItems[index].total_price = this.orderItems[index].unit_price * newQuantity;
    }
  }

  getOrderTotal(): number {
    return this.orderItems.reduce((total, item) => total + item.total_price, 0);
  }

  async submitOrder() {
    if (this.orderItems.length === 0) {
      alert('Bitte fügen Sie Artikel zur Bestellung hinzu.');
      return;
    }

    this.isSubmitting = true;

    try {
      const orderData = {
        customer_id: this.customer.id,
        customer_number: this.customer.customer_number,
        customer_name: this.customer.last_name_company,
        customer_addition: this.customer.name_addition,
        customer_email: this.customer.email,
        status: 'pending',
        total_price: this.getOrderTotal(),
        created_at: new Date().toISOString(),
        source: 'qr_code_public'
      };

      const completeOrder = {
        orderData: orderData,
        orderItems: this.orderItems.map(item => ({
          product_id: item.product_id,
          article_text: item.article_text,
          article_number: item.article_number,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          description: item.article_text
        }))
      };

      // Verwende die bestehende API-Endpoint
      const response = await this.http.post('https://multi-mandant-ecommerce.onrender.com/api/orders', completeOrder).toPromise();
      
      this.successMessage = 'Bestellung erfolgreich eingereicht! Vielen Dank für Ihre Bestellung.';
      this.orderItems = [];
      
      // Nach 3 Sekunden zur Bestätigungsseite weiterleiten
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 3000);

    } catch (error) {
      console.error('Fehler beim Absenden der Bestellung:', error);
      alert('Fehler beim Absenden der Bestellung. Bitte versuchen Sie es erneut.');
    } finally {
      this.isSubmitting = false;
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
