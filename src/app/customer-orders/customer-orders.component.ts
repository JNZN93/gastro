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
  @ViewChild('mobileSearchInput') mobileSearchInput!: any;
  @ViewChild('articlesDropdown') articlesDropdown!: any;
  @ViewChild('orderTableContainer') orderTableContainer!: any;
  @ViewChild('eanCodeInput') eanCodeInput!: any;
  @ViewChild('imageInput') imageInput!: any;
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
  isAnalyzingImages = false;
  
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

  // Toast für mobile/tablet Artikel-Hinzufügung
  isMobileToastVisible: boolean = false;
  mobileToastText: string = '';
  mobileToastTimeout: any = null;
  
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
  
  // Mobile Tab properties
  activeTab: 'search' | 'order' | 'prices' = 'search';
  
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
    
    // Prüfe auf pending order data aus dem Admin-Bereich
    this.checkForPendingOrderData();
    
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
          // Benutzerrolle und Name im GlobalService setzen
          this.globalService.setUserRole(response.user.role);
          this.globalService.setUserName(response.user.name || response.user.email || 'Benutzer');
          
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

  // Image analyze upload handlers
  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      input.value = '';
      return;
    }
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    this.isAnalyzingImages = true;
    const token = localStorage.getItem('token');

    fetch('https://multi-mandant-ecommerce.onrender.com/api/orders/analyze-images', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    })
    .then((response) => {
      const suggestion = response?.data?.orderSuggestion?.orderItems || [];
      let addedCount = 0;
      suggestion.forEach((sItem: any) => {
        const artikel = this.globalArtikels.find(a => a.article_number === sItem.article_number);
        if (artikel) {
          const artikelWithQty = { ...artikel, quantity: Number(sItem.quantity) || 1 };
          this.addToOrder(new Event('analyze-images'), artikelWithQty);
          addedCount++;
        }
      });
      // Info-Hinweise für Mobile/Tablet: nutze vorhandenes Toast-Schema mit Dummy-Werten
      if (addedCount > 0) {
        this.showMobileToast('Bild-Analyse', addedCount);
      } else {
        this.showMobileToast('Keine Treffer', 0);
      }
    })
    .catch((err) => {
      console.error('Fehler bei Bildanalyse:', err);
      this.showMobileToast('Analyse fehlgeschlagen', 0);
    })
    .finally(() => {
      this.isAnalyzingImages = false;
      if (this.imageInput && this.imageInput.nativeElement) {
        this.imageInput.nativeElement.value = '';
      } else {
        (event.target as HTMLInputElement).value = '';
      }
    });
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
      
      // Stelle sicher, dass die Aufträge korrekte Preise haben
      this.orderItems = savedOrders.map(orderItem => {
        // Validiere und korrigiere different_price Werte
        let correctedDifferentPrice = undefined;
        if (orderItem.different_price !== undefined && orderItem.different_price !== null && orderItem.different_price !== '') {
          const parsedPrice = parseFloat(orderItem.different_price);
          if (!isNaN(parsedPrice) && parsedPrice >= 0) {
            correctedDifferentPrice = Math.round(parsedPrice * 100) / 100; // Runde auf 2 Dezimalstellen
          } else {
            console.warn('⚠️ [LOAD-STORED] Ungültiger different_price Wert gefunden:', orderItem.different_price, 'für Artikel:', orderItem.article_text);
          }
        }
        
        // Stelle sicher, dass original_price korrekt gesetzt ist
        const originalPrice = orderItem.original_price || orderItem.sale_price;
        
        return {
          ...orderItem,
          different_price: correctedDifferentPrice,
          original_price: originalPrice,
          // Stelle sicher, dass sale_price immer den Standard-Preis enthält
          sale_price: originalPrice
        };
      });
      
      console.log('✅ [LOAD-STORED] Aufträge mit korrigierten Preisen geladen');
      console.log('📊 [LOAD-STORED] Aufträge mit different_price:', this.orderItems.filter(item => item.different_price !== undefined).length);
    }
  }

  // Prüfe auf pending order data aus dem Admin-Bereich
  private checkForPendingOrderData(): void {
    const pendingOrderData = localStorage.getItem('pendingOrderData');
    if (pendingOrderData) {
      console.log('📥 [PENDING-ORDER] Pending Order Data gefunden');
      
      try {
        const orderData = JSON.parse(pendingOrderData);
        console.log('📦 [PENDING-ORDER] Bestelldaten:', orderData);
        
        // Prüfe, ob bereits ein Auftrag vorhanden ist
        if (this.orderItems.length > 0) {
          // Zeige Bestätigungsdialog
          this.showReplaceOrderConfirmation(orderData);
        } else {
          // Lade die Bestellung direkt
          this.loadOrderData(orderData);
        }
        
        // Entferne die pending order data aus localStorage
        localStorage.removeItem('pendingOrderData');
        
      } catch (error) {
        console.error('❌ [PENDING-ORDER] Fehler beim Parsen der Bestelldaten:', error);
        localStorage.removeItem('pendingOrderData');
      }
    }
  }

  // Zeige Bestätigungsdialog zum Ersetzen des aktuellen Auftrags
  private showReplaceOrderConfirmation(orderData: any): void {
    const dialogRef = this.dialog.open(MyDialogComponent, {
      width: '400px',
      data: {
        title: 'Auftrag ersetzen',
        message: `Sie haben bereits einen Auftrag mit ${this.orderItems.length} Artikel(n) in Bearbeitung. Möchten Sie diesen durch die neue Bestellung ersetzen?`,
        isConfirmation: true,
        confirmLabel: 'Ersetzen',
        cancelLabel: 'Abbrechen'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.loadOrderData(orderData);
      }
    });
  }

  // Lade die Bestelldaten in die Customer Orders Komponente
  private loadOrderData(orderData: any): void {
    console.log('🔄 [LOAD-ORDER-DATA] Lade Bestelldaten:', orderData);
    
    // Setze den Kunden basierend auf der Kundennummer
    if (orderData.customer && orderData.customer.customer_number) {
      console.log('👤 [LOAD-ORDER-DATA] Suche Kunde mit Kundennummer:', orderData.customer.customer_number);
      
      // Lade den Kunden direkt aus der API
      this.loadCustomerByNumber(orderData.customer.customer_number, orderData);
    }
    
    // Setze die Bestellartikel
    if (orderData.items && orderData.items.length > 0) {
      console.log('📦 [LOAD-ORDER-DATA] Setze Bestellartikel:', orderData.items.length);
      
      // Check: Prüfe ob alle Artikel in globalArtikels vorhanden sind
      // Nach der Transformation in order-overview haben die Artikel die Felder article_number und article_text
      let missingArticles: any[] = [];
      
      // Warte bis globalArtikels vollständig geladen sind
      if (this.globalArtikels.length === 0) {
        console.log('⏳ [LOAD-ORDER-DATA] globalArtikels noch nicht geladen, überspringe Prüfung');
        // Keine Prüfung durchführen, wenn globalArtikels noch nicht geladen sind
      } else {
        console.log('🔍 [LOAD-ORDER-DATA] Debug: Prüfe Artikel in globalArtikels');
        console.log('🔍 [LOAD-ORDER-DATA] Anzahl globalArtikels:', this.globalArtikels.length);
        console.log('🔍 [LOAD-ORDER-DATA] Anzahl orderData.items:', orderData.items.length);
        
        // Zeige die ersten 5 Artikel aus globalArtikels für Debugging
        console.log('🔍 [LOAD-ORDER-DATA] Erste 5 Artikel aus globalArtikels:');
        this.globalArtikels.slice(0, 5).forEach((art, index) => {
          console.log(`   ${index + 1}. ${art.article_text} (${art.article_number})`);
        });
        
        // Zeige die ersten 5 Artikel aus orderData.items für Debugging
        console.log('🔍 [LOAD-ORDER-DATA] Erste 5 Artikel aus orderData.items:');
        orderData.items.slice(0, 5).forEach((item: any, index: number) => {
          console.log(`   ${index + 1}. ${item.article_text} (${item.article_number})`);
        });
        
        missingArticles = orderData.items.filter((item: any) => {
          const articleNumber = item.article_number;
          const foundInGlobal = this.globalArtikels.some((art: any) => {
            const match = art.article_number === articleNumber;
            if (!match) {
              console.log(`🔍 [LOAD-ORDER-DATA] Vergleich: "${art.article_number}" !== "${articleNumber}" für Artikel: ${item.article_text}`);
            }
            return match;
          });
          if (!foundInGlobal) {
            console.warn(`⚠️ [LOAD-ORDER-DATA] Artikel nicht in globalArtikels gefunden: ${item.article_text} (${articleNumber})`);
          }
          return !foundInGlobal;
        });
      }

      if (missingArticles.length > 0) {
        const missingArticleNames = missingArticles.map((item: any) => {
          return `${item.article_text} (${item.article_number})`;
        }).join(', ');
        console.warn(`⚠️ [LOAD-ORDER-DATA] ${missingArticles.length} Artikel nicht in globalArtikels gefunden: ${missingArticleNames}`);
        
        // Zeige Warnung an den Benutzer
        const warningMessage = `${missingArticles.length} Artikel konnten nicht in der Artikeldatenbank gefunden werden:\n${missingArticleNames}\n\nDiese Artikel werden trotzdem importiert, aber möglicherweise nicht korrekt angezeigt.`;
        alert(warningMessage);
      }
      
      // Transformiere die Artikel in das erwartete Format
      this.orderItems = orderData.items.map((item: any) => ({
        ...item,
        quantity: item.quantity || 1,
        article_text: item.product_name || item.article_text || 'Unbekannter Artikel',
        article_number: item.product_article_number || item.article_number || '',
        sale_price: item.price || item.sale_price || 0,
        cost_price: item.cost_price || 0,
        different_price: item.different_price,
        original_price: item.original_price || item.sale_price || item.price || 0
      }));
      
      // Speichere die Aufträge
      this.globalService.saveCustomerOrders(this.orderItems);
      
      console.log('✅ [LOAD-ORDER-DATA] Bestellartikel erfolgreich geladen');
    }
    
    // Wechsle zum Auftrag-Tab bei mobiler Ansicht
    if (window.innerWidth <= 768) {
      this.setActiveTab('order');
    }
    
    console.log('🎉 [LOAD-ORDER-DATA] Bestellung erfolgreich geladen!');
  }



  // Neue Methode zum Laden eines Kunden anhand der Kundennummer
  private loadCustomerByNumber(customerNumber: string, orderData: any): void {
    console.log('🔍 [LOAD-CUSTOMER-BY-NUMBER] Lade Kunde mit Nummer:', customerNumber);
    
    const token = localStorage.getItem('token');
    
    // Versuche zuerst, den Kunden aus der bereits geladenen Kundenliste zu finden
    const foundCustomer = this.customers.find(customer => 
      customer.customer_number === customerNumber
    );
    
    if (foundCustomer) {
      console.log('✅ [LOAD-CUSTOMER-BY-NUMBER] Kunde in lokaler Liste gefunden:', foundCustomer);
      this.setCustomerFromOrderData(foundCustomer, orderData);
      return;
    }
    
    // Wenn nicht in lokaler Liste, lade alle Kunden und suche dann
    console.log('🔄 [LOAD-CUSTOMER-BY-NUMBER] Kunde nicht in lokaler Liste, lade alle Kunden...');
    
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
      
      // Suche den Kunden in der geladenen Liste
      const customer = this.customers.find(c => c.customer_number === customerNumber);
      
      if (customer) {
        console.log('✅ [LOAD-CUSTOMER-BY-NUMBER] Kunde gefunden:', customer);
        this.setCustomerFromOrderData(customer, orderData);
      } else {
        console.warn('⚠️ [LOAD-CUSTOMER-BY-NUMBER] Kunde nicht gefunden:', customerNumber);
        // Erstelle einen minimalen Kunden mit nur der Kundennummer als Fallback
        const fallbackCustomer = {
          id: 0,
          customer_number: customerNumber,
          last_name_company: `Kunde ${customerNumber}`,
          name_addition: '',
          email: '',
          street: '',
          city: '',
          postal_code: '',
          _country_code: ''
        };
        this.setCustomerFromOrderData(fallbackCustomer, orderData);
      }
    })
    .catch(error => {
      console.error('❌ [LOAD-CUSTOMER-BY-NUMBER] Fehler beim Laden der Kunden:', error);
      // Erstelle einen minimalen Kunden mit nur der Kundennummer als Fallback
      const fallbackCustomer = {
        id: 0,
        customer_number: customerNumber,
        last_name_company: `Kunde ${customerNumber}`,
        name_addition: '',
        email: '',
        street: '',
        city: '',
        postal_code: '',
        _country_code: ''
      };
      this.setCustomerFromOrderData(fallbackCustomer, orderData);
    });
  }

  // Hilfsmethode zum Setzen des Kunden
  private setCustomerFromOrderData(customer: any, orderData: any): void {
    console.log('👤 [SET-CUSTOMER] Setze Kunde:', customer);
    this.globalService.setSelectedCustomerForOrders(customer);
    
    // Setze den geänderten Firmennamen falls vorhanden
    if (orderData.differentCompanyName) {
      this.differentCompanyName = orderData.differentCompanyName;
    }
    
    // Lade kundenspezifische Preise
    this.loadCustomerArticlePrices(customer.customer_number);
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

    // test log for commit
    
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

  // Hilfsmethode um den Fokus auf das Suchfeld zu setzen
  focusSearchInput(): void {
    // In mobile and tablet view, automatically switch to search tab
    if (window.innerWidth <= 768) {
      this.setActiveTab('search');
    }
    
    setTimeout(() => {
      // Verwende das korrekte Input-Feld basierend auf der Bildschirmgröße
      const isMobile = window.innerWidth <= 768;
      const targetInput = isMobile ? this.mobileSearchInput : this.searchInput;
      
      if (targetInput && targetInput.nativeElement) {
        // Fokus setzen und explizit den Cursor in das Feld setzen
        targetInput.nativeElement.focus();
        targetInput.nativeElement.select(); // Selektiert den gesamten Text (falls vorhanden)
        
        // Zusätzlich für mobile Geräte: Click-Event simulieren für bessere Tastatur-Aktivierung
        if (isMobile && 'ontouchstart' in window) {
          targetInput.nativeElement.click();
        }
      }
    }, 150); // Etwas länger warten für bessere mobile Kompatibilität
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

      // Wenn keine Menge eingegeben wurde oder die Menge leer/null/ungültig ist, setze auf 1
      if (!quantity || isNaN(quantity)) {
        quantity = 1;
        artikel.quantity = 1;
      } else {
        // Übernehme die Menge exakt wie eingegeben, ohne Rundung (auch negative Zahlen)
        artikel.quantity = quantity;
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
    
    // Fokussiere auf das Suchfeld
    this.focusSearchInput();
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

    // Find the index of the product item
    const productIndex = this.orderItems.findIndex(item => 
      item.article_number === productItem.article_number && 
      item.quantity === productItem.quantity &&
      item === productItem // Exact reference match
    );

    if (productIndex === -1) {
      return; // Product not found
    }

    // Find and remove PFAND items that match the custom_field_1 of the product
    const pfandArtikels = this.globalService.getPfandArtikels();
    const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === productItem.custom_field_1);
    
    if (matchingPfand) {
      // Check if there's a PFAND item directly after the product item
      const nextItemIndex = productIndex + 1;
      if (nextItemIndex < this.orderItems.length) {
        const nextItem = this.orderItems[nextItemIndex];
        
        // Only remove if the next item is the matching PFAND item
        if (nextItem.article_number === matchingPfand.article_number && 
            nextItem.category === 'PFAND') {
          
          // Remove only this specific PFAND item
          this.orderItems.splice(nextItemIndex, 1);
          console.log('🗑️ [PFAND-REPLACE] PFAND-Artikel entfernt für:', productItem.article_text, 'an Position', nextItemIndex);
        } else {
          console.log('⚠️ [PFAND-REPLACE] Kein zugehöriger PFAND-Artikel direkt nach', productItem.article_text, 'gefunden');
        }
      } else {
        console.log('⚠️ [PFAND-REPLACE] Kein Artikel nach', productItem.article_text, 'gefunden');
      }
    }
  }

  // Alternative method: Remove PFAND items based on quantity matching
  private removeAssociatedPfandItemsByQuantity(productItem: any): void {
    if (!productItem.custom_field_1) {
      return; // No PFAND associated with this product
    }

    const pfandArtikels = this.globalService.getPfandArtikels();
    const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === productItem.custom_field_1);
    
    if (matchingPfand) {
      // Find PFAND items with the same quantity as the product
      const productQuantity = Number(productItem.quantity);
      
      // Remove PFAND items that match both article_number and quantity
      this.orderItems = this.orderItems.filter(item => {
        if (item.article_number === matchingPfand.article_number && 
            item.category === 'PFAND' && 
            Number(item.quantity) === productQuantity) {
          console.log('🗑️ [PFAND-REPLACE] PFAND-Artikel entfernt für:', productItem.article_text, 'Menge:', productQuantity);
          return false; // Remove this item
        }
        return true; // Keep this item
      });
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
      isNaN(Number(artikel.quantity))
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

    // Zeige Toast für mobile/tablet Ansicht
    this.showMobileToast(artikel.article_text || artikel.article_name || 'Artikel', Number(artikel.quantity));

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
    
    // Fokussiere zurück auf das Suchfeld in Desktop-Ansicht oder wenn im search Tab in mobile/tablet Ansicht
    if (!this.isMobileOrTabletView() || (this.isMobileOrTabletView() && this.activeTab === 'search')) {
      this.focusSearchInput();
    }

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
      // Robuste Preis-Validierung für getOrderTotal
      let priceToUse: number;
      
      // Prüfe different_price zuerst
      if (item.different_price !== undefined && item.different_price !== null && item.different_price !== '') {
        const parsedDifferentPrice = parseFloat(item.different_price);
        if (!isNaN(parsedDifferentPrice) && parsedDifferentPrice >= 0) {
          priceToUse = parsedDifferentPrice;
        } else {
          // Ungültiger different_price - verwende sale_price
          console.warn('⚠️ [GET-ORDER-TOTAL] Ungültiger different_price:', item.different_price, 'für Artikel:', item.article_text, '- verwende sale_price');
          priceToUse = parseFloat(item.sale_price) || 0;
        }
      } else {
        // Kein different_price - verwende sale_price
        priceToUse = parseFloat(item.sale_price) || 0;
      }
      
      // Validiere auch die Menge
      const quantity = parseFloat(item.quantity) || 0;
      
      return sum + (priceToUse * quantity);
    }, 0);
  }

  // Hilfsmethode um den korrekten Preis für ein orderItem zu bekommen
  getItemPrice(item: any): number {
    // Robuste Preis-Validierung für getItemPrice
    if (item.different_price !== undefined && item.different_price !== null && item.different_price !== '') {
      const parsedDifferentPrice = parseFloat(item.different_price);
      if (!isNaN(parsedDifferentPrice) && parsedDifferentPrice >= 0) {
        return parsedDifferentPrice;
      } else {
        // Ungültiger different_price - verwende sale_price
        console.warn('⚠️ [GET-ITEM-PRICE] Ungültiger different_price:', item.different_price, 'für Artikel:', item.article_text, '- verwende sale_price');
      }
    }
    
    // Fallback auf sale_price
    return parseFloat(item.sale_price) || 0;
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
        
        // Prüfe, ob es eine gültige Dezimalzahl ist (erlaubt jetzt auch negative Zahlen)
        if (!/^-?\d*\.?\d+$/.test(cleanQuantity)) {
          console.warn('⚠️ [VALIDATE-QUANTITY] Ungültiges Format für Dezimalzahl');
          item.quantity = 1;
          this.updateItemTotal(item);
          return;
        }
        
        newQuantity = parseFloat(cleanQuantity);
      } else {
        newQuantity = Number(item.quantity);
      }
      
      // Validierung: Menge darf nicht NaN sein, aber negative Zahlen sind jetzt erlaubt
      if (isNaN(newQuantity)) {
        console.warn('⚠️ [VALIDATE-QUANTITY] Ungültige Menge, setze auf 1');
        item.quantity = 1;
      } else {
        // Runde auf 3 Dezimalstellen für Konsistenz
        item.quantity = Math.round(newQuantity * 1000) / 1000;
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

    // Prüfe auf Verkaufspreise unter EK-Preis
    const itemsBelowCost = this.orderItems.filter(item => {
      const sellingPrice = item.different_price !== undefined ? item.different_price : item.sale_price;
      return item.cost_price && sellingPrice < item.cost_price;
    });

    if (itemsBelowCost.length > 0) {
      const itemNames = itemsBelowCost.map(item => 
        `${item.article_text} (VK: €${(item.different_price !== undefined ? item.different_price : item.sale_price).toFixed(2)} < EK: €${item.cost_price.toFixed(2)})`
      ).join('\n');
      
      const confirmMessage = `⚠️ WARNUNG: Folgende Artikel werden unter dem Einkaufspreis verkauft:\n\n${itemNames}\n\nMöchten Sie den Auftrag trotzdem speichern?`;
      
      if (!confirm(confirmMessage)) {
        console.log('❌ [SAVE-ORDER] Auftrag wegen EK-Preis-Warnung abgebrochen');
        return;
      }
    } else {
      // Allgemeine Bestätigungsabfrage für den normalen Fall
      const orderSummary = this.orderItems.map(item => 
        `${item.quantity}x ${item.article_text} - €${((item.different_price !== undefined ? item.different_price : item.sale_price) * item.quantity).toFixed(2)}`
      ).join('\n');
      
      const totalPrice = this.getOrderTotal();
      const customerName = this.globalService.selectedCustomerForOrders.last_name_company;
      
      const confirmMessage = `📋 Auftrag bestätigen\n\nKunde: ${customerName}\n\nArtikel:\n${orderSummary}\n\nGesamtpreis: €${totalPrice.toFixed(2)}\n\nMöchten Sie diesen Auftrag speichern?`;
      
      if (!confirm(confirmMessage)) {
        console.log('❌ [SAVE-ORDER] Auftrag vom Benutzer abgebrochen');
        return;
      }
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

  // Mobile/Tablet Toast Methoden
  showMobileToast(articleName: string, quantity: number) {
    this.mobileToastText = `✅ ${articleName} (${quantity}x) hinzugefügt`;
    this.isMobileToastVisible = true;
    
    // Toast nach 3 Sekunden ausblenden
    if (this.mobileToastTimeout) {
      clearTimeout(this.mobileToastTimeout);
    }
    this.mobileToastTimeout = setTimeout(() => {
      this.hideMobileToast();
    }, 3000);
  }

  hideMobileToast() {
    this.isMobileToastVisible = false;
    this.mobileToastText = '';
    if (this.mobileToastTimeout) {
      clearTimeout(this.mobileToastTimeout);
      this.mobileToastTimeout = null;
    }
  }

  // Hilfsmethode um zu prüfen, ob wir in der mobilen/tablet Ansicht sind
  private isMobileOrTabletView(): boolean {
    return window.innerWidth <= 1023;
  }

  clearArticlePricesSearch() {
    this.articlePricesSearchTerm = '';
    this.filterArticlePrices();
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
        } else {
          console.warn('⚠️ [PFAND-ADD] PFAND-Artikel nicht gefunden für custom_field_1:', artikel.custom_field_1);
        }
      }
      
      // Speichere den Zustand
      this.globalService.saveCustomerOrders(this.orderItems);
      
      console.log('✅ [ARTICLE-PRICES-MODAL] Artikel erfolgreich zum Auftrag hinzugefügt');
      
      // Zeige Benachrichtigung
      this.showArticlePricesNotification(artikel.article_text || artikel.article_name || 'Unbekannter Artikel', quantity);
      
      // Zeige Toast für mobile/tablet Ansicht
      this.showMobileToast(artikel.article_text || artikel.article_name || 'Artikel', quantity);
      
      // Setze die temporäre Menge zurück
      customerPrice.tempQuantity = null;
      
      // Modal bleibt offen - nicht mehr automatisch schließen
      // this.closeArticlePricesModal();

      // Nur in Desktop-Ansicht: Fokussiere zurück auf das Suchfeld und wechsle Tab
      if (!this.isMobileOrTabletView()) {
        this.focusSearchInput();
      }

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

  // Methode zur Validierung von EAN-Codes (8 oder 13 Ziffern)
  isValidEanCode(eanCode: string): boolean {
    if (!eanCode || !eanCode.trim()) return false;
    return /^\d{8}$|^\d{13}$/.test(eanCode.trim());
  }

  // Methode um nur Zahlen in EAN-Eingabefeld zu erlauben
  onEanInput(event: any): void {
    const input = event.target;
    const value = input.value;
    
    // Entferne alle nicht-numerischen Zeichen
    const numericValue = value.replace(/[^0-9]/g, '');
    
    // Begrenze auf maximal 13 Ziffern
    const limitedValue = numericValue.slice(0, 13);
    
    // Aktualisiere den Wert nur wenn er sich geändert hat
    if (value !== limitedValue) {
      input.value = limitedValue;
      this.eanCode = limitedValue;
    }
  }

  // Mobile Tab methods
  setActiveTab(tab: 'search' | 'order' | 'prices'): void {
    if (tab === 'prices' && !this.globalService.selectedCustomerForOrders) {
      return; // Don't allow switching to prices tab if no customer is selected
    }
    
    this.activeTab = tab;
    
    // Wenn zum Preise-Tab gewechselt wird, initialisiere die gefilterten Artikel-Preise
    if (tab === 'prices') {
      this.articlePricesSearchTerm = '';
      this.filterArticlePrices();
    }
  }

  // Advanced method: Add unique PFAND association with parent reference
  private addPfandWithParentReference(artikel: any, quantity: number, parentIndex: number): void {
    if (!artikel.custom_field_1) {
      return;
    }

    const pfandArtikels = this.globalService.getPfandArtikels();
    const matchingPfand = pfandArtikels.find(pfand => pfand.article_number === artikel.custom_field_1);
    
    if (matchingPfand) {
      const pfandItem = { 
        ...matchingPfand, 
        quantity: quantity,
        parentArticleIndex: parentIndex, // Reference to parent article
        parentArticleNumber: artikel.article_number // Backup reference
      };
      
      // Insert the PFAND item at the position right after the parent item
      this.orderItems.splice(parentIndex + 1, 0, pfandItem);
      console.log('✅ [PFAND-ADD] PFAND-Artikel mit Parent-Referenz hinzugefügt:', matchingPfand.article_text, 'Menge:', quantity, 'Parent:', artikel.article_text);
    }
  }

  // Advanced method: Remove PFAND items based on parent reference
  private removeAssociatedPfandItemsByParentReference(productItem: any, productIndex: number): void {
    if (!productItem.custom_field_1) {
      return;
    }

    // Remove PFAND items that reference this product as parent
    this.orderItems = this.orderItems.filter((item, index) => {
      if (item.category === 'PFAND' && 
          (item.parentArticleIndex === productIndex || 
           item.parentArticleNumber === productItem.article_number)) {
        console.log('🗑️ [PFAND-REPLACE] PFAND-Artikel mit Parent-Referenz entfernt für:', productItem.article_text);
        return false; // Remove this item
      }
      return true; // Keep this item
    });
  }
}