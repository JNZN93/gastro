import { Injectable } from '@angular/core';
import { AuthService } from './authentication.service';
import { ToggleCartService } from './toggle-cart.service';
import { FavoritesService } from './favorites.service';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {
  public warenkorb: any[] = [];
  public orderData: any = {};
  public totalPrice: any = 0;
  public favoriteItems: any[] = [];
  public isAdmin: boolean = false;
  public userRole: string = '';
  public userName: string = '';
  public isUserLoggedIn: boolean = false;
  
  // Separate Variablen für verschiedene Komponenten
  public selectedCustomer: any = null; // Für employees component
  public selectedCustomerForOrders: any = null; // Für customer-orders component
  
  // Global verfügbares Array für PFAND-Artikel (statisch, wird nur einmal geladen)
  public pfandArtikels: any[] = [];

  constructor(
    private authService: AuthService, 
    private toggleService: ToggleCartService,
    private favoritesService: FavoritesService
  ) { 
    // Beim Start der Anwendung Token-Validierung durchführen
    this.validateTokenOnStart();
  }

  // ===== TOKEN VALIDATION METHODS =====
  // Methode zur Token-Validierung beim Start der Anwendung
  private validateTokenOnStart() {
    const token = localStorage.getItem('token');
    
    if (token) {
      console.log('🔄 [GLOBAL-VALIDATE] Token gefunden, validiere...');
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          console.log('🔄 [GLOBAL-VALIDATE] Token gültig:', response);
          this.isUserLoggedIn = true;
          this.userRole = response.user.role;
          this.userName = response.user.name || response.user.email || 'Benutzer';
          console.log('🔄 [GLOBAL-VALIDATE] Login-Status gesetzt:', this.isUserLoggedIn, 'Rolle:', this.userRole, 'Name:', this.userName);
          
          // Favoriten beim Token-Validierung laden
          this.onUserLogin();
        },
        error: (error) => {
          console.error('🔄 [GLOBAL-VALIDATE] Token ungültig:', error);
          this.clearLoginData();
        }
      });
    } else {
      console.log('🔄 [GLOBAL-VALIDATE] Kein Token gefunden');
      this.clearLoginData();
    }
  }

  // Methode zum Löschen aller Login-Daten
  private clearLoginData() {
    this.isUserLoggedIn = false;
    this.userRole = '';
    this.userName = '';
    localStorage.removeItem('token');
    console.log('🔄 [GLOBAL-CLEAR] Login-Daten gelöscht');
  }

  // Öffentliche Methode zur manuellen Token-Validierung
  public validateToken() {
    this.validateTokenOnStart();
  }

  // ===== USER ROLE METHODS =====
  // Methode zum Setzen der Benutzerrolle
  setUserRole(role: string) {
    this.userRole = role;
    console.log('🔄 [GLOBAL-ROLE] Benutzerrolle gesetzt:', role);
  }

  // Methode zum Setzen des Benutzernamens
  setUserName(name: string) {
    this.userName = name;
    console.log('🔄 [GLOBAL-USERNAME] Benutzername gesetzt:', name);
  }

  // Methode zum Setzen des Login-Status
  setUserLoggedIn(isLoggedIn: boolean) {
    this.isUserLoggedIn = isLoggedIn;
    console.log('🔄 [GLOBAL-LOGIN] Login-Status gesetzt:', isLoggedIn);
  }

  // Methode zum Abrufen der Benutzerrolle
  getUserRole(): string {
    return this.userRole;
  }

  // Methode zum Abrufen des Benutzernamens
  getUserName(): string {
    return this.userName;
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

  // ===== WARENKORB METHODS =====
  public isWarenkorbVisible: boolean = false;

  toggleWarenkorb(): void {
    this.toggleService.toggle(); // Use the same service as header
  }

  // ===== FAVORITES METHODS =====
  
  // Favoriten laden
  loadFavorites(): void {
    if (this.isUserLoggedIn) {
      this.favoritesService.getFavorites().subscribe({
        next: (favorites) => {
          this.favoriteItems = favorites;
          console.log('🔄 [GLOBAL-FAVORITES] Favoriten geladen:', favorites.length);
        },
        error: (error) => {
          console.error('🔄 [GLOBAL-FAVORITES] Fehler beim Laden der Favoriten:', error);
          this.favoriteItems = [];
        }
      });
    } else {
      this.favoriteItems = [];
    }
  }

  // Favorit hinzufügen
  addFavorite(productId: number): void {
    if (this.isUserLoggedIn) {
      // Sofort lokal hinzufügen für bessere UX
      if (!this.isFavorite(productId)) {
        // Temporärer Eintrag hinzufügen
        this.favoriteItems.push({ product_id: productId, id: Date.now() });
      }
      
      this.favoritesService.addFavorite(productId).subscribe({
        next: (response) => {
          console.log('🔄 [GLOBAL-FAVORITES] Favorit hinzugefügt:', response);
          // Favoriten neu laden um sicherzustellen, dass alles synchron ist
          this.loadFavorites();
        },
        error: (error) => {
          console.error('🔄 [GLOBAL-FAVORITES] Fehler beim Hinzufügen des Favoriten:', error);
          // Bei Fehler den temporären Eintrag wieder entfernen
          this.favoriteItems = this.favoriteItems.filter(fav => fav.product_id !== productId);
        }
      });
    }
  }

  // Favorit entfernen
  removeFavorite(productId: number): void {
    if (this.isUserLoggedIn) {
      // Sofort lokal entfernen für bessere UX
      this.favoriteItems = this.favoriteItems.filter(fav => fav.product_id !== productId);
      
      this.favoritesService.removeFavorite(productId).subscribe({
        next: (response) => {
          console.log('🔄 [GLOBAL-FAVORITES] Favorit entfernt:', response);
          // Favoriten neu laden um sicherzustellen, dass alles synchron ist
          this.loadFavorites();
        },
        error: (error) => {
          console.error('🔄 [GLOBAL-FAVORITES] Fehler beim Entfernen des Favoriten:', error);
          // Bei Fehler den Eintrag wieder hinzufügen
          this.loadFavorites();
        }
      });
    }
  }

  // Prüfen ob ein Produkt favorisiert ist
  isFavorite(productId: number): boolean {
    return this.favoriteItems.some((fav: any) => fav.product_id === productId);
  }

  // Favoriten beim Login laden
  onUserLogin(): void {
    this.loadFavorites();
  }

  // Favoriten beim Logout leeren
  onUserLogout(): void {
    this.favoriteItems = [];
  }
}
