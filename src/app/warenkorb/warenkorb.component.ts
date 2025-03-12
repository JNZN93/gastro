import { Component, OnInit } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { GlobalService } from '../global.service';
import { OrderService } from '../order.service';

@Component({
  selector: 'app-warenkorb',
  imports: [],
  templateUrl: './warenkorb.component.html',
  styleUrl: './warenkorb.component.scss'
})
export class WarenkorbComponent implements OnInit {

  isVisible = false;
  orderData = {};
  isDelivery: boolean = true; // Standardmäßig auf Lieferung gesetzt

  deliveryAddress = {
    street: '',
    zip: '',
    city: ''
  };
  


  constructor(private toggleService: ToggleCartService, public globalService: GlobalService, private orderService: OrderService) { 

    this.toggleService.isVisible$.subscribe(state => {
      this.isVisible = state;
    });

  }

  ngOnInit(): void {
    this.getTotalPrice();
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
    this.globalService.orderData.total_price = this.globalService.totalPrice
    const completeOrder = {
      orderData: {
          ...this.globalService.orderData,
          fulfillment_type: this.isDelivery ? 'delivery' : 'pickup' // Hier den gewünschten Wert setzen TOGGLE
      },
      orderItems: this.globalService.warenkorb
  };
    const getToken = localStorage.getItem("token");

    this.orderService.placeOrder(completeOrder, getToken).subscribe({
      next: (response) => {
        console.log('Bestellung erfolgreich:', response);
        alert('Bestellung erfolgreich abgesendet!');
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
  }

  removeItem(artikel: any) {
    // Warenkorb im GlobalService aktualisieren
    this.globalService.warenkorb = this.globalService.warenkorb.filter(
      item => item.article_number !== artikel.article_number
    );

    // Neue Referenz setzen, damit Angular das UI aktualisiert
    this.globalService.warenkorb = [...this.globalService.warenkorb];
    console.log(this.globalService.warenkorb)
    this.getTotalPrice();
  }

  closeWarenkorb(){
    this.toggleService.toggle();
  }

}
