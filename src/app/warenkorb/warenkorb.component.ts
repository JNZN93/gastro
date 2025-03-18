import { Component, OnInit } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { GlobalService } from '../global.service';
import { OrderService } from '../order.service';
import { FormsModule } from '@angular/forms';

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
  combinedValue: string = '';

  


  constructor(private toggleService: ToggleCartService, public globalService: GlobalService, private orderService: OrderService) { 

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
     console.log(this.isDelivery)
  }

  sendOrder() {
    this.getTotalPrice();
    const newAddress = this.city + '$' + this.zipCode + '$' + this.street;
    // save address for next orders
    localStorage.setItem('city', this.city ? this.city : '')
    localStorage.setItem('zipcode', this.zipCode ? this.zipCode : '')
    localStorage.setItem('street', this.street ? this.street : '')

    this.globalService.orderData.total_price = this.globalService.totalPrice
    const completeOrder = {
      orderData: {
          ...this.globalService.orderData,
          shipping_address: newAddress ? newAddress : '',
          fulfillment_type: this.isDelivery ? 'delivery' : 'pickup' // Hier den gewünschten Wert setzen TOGGLE
      },
      orderItems: this.globalService.warenkorb
  };
    const getToken = localStorage.getItem("token");

    this.orderService.placeOrder(completeOrder, getToken).subscribe({
      next: (response) => {
        console.log('Bestellung erfolgreich:', response);
        alert('Bestellung erfolgreich abgesendet!');
        // Warenkorb leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
      },
      error: (error) => {
        console.error('Fehler bei der Bestellung:', error);
        alert('Bestellung konnte nicht abgesendet werden');
      },
      complete: () => {
        this.isVisible = false; // Warenkorb schließen nach Abschluss
      }
    });
  }

  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
    console.log(this.globalService.totalPrice);
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
}
