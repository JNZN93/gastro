import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { ArtikelDataService } from '../artikel-data.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../authentication.service';
import { Router, RouterModule } from '@angular/router';
import { GlobalService } from '../global.service';
import { UploadLoadingComponent } from '../upload-loading/upload-loading.component';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MyDialogComponent } from '../my-dialog/my-dialog.component';

@Component({
  selector: 'app-customer-orders',
  imports: [CommonModule, FormsModule, RouterModule, UploadLoadingComponent, ZXingScannerModule, MatDialogModule],
  templateUrl: './customer-orders.component.html',
  styleUrl: './customer-orders.component.scss',
})
export class CustomerOrdersComponent implements OnInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  @ViewChild('searchInput') searchInput!: any;
  @ViewChild('articlesDropdown') articlesDropdown!: any;
  private artikelService = inject(ArtikelDataService);
  artikelData: any[] = [];
  orderItems: any[] = [];
  searchTerm: string = '';
  globalArtikels: any[] = [];
  filteredArtikels: any[] = [];
  customerArticlePrices: any[] = []; // Neue Property für Kunden-Artikel-Preise
  pendingCustomerForPriceUpdate: any = null; // Temporärer Kunde für Preis-Updates nach dem Laden der Artikel
  isVisible: boolean = true;
  isScanning = false;
  
  // Neue Properties für Dropdown-Navigation
  selectedIndex: number = -1;
  showDropdown: boolean = false;
  
  // Customer modal properties
  isCustomerModalOpen: boolean = false;
  customers: any[] = [];
  filteredCustomers: any[] = [];
  customerSearchTerm: string = '';
  isLoadingCustomers: boolean = false;
  
  // Article prices modal properties
  isArticlePricesModalOpen: boolean = false;
  articlePricesSearchTerm: string = '';
  filteredArticlePrices: any[] = [];
  
  // Edit mode properties
  editingItemIndex: number = -1;
  editingItemQuantity: number = 1;
  
  // Article name editing properties
  editingArticleNameIndex: number = -1;
  editingArticleName: string = '';
  
  availableDevices: MediaDeviceInfo[] = [];
  selectedDevice?: MediaDeviceInfo;
  formatsEnabled: BarcodeFormat[] = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF
  ];

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: "environment" }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    public globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    // Schließe das Dropdown, wenn außerhalb geklickt wird
    const target = event.target as HTMLElement;
    if (!target.closest('.search-input-wrapper') && !target.closest('.articles-dropdown')) {
      this.hideDropdown();
    }
  }

  ngOnInit(): void {
    // Footer verstecken
    this.hideFooter();
    
    this.loadCustomers();
    
    // Lade gespeicherte Daten aus localStorage
    this.loadStoredData();
    
    const token = localStorage.getItem('token');
    
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      this.selectedDevice = preferredCam || videoDevices[0];
    });

    if (token) {
      this.authService.checkToken(token).subscribe({
        next: (response) => {
          // Benutzerrolle im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          
          this.artikelService.getData().subscribe((res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            
            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            // Erstelle zusätzliches pfand-array für Artikel mit category "PFAND" (nur initial, da PFAND-Artikel statisch sind)
            this.globalService.setPfandArtikels(this.globalArtikels);
            this.artikelData = this.globalArtikels;
            this.isVisible = false;
            
            // Nach dem Laden der Artikel: Aktualisiere kundenspezifische Preise falls ein Kunde gespeichert ist
            if (this.pendingCustomerForPriceUpdate) {
              console.log('🔄 [INIT] Lade kundenspezifische Preise für gespeicherten Kunden:', this.pendingCustomerForPriceUpdate.customer_number);
              this.loadCustomerArticlePrices(this.pendingCustomerForPriceUpdate.customer_number);
              this.pendingCustomerForPriceUpdate = null; // Reset nach dem Laden
            }
          });
        },
        error: (error) => {
          this.isVisible = false;
          console.error('Token ungültig oder Fehler:', error);
          this.router.navigate(['/login']);
        },
      });
    } else {
      this.isVisible = false;
      console.log('Kein Token gefunden.');
      this.router.navigate(['/login']);
    }
  }

  ngOnDestroy(): void {
    // Footer wieder anzeigen beim Verlassen der Komponente
    this.showFooter();
  }

  // Footer verstecken
  private hideFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = 'none';
    }
  }

  // Footer anzeigen
  private showFooter(): void {
    const footer = document.querySelector('app-footer');
    if (footer) {
      (footer as HTMLElement).style.display = 'block';
    }
  }



  // Lade gespeicherte Daten aus localStorage
  private loadStoredData(): void {
    // Lade gespeicherten Kunden
    const savedCustomer = this.globalService.loadSelectedCustomerForOrders();
    if (savedCustomer) {
      console.log('📱 [LOAD-STORED] Gespeicherter Kunde gefunden:', savedCustomer);
      // Speichere den Kunden temporär, um ihn nach dem Laden der Artikel zu verwenden
      this.pendingCustomerForPriceUpdate = savedCustomer;
    }

    // Lade gespeicherte Aufträge
    const savedOrders = this.globalService.loadCustomerOrders();
    if (savedOrders && savedOrders.length > 0) {
      console.log('📱 [LOAD-STORED] Gespeicherte Aufträge gefunden:', savedOrders.length);
      this.orderItems = savedOrders;
      
      // Stelle sicher, dass die Aufträge korrekte Preise haben
      this.orderItems = this.orderItems.map(orderItem => ({
        ...orderItem,
        // Stelle sicher, dass different_price korrekt gesetzt ist
        different_price: orderItem.different_price !== undefined ? orderItem.different_price : undefined,
        // Stelle sicher, dass original_price korrekt gesetzt ist
        original_price: orderItem.original_price || orderItem.sale_price
      }));
      
      console.log('✅ [LOAD-STORED] Aufträge mit korrekten Preisen geladen');
    }
  }

  filteredArtikelData() {
    this.filteredArtikels = [];
    this.showDropdown = false;
    
    if (this.searchTerm) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      // Verwende die bereits gefilterten globalArtikels (ohne SCHNELLVERKAUF für nicht-Employee/Admin)
      // Erstelle eine neue Referenz für filteredArtikels, damit Angular die Änderungen erkennt
      this.filteredArtikels = [...this.globalArtikels.filter((artikel) =>
        terms.every((term) =>
          artikel.article_text.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      )];
      
      // Show dropdown if we have results
      this.showDropdown = this.filteredArtikels.length > 0;
      
      // Automatisch den ersten Artikel auswählen, wenn Ergebnisse vorhanden sind
      if (this.filteredArtikels.length > 0) {
        this.selectedIndex = 0;
        // Kurz warten, damit Angular die DOM-Änderungen verarbeitet hat
        setTimeout(() => {
          this.scrollToSelectedItem();
        }, 50);
      } else {
        this.selectedIndex = -1;
      }
      
      console.log('🔍 [FILTER] Gefilterte Artikel aktualisiert:', this.filteredArtikels.length);
      if (this.filteredArtikels.length > 0) {
        console.log('🔍 [FILTER] Beispiel Artikel:', {
          article_text: this.filteredArtikels[0].article_text,
          article_number: this.filteredArtikels[0].article_number,
          sale_price: this.filteredArtikels[0].sale_price,
          different_price: this.filteredArtikels[0].different_price
        });
      }
    } else {
      // Wenn kein Suchbegriff vorhanden ist, Reset der Auswahl
      this.selectedIndex = -1;
    }
  }

  clearSearch() {
    console.log('🧹 [CLEAR-SEARCH] Starte clearSearch...');
    console.log('🧹 [CLEAR-SEARCH] Vorher - searchTerm:', this.searchTerm);
    console.log('🧹 [CLEAR-SEARCH] Vorher - filteredArtikels Länge:', this.filteredArtikels.length);
    
    // If in edit mode, cancel it when clearing search
    if (this.editingItemIndex !== -1) {
      this.cancelEditItem();
      return;
    }
    
    // Setze searchTerm auf leeren String
    this.searchTerm = '';
    
    // Erstelle eine neue Referenz für filteredArtikels, damit Angular die Änderungen erkennt
    this.filteredArtikels = [];
    
    // Hide dropdown and reset selection
    this.showDropdown = false;
    this.selectedIndex = -1;
    
    // Leere auch das Input-Feld direkt
    if (this.searchInput && this.searchInput.nativeElement) {
      this.searchInput.nativeElement.value = '';
      console.log('🧹 [CLEAR-SEARCH] Input-Feld direkt geleert');
    }
    
    // Erzwinge Angular Change Detection
    this.cdr.detectChanges();
    
    // Zusätzliche Sicherheitsmaßnahme: Leere das Suchfeld nach einem kurzen Delay
    setTimeout(() => {
      if (this.searchTerm !== '') {
        console.log('🔄 [CLEAR-SEARCH] Zusätzliche Sicherheitsmaßnahme: Leere Suchfeld erneut...');
        this.searchTerm = '';
        this.cdr.detectChanges();
      }
    }, 10);
    
    console.log('🧹 [CLEAR-SEARCH] Nachher - searchTerm:', this.searchTerm);
    console.log('🧹 [CLEAR-SEARCH] Nachher - filteredArtikels Länge:', this.filteredArtikels.length);
    console.log('✅ [CLEAR-SEARCH] Suchfeld erfolgreich geleert');
  }

  // Neue Methoden für Tastatur-Navigation
  onKeyDown(event: KeyboardEvent) {
    // Handle Escape key for edit mode
    if (event.key === 'Escape') {
      if (this.editingItemIndex !== -1) {
        event.preventDefault();
        this.cancelEditItem();
        return;
      }
    }

    if (!this.showDropdown || this.filteredArtikels.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Wenn noch kein Element ausgewählt ist, wähle das erste
        if (this.selectedIndex === -1) {
          this.selectedIndex = 0;
        } else {
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredArtikels.length - 1);
        }
        this.scrollToSelectedItem();
        break;
      case 'ArrowUp':
        event.preventDefault();
        // Wenn noch kein Element ausgewählt ist, wähle das letzte
        if (this.selectedIndex === -1) {
          this.selectedIndex = this.filteredArtikels.length - 1;
        } else {
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        }
        this.scrollToSelectedItem();
        break;
      case 'Enter':
        event.preventDefault();
        this.selectArticle();
        break;
      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  scrollToSelectedItem() {
    // Warte kurz, damit Angular die DOM-Änderungen verarbeitet hat
    setTimeout(() => {
      if (this.articlesDropdown && this.selectedIndex >= 0) {
        const dropdownElement = this.articlesDropdown.nativeElement;
        const selectedElement = dropdownElement.querySelector(`.article-dropdown-item:nth-child(${this.selectedIndex + 1})`);
        
        if (selectedElement) {
          // Scroll zum ausgewählten Element mit sanfter Animation
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }
    }, 50); // Etwas länger warten für bessere DOM-Synchronisation
  }

  selectArticle() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredArtikels.length) {
      const selectedArticle = this.filteredArtikels[this.selectedIndex];
      this.addToOrder(new Event('enter'), selectedArticle);
      // Only clear search if not in edit mode
      if (this.editingItemIndex === -1) {
        this.clearSearch();
      }
    }
  }

  hideDropdown() {
    this.showDropdown = false;
    this.selectedIndex = -1;
  }

  onSearchFocus() {
    this.showDropdown = this.filteredArtikels.length > 0;
    // Wenn Artikel vorhanden sind aber keiner ausgewählt ist, wähle den ersten
    if (this.filteredArtikels.length > 0 && this.selectedIndex === -1) {
      this.selectedIndex = 0;
    }
    if (this.selectedIndex >= 0) {
      this.scrollToSelectedItem();
    }
    
    // If in edit mode, ensure dropdown is shown when focusing
    if (this.editingItemIndex !== -1 && this.searchTerm) {
      this.showDropdown = true;
    }
  }

  onArticleClick(artikel: any) {
    this.addToOrder(new Event('click'), artikel);
    // Only clear search if not in edit mode
    if (this.editingItemIndex === -1) {
      this.clearSearch();
    }
  }



  addFirstFilteredArticle() {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    if (this.filteredArtikels.length === 0) {
      // Wenn keine Artikel gefunden wurden, versuche es mit der globalen Artikelliste
      if (this.searchTerm) {
        const terms = this.searchTerm.toLowerCase().split(/\s+/);
        const foundInGlobal = this.globalArtikels.find((artikel) =>
          terms.every((term) =>
            artikel.article_text.toLowerCase().includes(term) ||
            artikel.article_number?.toLowerCase().includes(term) ||
            artikel.ean?.toLowerCase().includes(term)
          )
        );
        
        if (foundInGlobal) {
          this.addToOrder(new Event('enter'), foundInGlobal);
          // Leere das Suchfeld nach dem Hinzufügen nur wenn nicht im Bearbeitungsmodus
          if (this.editingItemIndex === -1) {
            this.clearSearch();
            console.log('🧹 [ENTER] Suchfeld geleert (Fallback)');
          }
          return;
        }
      }
      
      alert('Kein Artikel für "' + this.searchTerm + '" gefunden.');
      return;
    }

    // Wenn nur ein Artikel gefunden wurde, füge ihn direkt hinzu
    if (this.filteredArtikels.length === 1) {
      const singleArticle = this.filteredArtikels[0];
      console.log('✅ [ENTER] Einziger Artikel gefunden, füge hinzu:', singleArticle.article_text);
      this.addToOrder(new Event('enter'), singleArticle);
      // Leere das Suchfeld nach dem Hinzufügen nur wenn nicht im Bearbeitungsmodus
      if (this.editingItemIndex === -1) {
        this.clearSearch();
        console.log('🧹 [ENTER] Suchfeld geleert');
      }
      return;
    }

    // Wenn mehrere Artikel gefunden wurden, verwende die Dropdown-Navigation
    if (this.filteredArtikels.length > 1) {
      // Wenn kein Artikel ausgewählt ist, wähle den ersten
      if (this.selectedIndex === -1) {
        this.selectedIndex = 0;
      }
      // Verwende die selectArticle Methode
      this.selectArticle();
      return;
    }

    // Füge den ersten gefundenen Artikel hinzu (Fallback)
    const firstArticle = this.filteredArtikels[0];
    this.addToOrder(new Event('enter'), firstArticle);
    // Leere das Suchfeld nach dem Hinzufügen nur wenn nicht im Bearbeitungsmodus
    if (this.editingItemIndex === -1) {
      this.clearSearch();
      console.log('🧹 [ENTER] Suchfeld geleert (Fallback)');
    }
  }

  onCodeResult(result: string) {
    this.playBeep();
    this.stopScanner();
    this.searchTerm = result;
    this.filteredArtikelData();
  }

  startScanner() {
    this.isScanning = true;
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      this.availableDevices = videoDevices;

      const preferredCam = videoDevices.find(d => {
        const name = d.label.toLowerCase();
        return name.includes('back') &&
               !name.includes('wide') &&
               !name.includes('ultra') &&
               !name.includes('tele');
      });

      this.selectedDevice = preferredCam || videoDevices[0];
    });
    this.scanner?.scanStart();

    if (this.scanner) {
      this.scanner.torch = true;
    }
  }

  stopScanner() {
    this.isScanning = false;
    if (this.scanner) {
      this.scanner.torch = false;
    }
    this.scanner?.reset();
  }

  playBeep(): void {
    const audio = new Audio('beep.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.error('Fehler beim Abspielen des Tons:', err));
  }

  // Edit mode methods
  startEditItem(index: number): void {
    this.editingItemIndex = index;
    this.editingItemQuantity = this.orderItems[index].quantity;
    this.searchTerm = '';
    this.filteredArtikelData();
    
    // Focus search input after a short delay to ensure DOM is ready
    setTimeout(() => {
      if (this.searchInput && this.searchInput.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  cancelEditItem(): void {
    this.editingItemIndex = -1;
    this.editingItemQuantity = 1;
    this.searchTerm = '';
    this.filteredArtikelData();
    this.hideDropdown();
  }

  replaceItem(newArtikel: any): void {
    if (this.editingItemIndex === -1) {
      return;
    }

    // Validate quantity
    if (!newArtikel.quantity || isNaN(Number(newArtikel.quantity)) || Number(newArtikel.quantity) < 1) {
      newArtikel.quantity = this.editingItemQuantity;
    }

    // Replace the item at the editing index
    this.orderItems[this.editingItemIndex] = {
      ...newArtikel,
      quantity: Number(newArtikel.quantity)
    };

    // Reset edit mode
    this.editingItemIndex = -1;
    this.editingItemQuantity = 1;
    this.searchTerm = '';
    this.filteredArtikelData();
    this.hideDropdown();

    // Save to localStorage
    this.globalService.saveCustomerOrders(this.orderItems);
  }

  // Article name editing methods
  startEditArticleName(index: number): void {
    this.editingArticleNameIndex = index;
    this.editingArticleName = this.orderItems[index].article_text;
  }

  saveArticleName(index: number): void {
    if (this.editingArticleNameIndex === index && this.editingArticleName.trim()) {
      this.orderItems[index].article_text = this.editingArticleName.trim();
      this.orderItems[index].description = this.editingArticleName.trim(); // Save as description
      
      // Save to localStorage
      this.globalService.saveCustomerOrders(this.orderItems);
    }
    this.cancelEditArticleName();
  }

  cancelEditArticleName(): void {
    this.editingArticleNameIndex = -1;
    this.editingArticleName = '';
  }

  onArticleNameKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') {
      this.saveArticleName(index);
    } else if (event.key === 'Escape') {
      this.cancelEditArticleName();
    }
  }

  addToOrder(event: Event, artikel: any): void {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    // Check if we're in edit mode
    if (this.editingItemIndex !== -1) {
      this.replaceItem(artikel);
      return;
    }

    if (
      !artikel.quantity ||
      isNaN(Number(artikel.quantity)) ||
      Number(artikel.quantity) < 1
    ) {
      artikel.quantity = 1;
    }

    // Spezielle Behandlung für PFAND-Kategorie: Immer als neue Position hinzufügen
    if (artikel.category === 'PFAND') {
      this.orderItems = [
        ...this.orderItems,
        { 
          ...artikel, 
          quantity: Number(artikel.quantity)
          // sale_price bleibt unverändert (Standard-Preis)
          // different_price bleibt als separates Attribut (falls vorhanden)
        },
      ];
    } else {
      // Normale Behandlung für alle anderen Kategorien: Summieren wenn gleiche Artikelnummer
      const existingItem = this.orderItems.find(
        (item) => item.article_number == artikel.article_number
      );

      if (existingItem) {
        existingItem.quantity += Number(artikel.quantity);
      } else {
        this.orderItems = [
          ...this.orderItems,
          { 
            ...artikel, 
            quantity: Number(artikel.quantity)
            // sale_price bleibt unverändert (Standard-Preis)
            // different_price bleibt als separates Attribut (falls vorhanden)
          },
        ];
      }
    }

    // Speichere die Menge vor dem Zurücksetzen für PFAND-Prüfung
    const originalQuantity = Number(artikel.quantity);
    artikel.quantity = '';

    // Prüfe nach dem Hinzufügen des Artikels, ob PFAND benötigt wird
    if (artikel.custom_field_1) {
      const pfandArtikels = this.globalService.getPfandArtikels();
      const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === artikel.custom_field_1);
      
      if (matchingPfand) {
        // PFAND-Artikel automatisch zum Auftrag hinzufügen (gleiche Menge wie das Produkt) - keine Abfrage mehr
        this.orderItems = [
          ...this.orderItems,
          { 
            ...matchingPfand, 
            quantity: originalQuantity
          },
        ];
        console.log('✅ [PFAND-ADD] PFAND-Artikel automatisch hinzugefügt:', matchingPfand.article_text, 'Menge:', originalQuantity);
      }
    }

    // Speichere Aufträge im localStorage
    this.globalService.saveCustomerOrders(this.orderItems);

    // Nur Button-Animation ausführen, wenn event.target existiert (echtes Klick-Event)
    if (event.target) {
      const button = event.target as HTMLElement;
      button.classList.remove('clicked');
      
      requestAnimationFrame(() => {
          button.classList.add('clicked');
      });

      button.style.backgroundColor = "rgb(255, 102, 0)";
      button.style.transform = "scale(1.1)";
      
      setTimeout(() => {
        button.style.transform = "scale(1)";
        button.style.backgroundColor = "#10b981";
      }, 500);
    }

    // Leere das Suchfeld nach dem Hinzufügen
    this.searchTerm = '';
    this.filteredArtikelData();
    
    // Fokussiere zurück auf das Suchfeld
    setTimeout(() => {
      if (this.searchInput && this.searchInput.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  removeFromOrder(index: number): void {
    this.orderItems.splice(index, 1);
    // Speichere aktualisierte Aufträge im localStorage
    this.globalService.saveCustomerOrders(this.orderItems);
  }

  // Neue Methode für Bestätigungs-Modal beim Entfernen eines Artikels
  confirmRemoveFromOrder(index: number): void {
    const dialogRef = this.dialog.open(MyDialogComponent, {
      width: '400px',
      data: {
        title: 'Artikel entfernen',
        message: 'Möchten Sie diesen Artikel wirklich aus dem Auftrag entfernen?',
        isConfirmation: true,
        confirmLabel: 'Entfernen',
        cancelLabel: 'Abbrechen'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.removeFromOrder(index);
      }
    });
  }

  getOrderTotal(): number {
    return this.orderItems.reduce((sum, item) => {
      // Verwende different_price falls vorhanden, ansonsten sale_price
      const priceToUse = item.different_price !== undefined ? item.different_price : item.sale_price;
      return sum + (priceToUse * item.quantity);
    }, 0);
  }

  // Hilfsmethode um den korrekten Preis für ein orderItem zu bekommen
  getItemPrice(item: any): number {
    return item.different_price !== undefined ? item.different_price : item.sale_price;
  }

  updateItemTotal(item: any): void {
    console.log('💰 [UPDATE-ITEM] Aktualisiere Artikel:', item.article_text);
    console.log('💰 [UPDATE-ITEM] Vorher - different_price:', item.different_price);
    console.log('💰 [UPDATE-ITEM] Vorher - sale_price:', item.sale_price);
    
    // Stelle sicher, dass die Werte numerisch sind
    item.quantity = Number(item.quantity) || 1;
    
    // Prüfe, ob das Preis-Feld leer ist oder ungültige Werte enthält
    if (item.different_price === '' || item.different_price === null || item.different_price === undefined) {
      // Feld ist leer - verwende Standard-Preis
      item.different_price = undefined;
      console.log('🔄 [UPDATE-ITEM] Feld ist leer - verwende Standard-Preis:', item.sale_price);
    } else {
      // Preis wurde eingegeben - validiere und verwende ihn
      const newPrice = Number(item.different_price);
      
      // Validierung: Preis muss positiv sein
      if (isNaN(newPrice) || newPrice < 0) {
        console.warn('⚠️ [UPDATE-ITEM] Ungültiger Preis, setze auf Standard-Preis');
        item.different_price = undefined;
      } else {
        item.different_price = newPrice;
        console.log('✅ [UPDATE-ITEM] different_price aktualisiert auf:', item.different_price);
      }
    }
    
    // Berechne den neuen Gesamtpreis
    const itemPrice = this.getItemPrice(item);
    const totalPrice = itemPrice * item.quantity;
    
    console.log('💰 [UPDATE-ITEM] Nachher - verwendeter Preis:', itemPrice);
    console.log('💰 [UPDATE-ITEM] Nachher - Gesamtpreis:', totalPrice);
    
    // Speichere die Änderungen automatisch
    this.globalService.saveCustomerOrders(this.orderItems);
    console.log('💾 [UPDATE-ITEM] Änderungen gespeichert');
  }

  saveOrder(): void {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    if (this.orderItems.length === 0) {
      alert('Bitte fügen Sie Artikel zum Auftrag hinzu.');
      return;
    }

    // Ensure description is set for all items
    this.orderItems.forEach(item => {
      if (!item.description && item.article_text) {
        item.description = item.article_text;
      }
    });

    // Kundendaten für den Request
    const customerData = {
      customer_id: this.globalService.selectedCustomerForOrders.id,
      customer_number: this.globalService.selectedCustomerForOrders.customer_number,
      customer_name: this.globalService.selectedCustomerForOrders.last_name_company,
      customer_addition: this.globalService.selectedCustomerForOrders.name_addition,
      customer_city: this.globalService.selectedCustomerForOrders.city,
      customer_email: this.globalService.selectedCustomerForOrders.email,
      status: 'completed'
    };

    const completeOrder = {
      orderData: {
        ...customerData,
        total_price: this.getOrderTotal(),
        created_at: new Date().toISOString()
      },
      orderItems: this.orderItems
    };

    /*
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

  */

    const token = localStorage.getItem('token');

    console.log('💾 [SAVE-ORDER] Auftrag wird gespeichert:', completeOrder);
    
    // Temporär: Sofort Erfolg anzeigen (für Testzwecke)
    alert('Auftrag erfolgreich gespeichert!');
    this.clearAllOrderData();
    
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completeOrder)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Fehler beim Speichern des Auftrags');
      }
      return response.json();
    })
    .then(data => {
      alert('Auftrag erfolgreich gespeichert!');
      this.clearAllOrderData();
    })
    .catch(error => {
      console.error('Fehler beim Speichern des Auftrags:', error);
      alert('Fehler beim Speichern des Auftrags: ' + error.message);
    });
  }

  // Neue Methode zum vollständigen Leeren aller auftragsrelevanten Daten
  clearAllOrderData(): void {
    console.log('🗑️ [CLEAR-ALL-ORDER] Starte vollständiges Leeren aller auftragsrelevanten Daten...');
    
    // 1. Leere den Auftrag
    this.orderItems = [];
    console.log('✅ [CLEAR-ALL-ORDER] Auftrag geleert');
    
    // 2. Leere den ausgewählten Kunden
    this.globalService.clearSelectedCustomerForOrders();
    console.log('✅ [CLEAR-ALL-ORDER] Ausgewählter Kunde geleert');
    
    // 3. Leere die kundenspezifischen Preise
    this.customerArticlePrices = [];
    console.log('✅ [CLEAR-ALL-ORDER] Kundenspezifische Preise geleert');
    
    // 4. Setze alle Artikel auf Standard-Preise zurück
    this.globalArtikels = this.globalArtikels.map(artikel => ({
      ...artikel,
      different_price: undefined,
      original_price: undefined
    }));
    console.log('✅ [CLEAR-ALL-ORDER] Alle Artikel auf Standard-Preise zurückgesetzt');
    
    // 5. Aktualisiere die artikelData
    this.artikelData = [...this.globalArtikels];
    console.log('✅ [CLEAR-ALL-ORDER] artikelData aktualisiert');
    
    // 6. Leere das Suchfeld und gefilterte Artikel
    this.searchTerm = '';
    this.filteredArtikels = [];
    this.showDropdown = false;
    this.selectedIndex = -1;
    console.log('✅ [CLEAR-ALL-ORDER] Suchfeld und gefilterte Artikel geleert');
    
    // 7. Leere die Modals
    this.isCustomerModalOpen = false;
    this.isArticlePricesModalOpen = false;
    this.customerSearchTerm = '';
    this.articlePricesSearchTerm = '';
    this.filteredCustomers = [];
    this.filteredArticlePrices = [];
    console.log('✅ [CLEAR-ALL-ORDER] Modals geleert');
    
    // 8. Leere localStorage
    this.globalService.clearCustomerOrders();
    console.log('✅ [CLEAR-ALL-ORDER] localStorage geleert');
    
    // 9. Reset pendingCustomerForPriceUpdate
    this.pendingCustomerForPriceUpdate = null;
    console.log('✅ [CLEAR-ALL-ORDER] pendingCustomerForPriceUpdate zurückgesetzt');
    
    console.log('🎉 [CLEAR-ALL-ORDER] Alle auftragsrelevanten Daten erfolgreich geleert!');
  }

  // Neue Methode für Bestätigungs-Modal beim Löschen des gesamten Auftrags
  confirmClearOrder(): void {
    const dialogRef = this.dialog.open(MyDialogComponent, {
      width: '400px',
      data: {
        title: 'Auftrag löschen',
        message: 'Möchten Sie wirklich den gesamten Auftrag löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
        isConfirmation: true,
        confirmLabel: 'Löschen',
        cancelLabel: 'Abbrechen'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.clearOrder();
      }
    });
  }

  // Methode zum Leeren nur des Auftrags (für andere Funktionen)
  clearOrder(): void {
    console.log('🗑️ [CLEAR-ORDER] Auftrag wird gelöscht...');
    
    this.orderItems = [];
    // Lösche auch aus localStorage
    this.globalService.clearCustomerOrders();
    
    // Setze die kundenspezifischen Preise in der Artikelauswahl zurück
    if (this.customerArticlePrices.length > 0) {
      console.log('🔄 [CLEAR-ORDER] Setze kundenspezifische Preise zurück...');
      
      // Setze alle Artikel auf Standard-Preise zurück
      this.globalArtikels = this.globalArtikels.map(artikel => ({
        ...artikel,
        different_price: undefined,
        original_price: undefined
      }));
      
      // Aktualisiere auch die artikelData
      this.artikelData = [...this.globalArtikels];
      
      // Aktualisiere die gefilterten Artikel, falls bereits gesucht wurde
      if (this.searchTerm) {
        console.log('🔄 [CLEAR-ORDER] Aktualisiere gefilterte Artikel...');
        this.filteredArtikelData();
      }
      
      console.log('✅ [CLEAR-ORDER] Kundenspezifische Preise zurückgesetzt');
    } else {
      // Auch wenn keine kundenspezifischen Preise vorhanden sind, stelle sicher, dass alle Artikel Standard-Preise haben
      console.log('🔄 [CLEAR-ORDER] Setze alle Artikel auf Standard-Preise zurück...');
      
      this.globalArtikels = this.globalArtikels.map(artikel => ({
        ...artikel,
        different_price: undefined,
        original_price: undefined
      }));
      
      // Aktualisiere auch die artikelData
      this.artikelData = [...this.globalArtikels];
      
      // Aktualisiere die gefilterten Artikel, falls bereits gesucht wurde
      if (this.searchTerm) {
        console.log('🔄 [CLEAR-ORDER] Aktualisiere gefilterte Artikel...');
        this.filteredArtikelData();
      }
      
      console.log('✅ [CLEAR-ORDER] Alle Artikel auf Standard-Preise zurückgesetzt');
    }
    
    console.log('✅ [CLEAR-ORDER] Auftrag erfolgreich gelöscht');
  }

  // Customer modal methods
  openCustomerModal() {
    this.isCustomerModalOpen = true;
    this.filteredCustomers = this.customers;
    this.customerSearchTerm = '';
  }

  closeCustomerModal() {
    this.isCustomerModalOpen = false;
    this.customerSearchTerm = '';
  }

  loadCustomers() {
    this.isLoadingCustomers = true;
    const token = localStorage.getItem('token');
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/customers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Kunden');
      }
      return response.json();
    })
    .then(data => {
      this.customers = data;
      this.filteredCustomers = data;
      this.isLoadingCustomers = false;
    })
    .catch(error => {
      console.error('Fehler beim Laden der Kunden:', error);
      this.isLoadingCustomers = false;
    });
  }

  filterCustomers() {
    if (!this.customerSearchTerm.trim()) {
      this.filteredCustomers = this.customers;
      return;
    }

    const searchTerm = this.customerSearchTerm.toLowerCase();
    this.filteredCustomers = this.customers.filter(customer => {
      const normalizedSearchTerm = searchTerm.replace(/\s+/g, '');
      
      const normalizedCustomerNumber = customer.customer_number?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCompanyName = customer.last_name_company?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedNameAddition = customer.name_addition?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedCity = customer.city?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedEmail = customer.email?.toLowerCase().replace(/\s+/g, '') || '';
      
      const originalCustomerNumber = customer.customer_number?.toLowerCase() || '';
      const originalCompanyName = customer.last_name_company?.toLowerCase() || '';
      const originalNameAddition = customer.name_addition?.toLowerCase() || '';
      const originalCity = customer.city?.toLowerCase() || '';
      const originalEmail = customer.email?.toLowerCase() || '';
      
      return (
        normalizedCustomerNumber.includes(normalizedSearchTerm) ||
        normalizedCompanyName.includes(normalizedSearchTerm) ||
        normalizedNameAddition.includes(normalizedSearchTerm) ||
        normalizedCity.includes(normalizedSearchTerm) ||
        normalizedEmail.includes(normalizedSearchTerm) ||
        originalCustomerNumber.includes(searchTerm) ||
        originalCompanyName.includes(searchTerm) ||
        originalNameAddition.includes(searchTerm) ||
        originalCity.includes(searchTerm) ||
        originalEmail.includes(searchTerm)
      );
    });
  }

  selectCustomer(customer: any) {
    console.log('👤 [SELECT-CUSTOMER] Kunde ausgewählt:', customer);
    console.log('👤 [SELECT-CUSTOMER] Kundenummer:', customer.customer_number);
    console.log('👤 [SELECT-CUSTOMER] Kundenname:', customer.last_name_company);
    
    this.globalService.setSelectedCustomerForOrders(customer);
    console.log('💾 [SELECT-CUSTOMER] Kunde im GlobalService und localStorage gespeichert');
    
    this.closeCustomerModal();
    console.log('🔒 [SELECT-CUSTOMER] Customer Modal geschlossen');
    
    // Lösche das Suchfeld und gefilterte Artikel beim Kundenwechsel
    this.clearSearch();
    console.log('🧹 [SELECT-CUSTOMER] Suchfeld und gefilterte Artikel geleert');
    
    // Lade Kunden-Artikel-Preise für den ausgewählten Kunden
    console.log('🔄 [SELECT-CUSTOMER] Starte loadCustomerArticlePrices für Kunde:', customer.customer_number);
    this.loadCustomerArticlePrices(customer.customer_number);
  }

  // Neue Methode für Bestätigungs-Modal beim Zurücksetzen des Kunden
  confirmClearSelectedCustomer(): void {
    const dialogRef = this.dialog.open(MyDialogComponent, {
      width: '400px',
      data: {
        title: 'Kunde zurücksetzen',
        message: 'Möchten Sie wirklich den ausgewählten Kunden zurücksetzen? Dies wird auch den aktuellen Auftrag löschen.',
        isConfirmation: true,
        confirmLabel: 'Zurücksetzen',
        cancelLabel: 'Abbrechen'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.clearSelectedCustomer();
      }
    });
  }

  clearSelectedCustomer() {
    console.log('🗑️ [CLEAR-CUSTOMER] Kunde wird zurückgesetzt...');
    console.log('🗑️ [CLEAR-CUSTOMER] Aktuelle customerArticlePrices Länge:', this.customerArticlePrices.length);
    
    this.globalService.clearSelectedCustomerForOrders();
    console.log('💾 [CLEAR-CUSTOMER] Kunde im GlobalService und localStorage zurückgesetzt');
    
    this.clearOrder();
    console.log('🗑️ [CLEAR-CUSTOMER] Auftrag zurückgesetzt');
    
    this.customerArticlePrices = []; // Lösche auch die Kunden-Artikel-Preise
    console.log('🗑️ [CLEAR-CUSTOMER] customerArticlePrices zurückgesetzt');
    
    // Lösche das Suchfeld und gefilterte Artikel beim Zurücksetzen des Kunden
    this.clearSearch();
    console.log('🧹 [CLEAR-CUSTOMER] Suchfeld und gefilterte Artikel geleert');
    
    console.log('✅ [CLEAR-CUSTOMER] Kunde erfolgreich zurückgesetzt');
  }

  // Artikel-Preise-Modal Methoden
  openArticlePricesModal() {
    console.log('📋 [ARTICLE-PRICES-MODAL] Öffne Artikel-Preise-Modal...');
    this.isArticlePricesModalOpen = true;
    this.articlePricesSearchTerm = '';
    this.filterArticlePrices();
  }

  closeArticlePricesModal() {
    console.log('📋 [ARTICLE-PRICES-MODAL] Schließe Artikel-Preise-Modal...');
    this.isArticlePricesModalOpen = false;
    this.articlePricesSearchTerm = '';
    this.filteredArticlePrices = [];
  }

  filterArticlePrices() {
    console.log('🔍 [ARTICLE-PRICES-MODAL] Filtere Artikel-Preise...');
    console.log('🔍 [ARTICLE-PRICES-MODAL] Suchbegriff:', this.articlePricesSearchTerm);
    console.log('🔍 [ARTICLE-PRICES-MODAL] Verfügbare Artikel-Preise:', this.customerArticlePrices.length);
    console.log('🔍 [ARTICLE-PRICES-MODAL] Globale Artikel:', this.globalArtikels.length);
    
    // Zuerst filtere nach Verfügbarkeit in globalArtikels
    let availableCustomerPrices = this.customerArticlePrices.filter(customerPrice => {
      return this.isArticleAvailableInGlobal(customerPrice);
    });
    
    console.log('📊 [ARTICLE-PRICES-MODAL] Verfügbare Artikel in globalArtikels:', availableCustomerPrices.length);
    
    if (!this.articlePricesSearchTerm.trim()) {
      // Wenn kein Suchbegriff, zeige alle verfügbaren Artikel-Preise an
      this.filteredArticlePrices = availableCustomerPrices;
    } else {
      // Intelligente Suche: Teile Suchbegriff in einzelne Wörter auf
      const terms = this.articlePricesSearchTerm.toLowerCase().split(/\s+/);
      
      this.filteredArticlePrices = availableCustomerPrices.filter(customerPrice => {
        // Suche nach jedem Suchwort in verschiedenen Feldern
        return terms.every((term) => {
          const articleText = customerPrice.article_text?.toLowerCase() || '';
          const articleNumber = customerPrice.article_number?.toLowerCase() || '';
          const productId = customerPrice.product_id?.toLowerCase() || '';
          const ean = customerPrice.ean?.toLowerCase() || '';
          
          return articleText.includes(term) || 
                 articleNumber.includes(term) || 
                 productId.includes(term) ||
                 ean.includes(term);
        });
      });
    }
    
    console.log('📊 [ARTICLE-PRICES-MODAL] Gefilterte Artikel-Preise:', this.filteredArticlePrices.length);
  }

  // Neue Hilfsmethode zur Überprüfung der Verfügbarkeit in globalArtikels
  private isArticleAvailableInGlobal(customerPrice: any): boolean {
    // Suche nach verschiedenen Feldern in globalArtikels
    const foundInGlobal = this.globalArtikels.some(globalArtikel => {
      // 1. Suche nach product_id
      if (customerPrice.product_id && globalArtikel.article_number == customerPrice.product_id) {
        return true;
      }
      
      // 2. Suche nach article_number
      if (customerPrice.article_number && globalArtikel.article_number == customerPrice.article_number) {
        return true;
      }
      
      // 3. Suche nach id
      if (customerPrice.id && globalArtikel.id == customerPrice.id) {
        return true;
      }
      
      // 4. Suche nach EAN (falls vorhanden)
      if (customerPrice.ean && globalArtikel.ean == customerPrice.ean) {
        return true;
      }
      
      return false;
    });
    
    return foundInGlobal;
  }

  addArticleFromPricesModal(customerPrice: any) {
    console.log('➕ [ARTICLE-PRICES-MODAL] Füge Artikel hinzu:', customerPrice);
    console.log('🔍 [ARTICLE-PRICES-MODAL] Suche nach Artikel mit:');
    console.log('   - product_id:', customerPrice.product_id);
    console.log('   - id:', customerPrice.id);
    console.log('📊 [ARTICLE-PRICES-MODAL] Anzahl globaler Artikel:', this.globalArtikels.length);
    
    // Erweiterte Suche: Versuche verschiedene Felder zu finden
    let artikel = null;
    
    // 1. Suche nach article_number
    if (customerPrice.product_id) {
      artikel = this.globalArtikels.find(art => art.article_number == customerPrice.product_id);

      if (artikel) {
        console.log('✅ [ARTICLE-PRICES-MODAL] Artikel gefunden über article_number:', artikel.article_number);
      }
    }
    
    if (artikel) {
      // Verwende die eingegebene Menge oder Standard 1
      const quantity = customerPrice.tempQuantity && customerPrice.tempQuantity > 0 ? parseInt(customerPrice.tempQuantity) : 1;
      
      // Erstelle einen neuen Auftrag-Artikel mit den kundenspezifischen Preisen
      const orderItem = {
        ...artikel,
        quantity: quantity,
        different_price: parseFloat(customerPrice.unit_price_net),
        original_price: artikel.sale_price
      };
      
      // Spezielle Behandlung für PFAND-Kategorie: Immer als neue Position hinzufügen
      if (artikel.category === 'PFAND') {
        this.orderItems.push(orderItem);
      } else {
        // Normale Behandlung für alle anderen Kategorien: Summieren wenn gleiche Artikelnummer
        const existingItem = this.orderItems.find(
          (item) => item.article_number == artikel.article_number
        );

        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          this.orderItems.push(orderItem);
        }
      }
      
      // Speichere die Menge vor dem Zurücksetzen für PFAND-Prüfung
      const originalQuantity = quantity;
      
      // Prüfe nach dem Hinzufügen des Artikels, ob PFAND benötigt wird
      if (artikel.custom_field_1) {
        const pfandArtikels = this.globalService.getPfandArtikels();
        const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === artikel.custom_field_1);
        
        if (matchingPfand) {
          // PFAND-Artikel automatisch zum Auftrag hinzufügen (gleiche Menge wie das Produkt) - keine Abfrage mehr
          this.orderItems.push({ 
            ...matchingPfand, 
            quantity: originalQuantity
          });
          console.log('✅ [PFAND-ADD] PFAND-Artikel automatisch hinzugefügt:', matchingPfand.article_text, 'Menge:', originalQuantity);
        }
      }
      
      // Speichere den Zustand
      this.globalService.saveCustomerOrders(this.orderItems);
      
      console.log('✅ [ARTICLE-PRICES-MODAL] Artikel erfolgreich zum Auftrag hinzugefügt');
      
      // Setze die temporäre Menge zurück
      customerPrice.tempQuantity = null;
      
      // Schließe das Modal
      this.closeArticlePricesModal();
    } else {
      console.error('❌ [ARTICLE-PRICES-MODAL] Artikel nicht in globalen Artikeln gefunden:', customerPrice);
      console.log('🔍 [ARTICLE-PRICES-MODAL] Debug: Erste 5 globale Artikel:');
      this.globalArtikels.slice(0, 5).forEach((art, index) => {
        console.log(`   ${index + 1}. ID: ${art.id}, Art-Nr: ${art.article_number}, Product-ID: ${art.product_id}, Text: ${art.article_text}`);
      });
      
      // Zeige eine Benutzerbenachrichtigung
      alert(`Artikel "${customerPrice.article_text || customerPrice.product_id}" konnte nicht in der Artikeldatenbank gefunden werden. Bitte überprüfen Sie die Artikelnummer oder kontaktieren Sie den Administrator.`);
    }
  }

  getStandardPriceForArticle(customerPrice: any): number | null {
    // Erweiterte Suche: Versuche verschiedene Felder zu finden
    let artikel = null;
    
    // 1. Suche nach article_number
    if (customerPrice.article_number) {
      artikel = this.globalArtikels.find(art => art.article_number === customerPrice.article_number);
    }
    
    // 2. Suche nach product_id
    if (!artikel && customerPrice.product_id) {
      artikel = this.globalArtikels.find(art => art.product_id === customerPrice.product_id);
    }
    
    // 3. Suche nach id
    if (!artikel && customerPrice.id) {
      artikel = this.globalArtikels.find(art => art.id === customerPrice.id);
    }
    
    // 4. Suche nach EAN (falls vorhanden)
    if (!artikel && customerPrice.ean) {
      artikel = this.globalArtikels.find(art => art.ean === customerPrice.ean);
    }
    
    // 5. Fallback: Suche nach Artikeltext (fuzzy search)
    if (!artikel && customerPrice.article_text) {
      const searchText = customerPrice.article_text.toLowerCase();
      artikel = this.globalArtikels.find(art => 
        art.article_text && art.article_text.toLowerCase().includes(searchText)
      );
    }
    
    return artikel ? artikel.sale_price : null;
  }

  formatInvoiceDate(dateString: string | null | undefined): string {
    if (!dateString) {
      return '-';
    }
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '-';
      }
      
      // Formatiere das Datum im deutschen Format (DD.MM.YYYY)
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Fehler beim Formatieren des Datums:', error);
      return '-';
    }
  }

  // Neue Methode zum Laden der Kunden-Artikel-Preise
  loadCustomerArticlePrices(customerNumber: string) {
    console.log('🔄 [CUSTOMER-ARTICLE-PRICES] Starte API-Aufruf für Kunde:', customerNumber);
    
    // Spezielle Behandlung für bestimmte Kunden - leeres Array zurückgeben
    if (customerNumber === '10.022' || customerNumber === '10.003') {
      console.log('⚠️ [CUSTOMER-ARTICLE-PRICES] Spezielle Behandlung für Kunde:', customerNumber, '- leeres Array zurückgeben');
      this.customerArticlePrices = [];
      console.log('💾 [CUSTOMER-ARTICLE-PRICES] Leeres Array für Kunde', customerNumber, 'gespeichert');
      this.updateArtikelsWithCustomerPrices();
      return;
    }
    
    const token = localStorage.getItem('token');
    const apiUrl = `https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/customer/${customerNumber}`;
    
    console.log('🔗 [CUSTOMER-ARTICLE-PRICES] API URL:', apiUrl);
    console.log('�� [CUSTOMER-ARTICLE-PRICES] Token vorhanden:', !!token);
    
    fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response Status:', response.status);
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response OK:', response.ok);
      console.log('📡 [CUSTOMER-ARTICLE-PRICES] Response Headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error('❌ [CUSTOMER-ARTICLE-PRICES] Response nicht OK:', response.status, response.statusText);
        throw new Error(`Fehler beim Laden der Kunden-Artikel-Preise: ${response.status} ${response.statusText}`);
      }
      
      console.log('✅ [CUSTOMER-ARTICLE-PRICES] Response erfolgreich, parse JSON...');
      return response.json();
    })
    .then(data => {
      console.log('📊 [CUSTOMER-ARTICLE-PRICES] Empfangene Daten:', data);
      console.log('📊 [CUSTOMER-ARTICLE-PRICES] Anzahl Artikel-Preise:', Array.isArray(data) ? data.length : 'Kein Array');
      
      if (Array.isArray(data)) {
        console.log('📊 [CUSTOMER-ARTICLE-PRICES] Erste 3 Artikel-Preise:', data.slice(0, 3));
        if (data.length > 0) {
          console.log('📊 [CUSTOMER-ARTICLE-PRICES] Beispiel Artikel-Preis:', data[0]);
          // Debug: Zeige alle verfügbaren Felder des ersten Eintrags
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] Verfügbare Felder im ersten Eintrag:', Object.keys(data[0]));
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] product_id:', data[0].product_id);
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] article_number:', data[0].article_number);
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] unit_price_net:', data[0].unit_price_net);
        }
      }
      
      this.customerArticlePrices = data;
      console.log('💾 [CUSTOMER-ARTICLE-PRICES] Daten in customerArticlePrices gespeichert');
      
      // Aktualisiere die Artikel mit den kundenspezifischen Preisen
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES] Starte updateArtikelsWithCustomerPrices...');
      this.updateArtikelsWithCustomerPrices();
    })
    .catch(error => {
      console.error('❌ [CUSTOMER-ARTICLE-PRICES] Fehler beim API-Aufruf:', error);
      console.error('❌ [CUSTOMER-ARTICLE-PRICES] Fehler Details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      this.customerArticlePrices = [];
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES] customerArticlePrices zurückgesetzt');
    });
  }

  // Methode zum Aktualisieren der Artikel mit kundenspezifischen Preisen
  updateArtikelsWithCustomerPrices() {
    console.log('🔄 [UPDATE-PRICES] Starte updateArtikelsWithCustomerPrices...');
    console.log('📊 [UPDATE-PRICES] customerArticlePrices Länge:', this.customerArticlePrices.length);
    console.log('📊 [UPDATE-PRICES] globalArtikels Länge:', this.globalArtikels.length);
    console.log('📊 [UPDATE-PRICES] orderItems Länge:', this.orderItems.length);
    
    if (this.customerArticlePrices.length > 0) {
      console.log('✅ [UPDATE-PRICES] Kundenspezifische Preise vorhanden, erstelle Map...');
      
      // Erstelle eine Map für schnellen Zugriff auf die Kunden-Preise
      const customerPriceMap = new Map();
      this.customerArticlePrices.forEach(customerPrice => {
        // Verwende verschiedene Felder als Keys für bessere Suche
        if (customerPrice.product_id) {
          customerPriceMap.set(customerPrice.product_id, customerPrice);
        }
        if (customerPrice.article_number) {
          customerPriceMap.set(customerPrice.article_number, customerPrice);
        }
        if (customerPrice.id) {
          customerPriceMap.set(customerPrice.id.toString(), customerPrice);
        }
        if (customerPrice.ean) {
          customerPriceMap.set(customerPrice.ean, customerPrice);
        }
      });
      
      console.log('🗺️ [UPDATE-PRICES] Customer Price Map erstellt, Größe:', customerPriceMap.size);
      console.log('🗺️ [UPDATE-PRICES] Map Keys (erste 5):', Array.from(customerPriceMap.keys()).slice(0, 5));

      // Zähle Artikel mit kundenspezifischen Preisen
      let updatedCount = 0;
      let unchangedCount = 0;

      // Aktualisiere die globalen Artikel mit den kundenspezifischen Preisen
      this.globalArtikels = this.globalArtikels.map(artikel => {
        // Erweiterte Suche: Versuche verschiedene Felder zu finden
        let customerPrice = customerPriceMap.get(artikel.article_number);
        
        if (!customerPrice && artikel.product_id) {
          customerPrice = customerPriceMap.get(artikel.product_id);
        }
        
        if (!customerPrice && artikel.id) {
          customerPrice = customerPriceMap.get(artikel.id.toString());
        }
        
        if (!customerPrice && artikel.ean) {
          customerPrice = customerPriceMap.get(artikel.ean);
        }
        
        if (customerPrice) {
          const originalPrice = artikel.sale_price;
          const customerNetPrice = parseFloat(customerPrice.unit_price_net);
          
          console.log(`💰 [UPDATE-PRICES] Artikel ${artikel.article_number} (${artikel.article_text}): ${originalPrice}€ → ${customerNetPrice}€ (Kundenpreis)`);
          
          updatedCount++;
          return {
            ...artikel,
            different_price: customerNetPrice, // Füge den kundenspezifischen Preis als different_price hinzu
            original_price: originalPrice // Behalte den ursprünglichen Preis
          };
        } else {
          unchangedCount++;
          return {
            ...artikel,
            different_price: undefined, // Stelle sicher, dass keine alten kundenspezifischen Preise übrig bleiben
            original_price: undefined
          };
        }
      });

      console.log('📊 [UPDATE-PRICES] Aktualisierte Artikel:', updatedCount);
      console.log('📊 [UPDATE-PRICES] Unveränderte Artikel:', unchangedCount);
      console.log('📊 [UPDATE-PRICES] Gesamt Artikel:', this.globalArtikels.length);

      // Aktualisiere auch die artikelData
      this.artikelData = [...this.globalArtikels];
      console.log('💾 [UPDATE-PRICES] artikelData aktualisiert');
      
      // Aktualisiere IMMER die filteredArtikels, falls bereits gefiltert wurde
      if (this.searchTerm) {
        console.log('🔄 [UPDATE-PRICES] Aktualisiere filteredArtikels nach Kundenwechsel...');
        this.filteredArtikelData();
      }
      
      // Aktualisiere die Preise der Artikel im aktuellen Auftrag
      this.updateOrderItemsPrices(customerPriceMap);
      
      console.log('✅ [UPDATE-PRICES] Artikel mit kundenspezifischen Preisen erfolgreich aktualisiert');
    } else {
      console.log('⚠️ [UPDATE-PRICES] Keine kundenspezifischen Preise vorhanden, setze alle auf Standard-Preise zurück');
      
      // Setze alle Artikel auf Standard-Preise zurück
      this.globalArtikels = this.globalArtikels.map(artikel => ({
        ...artikel,
        different_price: undefined,
        original_price: undefined
      }));
      
      // Aktualisiere auch die artikelData
      this.artikelData = [...this.globalArtikels];
      console.log('💾 [UPDATE-PRICES] artikelData auf Standard-Preise zurückgesetzt');
      
      // Setze alle Preise auf Standard-Preise zurück
      this.resetOrderItemsToStandardPrices();
      
      // Aktualisiere auch hier die filteredArtikels, falls bereits gefiltert wurde
      if (this.searchTerm) {
        console.log('🔄 [UPDATE-PRICES] Aktualisiere filteredArtikels nach Zurücksetzen der Preise...');
        this.filteredArtikelData();
      }
      
      console.log('✅ [UPDATE-PRICES] Alle Artikel auf Standard-Preise zurückgesetzt');
    }
  }

  // Neue Methode zum Aktualisieren der Preise im aktuellen Auftrag
  private updateOrderItemsPrices(customerPriceMap: Map<string, any>) {
    console.log('🔄 [UPDATE-ORDER-PRICES] Starte updateOrderItemsPrices...');
    console.log('📊 [UPDATE-ORDER-PRICES] orderItems Länge:', this.orderItems.length);
    
    let updatedOrderItems = 0;
    let unchangedOrderItems = 0;

    this.orderItems = this.orderItems.map(orderItem => {
      // Erweiterte Suche: Versuche verschiedene Felder zu finden
      let customerPrice = customerPriceMap.get(orderItem.article_number);
      
      if (!customerPrice && orderItem.product_id) {
        customerPrice = customerPriceMap.get(orderItem.product_id);
      }
      
      if (!customerPrice && orderItem.id) {
        customerPrice = customerPriceMap.get(orderItem.id.toString());
      }
      
      if (!customerPrice && orderItem.ean) {
        customerPrice = customerPriceMap.get(orderItem.ean);
      }
      
      if (customerPrice) {
        const originalPrice = orderItem.original_price || orderItem.sale_price;
        const customerNetPrice = parseFloat(customerPrice.unit_price_net);
        
        console.log(`💰 [UPDATE-ORDER-PRICES] Auftrag-Artikel ${orderItem.article_number} (${orderItem.article_text}): ${orderItem.sale_price}€ → ${customerNetPrice}€ (Kundenpreis)`);
        
        updatedOrderItems++;
        return {
          ...orderItem,
          // sale_price bleibt unverändert (Standard-Preis)
          different_price: customerNetPrice, // Setze den kundenspezifischen Preis
          original_price: originalPrice // Behalte den ursprünglichen Standard-Preis
        };
      } else {
        // Kein kundenspezifischer Preis verfügbar, verwende Standard-Preis
        const standardPrice = orderItem.original_price || orderItem.sale_price;
        console.log(`💰 [UPDATE-ORDER-PRICES] Auftrag-Artikel ${orderItem.article_number} (${orderItem.article_text}): ${orderItem.sale_price}€ → ${standardPrice}€ (Standard-Preis)`);
        
        unchangedOrderItems++;
        return {
          ...orderItem,
          sale_price: standardPrice,
          different_price: undefined, // Entferne kundenspezifischen Preis
          original_price: standardPrice
        };
      }
    });

    // Speichere die aktualisierten Aufträge
    this.globalService.saveCustomerOrders(this.orderItems);
    console.log('💾 [UPDATE-ORDER-PRICES] Aktualisierte Aufträge gespeichert');

    console.log('📊 [UPDATE-ORDER-PRICES] Aktualisierte Auftrag-Artikel:', updatedOrderItems);
    console.log('📊 [UPDATE-ORDER-PRICES] Unveränderte Auftrag-Artikel:', unchangedOrderItems);
    console.log('📊 [UPDATE-ORDER-PRICES] Gesamt Auftrag-Artikel:', this.orderItems.length);
    console.log('✅ [UPDATE-ORDER-PRICES] Auftrag-Preise erfolgreich aktualisiert');
  }

  // Neue Methode zum Zurücksetzen der Auftrag-Preise auf Standard-Preise
  private resetOrderItemsToStandardPrices() {
    console.log('🔄 [RESET-ORDER-PRICES] Setze Auftrag-Preise auf Standard-Preise zurück...');
    
    this.orderItems = this.orderItems.map(orderItem => {
      const standardPrice = orderItem.original_price || orderItem.sale_price;
      console.log(`💰 [RESET-ORDER-PRICES] Auftrag-Artikel ${orderItem.article_number} (${orderItem.article_text}): ${orderItem.sale_price}€ → ${standardPrice}€ (Standard-Preis)`);
      
      return {
        ...orderItem,
        sale_price: standardPrice, // Stelle sicher, dass sale_price den Standard-Preis verwendet
        different_price: undefined, // Entferne kundenspezifischen Preis
        original_price: standardPrice
      };
    });

    // Speichere die aktualisierten Aufträge
    this.globalService.saveCustomerOrders(this.orderItems);
    console.log('💾 [RESET-ORDER-PRICES] Aktualisierte Aufträge gespeichert');

    console.log('✅ [RESET-ORDER-PRICES] Auftrag-Preise erfolgreich zurückgesetzt');
  }
}