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

  constructor() { }

  // Methode zum Setzen des selectedCustomer (nur im Memory)
  setSelectedCustomer(customer: any) {
    this.selectedCustomer = customer;
  }

  // Methode zum Löschen des selectedCustomer (nur im Memory)
  clearSelectedCustomer() {
    this.selectedCustomer = null;
  }
}
