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
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-customer-orders',
  imports: [CommonModule, FormsModule, RouterModule, UploadLoadingComponent, ZXingScannerModule, MatDialogModule, HttpClientModule],
  templateUrl: './customer-orders.component.html',
  styleUrl: './customer-orders.component.scss',
})
export class CustomerOrdersComponent implements OnInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner!: ZXingScannerComponent;
  @ViewChild('searchInput') searchInput!: any;
  @ViewChild('articlesDropdown') articlesDropdown!: any;
  @ViewChild('orderTableContainer') orderTableContainer!: any;
  @ViewChild('eanCodeInput') eanCodeInput!: any;
  private artikelService = inject(ArtikelDataService);
  private http = inject(HttpClient);
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
  
  // Notification properties for article prices modal
  isArticlePricesNotificationVisible: boolean = false;
  articlePricesNotificationText: string = '';
  articlePricesNotificationTimeout: any = null;
  
  // EAN Assignment modal properties
  isEanAssignmentModalOpen: boolean = false;
  eanAssignmentItem: any = null;
  eanCode: string = '';
  isEanScanning: boolean = false;
  isAssigningEan: boolean = false;
  eanErrorMessage: string = '';
  eanSuccessMessage: string = '';
  
  // Edit mode properties
  editingItemIndex: number = -1;
  editingItemQuantity: number = 1;
  
  // Article name editing properties
  editingArticleNameIndex: number = -1;
  editingArticleName: string = '';
  
  // Customer company name editing properties
  isEditingCompanyName: boolean = false;
  editingCompanyName: string = '';
  differentCompanyName: string = '';
  
  // Drag & Drop properties
  draggedIndex: number = -1;
  dragOverIndex: number = -1;
  
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

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent) {
    // Escape-Taste beendet Artikelnamen-Bearbeitung
    if (event.key === 'Escape' && this.editingArticleNameIndex !== -1) {
      this.cancelEditArticleName();
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
      // Check if search term is an 8 or 13 digit EAN code
      const isEanSearch = /^\d{8}$|^\d{13}$/.test(this.searchTerm.trim());
      
      if (isEanSearch) {
        // EAN-Suche: Zuerst in lokalen Artikeln suchen
        const localEanResults = this.globalArtikels.filter(artikel =>
          artikel.ean?.toLowerCase() === this.searchTerm.toLowerCase()
        );
        
        if (localEanResults.length > 0) {
          // EAN in lokalen Artikeln gefunden
          this.filteredArtikels = localEanResults;
          this.showDropdown = true;
          this.selectedIndex = -1;
          
          console.log('🔍 [EAN-LOCAL] EAN in lokalen Artikeln gefunden:', this.filteredArtikels.length);
        } else {
          // EAN nicht in lokalen Artikeln gefunden - API-Suche
          this.searchEanInApi(this.searchTerm.trim());
          return; // Warte auf API-Ergebnis
        }
      } else {
        // Normale Text-Suche
        const terms = this.searchTerm.toLowerCase().split(/\s+/);
        
        // Filtere Artikel basierend auf Suchbegriffen
        const filtered = this.globalArtikels.filter((artikel) =>
          terms.every((term) =>
            artikel.article_text.toLowerCase().includes(term) ||
            artikel.article_number?.toLowerCase().includes(term) ||
            artikel.ean?.toLowerCase().includes(term)
          )
        );
        
        // Sortiere nach Prioritätsreihenfolge
        this.filteredArtikels = filtered.sort((a, b) => {
          const searchTermLower = this.searchTerm.toLowerCase();
          
          // Prüfe exakte Übereinstimmungen für jede Prioritätsstufe
          const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
          const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
          const aArticleTextExact = a.article_text.toLowerCase() === searchTermLower;
          const bArticleTextExact = b.article_text.toLowerCase() === searchTermLower;
          const aEanExact = a.ean?.toLowerCase() === searchTermLower;
          const bEanExact = b.ean?.toLowerCase() === searchTermLower;
          
          // Prüfe Teilübereinstimmungen (beginnend mit Suchbegriff)
          const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
          const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
          const aArticleTextStartsWith = a.article_text.toLowerCase().startsWith(searchTermLower);
          const bArticleTextStartsWith = b.article_text.toLowerCase().startsWith(searchTermLower);
          const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
          const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);
          
          // Priorität 1: Exakte Übereinstimmung in article_number
          if (aArticleNumberExact && !bArticleNumberExact) return -1;
          if (!aArticleNumberExact && bArticleNumberExact) return 1;
          
          // Priorität 2: Exakte Übereinstimmung in article_text
          if (aArticleTextExact && !bArticleTextExact) return -1;
          if (!aArticleTextExact && bArticleTextExact) return 1;
          
          // Priorität 3: Exakte Übereinstimmung in ean
          if (aEanExact && !bEanExact) return -1;
          if (!aEanExact && bEanExact) return 1;
          
          // Priorität 4: Beginnt mit Suchbegriff in article_number
          if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
          if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
          
          // Priorität 5: Beginnt mit Suchbegriff in article_text
          if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
          if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
          
          // Priorität 6: Beginnt mit Suchbegriff in ean
          if (aEanStartsWith && !bEanStartsWith) return -1;
          if (!aEanStartsWith && bEanStartsWith) return 1;
          
          // Bei gleicher Priorität: zuerst nach article_number sortieren, dann nach article_text
          const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
          if (articleNumberComparison !== 0) {
            return articleNumberComparison;
          }
          return a.article_text.localeCompare(b.article_text);
        });
        
        // Show dropdown if we have results
        this.showDropdown = this.filteredArtikels.length > 0;
        
        // Reset selection - no automatic selection of first article
        this.selectedIndex = -1;
        
        console.log('🔍 [FILTER] Gefilterte Artikel aktualisiert:', this.filteredArtikels.length);
        if (this.filteredArtikels.length > 0) {
          console.log('🔍 [FILTER] Beispiel Artikel:', {
            article_text: this.filteredArtikels[0].article_text,
            article_number: this.filteredArtikels[0].article_number,
            sale_price: this.filteredArtikels[0].sale_price,
            different_price: this.filteredArtikels[0].different_price
          });
        }
      }
    } else {
      // Wenn kein Suchbegriff vorhanden ist, Reset der Auswahl
      this.selectedIndex = -1;
    }
  }

  /**
   * Vergleicht zwei Artikelnummern intelligent (numerisch und alphabetisch)
   * @param a Erste Artikelnummer
   * @param b Zweite Artikelnummer
   * @returns -1 wenn a < b, 0 wenn a = b, 1 wenn a > b
   */
  private compareArticleNumbers(a: string | undefined, b: string | undefined): number {
    // Behandle undefined/null Werte
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    
    // Versuche numerischen Vergleich für reine Zahlen
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    
    // Wenn beide Artikelnummern reine Zahlen sind, vergleiche sie numerisch
    if (!isNaN(aNum) && !isNaN(bNum) && a.toString() === aNum.toString() && b.toString() === bNum.toString()) {
      return aNum - bNum;
    }
    
    // Ansonsten alphabetischen Vergleich
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  private searchEanInApi(eanCode: string): void {
    const token = localStorage.getItem('token');
    
    this.http.get(`https://multi-mandant-ecommerce.onrender.com/api/product-eans/ean/${eanCode}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          // EAN in products_ean Tabelle gefunden
          const foundArticleNumber = response.data.article_number;
          
          // Prüfe ob dieser Artikel bereits in globalArtikels existiert
          const existingProduct = this.globalArtikels.find(artikel => 
            artikel.article_number === foundArticleNumber
          );
          
          if (existingProduct) {
            // Artikel existiert bereits - zeige ihn an
            this.filteredArtikels = [existingProduct];
            this.showDropdown = true;
            this.selectedIndex = -1;
            
            console.log('🔍 [EAN-API] EAN gefunden und Artikel in globalArtikels vorhanden:', existingProduct.article_text);
          } else {
            // Artikel existiert nicht in globalArtikels - keine Ergebnisse
            this.filteredArtikels = [];
            this.showDropdown = false;
            
            console.log('🔍 [EAN-API] EAN gefunden aber Artikel nicht in globalArtikels:', foundArticleNumber);
          }
        } else {
          // EAN nicht in products_ean Tabelle gefunden
          this.filteredArtikels = [];
          this.showDropdown = false;
          
          console.log('🔍 [EAN-API] EAN nicht in products_ean Tabelle gefunden:', eanCode);
        }
      },
      error: (error: any) => {
        console.error('Error searching EAN in API:', error);
        // Bei Fehler: normale lokale Suche durchführen
        this.performLocalSearch();
      }
    });
  }

  private performLocalSearch(): void {
    if (this.searchTerm) {
      const terms = this.searchTerm.toLowerCase().split(/\s+/);
      
      // Filtere Artikel basierend auf Suchbegriffen
      const filtered = this.globalArtikels.filter((artikel) =>
        terms.every((term) =>
          artikel.article_text.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      );
      
      this.filteredArtikels = filtered;
      this.showDropdown = this.filteredArtikels.length > 0;
      this.selectedIndex = -1;
      
      console.log('🔍 [FALLBACK] Lokale Suche durchgeführt:', this.filteredArtikels.length);
    } else {
      this.filteredArtikels = [];
      this.showDropdown = false;
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

    // Handle Enter key when dropdown is shown but no article is selected
    if (event.key === 'Enter' && this.showDropdown && this.filteredArtikels.length > 0 && this.selectedIndex === -1) {
      event.preventDefault();
      // Don't automatically select the first article - user must use arrow keys to select
      return;
    }

    if (!this.showDropdown || this.filteredArtikels.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Wenn noch kein Element ausgewählt ist, wähle das erste und fokussiere Mengenfeld
        if (this.selectedIndex === -1) {
          this.focusQuantityInput(0);
        } else {
          const nextIndex = Math.min(this.selectedIndex + 1, this.filteredArtikels.length - 1);
          this.focusQuantityInput(nextIndex);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        // Wenn noch kein Element ausgewählt ist, wähle das letzte und fokussiere Mengenfeld
        if (this.selectedIndex === -1) {
          this.focusQuantityInput(this.filteredArtikels.length - 1);
        } else {
          const prevIndex = Math.max(this.selectedIndex - 1, 0);
          this.focusQuantityInput(prevIndex);
        }
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

  scrollToLastArticle() {
    // Warte kurz, damit Angular die DOM-Änderungen verarbeitet hat
    setTimeout(() => {
      if (this.orderTableContainer && this.orderTableContainer.nativeElement && this.orderItems.length > 0) {
        const container = this.orderTableContainer.nativeElement;
        const tableBody = container.querySelector('tbody');
        
        if (tableBody && tableBody.children.length > 0) {
          const lastRow = tableBody.children[tableBody.children.length - 1];
          lastRow.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
          });
        }
      }
    }, 100); // Etwas länger warten für bessere DOM-Synchronisation nach Artikel-Hinzufügung
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



  focusQuantityInput(index: number) {
    // Warte kurz, damit Angular die DOM-Änderungen verarbeitet hat
    setTimeout(() => {
      if (this.articlesDropdown && index >= 0 && index < this.filteredArtikels.length) {
        const dropdownElement = this.articlesDropdown.nativeElement;
        const quantityInputs = dropdownElement.querySelectorAll('.quantity-input') as NodeListOf<HTMLInputElement>;
        
        if (quantityInputs[index]) {
          quantityInputs[index].focus();
          quantityInputs[index].select(); // Markiere den gesamten Text
          this.selectedIndex = index; // Markiere auch den Artikel als ausgewählt
          this.scrollToSelectedItem(); // Scrolle zum ausgewählten Artikel
        }
      }
    }, 50);
  }

  onQuantityInputKeyDown(event: KeyboardEvent, index: number) {
    if (!this.showDropdown || this.filteredArtikels.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        const nextIndex = Math.min(index + 1, this.filteredArtikels.length - 1);
        this.focusQuantityInput(nextIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        this.focusQuantityInput(prevIndex);
        break;
      case 'Enter':
        event.preventDefault();
        this.addArticleFromQuantityInput(index);
        break;
      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  addArticleFromQuantityInput(index: number) {
    if (index >= 0 && index < this.filteredArtikels.length) {
      const artikel = this.filteredArtikels[index];
      
      // Konvertiere die Menge zu einer Zahl und prüfe auf gültige Werte
      let quantity = Number(artikel.quantity);

      // To-do quantity
      
      // Wenn keine Menge eingegeben wurde oder die Menge leer/null/ungültig ist, setze auf 1
      if (!quantity || isNaN(quantity) || quantity <= 0) {
        quantity = 1;
        artikel.quantity = 1;
      } else {
        // Stelle sicher, dass die Menge als ganze Zahl gespeichert wird
        artikel.quantity = Math.floor(quantity);
      }
      
      // Füge den Artikel zum Auftrag hinzu
      this.addToOrder(new Event('enter'), artikel);
      
      // Nur Suchfeld leeren, wenn nicht im Bearbeitungsmodus
      if (this.editingItemIndex === -1) {
        this.clearSearch();
      }
    }
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

    // Get the original item being replaced
    const originalItem = this.orderItems[this.editingItemIndex];
    const originalQuantity = Number(originalItem.quantity);
    const newQuantity = Number(newArtikel.quantity);

    // Remove any existing PFAND items that were associated with the original item
    this.removeAssociatedPfandItems(originalItem);

    // Replace the item at the editing index
    this.orderItems[this.editingItemIndex] = {
      ...newArtikel,
      quantity: newQuantity
    };

    // Check if the new article needs PFAND and add it automatically
    if (newArtikel.custom_field_1) {
      const pfandArtikels = this.globalService.getPfandArtikels();
      const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === newArtikel.custom_field_1);
      
      if (matchingPfand) {
        // Insert PFAND item directly after the replaced item
        const pfandItem = { 
          ...matchingPfand, 
          quantity: newQuantity
        };
        
        // Insert the PFAND item at the position right after the replaced item
        this.orderItems.splice(this.editingItemIndex + 1, 0, pfandItem);
        
        console.log('✅ [PFAND-REPLACE] PFAND-Artikel direkt unter dem ersetzten Artikel eingefügt:', matchingPfand.article_text, 'Menge:', newQuantity);
      }
    }

    // Reset edit mode
    this.editingItemIndex = -1;
    this.editingItemQuantity = 1;
    this.searchTerm = '';
    this.filteredArtikelData();
    this.hideDropdown();

    // Save to localStorage
    this.globalService.saveCustomerOrders(this.orderItems);
  }

  // Helper method to remove PFAND items associated with a specific product
  private removeAssociatedPfandItems(productItem: any): void {
    if (!productItem.custom_field_1) {
      return; // No PFAND associated with this product
    }

    // Find and remove PFAND items that match the custom_field_1 of the product
    const pfandArtikels = this.globalService.getPfandArtikels();
    const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === productItem.custom_field_1);
    
    if (matchingPfand) {
      // Remove PFAND items with the same article_number as the matching PFAND
      this.orderItems = this.orderItems.filter(item => 
        !(item.article_number === matchingPfand.article_number && item.category === 'PFAND')
      );
      console.log('🗑️ [PFAND-REPLACE] PFAND-Artikel entfernt für:', productItem.article_text);
    }
  }

  // Article name editing methods
  startEditArticleName(index: number): void {
    this.editingArticleNameIndex = index;
    this.editingArticleName = this.orderItems[index].article_text;
    
    // Explizit Fokus setzen nach dem nächsten Tick
    setTimeout(() => {
      const inputElement = document.querySelector('.article-name-edit-input') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
        inputElement.select(); // Markiert den gesamten Text
      }
    }, 10); // Kurze Verzögerung für bessere Zuverlässigkeit
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

  // Zusätzliche Methode zum expliziten Abbrechen der Bearbeitung
  forceCancelEditArticleName(): void {
    this.editingArticleNameIndex = -1;
    this.editingArticleName = '';
    this.cdr.detectChanges(); // Erzwingt DOM-Update
  }

  onArticleNameKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') {
      this.saveArticleName(index);
    } else if (event.key === 'Escape') {
      this.cancelEditArticleName();
    }
  }

  onArticleNameFocus(index: number): void {
    // Zusätzliche Sicherheit: Fokus ist aktiv
    console.log('Article name input focused for index:', index);
  }

  // Customer company name editing methods
  startEditCompanyName(): void {
    this.isEditingCompanyName = true;
    this.editingCompanyName = this.differentCompanyName || this.globalService.selectedCustomerForOrders.last_name_company || '';
  }

  saveCompanyName(): void {
    const trimmedName = this.editingCompanyName.trim();
    const originalName = this.globalService.selectedCustomerForOrders.last_name_company || '';
    
    // Nur speichern wenn der Name tatsächlich geändert wurde
    if (trimmedName !== originalName) {
      this.differentCompanyName = trimmedName;
    } else {
      // Wenn der Name gleich ist, zurücksetzen
      this.differentCompanyName = '';
    }
    
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
  }

  cancelEditCompanyName(): void {
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
  }

  onCompanyNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveCompanyName();
    } else if (event.key === 'Escape') {
      this.cancelEditCompanyName();
    }
  }

  // Drag & Drop Methods
  onDragStart(event: DragEvent, index: number): void {
    // Prevent dragging if item is being edited
    if (this.editingItemIndex === index || this.editingArticleNameIndex === index) {
      event.preventDefault();
      return;
    }
    
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const row = target.closest('tr');
    if (row) {
      const index = Array.from(row.parentElement?.children || []).indexOf(row);
      this.dragOverIndex = index;
    }
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;
    
    // Only clear if we're leaving the row entirely
    if (!target.contains(relatedTarget)) {
      this.dragOverIndex = -1;
    }
  }

  onDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();
    
    if (this.draggedIndex === -1 || this.draggedIndex === dropIndex) {
      this.draggedIndex = -1;
      this.dragOverIndex = -1;
      return;
    }

    // Reorder the items
    const draggedItem = this.orderItems[this.draggedIndex];
    const newOrderItems = [...this.orderItems];
    
    // Remove the dragged item
    newOrderItems.splice(this.draggedIndex, 1);
    
    // Insert at the new position
    newOrderItems.splice(dropIndex, 0, draggedItem);
    
    this.orderItems = newOrderItems;
    
    // Save the new order
    this.globalService.saveCustomerOrders(this.orderItems);
    
    // Reset drag state
    this.draggedIndex = -1;
    this.dragOverIndex = -1;
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

    // Spezielle Behandlung für PFAND und SCHNELLVERKAUF-Kategorien: Immer als neue Position hinzufügen
    if (artikel.category === 'PFAND' || artikel.category === 'SCHNELLVERKAUF') {
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

    // Scrolle zur letzten Artikel-Position
    this.scrollToLastArticle();
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

  showArticleNotes(index: number): void {
    const item = this.orderItems[index];
    const notes = item.article_notes || item.notes || item.description || '';
    
    const dialogRef = this.dialog.open(MyDialogComponent, {
      width: '500px',
      data: {
        title: 'Artikel-Notizen',
        message: notes ? notes : 'Keine Notizen für diesen Artikel verfügbar.',
        confirmLabel: 'Schließen',
        showCancel: false
      }
    });
  }

  getArticleNotesTooltip(index: number): string {
    const item = this.orderItems[index];
    const notes = item.article_notes || item.notes || item.description || '';
    return notes ? notes : 'Keine Notizen für diesen Artikel verfügbar.';
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

  // Neue Methode für Input-Event - nur Gesamtsumme aktualisieren, keine Validierung
  onPriceInput(item: any): void {
    // Nur die Gesamtsumme aktualisieren, ohne Validierung
    // Das verhindert, dass unvollständige Eingaben gelöscht werden
    console.log('📝 [PRICE-INPUT] Preis-Eingabe:', item.different_price);
  }

  // Neue Methode für Quantity Input-Event - nur Gesamtsumme aktualisieren, keine Validierung
  onQuantityInput(item: any): void {
    // Nur die Gesamtsumme aktualisieren, ohne Validierung
    // Das verhindert, dass unvollständige Eingaben gelöscht werden
    console.log('📝 [QUANTITY-INPUT] Menge-Eingabe:', item.quantity);
  }

  // Neue Methode für Blur-Event - vollständige Validierung
  validateAndUpdatePrice(item: any): void {
    console.log('💰 [VALIDATE-PRICE] Validiere Preis für Artikel:', item.article_text);
    console.log('💰 [VALIDATE-PRICE] Eingabe:', item.different_price);
    
    // Stelle sicher, dass die Werte numerisch sind
    item.quantity = Number(item.quantity) || 1;
    
    // Prüfe, ob das Preis-Feld leer ist oder ungültige Werte enthält
    if (item.different_price === '' || item.different_price === null || item.different_price === undefined) {
      // Feld ist leer - verwende Standard-Preis
      item.different_price = undefined;
      console.log('🔄 [VALIDATE-PRICE] Feld ist leer - verwende Standard-Preis:', item.sale_price);
    } else {
      // Preis wurde eingegeben - validiere und verwende ihn
      // Konvertiere String zu Number und behandle Dezimalzahlen korrekt
      let newPrice: number;
      
      if (typeof item.different_price === 'string') {
        // Ersetze Komma durch Punkt für korrekte Zahl-Konvertierung
        // Entferne auch alle Leerzeichen
        const cleanPrice = item.different_price.replace(/\s/g, '').replace(',', '.');
        
        // Prüfe, ob es eine gültige Dezimalzahl ist
        if (!/^\d*\.?\d+$/.test(cleanPrice)) {
          console.warn('⚠️ [VALIDATE-PRICE] Ungültiges Format für Dezimalzahl');
          item.different_price = undefined;
          this.updateItemTotal(item);
          return;
        }
        
        newPrice = parseFloat(cleanPrice);
      } else {
        newPrice = Number(item.different_price);
      }
      
      // Validierung: Preis muss positiv sein
      if (isNaN(newPrice) || newPrice < 0) {
        console.warn('⚠️ [VALIDATE-PRICE] Ungültiger Preis, setze auf Standard-Preis');
        item.different_price = undefined;
      } else {
        // Runde auf 2 Dezimalstellen für Konsistenz
        item.different_price = Math.round(newPrice * 100) / 100;
        console.log('✅ [VALIDATE-PRICE] different_price aktualisiert auf:', item.different_price);
      }
    }
    
    // Rufe updateItemTotal auf für die finale Berechnung
    this.updateItemTotal(item);
  }

  // Neue Methode für Quantity Blur-Event - vollständige Validierung
  validateAndUpdateQuantity(item: any): void {
    console.log('📦 [VALIDATE-QUANTITY] Validiere Menge für Artikel:', item.article_text);
    console.log('📦 [VALIDATE-QUANTITY] Eingabe:', item.quantity);
    
    // Prüfe, ob das Quantity-Feld leer ist oder ungültige Werte enthält
    if (item.quantity === '' || item.quantity === null || item.quantity === undefined) {
      // Feld ist leer - setze auf 1
      item.quantity = 1;
      console.log('🔄 [VALIDATE-QUANTITY] Feld ist leer - setze auf 1');
    } else {
      // Menge wurde eingegeben - validiere und verwende sie
      // Konvertiere String zu Number und behandle Dezimalzahlen korrekt
      let newQuantity: number;
      
      if (typeof item.quantity === 'string') {
        // Ersetze Komma durch Punkt für korrekte Zahl-Konvertierung
        // Entferne auch alle Leerzeichen
        const cleanQuantity = item.quantity.replace(/\s/g, '').replace(',', '.');
        
        // Prüfe, ob es eine gültige Dezimalzahl ist
        if (!/^\d*\.?\d+$/.test(cleanQuantity)) {
          console.warn('⚠️ [VALIDATE-QUANTITY] Ungültiges Format für Dezimalzahl');
          item.quantity = 1;
          this.updateItemTotal(item);
          return;
        }
        
        newQuantity = parseFloat(cleanQuantity);
      } else {
        newQuantity = Number(item.quantity);
      }
      
      // Validierung: Menge muss positiv sein und mindestens 0.01
      if (isNaN(newQuantity) || newQuantity < 0.01) {
        console.warn('⚠️ [VALIDATE-QUANTITY] Ungültige Menge, setze auf 1');
        item.quantity = 1;
      } else {
        // Runde auf 2 Dezimalstellen für Konsistenz
        item.quantity = Math.round(newQuantity * 100) / 100;
        console.log('✅ [VALIDATE-QUANTITY] quantity aktualisiert auf:', item.quantity);
      }
    }
    
    // Rufe updateItemTotal auf für die finale Berechnung
    this.updateItemTotal(item);
  }

  updateItemTotal(item: any): void {
    console.log('💰 [UPDATE-ITEM] Aktualisiere Artikel:', item.article_text);
    console.log('💰 [UPDATE-ITEM] Vorher - different_price:', item.different_price);
    console.log('💰 [UPDATE-ITEM] Vorher - sale_price:', item.sale_price);
    console.log('💰 [UPDATE-ITEM] Vorher - quantity:', item.quantity);
    
    // Stelle sicher, dass die Werte numerisch sind (nur für die Berechnung)
    const quantity = Number(item.quantity) || 1;
    
    // Berechne den neuen Gesamtpreis
    const itemPrice = this.getItemPrice(item);
    const totalPrice = itemPrice * quantity;
    
    console.log('💰 [UPDATE-ITEM] Nachher - verwendeter Preis:', itemPrice);
    console.log('💰 [UPDATE-ITEM] Nachher - verwendete Menge:', quantity);
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
    const customerData: any = {
      customer_id: this.globalService.selectedCustomerForOrders.id,
      customer_number: this.globalService.selectedCustomerForOrders.customer_number,
      customer_name: this.globalService.selectedCustomerForOrders.last_name_company,
      customer_addition: this.globalService.selectedCustomerForOrders.name_addition,
      customer_email: this.globalService.selectedCustomerForOrders.email,
      status: 'completed'
    };

    // Nur Kundendaten mitsenden, wenn der Name geändert wurde
    if (this.differentCompanyName) {
      customerData.customer_city = this.globalService.selectedCustomerForOrders.city;
      customerData.customer_street = this.globalService.selectedCustomerForOrders.street;
      customerData.customer_postal_code = this.globalService.selectedCustomerForOrders.postal_code;
      customerData.customer_country_code = this.globalService.selectedCustomerForOrders._country_code;
      customerData.different_company_name = this.differentCompanyName;
    }

    const completeOrder = {
      orderData: {
        ...customerData,
        total_price: this.getOrderTotal(),
        created_at: new Date().toISOString()
      },
      orderItems: this.orderItems
    };


    const token = localStorage.getItem('token');

    console.log('💾 [SAVE-ORDER] Auftrag wird gespeichert:', completeOrder);
    
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
    
    // 4. Leere den geänderten Firmennamen
    this.differentCompanyName = '';
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
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
      const normalizedStreet = customer.street?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedPostalCode = customer.postal_code?.toLowerCase().replace(/\s+/g, '') || '';
      const normalizedEmail = customer.email?.toLowerCase().replace(/\s+/g, '') || '';
      
      const originalCustomerNumber = customer.customer_number?.toLowerCase() || '';
      const originalCompanyName = customer.last_name_company?.toLowerCase() || '';
      const originalNameAddition = customer.name_addition?.toLowerCase() || '';
      const originalCity = customer.city?.toLowerCase() || '';
      const originalStreet = customer.street?.toLowerCase() || '';
      const originalPostalCode = customer.postal_code?.toLowerCase() || '';
      const originalEmail = customer.email?.toLowerCase() || '';
      
      return (
        normalizedCustomerNumber.includes(normalizedSearchTerm) ||
        normalizedCompanyName.includes(normalizedSearchTerm) ||
        normalizedNameAddition.includes(normalizedSearchTerm) ||
        normalizedCity.includes(normalizedSearchTerm) ||
        normalizedStreet.includes(normalizedSearchTerm) ||
        normalizedPostalCode.includes(normalizedSearchTerm) ||
        normalizedEmail.includes(normalizedSearchTerm) ||
        originalCustomerNumber.includes(searchTerm) ||
        originalCompanyName.includes(searchTerm) ||
        originalNameAddition.includes(searchTerm) ||
        originalCity.includes(searchTerm) ||
        originalStreet.includes(searchTerm) ||
        originalPostalCode.includes(searchTerm) ||
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
    
    // Lösche den geänderten Firmennamen beim Kundenwechsel
    this.differentCompanyName = '';
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
    console.log('🧹 [SELECT-CUSTOMER] Geänderter Firmenname zurückgesetzt');
    
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
    
    // Lösche den geänderten Firmennamen
    this.differentCompanyName = '';
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
    console.log('🗑️ [CLEAR-CUSTOMER] Geänderter Firmenname zurückgesetzt');
    
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
    // Clear any active notification when closing modal
    this.hideArticlePricesNotification();
  }

  showArticlePricesNotification(articleName: string, quantity: number) {
    // Clear any existing timeout
    if (this.articlePricesNotificationTimeout) {
      clearTimeout(this.articlePricesNotificationTimeout);
    }
    
    // Set notification text
    this.articlePricesNotificationText = `${quantity}x "${articleName}" zum Auftrag hinzugefügt`;
    this.isArticlePricesNotificationVisible = true;
    
    // Auto-hide after 3 seconds
    this.articlePricesNotificationTimeout = setTimeout(() => {
      this.hideArticlePricesNotification();
    }, 3000);
  }

  hideArticlePricesNotification() {
    this.isArticlePricesNotificationVisible = false;
    this.articlePricesNotificationText = '';
    if (this.articlePricesNotificationTimeout) {
      clearTimeout(this.articlePricesNotificationTimeout);
      this.articlePricesNotificationTimeout = null;
    }
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
      
      // Spezielle Behandlung für PFAND und SCHNELLVERKAUF-Kategorien: Immer als neue Position hinzufügen
      if (artikel.category === 'PFAND' || artikel.category === 'SCHNELLVERKAUF') {
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
      
      // Zeige Benachrichtigung
      this.showArticlePricesNotification(artikel.article_text || artikel.article_name || 'Unbekannter Artikel', quantity);
      
      // Setze die temporäre Menge zurück
      customerPrice.tempQuantity = null;
      
      // Modal bleibt offen - nicht mehr automatisch schließen
      // this.closeArticlePricesModal();

      // Scrolle zur letzten Artikel-Position
      this.scrollToLastArticle();
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

  // EAN Assignment Methods
  openEanAssignmentModal(item: any): void {
    this.eanAssignmentItem = item;
    this.eanCode = '';
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
    this.isEanAssignmentModalOpen = true;
    this.isEanScanning = false;
    this.isAssigningEan = false;
    
    // Set focus on EAN input field after modal is opened
    setTimeout(() => {
      if (this.eanCodeInput) {
        this.eanCodeInput.nativeElement.focus();
      }
    }, 100);
  }

  closeEanAssignmentModal(): void {
    this.isEanAssignmentModalOpen = false;
    this.eanAssignmentItem = null;
    this.eanCode = '';
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
    this.isEanScanning = false;
    this.isAssigningEan = false;
  }

  startEanScanner(): void {
    this.isEanScanning = true;
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';
  }

  stopEanScanner(): void {
    this.isEanScanning = false;
  }

  onEanCodeResult(result: string): void {
    this.eanCode = result;
    this.stopEanScanner();
    this.playBeep();
  }

  assignEan(): void {
    if (!this.eanCode.trim()) {
      this.eanErrorMessage = 'Bitte geben Sie einen EAN-Code ein.';
      return;
    }

    if (!/^\d{8}$|^\d{13}$/.test(this.eanCode.trim())) {
      this.eanErrorMessage = 'EAN-Code muss genau 8 oder 13 Ziffern enthalten.';
      return;
    }

    this.isAssigningEan = true;
    this.eanErrorMessage = '';
    this.eanSuccessMessage = '';

    const token = localStorage.getItem('token');
    const payload = {
      article_number: this.eanAssignmentItem.article_number,
      ean: this.eanCode.trim()
    };

    this.http.post('https://multi-mandant-ecommerce.onrender.com/api/product-eans/assign', payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }).subscribe({
      next: (response: any) => {
        this.isAssigningEan = false;
        if (response.success) {
          this.eanSuccessMessage = 'EAN-Code erfolgreich zugeordnet!';
          
          // Update the item in the order
          this.eanAssignmentItem.ean = this.eanCode.trim();
          
          setTimeout(() => {
            this.closeEanAssignmentModal();
          }, 2000);
        } else {
          this.eanErrorMessage = response.message || 'Fehler beim Zuordnen des EAN-Codes.';
        }
      },
      error: (error: any) => {
        this.isAssigningEan = false;
        console.error('Error assigning EAN:', error);
        this.eanErrorMessage = error.error?.message || 'Fehler beim Zuordnen des EAN-Codes.';
      }
    });
  }

  removeEanFromItem(item: any): void {
    if (confirm('Möchten Sie die EAN-Zuordnung für diesen Artikel wirklich entfernen?')) {
      const token = localStorage.getItem('token');
      
      this.http.delete(`https://multi-mandant-ecommerce.onrender.com/api/product-eans/ean/${item.ean}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).subscribe({
        next: (response: any) => {
          if (response.success) {
            // Remove EAN from the item
            item.ean = undefined;
            console.log('EAN erfolgreich entfernt');
          } else {
            console.error('Fehler beim Entfernen der EAN:', response.message);
          }
        },
        error: (error: any) => {
          console.error('Error removing EAN:', error);
        }
      });
    }
  }

  // Methode zur Bestimmung der CSS-Klasse basierend auf Textlänge
  getArticleTitleClass(articleText: string): string {
    if (!articleText) return '';
    
    const length = articleText.length;
    if (length > 80) return 'extremely-long-text';
    if (length > 60) return 'very-long-text';
    if (length > 40) return 'long-text';
    return '';
  }
}