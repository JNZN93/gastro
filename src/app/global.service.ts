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
  
  // Separate Variablen für verschiedene Komponenten
  public selectedCustomer: any = null; // Für employees component
  public selectedCustomerForOrders: any = null; // Für customer-orders component

  constructor() { }

  // ===== EMPLOYEES METHODS =====
  // Methode zum Setzen des selectedCustomer (nur im Memory)
  setSelectedCustomer(customer: any) {
    this.selectedCustomer = customer;
  }

  // Methode zum Löschen des selectedCustomer (nur im Memory)
  clearSelectedCustomer() {
    this.selectedCustomer = null;
  }

  // ===== CUSTOMER-ORDERS METHODS =====
  // Methode zum Setzen des selectedCustomerForOrders (Memory + localStorage)
  setSelectedCustomerForOrders(customer: any) {
    this.selectedCustomerForOrders = customer;
    localStorage.setItem('selectedCustomerForOrders', JSON.stringify(customer));
  }

  // Methode zum Löschen des selectedCustomerForOrders (Memory + localStorage)
  clearSelectedCustomerForOrders() {
    this.selectedCustomerForOrders = null;
    localStorage.removeItem('selectedCustomerForOrders');
  }

  // Methode zum Laden des selectedCustomerForOrders aus localStorage
  loadSelectedCustomerForOrders(): any {
    const stored = localStorage.getItem('selectedCustomerForOrders');
    if (stored) {
      this.selectedCustomerForOrders = JSON.parse(stored);
      return this.selectedCustomerForOrders;
    }
    return null;
  }

  // ===== CUSTOMER-ORDERS STORAGE METHODS =====
  // Aufträge im localStorage speichern
  saveCustomerOrders(orderItems: any[]) {
    localStorage.setItem('customerOrderItems', JSON.stringify(orderItems));
  }

  // Aufträge aus localStorage laden
  loadCustomerOrders(): any[] {
    const stored = localStorage.getItem('customerOrderItems');
    return stored ? JSON.parse(stored) : [];
  }

  // Aufträge aus localStorage löschen
  clearCustomerOrders() {
    localStorage.removeItem('customerOrderItems');
  }

  // Alle customer-orders Daten löschen (nach erfolgreicher Bestellung)
  clearAllCustomerOrdersData() {
    this.clearSelectedCustomerForOrders();
    this.clearCustomerOrders();
  }
}
