import { Component, OnInit } from '@angular/core';
import { ToggleCartService } from '../toggle-cart.service';
import { GlobalService } from '../global.service';
import { OrderService } from '../order.service';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';
import { environment } from '../../environments/environment';

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
  
  // Lokaler Bestätigungsdialog
  // showClearConfirmation: boolean = false;
  // showOrderConfirmation: boolean = false;
  // showRemoveItemConfirmation: boolean = false;
  // itemToRemove: any = null;

  

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
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Bestellung bestätigen',
        message: 'Möchten Sie die Bestellung abschließen?',
        isConfirmation: true,
        confirmLabel: 'Bestellen',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '400px',
      minWidth: '300px',
    }).afterClosed().subscribe(result => {
      if (result) {
        this.confirmOrder();
      }
    });
  }

  confirmOrder() {
    this.getTotalPrice();
    
    // PFAND-Artikel automatisch hinzufügen BEVOR die Bestellung abgesendet wird
    this.addPfandArticlesToOrder();
    
    const newAddress = this.city + '$' + this.zipCode + '$' + this.street;
    // save address for next orders
    localStorage.setItem('city', this.city ? this.city : '')
    localStorage.setItem('zipcode', this.zipCode ? this.zipCode : '')
    localStorage.setItem('street', this.street ? this.street : '')

    this.globalService.orderData.total_price = this.globalService.totalPrice
    
    // Ensure description is set for all items (wie in Customer Orders)
    this.globalService.warenkorb.forEach(item => {
      if (!item.description && item.article_text) {
        item.description = item.article_text;
      }
    });
    
    // Kundendaten hinzufügen, falls ein Kunde ausgewählt wurde
    let customerData: any = {};
    if (this.globalService.selectedCustomer) {
      customerData = {
        customer_id: this.globalService.selectedCustomer.id,
        customer_number: this.globalService.selectedCustomer.customer_number,
        customer_name: this.globalService.selectedCustomer.last_name_company,
        customer_addition: this.globalService.selectedCustomer.name_addition,
        customer_city: this.globalService.selectedCustomer.city,
        customer_email: this.globalService.selectedCustomer.email,
        different_company_name: this.globalService.selectedCustomer.last_name_company || ''
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

    // 🔍 PAYLOAD LOGGING - Bestellung wird abgesendet
    console.log('🚀 [WARENKORB] Bestellung wird abgesendet:');
    console.log('📋 [WARENKORB] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('💰 [WARENKORB] Gesamtpreis:', completeOrder.orderData.total_price);
    console.log('📦 [WARENKORB] Anzahl Artikel:', completeOrder.orderItems.length);
    console.log('👤 [WARENKORB] Kunde:', customerData.customer_id ? `ID: ${customerData.customer_id}` : 'Kein Kunde ausgewählt');
    console.log('📅 [WARENKORB] Lieferdatum:', completeOrder.orderData.delivery_date);
    console.log('📍 [WARENKORB] Lieferart:', completeOrder.orderData.fulfillment_type);
    console.log('🏠 [WARENKORB] Lieferadresse:', completeOrder.orderData.shipping_address);
    console.log('📝 [WARENKORB] Anmerkungen:', completeOrder.orderData.customer_notes);
    console.log('🔑 [WARENKORB] Token vorhanden:', !!getToken);
    console.log('🌐 [WARENKORB] Endpoint:', '${environment.apiUrl}/api/orders');

    this.orderService.placeOrder(completeOrder, getToken).subscribe({
      next: (response) => {
        console.log('✅ [WARENKORB] Bestellung erfolgreich abgesendet! Response:', response);
        this.showOrderCompletedDialog();
        // Warenkorb leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
        // Ausgewählten Kunden löschen
        this.globalService.clearSelectedCustomer();
      },
      error: (error) => {
        console.error('❌ [WARENKORB] Fehler beim Absenden der Bestellung:', error);
        console.error('❌ [WARENKORB] Fehler Details:', error?.message, error?.status, error?.statusText);
        this.showOrderErrorDialog();
        // Ausgewählten Kunden auch bei Fehler löschen
        this.globalService.clearSelectedCustomer();
      },
      complete: () => {
        this.isVisible = false; // Warenkorb schließen nach Abschluss
      }
    });
    
  }

  cancelOrder() {
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Bestellung abbrechen',
        message: 'Möchten Sie die Bestellung wirklich abbrechen?',
        buttonLabel: 'Abbrechen',
        cancelLabel: 'Zurück'
      },
      maxWidth: '400px',
      minWidth: '300px',
    }).afterClosed().subscribe(result => {
      if (result) {
        this.isVisible = false;
      }
    });
  }

  // Neue Methode: PFAND-Artikel automatisch zur Bestellung hinzufügen
  addPfandArticlesToOrder() {
    console.log('🔄 [PFAND-LOGIC] Starte PFAND-Artikel Logik...');
    
    // Hole alle PFAND-Artikel aus dem GlobalService
    const pfandArtikels = this.globalService.getPfandArtikels();
    console.log('📦 [PFAND-LOGIC] Verfügbare PFAND-Artikel:', pfandArtikels.length);
    
    if (pfandArtikels.length === 0) {
      console.log('⚠️ [PFAND-LOGIC] Keine PFAND-Artikel verfügbar');
      return;
    }
    
    // Erstelle eine Kopie des Warenkorbs für die Verarbeitung
    const warenkorbCopy = [...this.globalService.warenkorb];
    const newItems: any[] = [];
    
    // Durchlaufe alle Artikel im Warenkorb
    warenkorbCopy.forEach((artikel, index) => {
      // Prüfe, ob der Artikel ein custom_field_1 hat (PFAND-Referenz)
      if (artikel.custom_field_1) {
        console.log(`🔍 [PFAND-LOGIC] Artikel ${artikel.article_text} hat custom_field_1: ${artikel.custom_field_1}`);
        
        // Suche nach dem passenden PFAND-Artikel
        const matchingPfand = pfandArtikels.find(pfand => 
          pfand.article_number === artikel.custom_field_1
        );
        
        if (matchingPfand) {
          console.log(`✅ [PFAND-LOGIC] PFAND-Artikel gefunden: ${matchingPfand.article_text}`);
          
          // Erstelle den PFAND-Artikel mit der gleichen Menge wie der Hauptartikel
          const pfandItem = {
            ...matchingPfand,
            quantity: artikel.quantity,
            description: matchingPfand.article_text,
            parent_article_number: artikel.article_number, // Referenz zum Hauptartikel
            is_pfand: true // Markierung als PFAND-Artikel
          };
          
          // Füge den PFAND-Artikel zur Liste der neuen Artikel hinzu
          newItems.push({
            item: pfandItem,
            insertAfterIndex: index
          });
          
          console.log(`➕ [PFAND-LOGIC] PFAND-Artikel wird hinzugefügt: ${pfandItem.article_text}, Menge: ${pfandItem.quantity}`);
        } else {
          console.log(`❌ [PFAND-LOGIC] Kein passender PFAND-Artikel gefunden für custom_field_1: ${artikel.custom_field_1}`);
        }
      } else {
        console.log(`ℹ️ [PFAND-LOGIC] Artikel ${artikel.article_text} hat kein custom_field_1`);
      }
    });
    
    // Füge alle PFAND-Artikel in umgekehrter Reihenfolge hinzu (damit die Indizes stimmen)
    newItems.reverse().forEach(({ item, insertAfterIndex }) => {
      this.globalService.warenkorb.splice(insertAfterIndex + 1, 0, item);
    });
    
    console.log(`🎯 [PFAND-LOGIC] PFAND-Logik abgeschlossen. ${newItems.length} PFAND-Artikel hinzugefügt.`);
    console.log(`📋 [PFAND-LOGIC] Neuer Warenkorb:`, this.globalService.warenkorb);
    
    // Aktualisiere den Warenkorb im localStorage
    localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
    
    // Aktualisiere den Gesamtpreis
    this.getTotalPrice();
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
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Artikel entfernen',
        message: `Möchten Sie das Artikel "${artikel.article_text}" wirklich aus dem Warenkorb entfernen?`,
        isConfirmation: true,
        confirmLabel: 'Entfernen',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '400px',
      minWidth: '300px',
    }).afterClosed().subscribe(result => {
      if (result) {
        // Warenkorb im GlobalService aktualisieren
        this.globalService.warenkorb = this.globalService.warenkorb.filter(
          item => item.article_number !== artikel.article_number
        );

        // Neue Referenz setzen, damit Angular das UI aktualisiert
        this.globalService.warenkorb = [...this.globalService.warenkorb];
        this.getTotalPrice();
        localStorage.setItem('warenkorb', JSON.stringify(this.globalService.warenkorb));
        
        // Modal schließen und Referenz löschen
      }
    });
  }

  confirmRemoveItem() {
    // Diese Methode wird nicht mehr benötigt
  }

  cancelRemoveItem() {
    // Diese Methode wird nicht mehr benötigt
  }

  clearCart() {
    this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Warenkorb leeren',
        message: 'Möchten Sie den gesamten Warenkorb wirklich leeren?',
        isConfirmation: true,
        confirmLabel: 'Leeren',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '400px',
      minWidth: '300px',
    }).afterClosed().subscribe(result => {
      if (result) {
        // Warenkorb komplett leeren
        this.globalService.warenkorb = [];
        this.globalService.totalPrice = 0;
        localStorage.removeItem('warenkorb');
        
        // Ausgewählten Kunden löschen
        this.globalService.clearSelectedCustomer();
        
        // Dialog schließen
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
