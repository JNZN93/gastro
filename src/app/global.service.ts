import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {
  public warenkorb: any[] = [];
  public orderData: any = {};
  public totalPrice: any = 0;
  public favoriteItems: any = [];
  public isAdmin: boolean = false;
  public selectedCustomer: any = null;

  constructor() { 
    // selectedCustomer aus localStorage laden
    const savedCustomer = localStorage.getItem('selectedCustomer');
    if (savedCustomer) {
      this.selectedCustomer = JSON.parse(savedCustomer);
    }
  }

  // Methode zum Setzen des selectedCustomer mit localStorage Persistierung
  setSelectedCustomer(customer: any) {
    this.selectedCustomer = customer;
    if (customer) {
      localStorage.setItem('selectedCustomer', JSON.stringify(customer));
    } else {
      localStorage.removeItem('selectedCustomer');
    }
  }

  // Methode zum Löschen des selectedCustomer mit localStorage Bereinigung
  clearSelectedCustomer() {
    this.selectedCustomer = null;
    localStorage.removeItem('selectedCustomer');
  }
}
