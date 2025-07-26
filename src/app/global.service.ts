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
  public userRole: string = '';
  
  // Separate Variablen für verschiedene Komponenten
  public selectedCustomer: any = null; // Für employees component
  public selectedCustomerForOrders: any = null; // Für customer-orders component
  
  // Global verfügbares Array für PFAND-Artikel (statisch, wird nur einmal geladen)
  public pfandArtikels: any[] = [];

  constructor() { }

  // ===== USER ROLE METHODS =====
  // Methode zum Setzen der Benutzerrolle
  setUserRole(role: string) {
    this.userRole = role;
    console.log('🔄 [GLOBAL-ROLE] Benutzerrolle gesetzt:', role);
  }

  // Methode zum Abrufen der Benutzerrolle
  getUserRole(): string {
    return this.userRole;
  }

  // Methode zum Prüfen, ob Benutzer SCHNELLVERKAUF-Artikel sehen darf
  canViewSchnellverkauf(): boolean {
    return this.userRole === 'employee' || this.userRole === 'admin';
  }

  // ===== SCHNELLVERKAUF FILTER METHODS =====
  // Methode zum Filtern von SCHNELLVERKAUF-Artikeln basierend auf Benutzerrolle
  filterSchnellverkaufArticles(artikels: any[]): any[] {
    if (this.canViewSchnellverkauf()) {
      // Employee und Admin können alle Artikel sehen
      return artikels;
    } else {
      // Andere Benutzer können keine SCHNELLVERKAUF-Artikel sehen
      const filteredArtikels = artikels.filter(artikel => artikel.category !== 'SCHNELLVERKAUF');
      console.log('🔄 [GLOBAL-FILTER] SCHNELLVERKAUF-Artikel herausgefiltert. Ursprünglich:', artikels.length, 'Gefiltert:', filteredArtikels.length);
      return filteredArtikels;
    }
  }

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

  // ===== PFAND ARTICLES METHODS =====
  // Methode zum Setzen der PFAND-Artikel (nur für initiale Ladung)
  // Wird automatisch in customer-orders.component.ts beim ersten Laden der Artikel aufgerufen
  setPfandArtikels(artikels: any[]) {
    this.pfandArtikels = artikels.filter(artikel => artikel.category === 'PFAND');
    console.log('🔄 [GLOBAL-PFAND] PFAND-Artikel global gesetzt:', this.pfandArtikels.length);
  }

  // Methode zum Abrufen der PFAND-Artikel
  // Verwendung in anderen Komponenten: this.globalService.getPfandArtikels()
  getPfandArtikels(): any[] {
    return this.pfandArtikels;
  }

  // Methode zum Prüfen, ob PFAND-Artikel bereits geladen wurden
  // Verwendung: if (this.globalService.hasPfandArtikels()) { ... }
  hasPfandArtikels(): boolean {
    return this.pfandArtikels.length > 0;
  }
}
