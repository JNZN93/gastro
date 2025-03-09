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
  warenkorb: any[] = [];
  orderData = {};
  totalPrice = 0;

  constructor(private toggleService: ToggleCartService, public globalService: GlobalService, private orderService: OrderService) { 

    this.toggleService.isVisible$.subscribe(state => {
      this.isVisible = state; // Automatische Aktualisierung
    });

  }

  ngOnInit(): void {
    this.warenkorb = this.globalService.warenkorb;
    console.log(this.warenkorb);
    this.getTotalPrice();
  }

  sendOrder() {
    this.getTotalPrice();
    this.globalService.orderData.total_price = this.totalPrice;
    const completeOrder = {orderData: this.globalService.orderData, orderItems: this.globalService.warenkorb}
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
    this.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => summe + (artikel.sale_price * parseInt(artikel.quantity)), 0);
    console.log(this.totalPrice);
    
  }
}
