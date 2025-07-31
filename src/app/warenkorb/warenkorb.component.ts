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
    // Berechne den Gesamtpreis beim Initialisieren
    this.getTotalPrice();
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
    
    const completeOrder = {
      orderData: {
          ...this.globalService.orderData,
          ...customerData,
          shipping_address: newAddress ? newAddress : '',
          fulfillment_type: this.isDelivery ? 'delivery' : 'pickup', // Hier den gewünschten Wert setzen TOGGLE
          delivery_date: this.delivery_date,
          customer_notes: this.customer_notes
      },
      orderItems: this.globalService.warenkorb
  };
    const getToken = localStorage.getItem("token");

    this.orderService.placeOrder(completeOrder, getToken).subscribe({
      next: (response) => {
        this.showOrderCompletedDialog();
        // Warenkorb leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
        // Ausgewählten Kunden löschen
        this.globalService.clearSelectedCustomer();
      },
      error: (error) => {
        this.showOrderErrorDialog();
        // Ausgewählten Kunden auch bei Fehler löschen
        this.globalService.clearSelectedCustomer();
      },
      complete: () => {
        this.isVisible = false; // Warenkorb schließen nach Abschluss
      }
    });
  }

  getTotalPrice() {
    this.globalService.totalPrice = this.globalService.warenkorb.reduce((summe, artikel) => {
      // Verwende different_price wenn ein Kunde ausgewählt ist und different_price vorhanden ist
      const itemPrice = (this.globalService.selectedCustomer && artikel.different_price !== undefined) 
        ? artikel.different_price 
        : artikel.sale_price;
      return summe + (itemPrice * parseInt(artikel.quantity));
    }, 0);
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

  clearCart() {
    // Bestätigungsdialog anzeigen
    const dialogRef = this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Warenkorb leeren',
        message: 'Möchtest du wirklich den gesamten Warenkorb leeren? Diese Aktion kann nicht rückgängig gemacht werden.',
        isConfirmation: true,
        confirmLabel: 'Ja, leeren',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '400px',
      minWidth: '300px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        // Warenkorb komplett leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
        
        // Ausgewählten Kunden löschen
        this.globalService.clearSelectedCustomer();
      }
    });
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
