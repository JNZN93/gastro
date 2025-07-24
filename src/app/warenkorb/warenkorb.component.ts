import { Component, OnInit } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { GlobalService } from '../global.service';
import { OrderService } from '../order.service';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';

@Component({
  selector: 'app-warenkorb',
  imports: [FormsModule],
  templateUrl: './warenkorb.component.html',
  styleUrl: './warenkorb.component.scss'
})
export class WarenkorbComponent implements OnInit {

  isVisible = false;
  orderData = {};
  isDelivery: boolean = true; // Standardmäßig auf Lieferung gesetzt
  street: string | null = localStorage.getItem('street') ? localStorage.getItem('street') : '';
  zipCode: string | null = localStorage.getItem('zipcode') ? localStorage.getItem('zipcode') : '';
  city: string | null= localStorage.getItem('city') ? localStorage.getItem('city') : '';
  delivery_date: string | null = '';
  customer_notes: string | null = '';
  combinedValue: string = '';

  


  constructor(private toggleService: ToggleCartService, public globalService: GlobalService, private orderService: OrderService, private dialog: MatDialog) { 

    this.toggleService.isVisible$.subscribe(state => {
      this.isVisible = state;
    });

  }

  ngOnInit(): void {
   
  }

  toggleDelivery(fulfillment_type:string) {
     if (fulfillment_type == 'pickup') {
      this.isDelivery = false;
     }
     else {
      this.isDelivery = true
     }
  }

  sendOrder() {
    this.getTotalPrice();
    const newAddress = this.city + '$' + this.zipCode + '$' + this.street;
    // save address for next orders
    localStorage.setItem('city', this.city ? this.city : '')
    localStorage.setItem('zipcode', this.zipCode ? this.zipCode : '')
    localStorage.setItem('street', this.street ? this.street : '')

    this.globalService.orderData.total_price = this.globalService.totalPrice
    
    // Kundendaten hinzufügen, falls ein Kunde ausgewählt wurde
    let customerData = {};
    if (this.globalService.selectedCustomer) {
      customerData = {
        customer_id: this.globalService.selectedCustomer.id,
        customer_number: this.globalService.selectedCustomer.customer_number,
        customer_name: this.globalService.selectedCustomer.last_name_company,
        customer_addition: this.globalService.selectedCustomer.name_addition,
        customer_city: this.globalService.selectedCustomer.city,
        customer_email: this.globalService.selectedCustomer.email
      };
    }
    
    const getToken = localStorage.getItem("token");

    // Prüfen ob ein Kunde ausgewählt wurde
    if (this.globalService.selectedCustomer) {
      // Kunden-spezifische Preise abrufen
      this.orderService.getCustomerArticlePrices(this.globalService.selectedCustomer.customer_number, getToken).subscribe({
        next: (customerPrices) => {
          // Order Items mit customer prices erweitern
          const orderItemsWithPrices = this.globalService.warenkorb.map(item => {
            // Suche nach customer price für diesen Artikel
            const customerPrice = customerPrices.find((price: any) => 
              price.product_id === item.article_number
            );
            
            if (customerPrice) {
              // Customer price gefunden - different_price hinzufügen
              return {
                ...item,
                different_price: customerPrice.unit_price_net
              };
            } else {
              // Kein customer price gefunden - normaler Artikel
              return item;
            }
          });

          this.placeOrderWithItems(orderItemsWithPrices, customerData, newAddress, getToken);
        },
        error: (error) => {
          console.error('Fehler beim Abrufen der Kundenpreise:', error);
          // Bei Fehler normal bestellen ohne customer prices
          this.placeOrderWithItems(this.globalService.warenkorb, customerData, newAddress, getToken);
        }
      });
    } else {
      // Kein Kunde ausgewählt - normal bestellen
      this.placeOrderWithItems(this.globalService.warenkorb, customerData, newAddress, getToken);
    }
  }

  private placeOrderWithItems(orderItems: any[], customerData: any, newAddress: string, token: string | null) {
    const completeOrder = {
      orderData: {
          ...this.globalService.orderData,
          ...customerData,
          shipping_address: newAddress ? newAddress : '',
          fulfillment_type: this.isDelivery ? 'delivery' : 'pickup',
          delivery_date: this.delivery_date,
          customer_notes: this.customer_notes
      },
      orderItems: orderItems
    };

    this.orderService.placeOrder(completeOrder, token).subscribe({
      next: (response) => {
        this.showOrderCompletedDialog();
        // Warenkorb leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
        // Ausgewählten Kunden löschen
        this.globalService.selectedCustomer = null;
      },
      error: (error) => {
        this.showOrderErrorDialog();
      },
      complete: () => {
        this.isVisible = false; // Warenkorb schließen nach Abschluss
      }
    });
  }

  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
  }

  reduceQuantity(artikel: any) {
    if (artikel.quantity > 1) {
        artikel.quantity--;
    } else {
        this.removeItem(artikel);
        return; // Verhindert zusätzliches UI-Update nach removeItem
    }

    this.updateWarenkorb();
  }

  increaseQuantity(artikel: any) {
    artikel.quantity++;
    this.updateWarenkorb();
  }

  updateWarenkorb() {
    // Setze eine neue Referenz, damit Angular das UI updated
    this.globalService.warenkorb = [...this.globalService.warenkorb];
    this.getTotalPrice();
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb))
  }

  
  removeItem(artikel: any) {
    // Warenkorb im GlobalService aktualisieren
    this.globalService.warenkorb = this.globalService.warenkorb.filter(
      item => item.article_number !== artikel.article_number
    );

    // Neue Referenz setzen, damit Angular das UI aktualisiert
    this.globalService.warenkorb = [...this.globalService.warenkorb];
    this.getTotalPrice();
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb))
  }

  closeWarenkorb(){
    this.toggleService.toggle();
  }

  showOrderCompletedDialog(): void {
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Bestellung abgeschlossen',
        message: 'Vielen Dank für deine Bestellung! Eine Bestellbestätigung wurde an deine E-Mail-Adresse gesendet.',
        buttonLabel: 'OK'
      },
      maxWidth: '400px',
      minWidth: '300px',
    });
    }
  
    showOrderErrorDialog() {
      this.dialog.open(MyDialogComponent, {
        data: {
          title: 'Fehler!',
          message: 'Die Bestellung konnte nicht abgesendet werden! Versuche es erneut.',
          buttonLabel: 'OK'
        },
        maxWidth: '400px',
        minWidth: '300px',
      });
    }
}
