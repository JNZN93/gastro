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
import { RecentImagesModalComponent } from '../recent-images-modal/recent-images-modal.component';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import { IndexedDBService } from '../indexeddb.service';
import { OffersService, OfferWithProducts, OfferProduct } from '../offers.service';
import { ForceActiveService } from '../force-active.service';
import { OrderService } from '../order.service';
import * as QRCode from 'qrcode';
import { environment } from '../../environments/environment';
import { firstValueFrom, Subscription } from 'rxjs';

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
  private indexedDBService = inject(IndexedDBService);
  private offersService = inject(OffersService);
  private forceActiveService = inject(ForceActiveService);
  private orderService = inject(OrderService);
  private forceActiveSubscription: Subscription | null = null;
  artikelData: any[] = [];
  orderItems: any[] = [];
  orderItems2: any[] = []; // Zweite Tabelle für Split-Modus
  isSplitMode: boolean = false;
  activeTable: 1 | 2 = 1; // Welche Tabelle ist gerade aktiv für Artikelhinzufügung
  searchTerm: string = '';
  customerNotes1: string = ''; // Anmerkungen für Auftrag 1 im Split-Modus
  customerNotes2: string = ''; // Anmerkungen für Auftrag 2 im Split-Modus
  globalArtikels: any[] = [];
  filteredArtikels: any[] = [];
  customerArticlePrices: any[] = []; // Neue Property für Kunden-Artikel-Preise
  pendingCustomerForPriceUpdate: any = null; // Temporärer Kunde für Preis-Updates nach dem Laden der Artikel
  isVisible: boolean = true;
  isScanning = false;
  isAnalyzingImages = false;
  isCostPriceBlurred: boolean = true; // EK-Preis Blur-Effekt aktiviert (Standard)
  activeOfferFirst: OfferWithProducts | null = null;
  
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
  
  // Edit mode for article prices modal
  isEditingArticlePrices: boolean = false;
  /** Wird true während auf die Kunden-Artikel-Preise gewartet wird (z. B. beim Klick auf Bearbeiten). */
  isLoadingArticlePrices: boolean = false;
  
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
  
  // Order confirmation modal properties
  isOrderConfirmationModalOpen: boolean = false;
  orderConfirmationData: any = null;
  isSavingOrder: boolean = false;
  isSavingAsOpen: boolean = false; // Flag für Zwischenspeichern (Status: open)
  eanAssignmentItem: any = null;
  eanCode: string = '';
  isEanScanning: boolean = false;
  isAssigningEan: boolean = false;
  eanErrorMessage: string = '';
  eanSuccessMessage: string = '';
  existingEans: any[] = [];
  isLoadingEans: boolean = false;
  
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
  
  // Edit mode properties for existing orders
  isEditMode: boolean = false;
  editingOrderId: number | null = null;
  originalStatus: string = 'open'; // Ursprünglicher Status vor der Bearbeitung
  
  // Drag & Drop properties
  draggedIndex: number = -1;
  dragOverIndex: number = -1;

  // Hilfsmethode zur Bereinigung von HTML-Entitäten
  sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
  
  // Mobile Tab properties
  activeTab: 'search' | 'order' | 'prices' = 'search';
  
  // Neue Properties für Datumsfelder
  orderDate: string = '';
  deliveryDate: string = '';
  
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

  // Browser-Navigation Handler
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    // Prüfe, ob ungespeicherte Änderungen vorhanden sind
    if (this.hasUnsavedChanges()) {
      const message = this.isEditMode 
        ? `Sie bearbeiten Bestellung #${this.editingOrderId} mit ungespeicherten Änderungen. Möchten Sie die Seite wirklich verlassen?`
        : `Sie haben einen Auftrag mit ${this.orderItems.length} Artikel(n) ohne Speicherung. Möchten Sie die Seite wirklich verlassen?`;
      
      // Browser-Warnung anzeigen
      event.preventDefault();
      event.returnValue = message;
      return message;
    }
    return undefined;
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent) {
    console.log('🔙 [BROWSER-BACK] Browser-Zurück-Button erkannt');
    
    // Prüfe, ob ungespeicherte Änderungen vorhanden sind
    if (this.hasUnsavedChanges()) {
      console.log('⚠️ [BROWSER-BACK] Ungespeicherte Änderungen erkannt, zeige Bestätigungsdialog');
      
      // Verhindere die Navigation temporär
      history.pushState(null, '', window.location.href);
      
      // Zeige Bestätigungsdialog
      const dialogRef = this.dialog.open(MyDialogComponent, {
        width: '400px',
        data: {
          title: 'Bearbeitung verlassen',
          message: this.isEditMode 
            ? `Sie bearbeiten Bestellung #${this.editingOrderId} mit ungespeicherten Änderungen. Möchten Sie wirklich zurück gehen?`
            : `Sie haben einen Auftrag mit ${this.orderItems.length} Artikel(n) ohne Speicherung. Möchten Sie wirklich zurück gehen?`,
          isConfirmation: true,
          confirmLabel: 'Zurück gehen',
          cancelLabel: 'Abbrechen'
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result === true) {
          console.log('✅ [BROWSER-BACK] Benutzer bestätigt Zurück-Navigation');
          // Stelle den ursprünglichen Status wieder her
          this.restoreOriginalStatus();
          // Bereinige alle Daten
          this.clearAllOrderData();
          // Führe die Navigation aus
          history.back();
        } else {
          console.log('❌ [BROWSER-BACK] Benutzer bricht Zurück-Navigation ab');
          // Navigation abbrechen - Seite bleibt unverändert
        }
      });
    } else {
      console.log('✅ [BROWSER-BACK] Keine ungespeicherten Änderungen, normale Navigation');
      // Keine ungespeicherten Änderungen - normale Navigation erlauben
    }
  }

  ngOnInit(): void {
    // Footer verstecken
    this.hideFooter();
    
    // History-State für Browser-Navigation initialisieren
    history.pushState(null, '', window.location.href);
    
    this.loadCustomers();
    
    // Lade gespeicherte Daten aus localStorage
    this.loadStoredData();
    
    // WICHTIG: checkForPendingOrderData() wird NACH dem Laden der globalArtikels aufgerufen
    // (siehe unten im artikelService.getData() Subscribe)
    
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
          
          this.artikelService.getData().subscribe(async (res) => {
            if(response.user.role == 'admin') {
              this.globalService.isAdmin = true;
            }
            
            // SCHNELLVERKAUF-Artikel basierend auf Benutzerrolle filtern
            this.globalArtikels = this.globalService.filterSchnellverkaufArticles(res);
            // Erstelle zusätzliches pfand-array für Artikel mit category "PFAND" (nur initial, da PFAND-Artikel statisch sind)
            this.globalService.setPfandArtikels(this.globalArtikels);
            this.artikelData = this.globalArtikels;
            this.isVisible = false;
            
            // Angebote laden und anwenden (erstes Angebot verwenden)
            // Zusätzlich: Async-Orchestrierung, damit nach Refresh im Edit-Mode Preise konsistent sind
            // (Angebote + Kundenpreise → normalize)
            await this.loadAndApplyFirstOfferAsync();

            // Subscription für force_active Änderungen
            this.forceActiveSubscription = this.forceActiveService.getActiveOfferObservable().subscribe({
              next: (forceActiveOffer) => {
                console.log('🔄 [CUSTOMER-ORDERS] Force Active Status geändert:', forceActiveOffer);
                // Angebote neu laden und anwenden
                this.loadAndApplyFirstOffer();
              },
              error: (error) => {
                console.error('❌ [CUSTOMER-ORDERS] Fehler beim Force Active Subscription:', error);
              }
            });

            // Nach dem Laden der Artikel: Aktualisiere kundenspezifische Preise falls ein Kunde gespeichert ist
            if (this.pendingCustomerForPriceUpdate) {
              console.log('🔄 [INIT] Lade kundenspezifische Preise für gespeicherten Kunden:', this.pendingCustomerForPriceUpdate.customer_number);
              const customerNumber = this.pendingCustomerForPriceUpdate.customer_number;
              this.pendingCustomerForPriceUpdate = null;
              await this.loadCustomerArticlePricesAsync(customerNumber);
            }

            // Prüfe Pending-Order + Edit-Mode Daten und normalisiere danach konsistent
            await this.checkForPendingOrderData();
            this.checkForEditModeData();
            await this.ensureBestPricesAfterRefresh();
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

  // ===== OFFERS INTEGRATION =====
  private loadAndApplyFirstOffer(): void {
    try {
      // Zuerst prüfen ob ein force_active Angebot gesetzt ist
      const forceActiveOffer = this.forceActiveService.getActiveOffer();

      if (forceActiveOffer) {
        console.log('🔥 [CUSTOMER-ORDERS] Force Active Angebot gefunden:', forceActiveOffer);

        // Lade alle Angebote und suche das force_active Angebot
        this.offersService.getAllOffersWithProducts().subscribe({
          next: (response: any) => {
            const offers: OfferWithProducts[] = response?.data || [];
            const activeForceOffer = offers.find(offer => offer.id === forceActiveOffer.offerId);

            if (activeForceOffer) {
              console.log('🔥 [CUSTOMER-ORDERS] Force Active Angebot angewendet:', activeForceOffer.name);
              this.activeOfferFirst = activeForceOffer;
              this.applyOfferPricingToGlobalArtikels(activeForceOffer);

              // Falls bereits kundenspezifische Preise geladen sind, Angebotslogik anwenden
              if (Array.isArray(this.customerArticlePrices) && this.customerArticlePrices.length > 0) {
                this.annotateCustomerPricesWithOffer(activeForceOffer);
              }
            } else {
              console.log('⚠️ [CUSTOMER-ORDERS] Force Active Angebot nicht gefunden, verwende reguläre Logik');
              this.loadRegularOffers();
            }
          },
          error: () => {
            console.log('⚠️ [CUSTOMER-ORDERS] Fehler beim Laden von Force Active Angebot, verwende reguläre Logik');
            this.loadRegularOffers();
          }
        });
      } else {
        // Kein force_active Angebot gesetzt, verwende reguläre Logik
        this.loadRegularOffers();
      }
    } catch (error) {
      console.error('❌ [CUSTOMER-ORDERS] Fehler in loadAndApplyFirstOffer:', error);
      this.loadRegularOffers();
    }
  }

  private loadRegularOffers(): void {
    this.offersService.getAllOffersWithProducts().subscribe({
      next: (response: any) => {
        const offers: OfferWithProducts[] = response?.data || [];
        if (!offers || offers.length === 0) {
          return;
        }

        // Filtere nur aktive Angebote mit gültigem Datumsbereich
        const activeOffers = offers.filter(offer => {
          const startDate = new Date(offer.start_date);
          const endDate = new Date(offer.end_date);
          const now = new Date();

          // Setze die Zeit auf Mitternacht für besseren Vergleich
          const startDateMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDateMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          const isActive = offer.is_active &&
                         startDateMidnight <= nowMidnight &&
                         endDateMidnight >= nowMidnight;

          console.log(`[CUSTOMER-ORDERS] Angebot "${offer.name}":`, {
            is_active: offer.is_active,
            startDateMidnight,
            endDateMidnight,
            nowMidnight,
            isActive
          });

          return isActive;
        });

        if (activeOffers.length === 0) {
          console.log('[CUSTOMER-ORDERS] Keine aktiven Angebote gefunden');
          return;
        }

        // Verwende das erste aktive Angebot
        const firstActiveOffer = activeOffers[0];
        this.activeOfferFirst = firstActiveOffer;
        this.applyOfferPricingToGlobalArtikels(firstActiveOffer);

        // Falls bereits kundenspezifische Preise geladen sind, Angebotslogik anwenden
        if (Array.isArray(this.customerArticlePrices) && this.customerArticlePrices.length > 0) {
          this.annotateCustomerPricesWithOffer(firstActiveOffer);
        }
      },
      error: () => {
        // still usable without offers
      }
    });
  }

  // Async-Variante: Lädt Angebote und wendet sie an, damit nach Refresh sequenziell gearbeitet werden kann
  private async loadAndApplyFirstOfferAsync(): Promise<void> {
    try {
      const forceActiveOffer = this.forceActiveService.getActiveOffer();

      const response: any = await firstValueFrom(this.offersService.getAllOffersWithProducts());
      const offers: OfferWithProducts[] = response?.data || [];
      if (!offers || offers.length === 0) {
        return;
      }

      let selectedOffer: OfferWithProducts | undefined;
      if (forceActiveOffer) {
        selectedOffer = offers.find(offer => offer.id === forceActiveOffer.offerId);
      }

      if (!selectedOffer) {
        // Fallback: erstes aktives Angebot analog loadRegularOffers()
        const now = new Date();
        const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const activeOffers = offers.filter(offer => {
          const startDate = new Date(offer.start_date);
          const endDate = new Date(offer.end_date);
          const startDateMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDateMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          return offer.is_active && startDateMidnight <= nowMidnight && endDateMidnight >= nowMidnight;
        });
        if (activeOffers.length === 0) return;
        selectedOffer = activeOffers[0];
      }

      if (!selectedOffer) return;

      this.activeOfferFirst = selectedOffer;
      this.applyOfferPricingToGlobalArtikels(selectedOffer);
      if (Array.isArray(this.customerArticlePrices) && this.customerArticlePrices.length > 0) {
        this.annotateCustomerPricesWithOffer(selectedOffer);
      }
    } catch (error) {
      console.error('❌ [CUSTOMER-ORDERS] Fehler in loadAndApplyFirstOfferAsync:', error);
    }
  }

  // Nach Refresh/Init sicherstellen, dass immer der günstigste Preis genutzt wird und UI aktualisieren
  private async ensureBestPricesAfterRefresh(): Promise<void> {
    try {
      console.log('🔄 [ENSURE-BEST-PRICES] Starte ensureBestPricesAfterRefresh');
      
      // Stelle sicher, dass alle OrderItems die aktuellen Angebotspreise aus globalArtikels haben
      if (Array.isArray(this.orderItems) && this.orderItems.length > 0 && this.globalArtikels && this.globalArtikels.length > 0) {
        this.orderItems.forEach(item => {
          // Prüfe, ob der Artikel in globalArtikels ein Angebot hat
          const matchingArtikel = this.globalArtikels.find(art => 
            (art.article_number && art.article_number === item.article_number) ||
            (art.product_id && art.product_id === item.product_id) ||
            (art.id && art.id === item.product_id)
          );
          
          if (matchingArtikel && matchingArtikel.use_offer_price && matchingArtikel.offer_price !== undefined) {
            // Setze offer_price, damit normalizeItemPrice() den günstigeren Preis wählen kann
            item.offer_price = matchingArtikel.offer_price;
            item.use_offer_price = true;
            console.log(`🏷️ [ENSURE-BEST-PRICES] Angebotspreis für ${item.article_number} gesetzt: €${item.offer_price}`);
          }
          
          // Normalisiere den Preis - wählt automatisch den günstigeren zwischen Kunde und Angebot
          this.normalizeItemPrice(item);
        });
        
        this.globalService.saveCustomerOrders(this.orderItems);
      }
      
      if (Array.isArray(this.orderItems2) && this.orderItems2.length > 0 && this.globalArtikels && this.globalArtikels.length > 0) {
        this.orderItems2.forEach(item => {
          const matchingArtikel = this.globalArtikels.find(art => 
            (art.article_number && art.article_number === item.article_number) ||
            (art.product_id && art.product_id === item.product_id) ||
            (art.id && art.id === item.product_id)
          );
          
          if (matchingArtikel && matchingArtikel.use_offer_price && matchingArtikel.offer_price !== undefined) {
            item.offer_price = matchingArtikel.offer_price;
            item.use_offer_price = true;
          }
          
          this.normalizeItemPrice(item);
        });
      }
      
      // UI aktualisieren, damit "Preis netto" Spalte sofort den neuen Preis zeigt
      this.cdr.detectChanges();
      console.log('✅ [ENSURE-BEST-PRICES] Beste Preise für alle OrderItems angewendet');
    } catch (e) {
      console.error('❌ [CUSTOMER-ORDERS] Fehler in ensureBestPricesAfterRefresh:', e);
    }
  }

  private applyOfferPricingToGlobalArtikels(offer: OfferWithProducts): void {
    if (!offer || !Array.isArray(this.globalArtikels) || this.globalArtikels.length === 0) return;

    const products = offer.products || [];
    if (!products.length) return;

    // Map for quick lookup by product identifiers
    const byProductId = new Map<number, OfferProduct>();
    const byArticleNumber = new Map<string, OfferProduct>();
    products.forEach((p) => {
      if (p?.product_id != null) byProductId.set(Number(p.product_id), p);
      if (p?.article_number) byArticleNumber.set(String(p.article_number), p);
    });

    const updated = this.globalArtikels.map((artikel: any) => {
      const idNum = artikel?.id != null ? Number(artikel.id) : undefined;
      const artNum = artikel?.article_number != null ? String(artikel.article_number) : undefined;

      let matched: OfferProduct | undefined = undefined;
      if (idNum !== undefined) matched = byProductId.get(idNum);
      if (!matched && artNum) matched = byArticleNumber.get(artNum);

      if (!matched) return artikel;

      const basePriceRaw = artikel?.sale_price ?? 0;
      const basePrice = typeof basePriceRaw === 'number' ? basePriceRaw : parseFloat(basePriceRaw) || 0;

      let offerPrice: number | undefined;
      if (matched.use_offer_price && matched.offer_price != null && matched.offer_price !== '') {
        const op = typeof matched.offer_price === 'number' ? matched.offer_price : parseFloat(String(matched.offer_price));
        if (!isNaN(op)) offerPrice = Math.max(0, Math.round(op * 100) / 100);
      } else if (offer?.discount_percentage) {
        const pct = Number(offer.discount_percentage);
        if (!isNaN(pct)) offerPrice = Math.max(0, Math.round((basePrice * (1 - pct / 100)) * 100) / 100);
      } else if (offer?.discount_amount) {
        const amt = Number(offer.discount_amount);
        if (!isNaN(amt)) offerPrice = Math.max(0, Math.round((basePrice - amt) * 100) / 100);
      }

      if (offerPrice === undefined) return artikel;

      return {
        ...artikel,
        original_price: basePrice,
        offer_price: offerPrice,
        use_offer_price: true,
        isOfferProduct: true,
        offerId: offer.id,
        offer_name: offer.name
      };
    });

    this.globalArtikels = updated;
    this.artikelData = [...this.globalArtikels];
    
    // Normalisiere Preise in orderItems nach Annotierung mit Angebot
    this.orderItems.forEach(item => {
      // Finde den aktualisierten Artikel mit Angebotspreis
      const updatedArtikel = updated.find(art => art.article_number === item.article_number || art.product_id === item.product_id);
      if (updatedArtikel && updatedArtikel.use_offer_price && updatedArtikel.offer_price !== undefined) {
        // Aktualisiere den Artikel im orderItem mit den Angebotsdaten
        item.use_offer_price = updatedArtikel.use_offer_price;
        item.offer_price = updatedArtikel.offer_price;
        // Normalisiere den Preis (setzt different_price auf offer_price wenn günstiger)
        this.normalizeItemPrice(item);
      }
    });
    
    // Normalisiere auch orderItems2 im Split-Modus
    if (this.orderItems2 && this.orderItems2.length > 0) {
      this.orderItems2.forEach(item => {
        const updatedArtikel = updated.find(art => art.article_number === item.article_number || art.product_id === item.product_id);
        if (updatedArtikel && updatedArtikel.use_offer_price && updatedArtikel.offer_price !== undefined) {
          item.use_offer_price = updatedArtikel.use_offer_price;
          item.offer_price = updatedArtikel.offer_price;
          this.normalizeItemPrice(item);
        }
      });
    }
  }

  private annotateCustomerPricesWithOffer(offer: OfferWithProducts): void {
    if (!offer || !Array.isArray(this.customerArticlePrices) || this.customerArticlePrices.length === 0) return;

    const products = offer.products || [];
    if (!products.length) return;

    const byProductId = new Map<number, OfferProduct>();
    const byArticleNumber = new Map<string, OfferProduct>();
    products.forEach((p) => {
      if (p?.product_id != null) byProductId.set(Number(p.product_id), p);
      if (p?.article_number) byArticleNumber.set(String(p.article_number), p);
    });

    this.customerArticlePrices = this.customerArticlePrices.map((price: any) => {
      const pid = price?.product_id != null ? Number(price.product_id) : undefined;
      const an = price?.article_number != null ? String(price.article_number) : undefined;

      let matched: OfferProduct | undefined = undefined;
      if (pid !== undefined) matched = byProductId.get(pid);
      if (!matched && an) matched = byArticleNumber.get(an);
      if (!matched) return price;

      const basePriceRaw = price?.unit_price_net ?? price?.sale_price ?? 0;
      const basePrice = typeof basePriceRaw === 'number' ? basePriceRaw : parseFloat(basePriceRaw) || 0;

      let offerPrice: number | undefined;
      if (matched.use_offer_price && matched.offer_price != null && matched.offer_price !== '') {
        const op = typeof matched.offer_price === 'number' ? matched.offer_price : parseFloat(String(matched.offer_price));
        if (!isNaN(op)) offerPrice = Math.max(0, Math.round(op * 100) / 100);
      } else if (offer?.discount_percentage) {
        const pct = Number(offer.discount_percentage);
        if (!isNaN(pct)) offerPrice = Math.max(0, Math.round((basePrice * (1 - pct / 100)) * 100) / 100);
      } else if (offer?.discount_amount) {
        const amt = Number(offer.discount_amount);
        if (!isNaN(amt)) offerPrice = Math.max(0, Math.round((basePrice - amt) * 100) / 100);
      }

      if (offerPrice === undefined) return price;

      return {
        ...price,
        original_unit_price_net: basePrice,
        unit_price_net: offerPrice,
        offer_price: offerPrice,
        use_offer_price: true,
        isOfferProduct: true,
        offerId: offer.id,
        offer_name: offer.name
      };
    });

    // Aktualisiere gefilterte Liste falls Suchmodal offen ist
    if (Array.isArray(this.filteredArticlePrices) && this.filteredArticlePrices.length > 0) {
      this.filteredArticlePrices = this.filteredArticlePrices.map((p: any) => {
        const ref = this.customerArticlePrices.find((cp: any) => (cp.product_id === p.product_id) || (cp.article_number === p.article_number));
        return ref || p;
      });
    }
    
    // Normalisiere Preise in orderItems nach Annotierung von Kundenpreisen mit Angebot
    this.orderItems.forEach(item => {
      // Finde den aktualisierten Kundenpreis mit Angebotspreis
      const updatedPrice = this.customerArticlePrices.find((cp: any) => 
        (cp.product_id !== undefined && cp.product_id === item.product_id) || 
        (cp.article_number && cp.article_number === item.article_number)
      );
      if (updatedPrice && updatedPrice.use_offer_price && updatedPrice.offer_price !== undefined) {
        // Aktualisiere den Artikel im orderItem mit den Angebotsdaten
        item.use_offer_price = updatedPrice.use_offer_price;
        item.offer_price = updatedPrice.offer_price;
        // Normalisiere den Preis (setzt different_price auf offer_price wenn günstiger)
        this.normalizeItemPrice(item);
      }
    });
    
    // Normalisiere auch orderItems2 im Split-Modus
    if (this.orderItems2 && this.orderItems2.length > 0) {
      this.orderItems2.forEach(item => {
        const updatedPrice = this.customerArticlePrices.find((cp: any) => 
          (cp.product_id !== undefined && cp.product_id === item.product_id) || 
          (cp.article_number && cp.article_number === item.article_number)
        );
        if (updatedPrice && updatedPrice.use_offer_price && updatedPrice.offer_price !== undefined) {
          item.use_offer_price = updatedPrice.use_offer_price;
          item.offer_price = updatedPrice.offer_price;
          this.normalizeItemPrice(item);
        }
      });
    }
  }

  // Intelligente Preisermittlung: Kundenpreise + Angebote mit intelligenter Priorität
  private resolveEffectivePrice(item: any): number {
    let bestPrice = item?.sale_price || 0; // Standardpreis als Basis
    let priceSource = 'sale_price'; // Quelle des besten Preises
    let originalCustomerPrice: number | undefined = undefined;

    // Kundenpreis zwischenspeichern (falls vorhanden)
    if (item && item.different_price !== undefined && item.different_price !== null && item.different_price !== '') {
      const customerPrice = typeof item.different_price === 'number' ? item.different_price : parseFloat(item.different_price);
      if (!isNaN(customerPrice)) {
        originalCustomerPrice = customerPrice;
        bestPrice = customerPrice; // Kundenpreis schlägt Standardpreis
        priceSource = 'different_price';
        console.log(`💰 [PRICE-LOGIC] Kundenpreis €${customerPrice} schlägt Standardpreis €${item.sale_price}`);
      }
    }

    // Angebotspreis prüfen - nimmt den günstigeren zwischen Angebot und aktuellem Preis (Kunde oder Standard)
    if (item && item.use_offer_price && item.offer_price !== undefined && item.offer_price !== null && item.offer_price !== '') {
      const offerPrice = typeof item.offer_price === 'number' ? item.offer_price : parseFloat(item.offer_price);
      if (!isNaN(offerPrice) && offerPrice < bestPrice) {
        // Wenn Angebotspreis günstiger ist, setze different_price auf den Angebotspreis für das Payload
        item.different_price = offerPrice;
        bestPrice = offerPrice; // Angebotspreis ist günstiger
        priceSource = 'offer_price';
        console.log(`🏷️ [PRICE-LOGIC] Angebotspreis €${offerPrice} ist günstiger als ${priceSource === 'different_price' ? 'Kundenpreis' : 'Standardpreis'} €${bestPrice} - different_price auf €${offerPrice} gesetzt`);
      }
    }

    console.log(`✅ [PRICE-LOGIC] Finaler Preis für ${item?.article_text}: €${bestPrice} (Quelle: ${priceSource})`);
    return bestPrice;
  }

  // Normalisiert den Preis für ein Item und setzt different_price korrekt
  private normalizeItemPrice(item: any): void {
    if (!item) return;
    
    // Rufe resolveEffectivePrice auf, um different_price korrekt zu setzen
    this.resolveEffectivePrice(item);
  }

  // Hilfsfunktion: Erkennen, ob ein echter Kundenpreis gesetzt ist
  public isCustomPrice(item: any): boolean {
    if (!item) {
      return false;
    }

    const parseNumber = (val: any): number => {
      if (typeof val === 'number') {
        return val;
      }
      if (typeof val === 'string') {
        const cleaned = val.replace(/\s/g, '').replace(',', '.');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? NaN : parsed;
      }
      return NaN;
    };

    // Prüfe zuerst, ob ein kundenspezifischer Preis in der Liste existiert
    const customerPrice = this.getCustomerArticlePrice(item);
    if (customerPrice) {
      const customerNetPrice = parseNumber(customerPrice.unit_price_net);
      const salePrice = parseNumber(item.sale_price);
      
      // Wenn ein kundenspezifischer Preis existiert UND gleich dem Standardpreis ist → grün
      if (!isNaN(customerNetPrice) && !isNaN(salePrice) && customerNetPrice === salePrice) {
        return true;
      }
    }

    // Fallback: Prüfe ob different_price gesetzt ist
    if (item.different_price === undefined || item.different_price === null || item.different_price === '') {
      return false;
    }

    const differentPrice = parseNumber(item.different_price);
    if (isNaN(differentPrice)) {
      return false;
    }


    const hasOffer = item && item.use_offer_price && item.offer_price !== undefined && item.offer_price !== null && item.offer_price !== '';
    if (hasOffer) {
      const offerPrice = parseNumber(item.offer_price);
      if (!isNaN(offerPrice) && differentPrice === offerPrice) {
        return false;
      }
    }

    return true;
  }

  // Hilfsfunktion: Findet den kundenspezifischen Preis für einen Artikel
  private getCustomerArticlePrice(item: any): any | null {
    if (!item || !this.customerArticlePrices || this.customerArticlePrices.length === 0) {
      return null;
    }

    // Suche nach dem Artikel in der kundenspezifischen Preisliste
    return this.customerArticlePrices.find((customerPrice: any) => {
      // Prüfe anhand der article_number
      if (item.article_number && customerPrice.article_number === item.article_number) {
        return true;
      }
      
      // Prüfe anhand der product_id
      if (item.product_id && customerPrice.product_id && customerPrice.product_id === item.product_id) {
        return true;
      }
      
      // Prüfe anhand der EAN
      if (item.ean && customerPrice.ean && customerPrice.ean === item.ean) {
        return true;
      }
      
      return false;
    }) || null;
  }

  ngOnDestroy(): void {
    // Footer wieder anzeigen beim Verlassen der Komponente
    this.showFooter();

    // Force Active Subscription aufräumen
    if (this.forceActiveSubscription) {
      this.forceActiveSubscription.unsubscribe();
      this.forceActiveSubscription = null;
    }
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
    
    console.log('📁 [BILD-UPLOAD] Dateien ausgewählt:', files.length);
    for (let i = 0; i < files.length; i++) {
      console.log(`📁 [BILD-UPLOAD] Datei ${i + 1}:`, {
        name: files[i].name,
        size: files[i].size,
        type: files[i].type
      });
    }
    
    // Speichere Bilder in IndexedDB
    this.storeImagesInIndexedDB(files);
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    this.isAnalyzingImages = true;
    const token = localStorage.getItem('token');

    console.log('🚀 [BILD-UPLOAD] Starte API-Aufruf an /api/orders/analyze-images');
    console.log('🔑 [BILD-UPLOAD] Token vorhanden:', !!token);

    fetch(`${environment.apiUrl}/api/orders/analyze-images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    .then(async (res) => {
      console.log('📡 [BILD-UPLOAD] HTTP Response Status:', res.status);
      console.log('📡 [BILD-UPLOAD] HTTP Response OK:', res.ok);
      console.log('📡 [BILD-UPLOAD] HTTP Response Headers:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const text = await res.text();
        console.error('❌ [BILD-UPLOAD] HTTP Response nicht OK:', res.status, res.statusText);
        console.error('❌ [BILD-UPLOAD] Response Text:', text);
        throw new Error(text || `HTTP ${res.status}`);
      }
      
      console.log('✅ [BILD-UPLOAD] HTTP Response erfolgreich, parse JSON...');
      return res.json();
    })
    .then((response) => {
      // Detaillierte Logs für die API-Antwort
      console.log('📡 [BILD-UPLOAD] API Response erhalten:', response);
      console.log('📊 [BILD-UPLOAD] Response Typ:', typeof response);
      console.log('📊 [BILD-UPLOAD] Response Struktur:', Object.keys(response));
      
      if (response.data) {
        console.log('📊 [BILD-UPLOAD] Response.data verfügbar:', Object.keys(response.data));
        
        if (response.data.imageAnalyses) {
          console.log('📊 [BILD-UPLOAD] imageAnalyses verfügbar:', response.data.imageAnalyses);
          console.log('📊 [BILD-UPLOAD] Anzahl imageAnalyses:', response.data.imageAnalyses.length);
          
          // Verwende die neue Response-Struktur mit customerNumber direkt in der Response
          let foundCustomerNumber: string | null = null;
          
          if (response.data.customerNumber) {
            foundCustomerNumber = response.data.customerNumber;
            console.log(`👤 [BILD-UPLOAD] Kundennummer aus Response gefunden:`, foundCustomerNumber);
          } else {
            // Fallback: Durchsuche alle imageAnalyses nach einer gültigen customer_number (alte Struktur)
            console.log('⚠️ [BILD-UPLOAD] Keine customerNumber in Response, verwende Fallback-Logik');
            for (let i = 0; i < response.data.imageAnalyses.length; i++) {
              const analysis = response.data.imageAnalyses[i];
              console.log(`📊 [BILD-UPLOAD] Analyse ${i}:`, analysis);
              
              if (analysis.orderInfo && analysis.orderInfo.customer_number && analysis.orderInfo.customer) {
                foundCustomerNumber = analysis.orderInfo.customer_number;
                console.log(`👤 [BILD-UPLOAD] Gültige Kundendaten in Analyse ${i} gefunden:`, {
                  customer_number: foundCustomerNumber,
                  customer: analysis.orderInfo.customer
                });
                break; // Verwende die erste gültige Kundennummer
              }
            }
          }
          
          // Wenn eine Kundennummer gefunden wurde, lade den Kunden (immer, auch wenn bereits ein Kunde ausgewählt ist)
          if (foundCustomerNumber) {
            console.log('👤 [BILD-UPLOAD] Wechsle zu Kunde aus Response:', foundCustomerNumber);
            this.loadCustomerByNumberFromResponse(foundCustomerNumber);
          }
          
          // Verwende orderSuggestion.orderItems für bessere Artikelverarbeitung
          let addedCount = 0;
          
          if (response.data.orderSuggestion && response.data.orderSuggestion.orderItems) {
            console.log('📋 [BILD-UPLOAD] orderSuggestion.orderItems verfügbar:', response.data.orderSuggestion.orderItems.length);
            
            response.data.orderSuggestion.orderItems.forEach((orderItem: any) => {
              // Suche den Artikel in globalArtikels nach product_id
              let artikel = this.globalArtikels.find(a => a.id === orderItem.product_id);
              
              if (!artikel) {
                // Fallback: Suche nach Artikelnummer falls product_id nicht gefunden
                artikel = this.globalArtikels.find(a => a.article_number === orderItem.article_number);
              }
              
              if (artikel) {
                const artikelWithQty = { 
                  ...artikel, 
                  quantity: orderItem.quantity || 1,
                  // Verwende zusätzliche Informationen aus der API-Response
                  unit_price: orderItem.unit_price,
                  notes: orderItem.notes,
                  confidence: orderItem.confidence,
                  match_type: orderItem.match_type
                };
                this.addToOrder(new Event('analyze-images'), artikelWithQty);
                addedCount++;
              } else {
                console.log(`⚠️ [BILD-UPLOAD] Artikel nicht gefunden für:`, orderItem);
              }
            });
          } else {
            // Fallback: Verwende die alte Logik falls orderSuggestion nicht verfügbar
            console.log('📋 [BILD-UPLOAD] orderSuggestion nicht verfügbar, verwende Fallback-Logik');
            
            let allProducts: any[] = [];
            response.data.imageAnalyses.forEach((analysis: any, index: number) => {
              if (analysis.products && Array.isArray(analysis.products)) {
                console.log(`📋 [BILD-UPLOAD] Produkte in Analyse ${index}:`, analysis.products.length);
                allProducts = allProducts.concat(analysis.products);
              }
            });
            
            console.log('📋 [BILD-UPLOAD] Alle gefundenen Produkte (Fallback):', allProducts.length);
            
            allProducts.forEach((product: any) => {
              const artikel = this.globalArtikels.find(a => a.article_number === product.article_number);
              if (artikel) {
                const artikelWithQty = { ...artikel, quantity: Number(product.quantity) || 1 };
                this.addToOrder(new Event('analyze-images'), artikelWithQty);
                addedCount++;
              }
            });
          }
          
          console.log('✅ [BILD-UPLOAD] Verarbeitung abgeschlossen. Hinzugefügte Artikel:', addedCount);
          
          // Info-Hinweise für Mobile/Tablet: nutze vorhandenes Toast-Schema mit Dummy-Werten
          if (addedCount > 0) {
            this.showMobileToast('Bild-Analyse', addedCount);
          } else {
            this.showMobileToast('Keine Treffer', 0);
          }
        } else {
          console.log('⚠️ [BILD-UPLOAD] Keine imageAnalyses in der Response gefunden');
        }
      }
    })
    .catch((err) => {
      console.error('❌ [BILD-UPLOAD] Fehler bei Bildanalyse:', err);
      console.error('❌ [BILD-UPLOAD] Fehler Details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
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

  // Speichere Bilder in IndexedDB
  private async storeImagesInIndexedDB(files: FileList): Promise<void> {
    try {
      const customerNumber = this.globalService.selectedCustomerForOrders?.customer_number;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await this.indexedDBService.storeImage(file, customerNumber);
        console.log('💾 [INDEXEDDB] Bild gespeichert:', file.name);
      }
      
      console.log('✅ [INDEXEDDB] Alle Bilder erfolgreich gespeichert');
    } catch (error) {
      console.error('❌ [INDEXEDDB] Fehler beim Speichern der Bilder:', error);
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
        
        const loadedItem = {
          ...orderItem,
          different_price: correctedDifferentPrice,
          original_price: originalPrice,
          // Stelle sicher, dass sale_price immer den Standard-Preis enthält
          sale_price: originalPrice
        };
        
        // Normalisiere den Preis des geladenen Items (prüft ob Angebotspreis günstiger ist)
        this.normalizeItemPrice(loadedItem);
        
        return loadedItem;
      });
      
      console.log('✅ [LOAD-STORED] Aufträge mit korrigierten Preisen geladen');
      console.log('📊 [LOAD-STORED] Aufträge mit different_price:', this.orderItems.filter(item => item.different_price !== undefined).length);
    }
  }

  // Prüfe auf pending order data aus dem Admin-Bereich
  private async checkForPendingOrderData(): Promise<void> {
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
          await this.loadOrderData(orderData);
        }
        
        // Entferne die pending order data aus localStorage
        localStorage.removeItem('pendingOrderData');
        
      } catch (error) {
        console.error('❌ [PENDING-ORDER] Fehler beim Parsen der Bestelldaten:', error);
        localStorage.removeItem('pendingOrderData');
      }
    }
  }

  // Prüfe auf Bearbeitungsmodus-Daten für Refresh-Persistenz
  private checkForEditModeData(): void {
    const editModeData = localStorage.getItem('editModeData');
    if (editModeData) {
      console.log('📥 [EDIT-MODE-DATA] Bearbeitungsmodus-Daten gefunden');
      
      try {
        const data = JSON.parse(editModeData);
        console.log('✏️ [EDIT-MODE-DATA] Bearbeitungsmodus-Daten:', data);
        
        // Stelle den Bearbeitungsmodus wieder her
        this.isEditMode = data.isEditMode || false;
        this.editingOrderId = data.editingOrderId || null;
        
        // Speichere den ursprünglichen Status für spätere Wiederherstellung
        this.originalStatus = data.originalStatus || 'open';
        
        // Stelle die Datumsfelder wieder her
        if (data.orderDate) {
          this.orderDate = this.formatDateForInput(data.orderDate);
          console.log('📅 [EDIT-MODE-DATA] Bestelldatum wiederhergestellt:', this.orderDate);
        }
        if (data.deliveryDate) {
          this.deliveryDate = this.formatDateForInput(data.deliveryDate);
          console.log('📅 [EDIT-MODE-DATA] Lieferdatum wiederhergestellt:', this.deliveryDate);
        }
        
        // Stelle die Kundenanmerkungen wieder her
        if (data.customerNotes) {
          this.customerNotes1 = data.customerNotes;
          console.log('📝 [EDIT-MODE-DATA] Kundenanmerkungen wiederhergestellt:', this.customerNotes1);
        }
        
        console.log('✅ [EDIT-MODE-DATA] Bearbeitungsmodus wiederhergestellt:', {
          isEditMode: this.isEditMode,
          editingOrderId: this.editingOrderId
        });
        
      } catch (error) {
        console.error('❌ [EDIT-MODE-DATA] Fehler beim Parsen der Bearbeitungsmodus-Daten:', error);
        localStorage.removeItem('editModeData');
      }
    }
  }

  // Stelle den ursprünglichen Status einer Bestellung wieder her
  private restoreOriginalStatus(): void {
    if (this.isEditMode && this.editingOrderId && this.originalStatus !== 'in_progress') {
      console.log('🔄 [RESTORE-STATUS] Stelle ursprünglichen Status wieder her:', {
        orderId: this.editingOrderId,
        originalStatus: this.originalStatus
      });
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('❌ [RESTORE-STATUS] Kein Token gefunden');
        return;
      }

      // Synchroner Aufruf für Browser-Navigation (wichtig für beforeunload)
      try {
        // Verwende fetch für synchronen Aufruf bei beforeunload
        const request = new XMLHttpRequest();
        request.open('PUT', `${environment.apiUrl}/api/orders/${this.editingOrderId}/status`, false);
        request.setRequestHeader('Authorization', `Bearer ${token}`);
        request.setRequestHeader('Content-Type', 'application/json');
        request.send(JSON.stringify({ status: this.originalStatus }));
        
        if (request.status === 200) {
          console.log('✅ [RESTORE-STATUS] Ursprünglicher Status synchron wiederhergestellt');
        } else {
          console.error('❌ [RESTORE-STATUS] Fehler beim synchronen Wiederherstellen:', request.status);
        }
      } catch (error) {
        console.error('❌ [RESTORE-STATUS] Fehler beim synchronen API-Aufruf:', error);
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

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result === true) {
        await this.loadOrderData(orderData);
      }
    });
  }

  // Lade die Bestelldaten in die Customer Orders Komponente
  private async loadOrderData(orderData: any): Promise<void> {
    console.log('🔄 [LOAD-ORDER-DATA] Lade Bestelldaten:', orderData);
    
    // Prüfe, ob wir im Bearbeitungsmodus sind
    if (orderData.editMode === true) {
      this.isEditMode = true;
      this.editingOrderId = orderData.editingOrderId || null;
      this.originalStatus = orderData.originalStatus || 'open'; // ✅ Speichere den ursprünglichen Status
      console.log('✏️ [LOAD-ORDER-DATA] Bearbeitungsmodus aktiviert für Bestellung:', this.editingOrderId);
      
      // Speichere Bearbeitungsmodus-Informationen im localStorage für Refresh-Persistenz
      const editModeData = {
        isEditMode: true,
        editingOrderId: this.editingOrderId,
        originalStatus: orderData.originalStatus, // ✅ Speichere den ursprünglichen Status
        orderDate: orderData.orderDate,
        deliveryDate: orderData.deliveryDate,
        customerNotes: orderData.customerNotes
      };
      localStorage.setItem('editModeData', JSON.stringify(editModeData));
      console.log('💾 [LOAD-ORDER-DATA] Bearbeitungsmodus-Daten im localStorage gespeichert');
    }
    
    // Setze die Datumsfelder, falls vorhanden
    if (orderData.orderDate) {
      this.orderDate = this.formatDateForInput(orderData.orderDate);
      console.log('📅 [LOAD-ORDER-DATA] Bestelldatum gesetzt:', this.orderDate);
    }
    if (orderData.deliveryDate) {
      this.deliveryDate = this.formatDateForInput(orderData.deliveryDate);
      console.log('📅 [LOAD-ORDER-DATA] Lieferdatum gesetzt:', this.deliveryDate);
    }
    
    // Setze die Kundenanmerkungen, falls vorhanden
    if (orderData.customerNotes) {
      this.customerNotes1 = orderData.customerNotes;
      console.log('📝 [LOAD-ORDER-DATA] Kundenanmerkungen gesetzt:', this.customerNotes1);
    }
    
    // Setze den Kunden basierend auf der Kundennummer oder E-Mail - WARTE auf Abschluss
    if (orderData.customer) {
      if (orderData.customer.customer_number) {
        console.log('👤 [LOAD-ORDER-DATA] Suche Kunde mit Kundennummer:', orderData.customer.customer_number);
        
        // Lade den Kunden direkt aus der API und WARTE
        await this.loadCustomerByNumberAsync(orderData.customer.customer_number, orderData);
      } else if (orderData.customer.email) {
        console.log('👤 [LOAD-ORDER-DATA] Keine Kundennummer, suche Kunde mit E-Mail:', orderData.customer.email);
        
        // Lade den Kunden anhand der E-Mail und WARTE
        await this.loadCustomerByEmailAsync(orderData.customer.email, orderData);
      } else {
        console.log('⚠️ [LOAD-ORDER-DATA] Weder Kundennummer noch E-Mail vorhanden');
      }
    }
    
    // Im Bearbeitungsmodus: Immer auf Kundenpreise (different_price) warten, bevor Artikel geladen werden.
    // Gilt für: Bearbeitung aus order-overview (z. B. Auftrag von Computer A auf Computer B bearbeiten),
    // sowie für Bestellungen aus customer-order-public. Maßgeblich sind die in customer-orders hinterlegten Preise.
    const editModeCustomerNumber = orderData.customer?.customer_number || this.globalService.selectedCustomerForOrders?.customer_number;
    if (orderData.editMode === true && editModeCustomerNumber) {
      console.log('⏳ [LOAD-ORDER-DATA] Bearbeitungsmodus: warte auf Kundenpreise (different_price) für', editModeCustomerNumber);
      await this.loadCustomerArticlePricesAsync(String(editModeCustomerNumber));
      console.log('✅ [LOAD-ORDER-DATA] Kundenpreise geladen, lade jetzt Bestellartikel');
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
      
      // Transformiere die Artikel in das erwartete Format und hole cost_price aus globalArtikels
      this.orderItems = orderData.items.map((item: any) => {
        const articleNumber = item.product_article_number || item.article_number || '';
        
        // Suche den Artikel in globalArtikels, um den cost_price und Angebotspreise zu bekommen
        let cost_price = 0;
        let offer_price: number | undefined;
        let use_offer_price = false;
        let offerId: number | undefined;
        let offer_name: string | undefined;
        
        let catalogSalePrice: number | undefined;
        if (articleNumber && this.globalArtikels && this.globalArtikels.length > 0) {
          const globalArtikel = this.globalArtikels.find(artikel => 
            artikel.article_number === articleNumber
          );
          if (globalArtikel) {
            cost_price = globalArtikel.cost_price || 0;
            catalogSalePrice = typeof globalArtikel.sale_price === 'number' ? globalArtikel.sale_price : parseFloat(globalArtikel.sale_price) || undefined;
            console.log(`💰 [LOAD-ORDER-DATA] EK-Preis für ${articleNumber} gefunden: €${cost_price}`);
            
            // Prüfe ob der Artikel einen Angebotspreis hat
            if (globalArtikel.use_offer_price && globalArtikel.offer_price !== undefined) {
              offer_price = globalArtikel.offer_price;
              use_offer_price = true;
              offerId = globalArtikel.offerId;
              offer_name = globalArtikel.offer_name;
              console.log(`🏷️ [LOAD-ORDER-DATA] Angebotspreis für ${articleNumber} gefunden: €${offer_price}`);
            }
          } else {
            console.warn(`⚠️ [LOAD-ORDER-DATA] Kein EK-Preis für ${articleNumber} gefunden`);
          }
        }
        
        // Im Bearbeitungsmodus: Preis kommt aus den hinterlegten Kundenpreisen (customerArticlePrices), nicht aus der Bestellung.
        let salePrice: number;
        let differentPrice: number | undefined;
        if (orderData.editMode === true && this.customerArticlePrices?.length > 0) {
          const customerPriceEntry = this.customerArticlePrices.find((cp: any) =>
            (cp.article_number && String(cp.article_number) === String(articleNumber)) ||
            (cp.product_id != null && cp.product_id === item.id)
          );
          salePrice = catalogSalePrice ?? (typeof item.sale_price === 'number' ? item.sale_price : parseFloat(item.sale_price) || 0);
          if (customerPriceEntry != null && customerPriceEntry.unit_price_net != null && customerPriceEntry.unit_price_net !== '') {
            const customerNet = typeof customerPriceEntry.unit_price_net === 'number'
              ? customerPriceEntry.unit_price_net
              : parseFloat(customerPriceEntry.unit_price_net);
            if (!isNaN(customerNet)) {
              differentPrice = customerNet;
              console.log(`💰 [LOAD-ORDER-DATA] Bearbeitungsmodus: Kundenpreis für ${articleNumber} aus hinterlegten Preisen: €${differentPrice}`);
            }
          }
          if (differentPrice === undefined && (item.different_price != null && item.different_price !== '')) {
            differentPrice = typeof item.different_price === 'number' ? item.different_price : parseFloat(item.different_price);
          }
        } else {
          // Nicht Bearbeitungsmodus oder keine Kundenpreise: Preis aus Bestellung bzw. Katalog
          const rawSalePrice = item.price ?? item.sale_price;
          salePrice = (typeof rawSalePrice === 'number' ? rawSalePrice : parseFloat(rawSalePrice)) || 0;
          if (salePrice <= 0 && catalogSalePrice !== undefined) {
            salePrice = catalogSalePrice;
            console.log(`💰 [LOAD-ORDER-DATA] Preis für ${articleNumber} aus Katalog übernommen: €${salePrice}`);
          }
          differentPrice = item.different_price !== undefined && item.different_price !== null && item.different_price !== ''
            ? (typeof item.different_price === 'number' ? item.different_price : parseFloat(item.different_price))
            : undefined;
        }
        
        // Prüfe ob Angebotspreis günstiger ist als Kundenpreis oder Standardpreis
        let finalPrice = differentPrice !== undefined ? differentPrice : salePrice;
        let finalUseOfferPrice = false;
        
        if (offer_price !== undefined) {
          const currentPrice = differentPrice !== undefined ? differentPrice : salePrice;
          if (offer_price < currentPrice) {
            finalPrice = offer_price;
            finalUseOfferPrice = true;
            console.log(`✅ [LOAD-ORDER-DATA] Angebotspreis €${offer_price} ist günstiger als ${differentPrice !== undefined ? 'Kundenpreis' : 'Standardpreis'} €${currentPrice} für ${articleNumber}`);
          }
        }
        
        // Setze different_price: Wenn Angebotspreis verwendet wird ODER wenn differentPrice existiert und verschieden von salePrice
        let finalDifferentPrice: number | undefined;
        if (finalUseOfferPrice) {
          // Angebotspreis wird verwendet → setze different_price auf Angebotspreis
          finalDifferentPrice = offer_price;
        } else if (differentPrice !== undefined && differentPrice !== salePrice) {
          // Kundenpreis existiert und ist verschieden → behalte Kundenpreis
          finalDifferentPrice = differentPrice;
        } else if (finalPrice !== salePrice) {
          // Sonst nur setzen wenn finalPrice verschieden von salePrice
          finalDifferentPrice = finalPrice;
        } else {
          // Wenn finalPrice == salePrice, dann kein different_price
          finalDifferentPrice = undefined;
        }
        
        return {
          ...item,
          quantity: item.quantity || 1,
          article_text: item.product_name || item.article_text || 'Unbekannter Artikel',
          article_number: articleNumber,
          sale_price: salePrice,
          cost_price: cost_price, // Aus globalArtikels geladen
          different_price: finalDifferentPrice, // Korrekt gesetzt für Input-Anzeige
          original_price: item.original_price || salePrice || item.price || 0,
          offer_price: finalUseOfferPrice ? offer_price : undefined,
          use_offer_price: finalUseOfferPrice,
          isOfferProduct: finalUseOfferPrice,
          offerId: finalUseOfferPrice ? offerId : undefined,
          offer_name: finalUseOfferPrice ? offer_name : undefined
        };
      });
      
      // Normalisiere Preise für alle geladenen Items (stellt sicher, dass different_price korrekt gesetzt ist)
      this.orderItems.forEach(item => {
        this.normalizeItemPrice(item);
      });
      
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



  // Neue async Methode zum Laden eines Kunden anhand der E-Mail
  private async loadCustomerByEmailAsync(email: string, orderData: any): Promise<void> {
    console.log('🔍 [LOAD-CUSTOMER-BY-EMAIL] Lade Kunde mit E-Mail:', email);
    
    const token = localStorage.getItem('token');
    
    // Versuche zuerst, den Kunden aus der bereits geladenen Kundenliste zu finden
    const foundCustomer = this.customers.find(customer => 
      customer.email && customer.email.toLowerCase() === email.toLowerCase()
    );
    
    if (foundCustomer) {
      console.log('✅ [LOAD-CUSTOMER-BY-EMAIL] Kunde in lokaler Liste gefunden:', foundCustomer);
      await this.setCustomerFromOrderDataAsync(foundCustomer, orderData);
      return;
    }
    
    // Wenn nicht in lokaler Liste, lade alle Kunden und suche dann
    console.log('🔄 [LOAD-CUSTOMER-BY-EMAIL] Kunde nicht in lokaler Liste, lade alle Kunden...');
    
    try {
      const response = await fetch(`${environment.apiUrl}/api/customers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Kunden');
      }
      
      const data = await response.json();
      this.customers = data;
      
      // Suche den Kunden in der geladenen Liste
      const customer = this.customers.find(c => 
        c.email && c.email.toLowerCase() === email.toLowerCase()
      );
      
      if (customer) {
        console.log('✅ [LOAD-CUSTOMER-BY-EMAIL] Kunde gefunden:', customer);
        await this.setCustomerFromOrderDataAsync(customer, orderData);
      } else {
        console.warn('⚠️ [LOAD-CUSTOMER-BY-EMAIL] Kunde nicht gefunden:', email);
        // Erstelle einen minimalen Kunden mit nur der E-Mail als Fallback
        const fallbackCustomer = {
          id: 0,
          customer_number: '',
          last_name_company: `Kunde (${email})`,
          name_addition: '',
          email: email,
          street: '',
          city: '',
          postal_code: '',
          _country_code: ''
        };
        await this.setCustomerFromOrderDataAsync(fallbackCustomer, orderData);
      }
    } catch (error) {
      console.error('❌ [LOAD-CUSTOMER-BY-EMAIL] Fehler beim Laden der Kunden:', error);
      // Erstelle einen minimalen Kunden mit nur der E-Mail als Fallback
      const fallbackCustomer = {
        id: 0,
        customer_number: '',
        last_name_company: `Kunde (${email})`,
        name_addition: '',
        email: email,
        street: '',
        city: '',
        postal_code: '',
        _country_code: ''
      };
      await this.setCustomerFromOrderDataAsync(fallbackCustomer, orderData);
    }
  }

  // Neue Methode zum Laden eines Kunden anhand der E-Mail (für andere Verwendungen)
  private loadCustomerByEmail(email: string, orderData: any): void {
    this.loadCustomerByEmailAsync(email, orderData);
  }

  // Neue async Methode zum Laden eines Kunden anhand der Kundennummer
  private async loadCustomerByNumberAsync(customerNumber: string, orderData: any): Promise<void> {
    console.log('🔍 [LOAD-CUSTOMER-BY-NUMBER] Lade Kunde mit Nummer:', customerNumber);
    
    const token = localStorage.getItem('token');
    
    // Versuche zuerst, den Kunden aus der bereits geladenen Kundenliste zu finden
    const foundCustomer = this.customers.find(customer => 
      customer.customer_number === customerNumber
    );
    
      if (foundCustomer) {
        console.log('✅ [LOAD-CUSTOMER-BY-NUMBER] Kunde in lokaler Liste gefunden:', foundCustomer);
        await this.setCustomerFromOrderDataAsync(foundCustomer, orderData);
        return;
      }
    
    // Wenn nicht in lokaler Liste, lade alle Kunden und suche dann
    console.log('🔄 [LOAD-CUSTOMER-BY-NUMBER] Kunde nicht in lokaler Liste, lade alle Kunden...');
    
    try {
      const response = await fetch(`${environment.apiUrl}/api/customers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Kunden');
      }
      
      const data = await response.json();
      this.customers = data;
      
      // Suche den Kunden in der geladenen Liste
      const customer = this.customers.find(c => c.customer_number === customerNumber);
      
      if (customer) {
        console.log('✅ [LOAD-CUSTOMER-BY-NUMBER] Kunde gefunden:', customer);
        await this.setCustomerFromOrderDataAsync(customer, orderData);
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
        await this.setCustomerFromOrderDataAsync(fallbackCustomer, orderData);
      }
    } catch (error) {
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
      await this.setCustomerFromOrderDataAsync(fallbackCustomer, orderData);
    }
  }

  // Neue Methode zum Laden eines Kunden anhand der Kundennummer (für andere Verwendungen)
  private loadCustomerByNumber(customerNumber: string, orderData: any): void {
    this.loadCustomerByNumberAsync(customerNumber, orderData);
  }

  // Hilfsmethode zum Setzen des Kunden mit async/await
  private async setCustomerFromOrderDataAsync(customer: any, orderData: any): Promise<void> {
    console.log('👤 [SET-CUSTOMER] Setze Kunde:', customer);
    this.globalService.setSelectedCustomerForOrders(customer);
    
    // Setze den geänderten Firmennamen falls vorhanden
    if (orderData.differentCompanyName) {
      this.differentCompanyName = orderData.differentCompanyName;
    }
    
    // ✅ Lade kundenspezifische Preise MIT async - WARTET auf Kundenpreise
    if (customer.customer_number) {
      console.log('⏳ [SET-CUSTOMER] Warte auf Kundenpreise für Kunde:', customer.customer_number);
      await this.loadCustomerArticlePricesAsync(customer.customer_number);
      console.log('✅ [SET-CUSTOMER] Kundenpreise geladen für Kunde:', customer.customer_number);
    }
  }

  // Hilfsmethode zum Setzen des Kunden (für andere Verwendungen ohne await)
  private setCustomerFromOrderData(customer: any, orderData: any): void {
    this.setCustomerFromOrderDataAsync(customer, orderData);
  }

  // Neue Methode zum Laden eines Kunden aus der Bildanalyse-Response
  private loadCustomerByNumberFromResponse(customerNumber: string): void {
    console.log('🔍 [LOAD-CUSTOMER-FROM-RESPONSE] Lade Kunde mit Nummer aus Response:', customerNumber);
    
    const token = localStorage.getItem('token');
    
    // Versuche zuerst, den Kunden aus der bereits geladenen Kundenliste zu finden
    const foundCustomer = this.customers.find(customer => 
      customer.customer_number === customerNumber
    );
    
    if (foundCustomer) {
      console.log('✅ [LOAD-CUSTOMER-FROM-RESPONSE] Kunde in lokaler Liste gefunden:', foundCustomer);
      this.setCustomerFromResponse(foundCustomer);
      return;
    }
    
    // Wenn nicht in lokaler Liste, lade alle Kunden und suche dann
    console.log('🔄 [LOAD-CUSTOMER-FROM-RESPONSE] Kunde nicht in lokaler Liste, lade alle Kunden...');
    
    fetch(`${environment.apiUrl}/api/customers`, {
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
        console.log('✅ [LOAD-CUSTOMER-FROM-RESPONSE] Kunde gefunden:', customer);
        this.setCustomerFromResponse(customer);
      } else {
        console.warn('⚠️ [LOAD-CUSTOMER-FROM-RESPONSE] Kunde nicht gefunden:', customerNumber);
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
        this.setCustomerFromResponse(fallbackCustomer);
      }
    })
    .catch(error => {
      console.error('❌ [LOAD-CUSTOMER-FROM-RESPONSE] Fehler beim Laden der Kunden:', error);
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
      this.setCustomerFromResponse(fallbackCustomer);
    });
  }

  // Hilfsmethode zum Setzen des Kunden aus der Response
  private setCustomerFromResponse(customer: any): void {
    console.log('👤 [SET-CUSTOMER-FROM-RESPONSE] Setze Kunde aus Response:', customer);
    this.globalService.setSelectedCustomerForOrders(customer);
    
    // Lade kundenspezifische Preise
    this.loadCustomerArticlePrices(customer.customer_number);
  }

filteredArtikelData() {
  this.filteredArtikels = [];
  this.showDropdown = false;

  if (this.searchTerm) {
    const trimmedTerm = this.searchTerm.trim();

    // Mindestlänge prüfen (außer bei EAN)
    const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
    if (!isEanSearch && trimmedTerm.length < 3) {
      this.selectedIndex = -1;
      return; // Suche abbrechen
    }

    if (isEanSearch) {
      // EAN-Suche: Zuerst in lokalen Artikeln suchen
      const localEanResults = this.globalArtikels.filter(artikel =>
        artikel.ean?.toLowerCase() === trimmedTerm.toLowerCase()
      );

      if (localEanResults.length > 0) {
        this.filteredArtikels = localEanResults;
        this.showDropdown = true;
        this.selectedIndex = -1;

        console.log('🔍 [EAN-LOCAL] EAN in lokalen Artikeln gefunden:', this.filteredArtikels.length);
      } else {
        // EAN nicht gefunden → API-Suche
        this.searchEanInApi(trimmedTerm);
        return;
      }
    } else {
      // Normale Text-Suche
      const terms = trimmedTerm.toLowerCase().split(/\s+/);

      const filtered = this.globalArtikels.filter((artikel) =>
        terms.every((term) =>
          artikel.article_text.toLowerCase().includes(term) ||
          artikel.article_number?.toLowerCase().includes(term) ||
          artikel.ean?.toLowerCase().includes(term)
        )
      );

      // Sortierlogik bleibt wie bisher
      this.filteredArtikels = filtered.sort((a, b) => {
        const searchTermLower = trimmedTerm.toLowerCase();
        const aArticleNumberExact = a.article_number?.toLowerCase() === searchTermLower;
        const bArticleNumberExact = b.article_number?.toLowerCase() === searchTermLower;
        const aArticleTextExact = a.article_text.toLowerCase() === searchTermLower;
        const bArticleTextExact = b.article_text.toLowerCase() === searchTermLower;
        const aEanExact = a.ean?.toLowerCase() === searchTermLower;
        const bEanExact = b.ean?.toLowerCase() === searchTermLower;

        const aArticleNumberStartsWith = a.article_number?.toLowerCase().startsWith(searchTermLower);
        const bArticleNumberStartsWith = b.article_number?.toLowerCase().startsWith(searchTermLower);
        const aArticleTextStartsWith = a.article_text.toLowerCase().startsWith(searchTermLower);
        const bArticleTextStartsWith = b.article_text.toLowerCase().startsWith(searchTermLower);
        const aEanStartsWith = a.ean?.toLowerCase().startsWith(searchTermLower);
        const bEanStartsWith = b.ean?.toLowerCase().startsWith(searchTermLower);

        if (aArticleNumberExact && !bArticleNumberExact) return -1;
        if (!aArticleNumberExact && bArticleNumberExact) return 1;
        if (aArticleTextExact && !bArticleTextExact) return -1;
        if (!aArticleTextExact && bArticleTextExact) return 1;
        if (aEanExact && !bEanExact) return -1;
        if (!aEanExact && bEanExact) return 1;
        if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
        if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
        if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
        if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
        if (aEanStartsWith && !bEanStartsWith) return -1;
        if (!aEanStartsWith && bEanStartsWith) return 1;

        const articleNumberComparison = this.compareArticleNumbers(a.article_number, b.article_number);
        if (articleNumberComparison !== 0) {
          return articleNumberComparison;
        }
        return a.article_text.localeCompare(b.article_text);
      });

      this.showDropdown = this.filteredArtikels.length > 0;
      this.selectedIndex = -1;
    }
  } else {
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
    
    this.http.get(`${environment.apiUrl}/api/product-eans/ean/${eanCode}`, {
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

    // Im Split-Modus: Entscheide basierend auf activeTable, zu welcher Tabelle hinzugefügt wird
    const targetItems = (this.isSplitMode && this.activeTable === 2) ? this.orderItems2 : this.orderItems;

    // Spezielle Behandlung für PFAND und SCHNELLVERKAUF-Kategorien: Immer als neue Position hinzufügen
    if (artikel.category === 'PFAND' || artikel.category === 'SCHNELLVERKAUF') {
      const newItem = { 
        ...artikel, 
        quantity: Number(artikel.quantity)
      };
      // Normalisiere den Preis des neuen Items
      this.normalizeItemPrice(newItem);
      
      if (this.isSplitMode && this.activeTable === 2) {
        this.orderItems2 = [
          ...this.orderItems2,
          newItem
        ];
      } else {
        this.orderItems = [
          ...this.orderItems,
          newItem
        ];
      }
    } else {
      // Normale Behandlung für alle anderen Kategorien: Summieren wenn gleiche Artikelnummer
      if (this.isSplitMode && this.activeTable === 2) {
        const existingItem = this.orderItems2.find(
          (item) => item.article_number == artikel.article_number
        );

        if (existingItem) {
          existingItem.quantity += Number(artikel.quantity);
          // Normalisiere den Preis des existierenden Items
          this.normalizeItemPrice(existingItem);
        } else {
          const newItem = { 
            ...artikel, 
            quantity: Number(artikel.quantity)
          };
          // Normalisiere den Preis des neuen Items
          this.normalizeItemPrice(newItem);
          this.orderItems2 = [
            ...this.orderItems2,
            newItem
          ];
        }
      } else {
        const existingItem = this.orderItems.find(
          (item) => item.article_number == artikel.article_number
        );

        if (existingItem) {
          existingItem.quantity += Number(artikel.quantity);
          // Normalisiere den Preis des existierenden Items
          this.normalizeItemPrice(existingItem);
        } else {
          const newItem = { 
            ...artikel, 
            quantity: Number(artikel.quantity)
          };
          // Normalisiere den Preis des neuen Items
          this.normalizeItemPrice(newItem);
          this.orderItems = [
            ...this.orderItems,
            newItem
          ];
        }
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
        if (this.isSplitMode && this.activeTable === 2) {
          this.orderItems2 = [
            ...this.orderItems2,
            { 
              ...matchingPfand, 
              quantity: originalQuantity
            },
          ];
        } else {
          this.orderItems = [
            ...this.orderItems,
            { 
              ...matchingPfand, 
              quantity: originalQuantity
            },
          ];
        }
        console.log(`✅ [PFAND-ADD] PFAND-Artikel automatisch hinzugefügt zu Tabelle ${this.activeTable}:`, matchingPfand.article_text, 'Menge:', originalQuantity);
      }
    }

    // Speichere Aufträge im localStorage (nur Tabelle 1)
    if (!this.isSplitMode || this.activeTable === 1) {
      this.globalService.saveCustomerOrders(this.orderItems);
    }

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

  // Zeige Notizen für Eintrag aus dem Artikel-Preise-Modal
  showCustomerPriceNotes(customerPrice: any): void {
    const notes = customerPrice?.article_notes || customerPrice?.notes || customerPrice?.description || '';
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
    return this.resolveEffectivePrice(item);
  }

  // Hilfsmethode um MwSt-Rate basierend auf tax_code zu bekommen
  getTaxRate(taxCode: number): number {
    switch (taxCode) {
      case 1: return 0.19; // 19% MwSt
      case 2: return 0.07; // 7% MwSt
      case 3: return 0.00; // 0% MwSt
      default: return 0.19; // Standard: 19% MwSt
    }
  }

  // Hilfsmethode um den MwSt-Prozentsatz als String zu bekommen
  getTaxRatePercent(taxCode: number): string {
    const rate = this.getTaxRate(taxCode);
    return (rate * 100).toFixed(0) + '%';
  }

  // Hilfsmethode um Bruttopreis zu berechnen (Netto + MwSt)
  getGrossPrice(netPrice: number, taxCode: number): number {
    const taxRate = this.getTaxRate(taxCode);
    return netPrice * (1 + taxRate);
  }

  // Hilfsmethode um den Bruttopreis für ein orderItem zu bekommen
  getItemGrossPrice(item: any): number {
    const netPrice = this.getItemPrice(item);
    return this.getGrossPrice(netPrice, item.tax_code || 1);
  }

  // Hilfsmethode um den Gesamt-Bruttopreis aller Items zu berechnen
  getOrderTotalGross(): number {
    return this.orderItems.reduce((sum, item) => {
      const itemNetPrice = this.getItemPrice(item);
      const itemGrossPrice = this.getGrossPrice(itemNetPrice, item.tax_code || 1);
      const quantity = Number(item.quantity) || 0;
      return sum + (itemGrossPrice * quantity);
    }, 0);
  }

  // Hilfsmethode um den Gesamt-Bruttopreis für Tabelle 2 zu berechnen
  getOrderTotal2Gross(): number {
    return this.orderItems2.reduce((sum, item) => {
      const itemNetPrice = this.getItemPrice(item);
      const itemGrossPrice = this.getGrossPrice(itemNetPrice, item.tax_code || 1);
      const quantity = Number(item.quantity) || 0;
      return sum + (itemGrossPrice * quantity);
    }, 0);
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
    
    // Im Split-Modus: Synchronisiere die Mengen zwischen den beiden Tabellen
    if (this.isSplitMode) {
      this.syncQuantitiesInSplitMode(item);
    }
  }

  // Arrow key navigation for quantity input fields
  onQuantityKeyDown(event: KeyboardEvent, item: any, itemIndex: number): void {
    // Prevent default arrow key behavior (increment/decrement)
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      
      // Vertical navigation: switch between quantity inputs in different rows
      this.navigateVertically(event.key === 'ArrowUp' ? -1 : 1, itemIndex, 'quantity');
    }
  }

  // Arrow key navigation for price input fields
  onPriceKeyDown(event: KeyboardEvent, item: any, itemIndex: number): void {
    // Prevent default arrow key behavior (increment/decrement)
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      
      // Vertical navigation: switch between price inputs in different rows
      this.navigateVertically(event.key === 'ArrowUp' ? -1 : 1, itemIndex, 'price');
    }
  }

  // Navigate vertically between input fields of the same type
  private navigateVertically(direction: number, currentIndex: number, fieldType: 'quantity' | 'price'): void {
    // Determine which table to use based on split mode and active table
    let targetItems: any[];
    let tableSelector: string;
    
    if (this.isSplitMode) {
      if (this.activeTable === 2) {
        targetItems = this.orderItems2;
        tableSelector = '.split-table-wrapper:nth-child(2)'; // Second table (right side)
      } else {
        targetItems = this.orderItems;
        tableSelector = '.split-table-wrapper:nth-child(1)'; // First table (left side)
      }
    } else {
      targetItems = this.orderItems;
      tableSelector = '.order-table-container'; // Normal mode
    }
    
    const totalItems = targetItems.length;
    let nextIndex = currentIndex + direction;
    
    // Wrap around if we go beyond bounds
    if (nextIndex < 0) {
      nextIndex = totalItems - 1;
    } else if (nextIndex >= totalItems) {
      nextIndex = 0;
    }
    
    // Find the target input field within the correct table
    const targetInput = fieldType === 'quantity' 
      ? this.findQuantityInputForItemInTable(nextIndex, tableSelector)
      : this.findPriceInputForItemInTable(nextIndex, tableSelector);
    
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
  }

  // Helper method to find quantity input for a specific item within a specific table
  private findQuantityInputForItemInTable(itemIndex: number, tableSelector: string): HTMLInputElement | null {
    // Search within the specified table
    const tableElement = document.querySelector(tableSelector);
    if (!tableElement) {
      return null;
    }
    
    // Try desktop view first
    let quantityInput = tableElement.querySelector(`tr.order-row:nth-child(${itemIndex + 1}) .quantity-edit`) as HTMLInputElement;
    
    // If not found in desktop view, try mobile view
    if (!quantityInput) {
      quantityInput = tableElement.querySelector(`.order-card:nth-child(${itemIndex + 1}) .quantity-edit`) as HTMLInputElement;
    }
    
    return quantityInput;
  }

  // Helper method to find quantity input for a specific item (legacy method for backward compatibility)
  private findQuantityInputForItem(itemIndex: number): HTMLInputElement | null {
    // Try desktop view first
    let quantityInput = document.querySelector(`tr.order-row:nth-child(${itemIndex + 1}) .quantity-edit`) as HTMLInputElement;
    
    // If not found in desktop view, try mobile view
    if (!quantityInput) {
      quantityInput = document.querySelector(`.order-card:nth-child(${itemIndex + 1}) .quantity-edit`) as HTMLInputElement;
    }
    
    return quantityInput;
  }

  // Helper method to find price input for a specific item within a specific table
  private findPriceInputForItemInTable(itemIndex: number, tableSelector: string): HTMLInputElement | null {
    // Search within the specified table
    const tableElement = document.querySelector(tableSelector);
    if (!tableElement) {
      return null;
    }
    
    // Try desktop view first
    let priceInput = tableElement.querySelector(`tr.order-row:nth-child(${itemIndex + 1}) .price-edit`) as HTMLInputElement;
    
    // If not found in desktop view, try mobile view
    if (!priceInput) {
      priceInput = tableElement.querySelector(`.order-card:nth-child(${itemIndex + 1}) .price-edit`) as HTMLInputElement;
    }
    
    return priceInput;
  }

  // Helper method to find price input for a specific item (legacy method for backward compatibility)
  private findPriceInputForItem(itemIndex: number): HTMLInputElement | null {
    // Try desktop view first
    let priceInput = document.querySelector(`tr.order-row:nth-child(${itemIndex + 1}) .price-edit`) as HTMLInputElement;
    
    // If not found in desktop view, try mobile view
    if (!priceInput) {
      priceInput = document.querySelector(`.order-card:nth-child(${itemIndex + 1}) .price-edit`) as HTMLInputElement;
    }
    
    return priceInput;
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
  validateAndUpdateQuantity(item: any, skipSyncInSplitMode: boolean = false): void {
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
    
    // Im Split-Modus: Synchronisiere die Mengen zwischen den beiden Tabellen (nur wenn nicht überspringen)
    if (this.isSplitMode && !skipSyncInSplitMode) {
      this.syncQuantitiesInSplitMode(item);
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
    // Reset flag für normales Speichern
    this.isSavingAsOpen = false;
    // Im Split-Modus: Speichere immer beide Aufträge
    if (this.isSplitMode) {
      this.showSplitSaveDialog();
    } else {
      this.openOrderConfirmationModal();
    }
  }

  showSplitSaveDialog(): void {
    // Filter: Artikel mit Menge !== 0 (negative Mengen sind erlaubt, aber nicht 0)
    const itemsTable1 = this.orderItems.filter(item => item.quantity !== 0);
    const itemsTable2 = this.orderItems2.filter(item => item.quantity !== 0);

    // Prüfe, ob mindestens ein Auftrag Artikel hat
    if (itemsTable1.length === 0 && itemsTable2.length === 0) {
      alert('Beide Aufträge sind leer. Bitte fügen Sie Artikel hinzu.');
      return;
    }

    // Erstelle Bestätigungsnachricht
    let message = '📋 Beide Aufträge speichern?\n\n';
    
    if (itemsTable1.length > 0) {
      message += `✅ Auftrag 1: ${itemsTable1.length} Artikel, Gesamt: €${this.getOrderTotal().toFixed(2)}\n`;
    } else {
      message += `⚠️ Auftrag 1: Leer (wird nicht gespeichert)\n`;
    }
    
    if (itemsTable2.length > 0) {
      message += `✅ Auftrag 2: ${itemsTable2.length} Artikel, Gesamt: €${this.getOrderTotal2().toFixed(2)}\n`;
    } else {
      message += `⚠️ Auftrag 2: Leer (wird nicht gespeichert)\n`;
    }

    message += '\n';
    
    if (itemsTable1.length === 0 || itemsTable2.length === 0) {
      message += '⚠️ Hinweis: Nur Aufträge mit Artikeln werden gespeichert.\n\n';
    }
    
    // Zeige Anmerkungen falls vorhanden
    if (this.customerNotes1 || this.customerNotes2) {
      message += '\n📝 Anmerkungen:\n';
      if (this.customerNotes1) {
        message += `Auftrag 1: ${this.customerNotes1}\n`;
      }
      if (this.customerNotes2) {
        message += `Auftrag 2: ${this.customerNotes2}\n`;
      }
      message += '\n';
    }
    
    message += 'Möchten Sie fortfahren?';

    // Zeige Bestätigungs-Dialog
    const dialogRef = this.dialog.open(MyDialogComponent, {
      data: {
        title: 'Beide Aufträge speichern',
        message: message,
        isConfirmation: true,
        confirmLabel: 'Beide speichern',
        cancelLabel: 'Abbrechen'
      },
      maxWidth: '500px',
      minWidth: '400px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.saveBothOrders();
      }
    });
  }


  async saveBothOrders(): Promise<void> {
    // Filter: Nur Artikel mit Menge !== 0 (negative Mengen erlaubt)
    const itemsTable1 = this.orderItems.filter(item => item.quantity !== 0);
    const itemsTable2 = this.orderItems2.filter(item => item.quantity !== 0);

    // Sammle die zu speichernden Aufträge
    const ordersToSave: Promise<any>[] = [];
    
    if (itemsTable1.length > 0) {
      ordersToSave.push(this.saveOrderDirectly(itemsTable1, 'completed', this.customerNotes1));
      console.log(`📦 [SPLIT-SAVE] Auftrag 1 wird gespeichert: ${itemsTable1.length} Artikel`);
      if (this.customerNotes1) {
        console.log(`📝 [SPLIT-SAVE] Auftrag 1 Anmerkungen: ${this.customerNotes1}`);
      }
    } else {
      console.log(`⚠️ [SPLIT-SAVE] Auftrag 1 übersprungen (keine Artikel mit Menge !== 0)`);
    }
    
    if (itemsTable2.length > 0) {
      ordersToSave.push(this.saveOrderDirectly(itemsTable2, 'completed', this.customerNotes2));
      console.log(`📦 [SPLIT-SAVE] Auftrag 2 wird gespeichert: ${itemsTable2.length} Artikel`);
      if (this.customerNotes2) {
        console.log(`📝 [SPLIT-SAVE] Auftrag 2 Anmerkungen: ${this.customerNotes2}`);
      }
    } else {
      console.log(`⚠️ [SPLIT-SAVE] Auftrag 2 übersprungen (keine Artikel mit Menge !== 0)`);
    }

    if (ordersToSave.length === 0) {
      alert('Keine Aufträge zu speichern. Beide Aufträge sind leer.');
      return;
    }

    this.isSavingOrder = true;

    try {
      // Beide Aufträge parallel als separate Fetches speichern
      await Promise.all(ordersToSave);
      
      const savedCount = ordersToSave.length;
      let message = savedCount === 2 
        ? 'Beide Aufträge wurden erfolgreich gespeichert!' 
        : `${savedCount} Auftrag wurde erfolgreich gespeichert!`;
      
      // Im Bearbeitungsmodus: Lösche die ursprüngliche Bestellung
      if (this.isEditMode && this.editingOrderId) {
        console.log(`🗑️ [SPLIT-EDIT] Lösche ursprüngliche Bestellung #${this.editingOrderId} (wurde in ${savedCount} Aufträge aufgeteilt)`);
        
        try {
          await this.deleteOriginalOrder(this.editingOrderId);
          message += `\n\nUrsprüngliche Bestellung #${this.editingOrderId} wurde gelöscht.`;
          console.log(`✅ [SPLIT-EDIT] Ursprüngliche Bestellung #${this.editingOrderId} erfolgreich gelöscht`);
        } catch (deleteError) {
          console.error('❌ [SPLIT-EDIT] Fehler beim Löschen der ursprünglichen Bestellung:', deleteError);
          message += `\n\n⚠️ Warnung: Ursprüngliche Bestellung konnte nicht gelöscht werden.`;
        }
      }
      
      alert(message);
      this.clearAllOrderData();
      this.isSplitMode = false;
      this.orderItems2 = [];
      this.customerNotes1 = '';
      this.customerNotes2 = '';
      
      // Im Bearbeitungsmodus: Navigiere zur Order-Overview
      if (this.isEditMode) {
        console.log('🔄 [SPLIT-EDIT] Navigiere zur Order-Overview...');
        this.router.navigate(['/order-overview']);
      }
    } catch (error) {
      console.error('Fehler beim Speichern der Aufträge:', error);
      alert('Fehler beim Speichern: ' + error);
    } finally {
      this.isSavingOrder = false;
    }
  }

  // Lösche eine Bestellung (für Split-Mode im Bearbeitungsmodus)
  private async deleteOriginalOrder(orderId: number): Promise<void> {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${environment.apiUrl}/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Fehler beim Löschen der Bestellung: ${response.statusText}`);
    }
    
    return response.json();
  }

  async saveOrderDirectly(items: any[], status: string, customerNotes: string = ''): Promise<void> {
    // Ensure description is set for all items
    items.forEach(item => {
      if (!item.description && item.article_text) {
        item.description = item.article_text;
      }
    });

    const customerData: any = {
      customer_id: this.globalService.selectedCustomerForOrders.id,
      customer_number: this.globalService.selectedCustomerForOrders.customer_number,
      customer_name: this.globalService.selectedCustomerForOrders.last_name_company,
      customer_addition: this.globalService.selectedCustomerForOrders.name_addition,
      customer_email: this.globalService.selectedCustomerForOrders.email,
      status: status,
      customer_notes: customerNotes || ''
    };

    if (this.differentCompanyName) {
      customerData.customer_city = this.globalService.selectedCustomerForOrders.city;
      customerData.customer_street = this.globalService.selectedCustomerForOrders.street;
      customerData.customer_postal_code = this.globalService.selectedCustomerForOrders.postal_code;
      customerData.customer_country_code = this.globalService.selectedCustomerForOrders._country_code;
      customerData.different_company_name = this.differentCompanyName;
    }

    if (this.orderDate) {
      customerData.order_date = this.orderDate;
    }
    if (this.deliveryDate) {
      customerData.delivery_date = this.deliveryDate;
    }

    const completeOrder = {
      orderData: {
        ...customerData,
        total_price: items.reduce((total, item) => {
          const price = item.different_price !== undefined && item.different_price !== null && item.different_price !== '' 
            ? item.different_price 
            : item.sale_price;
          return total + (price * item.quantity);
        }, 0),
        created_at: new Date().toISOString()
      },
      orderItems: items.map(item => ({
        ...item,
        different_price: item.different_price, // Stelle sicher, dass different_price explizit gesetzt wird
        sale_price: item.sale_price,
        quantity: item.quantity,
        description: item.description || item.article_text,
        has_offer_price: item.use_offer_price && item.offer_price !== undefined ? true : false
      }))
    };

    console.log('🔍 [SAVE-ORDER] Sende Bestellung mit different_price:', completeOrder.orderItems.map(item => ({
      article_number: item.article_number,
      different_price: item.different_price,
      sale_price: item.sale_price
    })));

    console.log('🔍 [SAVE-ORDER] Vollständige Bestellung:', JSON.stringify(completeOrder, null, 2));

    const token = localStorage.getItem('token');

    const response = await fetch(`${environment.apiUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completeOrder)
    });

    if (!response.ok) {
      throw new Error('Fehler beim Speichern des Auftrags');
    }

    return response.json();
  }

  saveOrderAsOpen(): void {
    // Validierung
    if (this.orderItems.length === 0) {
      alert('Bitte fügen Sie mindestens einen Artikel hinzu.');
      return;
    }

    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie einen Kunden aus.');
      return;
    }

    // Direkt als "offen" speichern ohne Modal
    this.isSavingOrder = true;

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
      status: 'open'
    };

    // Nur Kundendaten mitsenden, wenn der Name geändert wurde
    if (this.differentCompanyName) {
      customerData.customer_city = this.globalService.selectedCustomerForOrders.city;
      customerData.customer_street = this.globalService.selectedCustomerForOrders.street;
      customerData.customer_postal_code = this.globalService.selectedCustomerForOrders.postal_code;
      customerData.customer_country_code = this.globalService.selectedCustomerForOrders._country_code;
      customerData.different_company_name = this.differentCompanyName;
    }

    // Datumsfelder nur mitsenden, wenn ausgefüllt
    if (this.orderDate) {
      customerData.order_date = this.orderDate;
    }
    if (this.deliveryDate) {
      customerData.delivery_date = this.deliveryDate;
    }
    
    // Kundenanmerkungen hinzufügen
    customerData.customer_notes = this.customerNotes1 || '';

    // Filter: Artikel mit Menge 0 herausfiltern (negative Mengen erlaubt)
    const filteredOrderItems = this.orderItems.filter(item => item.quantity !== 0);
    
    if (filteredOrderItems.length < this.orderItems.length) {
      console.log(`📦 [SAVE-AS-OPEN] Gefilterte Artikel: ${filteredOrderItems.length} von ${this.orderItems.length} (${this.orderItems.length - filteredOrderItems.length} mit Menge 0 entfernt)`);
    }

    const completeOrder = {
      orderData: {
        ...customerData,
        total_price: this.getOrderTotal(),
        created_at: new Date().toISOString()
      },
      orderItems: filteredOrderItems.map(item => ({
        ...item,
        has_offer_price: item.use_offer_price && item.offer_price !== undefined ? true : false
      }))
    };

    const token = localStorage.getItem('token');

    // Prüfe, ob wir im Bearbeitungsmodus sind
    const isEditMode = this.isEditMode && this.editingOrderId;
    const method = isEditMode ? 'PUT' : 'POST';
    const endpoint = isEditMode 
      ? `${environment.apiUrl}/api/orders/${this.editingOrderId}`
      : `${environment.apiUrl}/api/orders`;

    console.log('🚀 [CUSTOMER-ORDERS] Zwischenspeichern - Bestellung wird abgesendet:');
    console.log('✏️ [CUSTOMER-ORDERS] Bearbeitungsmodus:', isEditMode);
    if (isEditMode) {
      console.log('🆔 [CUSTOMER-ORDERS] Bestellungs-ID:', this.editingOrderId);
    }
    console.log('📋 [CUSTOMER-ORDERS] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('📳 [CUSTOMER-ORDERS] Status: open (Zwischengespeichert)');
    console.log('🌐 [CUSTOMER-ORDERS] Endpoint:', endpoint);
    console.log('🔨 [CUSTOMER-ORDERS] HTTP-Methode:', method);

    fetch(endpoint, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completeOrder)
    })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) {
        console.error('❌ [SAVE-AS-OPEN] Backend-Fehler:', data);
        throw new Error(data.error || data.message || `Fehler beim ${isEditMode ? 'Aktualisieren' : 'Zwischenspeichern'} des Auftrags`);
      }
      return data;
    })
    .then(data => {
      this.isSavingOrder = false;
      const successMessage = isEditMode 
        ? 'Bestellung erfolgreich aktualisiert (Status: Offen)!' 
        : 'Auftrag erfolgreich zwischengespeichert (Status: Offen)!';
      alert(successMessage);
      this.clearAllOrderData();
      
      // Bearbeitungsmodus wird in clearAllOrderData() zurückgesetzt
    })
    .catch(error => {
      this.isSavingOrder = false;
      console.error(`Fehler beim ${isEditMode ? 'Aktualisieren' : 'Zwischenspeichern'} des Auftrags:`, error);
      alert(`Fehler beim ${isEditMode ? 'Aktualisieren' : 'Zwischenspeichern'} des Auftrags: ` + error.message);
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
    
    // 4. Leere Anmerkungen für Split-Modus
    this.customerNotes1 = '';
    this.customerNotes2 = '';
    
    // 5. Leere den geänderten Firmennamen
    this.differentCompanyName = '';
    this.isEditingCompanyName = false;
    this.editingCompanyName = '';
    console.log('✅ [CLEAR-ALL-ORDER] Kundenspezifische Preise geleert');
    
    // 5. Leere die Datumsfelder
    this.orderDate = '';
    this.deliveryDate = '';
    console.log('✅ [CLEAR-ALL-ORDER] Datumsfelder geleert');
    
    // 6. Setze alle Artikel auf Standard-Preise zurück
    this.globalArtikels = this.globalArtikels.map(artikel => ({
      ...artikel,
      different_price: undefined,
      original_price: undefined
    }));
    
    // 7. Bearbeitungsmodus zurücksetzen
    if (this.isEditMode) {
      this.isEditMode = false;
      this.editingOrderId = null;
      this.originalStatus = 'open'; // Reset original status
      // Lösche auch die Bearbeitungsmodus-Daten aus localStorage
      localStorage.removeItem('editModeData');
      console.log('✅ [CLEAR-ALL-ORDER] Bearbeitungsmodus zurückgesetzt und localStorage bereinigt');
    }
    console.log('✅ [CLEAR-ALL-ORDER] Alle Artikel auf Standard-Preise zurückgesetzt');
    
    // 7. Aktualisiere die artikelData
    this.artikelData = [...this.globalArtikels];
    console.log('✅ [CLEAR-ALL-ORDER] artikelData aktualisiert');
    
    // 8. Leere das Suchfeld und gefilterte Artikel
    this.searchTerm = '';
    this.filteredArtikels = [];
    this.showDropdown = false;
    this.selectedIndex = -1;
    console.log('✅ [CLEAR-ALL-ORDER] Suchfeld und gefilterte Artikel geleert');
    
    // 9. Leere die Modals
    this.isCustomerModalOpen = false;
    this.isArticlePricesModalOpen = false;
    this.isOrderConfirmationModalOpen = false;
    this.customerSearchTerm = '';
    this.articlePricesSearchTerm = '';
    this.filteredCustomers = [];
    this.filteredArticlePrices = [];
    console.log('✅ [CLEAR-ALL-ORDER] Modals geleert');
    
    // 10. Leere localStorage
    this.globalService.clearCustomerOrders();
    console.log('✅ [CLEAR-ALL-ORDER] localStorage geleert');
    
    // 11. Reset pendingCustomerForPriceUpdate
    this.pendingCustomerForPriceUpdate = null;
    console.log('✅ [CLEAR-ALL-ORDER] pendingCustomerForPriceUpdate zurückgesetzt');
    
    console.log('🎉 [CLEAR-ALL-ORDER] Alle auftragsrelevanten Daten erfolgreich geleert!');
  }

  // Neue Methode für Bestätigungs-Modal beim Zwischenspeichern
  confirmSaveOrderAsOpen(): void {
    // Öffne das gleiche Modal wie beim normalen Speichern, aber mit Flag für Zwischenspeichern
    this.isSavingAsOpen = true;
    this.openOrderConfirmationModal();
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
    
    // Leere die Datumsfelder
    this.orderDate = '';
    this.deliveryDate = '';
    console.log('✅ [CLEAR-ORDER] Datumsfelder geleert');
    
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
    
    fetch(`${environment.apiUrl}/api/customers`, {
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
    
    // Lösche die Datumsfelder beim Kundenwechsel
    this.orderDate = '';
    this.deliveryDate = '';
    console.log('🧹 [SELECT-CUSTOMER] Datumsfelder zurückgesetzt');
    
    // Lade Kunden-Artikel-Preise für den ausgewählten Kunden
    console.log('🔄 [SELECT-CUSTOMER] Starte loadCustomerArticlePrices für Kunde:', customer.customer_number);
    this.loadCustomerArticlePrices(customer.customer_number);
  }

  // Öffne Modal mit den letzten hochgeladenen Bildern
  openRecentImagesModal(): void {
    const dialogRef = this.dialog.open(RecentImagesModalComponent, {
      width: '98vw',
      maxWidth: '1400px',
      height: '95vh',
      data: {}
    });

    dialogRef.afterClosed().subscribe(() => {
      console.log('📷 [RECENT-IMAGES] Modal geschlossen');
    });
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
    
    // Lösche die Datumsfelder
    this.orderDate = '';
    this.deliveryDate = '';
    console.log('🗑️ [CLEAR-CUSTOMER] Datumsfelder zurückgesetzt');
    
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
    this.isEditingArticlePrices = false; // Reset edit mode when closing
    // Clear any active notification when closing modal
    this.hideArticlePricesNotification();
  }

  async toggleEditMode() {
    if (this.isEditingArticlePrices) {
      this.isEditingArticlePrices = false;
      console.log('🔧 [ARTICLE-PRICES-MODAL] Bearbeitungsmodus deaktiviert');
      this.filterArticlePrices();
      this.filteredArticlePrices.forEach(articlePrice => {
        articlePrice.editedPrice = undefined;
      });
      return;
    }

    const customerNumber = this.globalService.selectedCustomerForOrders?.customer_number;
    if (customerNumber) {
      this.isLoadingArticlePrices = true;
      this.cdr.detectChanges();
      try {
        await this.loadCustomerArticlePricesAsync(customerNumber);
        this.filterArticlePrices();
      } finally {
        this.isLoadingArticlePrices = false;
        this.cdr.detectChanges();
      }
    } else {
      this.filterArticlePrices();
    }

    this.isEditingArticlePrices = true;
    console.log('🔧 [ARTICLE-PRICES-MODAL] Bearbeitungsmodus aktiviert (hinterlegte Preise geladen)');
    this.filteredArticlePrices.forEach(articlePrice => {
      if (articlePrice.editedPrice === undefined) {
        articlePrice.editedPrice = articlePrice.unit_price_net;
      }
    });
  }

  async deleteCustomerArticlePrice(articlePrice: any) {
    if (!articlePrice.id) {
      console.error('❌ [DELETE-ARTICLE-PRICE] Keine ID gefunden');
      alert('Fehler: Artikel-Preis ID nicht gefunden.');
      return;
    }

    if (!confirm(`Möchten Sie wirklich den kundenspezifischen Preis für "${articlePrice.article_text || articlePrice.product_name}" löschen?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await this.http.delete(`${environment.apiUrl}/api/customer-article-prices/${articlePrice.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).toPromise();
      console.log('✅ [DELETE-ARTICLE-PRICE] Preis erfolgreich gelöscht:', response);
      
      // Entferne aus customerArticlePrices
      this.customerArticlePrices = this.customerArticlePrices.filter(p => p.id !== articlePrice.id);
      
      // Aktualisiere gefilterte Liste
      this.filterArticlePrices();
      
      // Aktualisiere globalArtikel mit Standard-Preisen
      this.updateArtikelsWithCustomerPrices();
      
      // Zeige Benachrichtigung
      alert('Kundenspezifischer Preis erfolgreich gelöscht!');
      
    } catch (error: any) {
      console.error('❌ [DELETE-ARTICLE-PRICE] Fehler beim Löschen:', error);
      alert(`Fehler beim Löschen: ${error.message || 'Unbekannter Fehler'}`);
    }
  }

  async saveCustomerArticlePrice(articlePrice: any) {
    if (!articlePrice.id) {
      console.error('❌ [UPDATE-ARTICLE-PRICE] Keine ID gefunden');
      alert('Fehler: Artikel-Preis ID nicht gefunden.');
      return;
    }

    if (!articlePrice.editedPrice || articlePrice.editedPrice <= 0) {
      alert('Bitte geben Sie einen gültigen Preis ein.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await this.http.put(`${environment.apiUrl}/api/customer-article-prices/${articlePrice.id}`, {
        unit_price_net: Number(articlePrice.editedPrice)
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).toPromise();
      
      console.log('✅ [UPDATE-ARTICLE-PRICE] Preis erfolgreich aktualisiert:', response);
      
      // Aktualisiere den Preis in den lokalen Listen
      articlePrice.unit_price_net = Number(articlePrice.editedPrice);
      articlePrice.editedPrice = undefined; // Reset edited price
      
      // Aktualisiere gefilterte Liste
      this.filterArticlePrices();
      
      // Aktualisiere globalArtikels mit neuen Preisen
      this.updateArtikelsWithCustomerPrices();
      
      // Zeige Benachrichtigung
      this.showArticlePricesNotification(
        articlePrice.article_text || articlePrice.product_name, 
        1, 
        true // isPriceUpdate flag
      );
      
    } catch (error: any) {
      console.error('❌ [UPDATE-ARTICLE-PRICE] Fehler beim Aktualisieren:', error);
      alert(`Fehler beim Aktualisieren: ${error.message || 'Unbekannter Fehler'}`);
    }
  }

  showArticlePricesNotification(articleName: string, quantity: number, isPriceUpdate: boolean = false) {
    // Clear any existing timeout
    if (this.articlePricesNotificationTimeout) {
      clearTimeout(this.articlePricesNotificationTimeout);
    }
    
    // Set notification text based on action type
    if (isPriceUpdate) {
      this.articlePricesNotificationText = `✅ Preis für "${articleName}" erfolgreich aktualisiert`;
    } else {
      this.articlePricesNotificationText = `${quantity}x "${articleName}" zum Auftrag hinzugefügt`;
    }
    
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
    } else if (this.articlePricesSearchTerm.trim().length < 3) {
      // Wenn weniger als 3 Zeichen eingegeben wurden, zeige alle verfügbaren Artikel-Preise an
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
    // Normalisierung für robuste Vergleiche (Kleinbuchstaben, ß→ss, Diakritika entfernen)
    const normalize = (v: any) => (v ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Suche nach verschiedenen Feldern in globalArtikels
    const foundInGlobal = this.globalArtikels.some(globalArtikel => {
      const gaArticleNumber = normalize(globalArtikel.article_number);
      // Wir matchen bewusst NICHT mehr über globale product_id oder id, um False-Positives zu vermeiden
      const gaEan = normalize(globalArtikel.ean);

      const cpArticleNumber = normalize(customerPrice.article_number);
      const cpProductId = normalize(customerPrice.product_id);
      const cpEan = normalize(customerPrice.ean);

      // 1. product_id (vom Preis) ↔ article_number (global)
      if (cpProductId && gaArticleNumber && gaArticleNumber === cpProductId) {
        return true;
      }

      // 2. article_number ↔ article_number
      if (cpArticleNumber && gaArticleNumber && gaArticleNumber === cpArticleNumber) {
        return true;
      }

      // 3. ean ↔ ean
      if (cpEan && gaEan && gaEan === cpEan) {
        return true;
      }

      return false;
    });

    return foundInGlobal;
  }

  // Druck-Funktion für kundenspezifische Preise mit Excel-ähnlicher Tabelle
  printCustomerPrices(): void {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    const prices = (this.filteredArticlePrices && this.filteredArticlePrices.length > 0)
      ? this.filteredArticlePrices
      : this.customerArticlePrices;

    if (!prices || prices.length === 0) {
      alert('Keine kundenspezifischen Preise zum Drucken vorhanden.');
      return;
    }

    const customer = this.globalService.selectedCustomerForOrders;
    const doc = new jsPDF();
    
    // Konstanten für das Layout - DIN A4 Portrait, sehr kompakt wie Excel-Liste
    // Zwei Artikelblöcke nebeneinander, viele Zeilen pro Seite,
    // dabei so ausgelegt, dass alles sicher auf eine DIN A4 Seite passt.
    const rowsPerPage = 26; // 26 Tabellenzeilen pro Seite, jede Zeile enthält bis zu 2 Artikel

    // Funktion zum Hinzufügen der Kundendaten auf jeder Seite
    const addCustomerHeader = async (pageNumber: number, totalPages: number) => {
      // Header mit Kundendaten - kompakt gestaltet
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Bestellformular', 14, 15);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Kunde: ${customer.last_name_company || ''}`, 14, 25);
      doc.text(`Kundennummer: ${customer.customer_number || ''}`, 14, 32);
      doc.text(`Seite ${pageNumber} von ${totalPages}`, 14, 39);
      
      // QR-Code für Online-Bestellung hinzufügen (nur auf der ersten Seite)
      if (pageNumber === 1) {
        await this.addQRCodeToPDF(doc, customer.id);
      }
      
      // Trennlinie unter Header
      doc.setLineWidth(0.5);
      doc.line(14, 42, 196, 42);
    };

    // Daten für die Tabelle vorbereiten:
    // Zwei Artikel "nebeneinander" pro Zeile, mit optischem Abstand dazwischen:
    // [Artikel 1, Art.-Nr. 1, Menge 1, (Leer-Spalte), Artikel 2, Art.-Nr. 2, Menge 2]
    const tableData: any[] = [];
    for (let i = 0; i < prices.length; i += 2) {
      const p1 = prices[i];
      const p2 = prices[i + 1];

      const row = [
        p1 ? (p1.article_text || '-') : '',
        p1 ? (p1.article_number || p1.product_id || '-') : '',
        '',  // Menge 1 (zum Ausfüllen)
        '',  // Leer-Spalte als Abstand zwischen Block 1 und 2
        p2 ? (p2.article_text || '-') : '',
        p2 ? (p2.article_number || p2.product_id || '-') : '',
        ''   // Menge 2 (zum Ausfüllen)
      ];

      tableData.push(row);
    }

    // Einige zusätzliche leere Zeilen am Ende für handschriftliche Einträge
    for (let i = 0; i < 6; i++) {
      tableData.push(['', '', '', '', '', '', '']);
    }

    // Gesamtseitenzahl anhand der tatsächlichen Tabellenzeilen berechnen
    const totalPages = Math.ceil(tableData.length / rowsPerPage);

    // Excel-ähnliche Tabelle mit jsPDF-AutoTable
    import('jspdf-autotable').then(({ default: autoTable }) => {
      // Alle Seiten manuell erstellen
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          doc.addPage();
        }
        
        // Header auf jede Seite setzen
        addCustomerHeader(page + 1, totalPages);
        
        // Zeilen (mit bis zu 2 Artikeln) für diese Seite
        const startIndex = page * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, tableData.length);
        const pageData = tableData.slice(startIndex, endIndex);
        
        // Tabelle auf diese Seite zeichnen - WICHTIG: pageBreak deaktivieren
        // startY nach Header positioniert (Header endet bei Y=42, +8px Abstand = 50)
        autoTable(doc, {
          startY: 48,
          // Kürzere Überschriften, damit alles in einer Zeile bleibt
          head: [['Artikel 1', 'Nr. 1', 'Menge', '', 'Artikel 2', 'Nr. 2', 'Menge']],
          body: pageData,
          theme: 'grid',
          pageBreak: 'avoid', // Verhindert automatische Seitenumbrüche
          tableWidth: 'auto',
          styles: {
            fontSize: 8,           // kleine, aber gut lesbare Schrift
            cellPadding: 1.2,      // kompakte Zeilenhöhe
            lineWidth: 0.2,
            lineColor: [100, 100, 100],
            fillColor: [255, 255, 255]
          },
          headStyles: {
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8 // etwas kleinere Schrift, um Umbrüche im Header zu vermeiden
          },
          columnStyles: {
            0: { cellWidth: 50, halign: 'left' },   // Artikel 1
            1: { cellWidth: 22, halign: 'left' },   // Art.-Nr. 1
            2: { cellWidth: 12, halign: 'center' }, // Menge 1
            3: { cellWidth: 6,  halign: 'center' }, // Leer-Spalte (optischer Abstand, ohne Linien)
            4: { cellWidth: 50, halign: 'left' },   // Artikel 2
            5: { cellWidth: 22, halign: 'left' },   // Art.-Nr. 2
            6: { cellWidth: 12, halign: 'center' }  // Menge 2
          },
          margin: { left: 10, right: 10 },
          // Zell-Stile anpassen, damit der Abstand ohne Tabellenlinien dargestellt wird
          didParseCell: (data: any) => {
            const colIndex = data.column.index;

            // Mittlere Leer-Spalte komplett ohne Rahmen und ohne Hintergrund zeichnen
            if (colIndex === 3) {
              data.cell.styles.lineWidth = 0;
              data.cell.styles.fillColor = [255, 255, 255];
              // Im Header auch den schwarzen Balken entfernen
              if (data.section === 'head') {
                data.cell.text = [''];
              }
            }

            // Rechte Linie von Block 1 und linke Linie von Block 2 im Bereich des Abstands entfernen
            if (colIndex === 2) {
              (data.cell.styles as any).lineWidthRight = 0;
            }
            if (colIndex === 4) {
              (data.cell.styles as any).lineWidthLeft = 0;
            }
          },
          // Callback um sicherzustellen, dass nicht automatisch eine neue Seite erstellt wird
          didDrawPage: (data: any) => {
            // Nichts tun - wir kontrollieren Seiten manuell
          }
        });
      }
      
      // Öffne Druck-Dialog erst nach dem Zeichnen aller Tabellen
      try {
        const blobUrl = doc.output('bloburl');
        const win = window.open(blobUrl, '_blank');
        if (win) {
          setTimeout(() => {
            try { win.print(); } catch {}
          }, 400);
        } else {
          doc.save(`Kundenpreise_${customer.customer_number || ''}.pdf`);
        }
      } catch (e) {
        doc.save(`Kundenpreise_${customer.customer_number || ''}.pdf`);
      }
    });
  }

  // QR-Code separat anzeigen (neue Methode)
  async showQRCode(): Promise<void> {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    try {
      const customer = this.globalService.selectedCustomerForOrders;
      console.log('🔍 [QR-CODE] Generiere QR-Code PDF für Kunde:', customer.id);
      
      // Token für den Kunden generieren
      const token = await this.generateCustomerToken(customer.customer_number);
      if (!token) {
        console.error('❌ [QR-CODE] Fehler beim Generieren des Tokens für Kunde:', customer.customer_number);
        alert('Fehler beim Generieren des Tokens. Bitte versuchen Sie es erneut.');
        return;
      }
      
      console.log('🔍 [QR-CODE] Token erfolgreich generiert für Kunde:', customer.customer_number);
      console.log('🔍 [QR-CODE] Kunde Details:', {
        id: customer.id,
        customer_number: customer.customer_number,
        last_name_company: customer.last_name_company
      });
      
      // URL für die öffentliche Bestellseite generieren (mit Token)
      const baseUrl = window.location.origin;
      const orderUrl = `${baseUrl}/customer-order/${token}`;
      console.log('🔍 [QR-CODE] Generierte URL mit Token:', orderUrl);
      console.log('🔍 [QR-CODE] Token Länge:', token.length);
      console.log('🔍 [QR-CODE] Token (erste 20 Zeichen):', token.substring(0, 20) + '...');
      console.log('🔍 [QR-CODE] Base URL:', baseUrl);
      console.log('🔍 [QR-CODE] Vollständige URL:', orderUrl);
      
      // ⭐ AUFFÄLLIGER LOG FÜR DIREKTES KOPIEREN DER URL ⭐
      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('%c🔗 DIREKT-LINK FÜR KUNDENBESTELLUNG', 'color: #10b981; font-weight: bold; font-size: 16px;');
      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('%cKunde: %c' + customer.last_name_company, 'color: #3b82f6; font-weight: bold;', 'color: #1e40af; font-weight: bold;');
      console.log('%cKundennummer: %c' + customer.customer_number, 'color: #3b82f6; font-weight: bold;', 'color: #1e40af; font-weight: bold;');
      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('%c📋 URL zum Kopieren:', 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      console.log('%c' + orderUrl, 'color: #dc2626; font-weight: bold; font-size: 14px; background: #fef3c7; padding: 8px; border-radius: 4px;');
      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('%c💡 Tipp: Rechtsklick auf die URL → "Copy object" oder einfach markieren und kopieren', 'color: #6b7280; font-style: italic;');
      
      // QR-Code als Data URL generieren (höhere Auflösung für bessere Qualität)
      const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
        width: 300, // Höhere Auflösung für bessere Qualität
        margin: 1,  // Kleinerer Rand für mehr Inhalt
        color: {
          dark: '#1a365d',  // Dunkelblau statt schwarz - professioneller
          light: '#f7fafc'  // Sehr helles Blau statt weiß - subtiler
        },
        errorCorrectionLevel: 'H' // Höchste Fehlerkorrektur für bessere Lesbarkeit
      });
      
      // Neue PDF erstellen
      const doc = new jsPDF();
      
      // Header mit professionelleren Farben
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 54, 93); // Dunkelblau
      doc.text('Online Bestellung', 105, 30, { align: 'center' });
      
      // Kundendaten
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(66, 153, 225); // Hellblau
      doc.text('Kundendaten:', 20, 50);
      
      doc.setFontSize(12);
      doc.setTextColor(26, 54, 93); // Dunkelblau
      doc.text(`Firma: ${customer.last_name_company || ''}`, 20, 65);
      doc.text(`Kundennummer: ${customer.customer_number || ''}`, 20, 75);
      if (customer.name_addition) {
        doc.text(`Zusatz: ${customer.name_addition}`, 20, 85);
      }
      
      // QR-Code (kleiner, damit mehr Platz für Text bleibt)
      const qrSize = 80; // Kleinerer QR-Code
      const qrX = 105 - (qrSize / 2); // Zentriert
      const qrY = 100;
      
      // Schönerer Rahmen mit abgerundeten Ecken (simuliert durch mehrere Rechtecke)
      const framePadding = 8;
      const frameSize = qrSize + (framePadding * 2);
      
      // Hintergrund für den QR-Code (weiß)
      doc.setFillColor(255, 255, 255);
      doc.rect(qrX - framePadding, qrY - framePadding, frameSize, frameSize, 'F');
      
      // Äußerer Rahmen (dunkelblau)
      doc.setDrawColor(26, 54, 93); // #1a365d
      doc.setLineWidth(2);
      doc.rect(qrX - framePadding, qrY - framePadding, frameSize, frameSize);
      
      // Innerer Rahmen (hellblau)
      doc.setDrawColor(66, 153, 225); // #4299e1
      doc.setLineWidth(1);
      doc.rect(qrX - framePadding + 3, qrY - framePadding + 3, frameSize - 6, frameSize - 6);
      
      // QR-Code einfügen
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      
      // Anleitung (rechts neben dem QR-Code)
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 54, 93); // Dunkelblau
      doc.text('Anleitung:', 20, 200);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(66, 153, 225); // Hellblau
      doc.text('1. QR-Code mit dem Handy scannen', 20, 215);
      doc.text('2. Direkt auf der Webseite bestellen', 20, 230);
      
      // Wichtiger Hinweis zum Datenschutz
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // Rot für Aufmerksamkeit
      doc.text('Wichtiger Hinweis:', 20, 250);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(220, 38, 38); // Rot für Aufmerksamkeit
      doc.text('Bitte QR-Code nicht weitergeben - enthält persönliche Bestelldaten', 20, 265);
      
      // Datum
      doc.setFontSize(10);
      doc.setTextColor(26, 54, 93); // Dunkelblau
      doc.text(`Generiert am: ${new Date().toLocaleString('de-DE')}`, 20, 285);
      
      // PDF öffnen und automatisch drucken
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        // Automatischer Druck nach kurzer Verzögerung
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      
    } catch (error: any) {
      console.error('❌ [QR-CODE] Fehler beim Generieren des QR-Code PDFs:', error);
      alert('Fehler beim Generieren des QR-Code PDFs: ' + (error?.message || 'Unbekannter Fehler'));
    }
  }

  // Token für Kunden generieren
  private async generateCustomerToken(customerNumber: string): Promise<string | null> {
    try {
      console.log('🔍 [TOKEN] Generiere Token für Kunde:', customerNumber);
      console.log('🔍 [TOKEN] API URL:', '${environment.apiUrl}/api/auth/generate-customer-token');
      console.log('🔍 [TOKEN] Request Body:', { customerNumber: customerNumber });
      console.log('🔍 [TOKEN] Aktuelle URL:', window.location.href);
      
      const response = await firstValueFrom(this.http.post(`${environment.apiUrl}/api/auth/generate-customer-token`, {
        customerNumber: customerNumber
      }));
      
      console.log('🔍 [TOKEN] API Response erhalten:', response);
      console.log('🔍 [TOKEN] Response Typ:', typeof response);
      console.log('🔍 [TOKEN] Response Keys:', response ? Object.keys(response) : 'keine');
      
      if (response && (response as any).token) {
              console.log('🔍 [TOKEN] Token erfolgreich generiert:', (response as any).token);
      console.log('🔍 [TOKEN] Token Länge:', (response as any).token.length);
      console.log('🔍 [TOKEN] Token (erste 20 Zeichen):', (response as any).token.substring(0, 20) + '...');
      console.log('🔍 [TOKEN] Token erfolgreich zurückgegeben');
      return (response as any).token;
      } else {
        console.error('❌ [TOKEN] Kein Token in der Response erhalten:', response);
        return null;
      }
    } catch (error: any) {
      console.error('❌ [TOKEN] Fehler beim Generieren des Tokens:', error);
      console.error('❌ [TOKEN] Fehler Status:', error?.status);
      console.error('❌ [TOKEN] Fehler Message:', error?.message);
      console.error('❌ [TOKEN] Fehler Details:', error);
      return null;
    }
  }

  // QR-Code für Online-Bestellung zum PDF hinzufügen
  private async addQRCodeToPDF(doc: any, customerId: string): Promise<void> {
    try {
      console.log('🔍 [QR-CODE] Starte QR-Code Generierung für Kunde:', customerId);
      
      // Token für den Kunden generieren
      const token = await this.generateCustomerToken(customerId);
      if (!token) {
        console.error('❌ [QR-CODE] Konnte keinen Token generieren, verwende Fallback');
        // Fallback: Verwende die ursprüngliche URL ohne Token
        const baseUrl = window.location.origin;
        const orderUrl = `${baseUrl}/customer-order/${customerId}`;
        console.log('🔍 [QR-CODE] Fallback URL:', orderUrl);
        
        // QR-Code mit Fallback-URL generieren
        const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#1a365d',
            light: '#f7fafc'
          },
          errorCorrectionLevel: 'H'
        });
        
        // QR-Code ins PDF einfügen (vereinfachte Version)
        const qrX = 140;
        const qrY = 15;
        const qrSize = 80;
        doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        
        // Wichtiger Hinweis zum Datenschutz auch im Fallback
        const textX = qrX + (qrSize / 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 38, 38); // Rot für Aufmerksamkeit
        const warningText = '⚠️ Bitte QR-Code nicht weitergeben - enthält persönliche Bestelldaten';
        const warningWidth = doc.getTextWidth(warningText);
        doc.text(warningText, textX - (warningWidth / 2), qrY + qrSize + 65);
        
        // URL mit Zeilenumbrüchen auch im Fallback anzeigen
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100); // Grau für URL
        const urlLabel = 'Direktlink:';
        const urlLabelWidth = doc.getTextWidth(urlLabel);
        doc.text(urlLabel, textX - (urlLabelWidth / 2), qrY + qrSize + 80);
        
        // URL in mehrere Zeilen aufteilen
        const maxLineLength = 35; // Maximale Zeichen pro Zeile
        const urlLines = this.splitUrlIntoLines(orderUrl, maxLineLength);
        let urlY = qrY + qrSize + 90;
        
        urlLines.forEach((line: string) => {
          const lineWidth = doc.getTextWidth(line);
          doc.text(line, textX - (lineWidth / 2), urlY);
          urlY += 5; // Abstand zwischen den Zeilen
        });
        
        console.log('🔍 [QR-CODE] Fallback QR-Code ins PDF eingefügt');
        return;
      }
      
      console.log('🔍 [QR-CODE] Token erfolgreich generiert für Kunde:', customerId);
      
      // URL für die öffentliche Bestellseite generieren (mit Token)
      const baseUrl = window.location.origin;
      const orderUrl = `${baseUrl}/customer-order/${token}`;
      console.log('🔍 [QR-CODE] Generierte URL mit Token:', orderUrl);
      console.log('🔍 [QR-CODE] Token Länge:', token.length);
      console.log('🔍 [QR-CODE] Token (erste 20 Zeichen):', token.substring(0, 20) + '...');
      
      // QR-Code als Data URL generieren (höhere Auflösung für bessere Qualität)
      console.log('🔍 [QR-CODE] Generiere QR-Code...');
      const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
        width: 200, // Höhere Auflösung für bessere Qualität
        margin: 1,  // Kleinerer Rand für mehr Inhalt
        color: {
          dark: '#1a365d',  // Dunkelblau statt schwarz - professioneller
          light: '#f7fafc'  // Sehr helles Blau statt weiß - subtiler
        },
        errorCorrectionLevel: 'H' // Höchste Fehlerkorrektur für bessere Lesbarkeit
      });
      console.log('🔍 [QR-CODE] QR-Code erfolgreich generiert, Länge:', qrCodeDataUrl.length);
      
      // QR-Code rechts oben im Header platzieren (größer und sichtbarer)
      console.log('🔍 [QR-CODE] Füge QR-Code ins PDF ein...');
      
      // Position: Rechts oben, aber garantiert sichtbar
      const qrX = 140;  // X-Position (von links) - etwas nach links verschoben
      const qrY = 15;   // Y-Position (von oben) - etwas nach oben verschoben
      const qrSize = 80; // Größerer QR-Code für bessere Lesbarkeit
      
      // Schönerer Rahmen mit abgerundeten Ecken (simuliert durch mehrere Rechtecke)
      const framePadding = 8;
      const frameSize = qrSize + (framePadding * 2);
      
      // Hintergrund für den QR-Code (weiß mit subtiler Schattierung)
      doc.setFillColor(255, 255, 255);
      doc.rect(qrX - framePadding, qrY - framePadding, frameSize, frameSize, 'F');
      
      // Äußerer Rahmen (dunkelblau)
      doc.setDrawColor(26, 54, 93); // #1a365d
      doc.setLineWidth(1.5);
      doc.rect(qrX - framePadding, qrY - framePadding, frameSize, frameSize);
      
      // Innerer Rahmen (hellblau)
      doc.setDrawColor(66, 153, 225); // #4299e1
      doc.setLineWidth(0.5);
      doc.rect(qrX - framePadding + 2, qrY - framePadding + 2, frameSize - 4, frameSize - 4);
      
      // QR-Code einfügen
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      console.log('🔍 [QR-CODE] QR-Code erfolgreich ins PDF eingefügt bei Position:', qrX, qrY, 'Größe:', qrSize);
      
      // Professionelle Beschriftung unter dem QR-Code
      const textX = qrX + (qrSize / 2); // Zentriert unter dem QR-Code
      
      // Haupttitel
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 54, 93); // Dunkelblau
      const mainTitle = 'ONLINE BESTELLEN';
      const mainTitleWidth = doc.getTextWidth(mainTitle);
      doc.text(mainTitle, textX - (mainTitleWidth / 2), qrY + qrSize + 20);
      
      // Untertitel
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(66, 153, 225); // Hellblau
      const subtitle1 = 'QR-Code scannen';
      const subtitle1Width = doc.getTextWidth(subtitle1);
      doc.text(subtitle1, textX - (subtitle1Width / 2), qrY + qrSize + 35);
      
      const subtitle2 = 'Direkt bestellen';
      const subtitle2Width = doc.getTextWidth(subtitle2);
      doc.text(subtitle2, textX - (subtitle2Width / 2), qrY + qrSize + 48);
      
      // Wichtiger Hinweis zum Datenschutz
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(220, 38, 38); // Rot für Aufmerksamkeit
      const warningText = '⚠️ Bitte QR-Code nicht weitergeben - enthält persönliche Bestelldaten';
      const warningWidth = doc.getTextWidth(warningText);
      doc.text(warningText, textX - (warningWidth / 2), qrY + qrSize + 65);
      
      // URL mit Zeilenumbrüchen anzeigen
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100); // Grau für URL
      const urlLabel = 'Direktlink:';
      const urlLabelWidth = doc.getTextWidth(urlLabel);
      doc.text(urlLabel, textX - (urlLabelWidth / 2), qrY + qrSize + 80);
      
      // URL in mehrere Zeilen aufteilen
      const maxLineLength = 35; // Maximale Zeichen pro Zeile
      const urlLines = this.splitUrlIntoLines(orderUrl, maxLineLength);
      let urlY = qrY + qrSize + 90;
      
      urlLines.forEach((line: string) => {
        const lineWidth = doc.getTextWidth(line);
        doc.text(line, textX - (lineWidth / 2), urlY);
        urlY += 5; // Abstand zwischen den Zeilen
      });
      
      // Zusätzliche visuelle Elemente
      // Kleine dekorative Linien links und rechts vom Titel
      const lineLength = 15;
      const lineY = qrY + qrSize + 28;
      
      doc.setDrawColor(66, 153, 225); // Hellblau
      doc.setLineWidth(1);
      doc.line(textX - (mainTitleWidth / 2) - lineLength - 5, lineY, textX - (mainTitleWidth / 2) - 5, lineY);
      doc.line(textX + (mainTitleWidth / 2) + 5, lineY, textX + (mainTitleWidth / 2) + lineLength + 5, lineY);
      
      console.log('🔍 [QR-CODE] Beschriftung und Dekoration hinzugefügt');
      
    } catch (error: any) {
      console.error('❌ [QR-CODE] Fehler beim Generieren des QR-Codes:', error);
      console.error('❌ [QR-CODE] Fehler Details:', error?.message, error?.stack);
      
      // Fallback: Text statt QR-Code
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(26, 54, 93); // Dunkelblau
      doc.text('Online bestellen:', 160, 25);
      doc.text('QR-Code verfügbar', 160, 30);
      console.log('🔍 [QR-CODE] Fallback-Text hinzugefügt');
    }
  }

  addArticleFromPricesModal(customerPrice: any) {
    console.log('➕ [ARTICLE-PRICES-MODAL] Füge Artikel hinzu:', customerPrice);
    console.log('🔍 [ARTICLE-PRICES-MODAL] Suche nach Artikel mit:');
    console.log('   - product_id:', customerPrice.product_id);
    console.log('   - id:', customerPrice.id);
    console.log('📊 [ARTICLE-PRICES-MODAL] Anzahl globaler Artikel:', this.globalArtikels.length);
    
    // Einheitliche, robuste Suche (wie der Filter): diakritik- und case-insensitiv
    const normalize = (v: any) => (v ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let artikel = null;

    const cpArticleNumber = normalize(customerPrice.article_number);
    const cpProductId = normalize(customerPrice.product_id);
    const cpEan = normalize(customerPrice.ean);

    artikel = this.globalArtikels.find(art => {
      const gaArticleNumber = normalize(art.article_number);
      const gaEan = normalize(art.ean);
      return (cpArticleNumber && gaArticleNumber === cpArticleNumber) ||
             (cpProductId && gaArticleNumber === cpProductId) ||
             (cpEan && gaEan && gaEan === cpEan);
    }) || null;

    if (artikel) {
      console.log('✅ [ARTICLE-PRICES-MODAL] Artikel gefunden:', {
        article_number: artikel.article_number,
        ean: artikel.ean
      });
      
      // Prüfe auf Unterschiede im Artikeltext zwischen Modal und globaler Datenbank
      const modalText = (customerPrice.article_text || customerPrice.product_name)?.trim();
      const globalText = artikel.article_text?.trim();

      console.log('🔍 [ARTICLE-COMPARISON] Vergleiche Artikeltexte:');
      console.log('   - Modal-Daten:', customerPrice);
      console.log('   - Modal-Text (mit Fallback):', modalText);
      console.log('   - Globaler Artikel:', artikel);
      console.log('   - Globaler Text:', globalText);

      if (modalText && globalText && modalText !== globalText) {
        console.warn('⚠️ [ARTICLE-TEXT-MISMATCH] Unterschiedlicher Artikeltext gefunden:', {
          modal: modalText,
          global: globalText,
          article_number: artikel.article_number
        });

        // Frage den Benutzer, ob er trotzdem fortfahren möchte
        const confirmMessage = `⚠️ Dateninkonsistenz erkannt!\n\n` +
          `Artikelnummer: ${artikel.article_number}\n\n` +
          `Im Modal angezeigt:\n"${modalText}"\n\n` +
          `In der Datenbank gefunden:\n"${globalText}"\n\n` +
          `Möchten Sie den Artikel trotzdem mit dem Datenbank-Text hinzufügen?`;

        const userConfirmed = confirm(confirmMessage);

        if (!userConfirmed) {
          console.log('❌ [ARTICLE-TEXT-MISMATCH] Benutzer hat Hinzufügen abgebrochen');
          return; // Breche die Methode ab
        }

        console.log('✅ [ARTICLE-TEXT-MISMATCH] Benutzer hat Fortfahren bestätigt');
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
      
      // Normalisiere den Preis des Items (prüft ob Angebotspreis günstiger ist)
      this.normalizeItemPrice(orderItem);
      
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

  // Debug-Methode für Modal-Anzeige
  logModalDisplay(customerPrice: any): string {
    const displayedText = customerPrice.article_text || customerPrice.product_name || 'Unbekannter Artikel';
    const displayedNumber = customerPrice.article_number || customerPrice.product_id;

    console.log('📱 [MODAL-DISPLAY] Einzelner Artikel im Modal:');
    console.log('   - Artikeltext:', displayedText);
    console.log('   - Artikelnummer:', displayedNumber);
    console.log('   - Rohdaten:', customerPrice);

    return ''; // Leerer String für Template
  }

  // Neue Methode zum Laden der Kunden-Artikel-Preise
  // Promise-Version für async/await oder .then()
  loadCustomerArticlePricesAsync(customerNumber: string): Promise<void> {
    return new Promise((resolve) => {
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES-ASYNC] Starte API-Aufruf für Kunde:', customerNumber);
      
      // Spezielle Behandlung für bestimmte Kunden
      if (customerNumber === '10.022' || customerNumber === '10.003') {
        console.log('⚠️ [CUSTOMER-ARTICLE-PRICES-ASYNC] Spezielle Behandlung');
        this.customerArticlePrices = [];
        this.updateArtikelsWithCustomerPrices();
        resolve();
        return;
      }
      
      const token = localStorage.getItem('token');
      const apiUrl = `${environment.apiUrl}/api/customer-article-prices/customer/${customerNumber}`;
      
      fetch(apiUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      .then(response => {
        if (!response.ok) throw new Error(`Fehler: ${response.status}`);
        return response.json();
      })
      .then(data => {
        const filtered = Array.isArray(data) 
          ? data.filter((price: any) => this.isArticleAvailableInGlobal(price))
          : [];
        this.customerArticlePrices = filtered;
        this.updateArtikelsWithCustomerPrices();
        console.log('✅ [CUSTOMER-ARTICLE-PRICES-ASYNC] Geladen:', filtered.length);
        resolve();
      })
      .catch(error => {
        console.error('❌ [CUSTOMER-ARTICLE-PRICES-ASYNC] Fehler:', error);
        this.customerArticlePrices = [];
        resolve(); // Auch bei Fehler auflösen
      });
    });
  }

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
    const apiUrl = `${environment.apiUrl}/api/customer-article-prices/customer/${customerNumber}`;
    
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
      console.log('📊 [CUSTOMER-ARTICLE-PRICES] Anzahl Artikel-Preise (roh):', Array.isArray(data) ? data.length : 'Kein Array');

      if (Array.isArray(data)) {
        console.log('📊 [CUSTOMER-ARTICLE-PRICES] Erste 3 Artikel-Preise:', data.slice(0, 3));
        if (data.length > 0) {
          console.log('📊 [CUSTOMER-ARTICLE-PRICES] Beispiel Artikel-Preis:', data[0]);
          // Debug: Zeige alle verfügbaren Felder des ersten Eintrags
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] Verfügbare Felder im ersten Eintrag:', Object.keys(data[0]));
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] product_id:', data[0].product_id);
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] article_number:', data[0].article_number);

          // Logge was im Modal angezeigt wird
          const firstItem = data[0];
          const displayedText = firstItem.article_text || firstItem.product_name || 'Unbekannter Artikel';
          const displayedNumber = firstItem.article_number || firstItem.product_id;

          console.log('📱 [MODAL-DISPLAY] Was wird im Modal angezeigt:');
          console.log('   - Artikeltext:', displayedText);
          console.log('   - Artikelnummer:', displayedNumber);
          console.log('   - article_text vorhanden:', !!firstItem.article_text);
          console.log('   - product_name vorhanden:', !!firstItem.product_name);
          console.log('   - article_number vorhanden:', !!firstItem.article_number);
          console.log('   - product_id vorhanden:', !!firstItem.product_id);
          console.log('🔍 [CUSTOMER-ARTICLE-PRICES] unit_price_net:', data[0].unit_price_net);
        }
      }

      // Filtere direkt nach globaler Verfügbarkeit, damit nicht-verfügbare Artikel
      // weder gezählt noch im Modal angezeigt werden
      const filteredCustomerPrices = Array.isArray(data)
        ? data.filter((price: any) => this.isArticleAvailableInGlobal(price))
        : [];

      this.customerArticlePrices = filteredCustomerPrices;
      console.log('💾 [CUSTOMER-ARTICLE-PRICES] Gefilterte Daten gespeichert', {
        originalCount: Array.isArray(data) ? data.length : 0,
        filteredCount: filteredCustomerPrices.length,
      });

      // Aktualisiere die Artikel mit den kundenspezifischen Preisen
      console.log('🔄 [CUSTOMER-ARTICLE-PRICES] Starte updateArtikelsWithCustomerPrices...');
      this.updateArtikelsWithCustomerPrices();

      // Wenn Modal offen ist, Anzeige aktualisieren
      if (this.isArticlePricesModalOpen) {
        this.filterArticlePrices();
      }
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
      
      // WICHTIG für Refresh im Edit-Mode: Wenn Angebote bereits geladen sind,
      // wende sie auf die Kundenpreise an, damit der günstigere Preis (Angebot oder Kunde) verwendet wird
      if (this.activeOfferFirst && Array.isArray(this.orderItems) && this.orderItems.length > 0) {
        console.log('🏷️ [UPDATE-PRICES] Angebote bereits geladen, wende auf OrderItems an');
        // annotateCustomerPricesWithOffer() aktualisiert die customerArticlePrices mit Angeboten
        // und wendet dann normalizeItemPrice() auf alle OrderItems an
        this.annotateCustomerPricesWithOffer(this.activeOfferFirst);
      }
      
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
        
        // Prüfe, ob der Artikel in globalArtikels ein Angebot hat
        // Dies ist wichtig, damit der günstigere Preis (Angebot vs. Kunde) verwendet wird
        let offerPriceFromGlobal: number | undefined = undefined;
        let useOfferPrice = false;
        if (this.globalArtikels && this.globalArtikels.length > 0) {
          const matchingArtikel = this.globalArtikels.find(art => 
            (art.article_number && art.article_number === orderItem.article_number) ||
            (art.product_id && art.product_id === orderItem.product_id) ||
            (art.id && art.id === orderItem.product_id)
          );
          if (matchingArtikel && matchingArtikel.use_offer_price && matchingArtikel.offer_price !== undefined) {
            offerPriceFromGlobal = matchingArtikel.offer_price;
            useOfferPrice = true;
            console.log(`🏷️ [UPDATE-ORDER-PRICES] Angebotspreis für ${orderItem.article_number} gefunden: €${offerPriceFromGlobal}`);
          }
        }
        
        updatedOrderItems++;
        const updatedItem = {
          ...orderItem,
          // sale_price bleibt unverändert (Standard-Preis)
          different_price: customerNetPrice, // Setze den kundenspezifischen Preis
          original_price: originalPrice, // Behalte den ursprünglichen Standard-Preis
          // WICHTIG: Setze offer_price, damit normalizeItemPrice() den günstigeren Preis wählen kann
          offer_price: offerPriceFromGlobal !== undefined ? offerPriceFromGlobal : orderItem.offer_price,
          use_offer_price: useOfferPrice || orderItem.use_offer_price
        };
        
        // WICHTIG: Prüfe nach dem Setzen des Kundenpreises, ob ein Angebotspreis günstiger ist
        // normalizeItemPrice() prüft offer_price und setzt different_price auf den günstigeren Preis
        this.normalizeItemPrice(updatedItem);
        
        return updatedItem;
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
    
    // Load existing EANs for this article
    this.loadExistingEans(item.article_number);
    
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
    this.existingEans = [];
    this.isLoadingEans = false;
  }

  // Order confirmation modal methods
  openOrderConfirmationModal(): void {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      this.isSavingAsOpen = false; // Reset flag
      return;
    }

    if (this.orderItems.length === 0) {
      alert('Bitte fügen Sie Artikel zum Auftrag hinzu.');
      this.isSavingAsOpen = false; // Reset flag
      return;
    }

    // Prüfe auf Verkaufspreise unter EK-Preis
    const itemsBelowCost = this.orderItems.filter(item => {
      const sellingPrice = item.different_price !== undefined ? item.different_price : item.sale_price;
      return item.cost_price && sellingPrice < item.cost_price;
    });

    // Bestellübersicht erstellen
    const orderSummary = this.orderItems.map(item => 
      `${item.quantity}x ${item.article_text} - €${((item.different_price !== undefined ? item.different_price : item.sale_price) * item.quantity).toFixed(2)}`
    ).join('\n');
    
    const totalPrice = this.getOrderTotal();
    const customerName = this.globalService.selectedCustomerForOrders.last_name_company;
    
    // Erweiterte Bestellübersicht mit Datumsfeldern
    const statusText = this.isSavingAsOpen ? 'zwischenspeichern (Status: Offen)' : 'speichern';
    let confirmMessage = `📋 Auftrag ${statusText}\n\nKunde: ${customerName}\n\nArtikel:\n${orderSummary}\n\nGesamtpreis: €${totalPrice.toFixed(2)}`;
    
    // Füge Datumsfelder zur Übersicht hinzu, falls ausgefüllt
    if (this.orderDate) {
      confirmMessage += `\nBestelldatum: ${this.orderDate}`;
    }
    if (this.deliveryDate) {
      confirmMessage += `\nLieferdatum: ${this.deliveryDate}`;
    }
    
    if (itemsBelowCost.length > 0) {
      const itemNames = itemsBelowCost.map(item => 
        `${item.article_text} (VK: €${(item.different_price !== undefined ? item.different_price : item.sale_price).toFixed(2)} < EK: €${item.cost_price.toFixed(2)})`
      ).join('\n');
      
      confirmMessage += `\n\n⚠️ WARNUNG: Folgende Artikel werden unter dem Einkaufspreis verkauft:\n\n${itemNames}`;
    }
    
    if (this.isSavingAsOpen) {
      confirmMessage += `\n\nDer Auftrag wird mit dem Status "Offen" gespeichert und kann später bearbeitet werden.`;
    }
    
    confirmMessage += `\n\nMöchten Sie diesen Auftrag ${statusText}?`;
    
    // Bereite die Modal-Daten vor
    this.orderConfirmationData = {
      customerName: customerName,
      orderSummary: orderSummary,
      totalPrice: totalPrice,
      orderDate: this.orderDate,
      deliveryDate: this.deliveryDate,
      itemsBelowCost: itemsBelowCost,
      confirmMessage: confirmMessage
    };

    this.isOrderConfirmationModalOpen = true;
  }

  closeOrderConfirmationModal(): void {
    this.isOrderConfirmationModalOpen = false;
    this.orderConfirmationData = null;
    this.isSavingOrder = false;
    this.isSavingAsOpen = false; // Reset flag when closing modal
  }

  confirmOrderSave(): void {
    if (!this.orderConfirmationData) {
      return;
    }

    // Verhindere Doppelklicks
    if (this.isSavingOrder) {
      console.log('⚠️ [SAVE-ORDER] Auftrag wird bereits gespeichert. Doppelklick verhindert.');
      return;
    }

    this.isSavingOrder = true;

    // Ensure description is set for all items
    this.orderItems.forEach(item => {
      if (!item.description && item.article_text) {
        item.description = item.article_text;
      }
    });

    // Kundendaten für den Request
    // Wenn isSavingAsOpen true ist, Status auf "open" setzen, sonst "completed"
    const orderStatus = this.isSavingAsOpen ? 'open' : 'completed';
    const customerData: any = {
      customer_id: this.globalService.selectedCustomerForOrders.id,
      customer_number: this.globalService.selectedCustomerForOrders.customer_number,
      customer_name: this.globalService.selectedCustomerForOrders.last_name_company,
      customer_addition: this.globalService.selectedCustomerForOrders.name_addition,
      customer_email: this.globalService.selectedCustomerForOrders.email,
      status: orderStatus
    };

    // Nur Kundendaten mitsenden, wenn der Name geändert wurde
    if (this.differentCompanyName) {
      customerData.customer_city = this.globalService.selectedCustomerForOrders.city;
      customerData.customer_street = this.globalService.selectedCustomerForOrders.street;
      customerData.customer_postal_code = this.globalService.selectedCustomerForOrders.postal_code;
      customerData.customer_country_code = this.globalService.selectedCustomerForOrders._country_code;
      customerData.different_company_name = this.differentCompanyName;
    }

    // Datumsfelder nur mitsenden, wenn ausgefüllt
    if (this.orderDate) {
      customerData.order_date = this.orderDate;
    }
    if (this.deliveryDate) {
      customerData.delivery_date = this.deliveryDate;
    }
    
    // Kundenanmerkungen hinzufügen
    customerData.customer_notes = this.customerNotes1 || '';

    // Filter: Artikel mit Menge 0 herausfiltern (negative Mengen erlaubt)
    const filteredOrderItems = this.orderItems.filter(item => item.quantity !== 0);
    
    if (filteredOrderItems.length < this.orderItems.length) {
      console.log(`📦 [SAVE-ORDER] Gefilterte Artikel: ${filteredOrderItems.length} von ${this.orderItems.length} (${this.orderItems.length - filteredOrderItems.length} mit Menge 0 entfernt)`);
    }

    const completeOrder = {
      orderData: {
        ...customerData,
        total_price: this.getOrderTotal(),
        created_at: new Date().toISOString()
      },
      orderItems: filteredOrderItems.map(item => ({
        ...item,
        has_offer_price: item.use_offer_price && item.offer_price !== undefined ? true : false
      }))
    };

    const token = localStorage.getItem('token');

    // Prüfe, ob wir im Bearbeitungsmodus sind
    const isEditMode = this.isEditMode && this.editingOrderId;
    const method = isEditMode ? 'PUT' : 'POST';
    const endpoint = isEditMode 
      ? `${environment.apiUrl}/api/orders/${this.editingOrderId}`
      : `${environment.apiUrl}/api/orders`;

    console.log('🚀 [CUSTOMER-ORDERS] Bestellung wird abgesendet:');
    console.log('✏️ [CUSTOMER-ORDERS] Bearbeitungsmodus:', isEditMode);
    if (isEditMode) {
      console.log('🆔 [CUSTOMER-ORDERS] Bestellungs-ID:', this.editingOrderId);
    }
    console.log('📋 [CUSTOMER-ORDERS] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('💰 [CUSTOMER-ORDERS] Gesamtpreis:', completeOrder.orderData.total_price);
    console.log('📦 [CUSTOMER-ORDERS] Anzahl Artikel:', completeOrder.orderItems.length);
    console.log('👤 [CUSTOMER-ORDERS] Kunde:', completeOrder.orderData.customer_name);
    console.log('🆔 [CUSTOMER-ORDERS] Kunden-ID:', completeOrder.orderData.customer_id);
    console.log('📅 [CUSTOMER-ORDERS] Bestelldatum:', completeOrder.orderData.order_date || 'Nicht gesetzt');
    console.log('🚚 [CUSTOMER-ORDERS] Lieferdatum:', completeOrder.orderData.delivery_date || 'Nicht gesetzt');
    console.log('🏢 [CUSTOMER-ORDERS] Firmenname geändert:', !!completeOrder.orderData.different_company_name);
    console.log('🔑 [CUSTOMER-ORDERS] Token vorhanden:', !!token);
    console.log('🌐 [CUSTOMER-ORDERS] Endpoint:', endpoint);
    console.log('🔨 [CUSTOMER-ORDERS] HTTP-Methode:', method);
    console.log('📊 [CUSTOMER-ORDERS] Artikel-Details:', completeOrder.orderItems.map(item => ({
      artikel: item.article_text,
      menge: item.quantity,
      preis: item.different_price !== undefined ? item.different_price : item.sale_price,
      beschreibung: item.description
    })));

    console.log('💾 [SAVE-ORDER] Auftrag wird gespeichert:', completeOrder);
    
    fetch(endpoint, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completeOrder)
    })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) {
        console.error('❌ [SAVE-ORDER] Backend-Fehler:', data);
        throw new Error(data.error || data.message || `Fehler beim ${isEditMode ? 'Aktualisieren' : 'Speichern'} des Auftrags`);
      }
      return data;
    })
    .then(data => {
      this.isSavingOrder = false;
      const statusText = this.isSavingAsOpen ? 'zwischengespeichert (Status: Offen)' : 'gespeichert';
      const successMessage = isEditMode 
        ? `Bestellung erfolgreich aktualisiert${this.isSavingAsOpen ? ' (Status: Offen)' : ''}!` 
        : `Auftrag erfolgreich ${statusText}!`;
      alert(successMessage);
      this.closeOrderConfirmationModal();
      this.clearAllOrderData();
      
      // Bearbeitungsmodus zurücksetzen
      if (isEditMode) {
        this.isEditMode = false;
        this.editingOrderId = null;
        this.originalStatus = 'open'; // Reset original status
        // Lösche auch die Bearbeitungsmodus-Daten aus localStorage
        localStorage.removeItem('editModeData');
        console.log('✅ [CUSTOMER-ORDERS] Bearbeitungsmodus beendet und localStorage bereinigt');
      }
    })
    .catch(error => {
      this.isSavingOrder = false;
      console.error(`Fehler beim ${isEditMode ? 'Aktualisieren' : 'Speichern'} des Auftrags:`, error);
      alert(`Fehler beim ${isEditMode ? 'Aktualisieren' : 'Speichern'} des Auftrags: ` + error.message);
    });
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

  loadExistingEans(articleNumber: string): void {
    const token = localStorage.getItem('token');
    this.isLoadingEans = true;
    
    this.http.get(`${environment.apiUrl}/api/product-eans/article/${articleNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).subscribe({
      next: (response: any) => {
        this.isLoadingEans = false;
        if (response.success && response.data) {
          this.existingEans = response.data.map((item: any) => ({
            id: item.id,
            ean: item.ean
          }));
        } else {
          this.existingEans = [];
        }
      },
      error: (error: any) => {
        this.isLoadingEans = false;
        console.error('Error loading existing EANs:', error);
        this.existingEans = [];
      }
    });
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

    this.http.post(`${environment.apiUrl}/api/product-eans/assign`, payload, {
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
          
          // Add to existingEans list
          this.existingEans.push({
            id: response.data?.id || Date.now(), // Use response ID or fallback
            ean: this.eanCode.trim()
          });
          
          setTimeout(() => {
            this.closeEanAssignmentModal();
          }, 1000);
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
      
      this.http.delete(`${environment.apiUrl}/api/product-eans/${item.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).subscribe({
        next: (response: any) => {
          if (response.success) {
            // Remove EAN from the item
            item.ean = undefined;
            
            // Also remove from existingEans list if it's there
            this.existingEans = this.existingEans.filter(ean => ean.id !== item.id);
            
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

  // test comment
  // Hilfsmethode zum Prüfen auf ungespeicherte Änderungen
  private hasUnsavedChanges(): boolean {
    return this.isEditMode || this.orderItems.length > 0;
  }

  private navigateWithUnsavedChanges(targetRoute: string[], confirmLabel: string): void {
    if (this.hasUnsavedChanges()) {
      const dialogRef = this.dialog.open(MyDialogComponent, {
        width: '400px',
        data: {
          title: 'Bearbeitung verlassen',
          message: this.isEditMode 
            ? `Sie bearbeiten Bestellung #${this.editingOrderId} mit ungespeicherten Änderungen. Möchten Sie wirklich zurück gehen?`
            : `Sie haben einen Auftrag mit ${this.orderItems.length} Artikel(n) ohne Speicherung. Möchten Sie wirklich zurück gehen?`,
          isConfirmation: true,
          confirmLabel,
          cancelLabel: 'Abbrechen'
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result === true) {
          this.restoreOriginalStatus();
          this.clearAllOrderData();
          this.router.navigate(targetRoute);
        }
      });
    } else {
      this.router.navigate(targetRoute);
    }
  }

  // Navigation method
  goBack(): void {
    this.navigateWithUnsavedChanges(['/admin'], 'Zurück gehen');
  }

  goToOrderOverview(): void {
    this.navigateWithUnsavedChanges(['/order-overview'], 'Zur Übersicht wechseln');
  }

  // Hilfsfunktion um lange URLs in mehrere Zeilen aufzuteilen
  private splitUrlIntoLines(url: string, maxLineLength: number): string[] {
    if (url.length <= maxLineLength) {
      return [url];
    }

    const lines: string[] = [];
    let startIndex = 0;
    
    // URL nach fester Zeichenanzahl umbrechen
    while (startIndex < url.length) {
      const endIndex = Math.min(startIndex + maxLineLength, url.length);
      const line = url.substring(startIndex, endIndex);
      lines.push(line);
      startIndex = endIndex;
    }
    
    return lines;
  }

  // ==================== SPLIT MODE METHODS ====================

  toggleSplitMode(): void {
    if (!this.isSplitMode) {
      // Aktiviere Split-Modus
      if (this.orderItems.length === 0) {
        alert('Bitte fügen Sie zunächst Artikel zum Auftrag hinzu.');
        return;
      }
      
      // Speichere die Ausgangsmenge für jeden Artikel (für konstante Gesamtmenge)
      this.orderItems.forEach(item => {
        item.initial_quantity = Number(item.quantity);
        console.log(`💾 [SPLIT-INIT] Artikel ${item.article_text}: Ausgangsmenge = ${item.initial_quantity}`);
      });
      
      // Erstelle Kopie aller Artikel mit Menge 0 und gleicher initial_quantity
      this.orderItems2 = this.orderItems.map(item => ({
        ...item,
        quantity: 0,
        initial_quantity: item.initial_quantity
      }));
      
      this.isSplitMode = true;
      console.log('✅ [SPLIT-MODE] Split-Modus aktiviert');
    } else {
      // Deaktiviere Split-Modus
      const hasItemsInTable2 = this.orderItems2.some(item => item.quantity > 0);
      
      if (hasItemsInTable2) {
        const confirm = window.confirm('Auftrag 2 enthält Artikel. Möchten Sie den Split-Modus wirklich beenden? Alle Artikel in Auftrag 2 gehen verloren.');
        if (!confirm) {
          return;
        }
      }
      
      // Entferne initial_quantity von den Artikeln
      this.orderItems.forEach(item => {
        delete item.initial_quantity;
      });
      
      this.orderItems2 = [];
      this.isSplitMode = false;
      this.activeTable = 1;
      console.log('❌ [SPLIT-MODE] Split-Modus deaktiviert');
    }
  }

  setActiveTable(tableNumber: 1 | 2): void {
    this.activeTable = tableNumber;
    console.log(`🎯 [ACTIVE-TABLE] Tabelle ${tableNumber} ist jetzt aktiv`);
  }

  // Synchronisiere die Mengen zwischen beiden Tabellen im Split-Modus
  // Logik: Gesamtmenge bleibt konstant (initial_quantity = quantity_table1 + quantity_table2)
  syncQuantitiesInSplitMode(item: any): void {
    // WICHTIG: Finde das EXAKTE Objekt in den Arrays (nicht nach article_number suchen!)
    // Das ist wichtig für mehrere Artikel mit der gleichen article_number (z.B. mehrere PFAND-Artikel)
    const index1 = this.orderItems.indexOf(item);
    const index2 = this.orderItems2.indexOf(item);
    
    // Bestimme, aus welcher Tabelle die Änderung kam
    let sourceIndex: number;
    let isFromTable1: boolean;
    
    if (index1 !== -1) {
      // Item ist in Tabelle 1
      sourceIndex = index1;
      isFromTable1 = true;
    } else if (index2 !== -1) {
      // Item ist in Tabelle 2
      sourceIndex = index2;
      isFromTable1 = false;
    } else {
      // Item wurde nicht gefunden - sollte nicht passieren
      console.warn('⚠️ [SYNC-SPLIT] Artikel nicht in den Tabellen gefunden');
      return;
    }
    
    // Hole die entsprechenden Artikel aus beiden Tabellen (gleicher Index in beiden Arrays)
    const item1 = this.orderItems[sourceIndex];
    const item2 = this.orderItems2[sourceIndex];
    
    if (!item1 || !item2) {
      console.warn('⚠️ [SYNC-SPLIT] Korrespondierender Artikel nicht gefunden');
      return;
    }
    
    // Hole die Ausgangsmenge (initial_quantity)
    const initialQuantity = item1.initial_quantity || item2.initial_quantity || 0;
    
    // Konvertiere die aktuelle Menge zu einer Zahl (auch während der Eingabe)
    const currentQuantity = parseFloat(item.quantity) || 0;
    
    // Berechne die verbleibende Menge für die andere Tabelle
    const remainingQuantity = initialQuantity - currentQuantity;
    
    // Setze die Menge in der anderen Tabelle
    if (isFromTable1) {
      // Änderung kam aus Tabelle 1 → Berechne Auftrag 2
      this.orderItems2[sourceIndex].quantity = remainingQuantity;
      console.log(`🔄 [SYNC-SPLIT] Index ${sourceIndex}: Auftrag 1 (${currentQuantity}) → Auftrag 2 (${remainingQuantity}), Gesamt: ${initialQuantity}`);
    } else {
      // Änderung kam aus Tabelle 2 → Berechne Auftrag 1
      this.orderItems[sourceIndex].quantity = remainingQuantity;
      console.log(`🔄 [SYNC-SPLIT] Index ${sourceIndex}: Auftrag 2 (${currentQuantity}) → Auftrag 1 (${remainingQuantity}), Gesamt: ${initialQuantity}`);
    }
  }

  transferQuantityToTable2(index: number, amount: number): void {
    const item = this.orderItems[index];
    const item2 = this.orderItems2[index];
    
    if (item.quantity >= amount) {
      item.quantity -= amount;
      item2.quantity += amount;
      
      // Validiere und formatiere die Mengen (ohne weitere Synchronisation)
      this.validateAndUpdateQuantity(item, true);
      this.validateAndUpdateQuantity(item2, true);
      
      console.log(`➡️ [TRANSFER] ${amount} von "${item.article_text}" zu Auftrag 2 verschoben`);
    } else {
      alert(`Nicht genug Menge verfügbar. Verfügbar: ${item.quantity}`);
    }
  }

  transferQuantityToTable1(index: number, amount: number): void {
    const item = this.orderItems[index];
    const item2 = this.orderItems2[index];
    
    if (item2.quantity >= amount) {
      item2.quantity -= amount;
      item.quantity += amount;
      
      // Validiere und formatiere die Mengen (ohne weitere Synchronisation)
      this.validateAndUpdateQuantity(item, true);
      this.validateAndUpdateQuantity(item2, true);
      
      console.log(`⬅️ [TRANSFER] ${amount} von "${item.article_text}" zu Auftrag 1 verschoben`);
    } else {
      alert(`Nicht genug Menge verfügbar. Verfügbar: ${item2.quantity}`);
    }
  }


  removeFromOrder2(index: number): void {
    const item = this.orderItems2[index];
    this.orderItems2.splice(index, 1);
    console.log('🗑️ [REMOVE-FROM-ORDER-2] Artikel aus Auftrag 2 entfernt:', item.article_text);
  }

  getOrderTotal2(): number {
    return this.orderItems2.reduce((total, item) => {
      const price = item.different_price !== undefined && item.different_price !== null && item.different_price !== '' 
        ? item.different_price 
        : item.sale_price;
      return total + (price * item.quantity);
    }, 0);
  }

  // Hilfsmethode zum Formatieren eines Datums für Input-Felder (YYYY-MM-DD)
  private formatDateForInput(dateString: string): string {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Fehler beim Formatieren des Datums:', error);
      return '';
    }
  }

  // PDF-Generierung für Aufträge
  generateOrderPDF(): void {
    if (!this.globalService.selectedCustomerForOrders) {
      alert('Bitte wählen Sie zuerst einen Kunden aus.');
      return;
    }

    if (this.orderItems.length === 0) {
      alert('Der Auftrag ist leer. Bitte fügen Sie Artikel hinzu.');
      return;
    }

    try {
      const doc = new jsPDF();
      let pageCount = 1;
      let totalPages = 1; // Wird später berechnet

      // Moderne Farbpalette
      const colors = {
        primary: [41, 128, 185],      // Blau
        secondary: [52, 73, 94],      // Dunkelgrau
        accent: [46, 204, 113],       // Grün
        light: [236, 240, 241],       // Hellgrau
        dark: [44, 62, 80],           // Sehr dunkelgrau
        white: [255, 255, 255]        // Weiß
      };

      // Hilfsfunktion zum Zeichnen der Seitenzahl
      const drawPageNumber = (currentPage: number, totalPages: number) => {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.text(`${currentPage} von ${totalPages}`, 190, 290, { align: 'right' });
      };

      // Hinweis: Kein Rechnungsdokument
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);

      // Datum Badge (statt Bestellnummer)
      const currentDate = new Date().toLocaleDateString('de-DE');
      doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
      doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const dateText = currentDate.length > 10 ? currentDate.substring(0, 8) : currentDate;
      doc.text(dateText, 162, 12);

      // Bestellinformationen in modernen Karten (kompakter)
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      
      let yPos = 28;
      const cardHeight = 20;
      const leftCardWidth = 90;
      const rightCardWidth = 90;
      const cardSpacing = 10;

      const customer = this.globalService.selectedCustomerForOrders;
      const customerName = this.differentCompanyName || customer.last_name_company || customer.customer_number;
      const orderDateFormatted = this.orderDate || new Date().toLocaleDateString('de-DE');
      const createdAtFormatted = new Date().toLocaleTimeString('de-DE');

      // Linke Karte - Bestelldetails
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, yPos, leftCardWidth, cardHeight, 5, 5);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text('BESTELLDETAILS', 20, yPos + 6);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      doc.text('Datum: ' + orderDateFormatted, 20, yPos + 11);
      doc.text('Erstellt: ' + createdAtFormatted, 20, yPos + 16);

      // Rechte Karte - Lieferdetails
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(115, yPos, rightCardWidth, cardHeight, 5, 5);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text('LIEFERDETAILS', 120, yPos + 6);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      const deliveryDateText = this.deliveryDate || 'Nicht festgelegt';
      doc.text('Datum: ' + deliveryDateText, 120, yPos + 11);
      doc.text('Art: Lieferung', 120, yPos + 16);

      yPos += cardHeight + 10;

      // Kunde Karte mit allen Informationen
      const customerLines: string[] = [];
      
      // Kundennummer
      if (customer.customer_number) {
        customerLines.push(customer.customer_number);
      }
      
      // Firmenname/Name
      if (customerName) {
        customerLines.push(customerName);
      }
      
      // Namenszusatz (z.B. "Inh. Özlem Özmeneroglu")
      if (customer.name_addition) {
        customerLines.push(customer.name_addition);
      }
      
      // Adresse
      if (customer.street) {
        customerLines.push(customer.street);
      }
      
      // PLZ und Stadt
      if (customer.postal_code || customer.city) {
        const cityLine = `${customer.postal_code || ''} ${customer.city || ''}`.trim();
        if (cityLine) {
          customerLines.push(cityLine);
        }
      }

      // Kundenanmerkung (Anmerkung aus dem Auftrag) unter "KUNDE" anzeigen
      const customerNotes = (this.customerNotes1 || '').trim();
      if (customerNotes) {
        customerLines.push(`Anmerkung: ${customerNotes}`);
      }
      
      // Berechne die Höhe der Karte basierend auf Anzahl der Zeilen
      const lineHeight = 5;
      const padding = 10;
      const customerCardHeight = Math.max(30, customerLines.length * lineHeight + padding);
      
      // Kunde Karte nutzt volle Breite
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, yPos, leftCardWidth + rightCardWidth + cardSpacing, customerCardHeight, 5, 5);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text('KUNDE', 20, yPos + 6);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      
      let textY = yPos + 12;
      customerLines.forEach((line) => {
        if (line && line.trim()) {
          const splitLines = doc.splitTextToSize(line, 175);
          splitLines.forEach((splitLine: string) => {
            doc.text(splitLine, 20, textY);
            textY += lineHeight;
          });
        }
      });

      yPos += customerCardHeight + 10;

      // Moderne Trennlinie
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(2);
      doc.line(15, yPos, 195, yPos);

      // Moderne Artikeltabelle
      const tableStartY = yPos + 15;
      const tableWidth = 180;
      const headerHeight = 10;
      const rowHeight = 8;
      
      // Tabellenüberschrift mit modernem Design
      doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.roundedRect(15, tableStartY, tableWidth, headerHeight, 3, 3, 'F');
      
      doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      // Spaltenbreiten
      const col1 = 18;   // Pos
      const col2 = 28;   // Menge
      const col3 = 45;   // Artikel (mehr Platz)
      const col4 = 135;  // Artikelnr.
      const col5 = 160;  // Preis
      const col6 = 180;  // Gesamt
      
      // Überschriften
      doc.text('Pos', col1, tableStartY + 6);
      doc.text('Menge', col2, tableStartY + 6);
      doc.text('Artikel', col3, tableStartY + 6);
      doc.text('Artikelnr.', col4, tableStartY + 6);
      doc.text('Preis', col5, tableStartY + 6);
      doc.text('Gesamt', col6, tableStartY + 6);

      // Moderne Artikelzeilen
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      let currentY = tableStartY + headerHeight;
      const pageHeight = 297;
      const bottomMargin = 40;

      this.orderItems.forEach((item, index) => {
        // Seitenumbruch prüfen
        if (currentY + rowHeight > pageHeight - bottomMargin) {
          doc.addPage();
          pageCount++;
          currentY = 20;
          
          // Hinweis auf neuer Seite wiederholen: Kein Rechnungsdokument
          doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Kommissionierungsschein – kein Rechnungsdokument', 15, 12);
          
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text('Dieses Dokument dient ausschließlich der Kommissionierung und ersetzt keine Rechnung.', 15, 16.5);
          
          // Datum Badge
          doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
          doc.roundedRect(160, 5, 35, 10, 3, 3, 'F');
          doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(dateText, 162, 12);
          
          currentY = 25;
          
          // Tabellenüberschrift auf neuer Seite wiederholen
          doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
          doc.roundedRect(15, currentY, tableWidth, headerHeight, 3, 3, 'F');
          
          doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text('Pos', col1, currentY + 6);
          doc.text('Menge', col2, currentY + 6);
          doc.text('Artikel', col3, currentY + 6);
          doc.text('Artikelnr.', col4, currentY + 6);
          doc.text('Preis', col5, currentY + 6);
          doc.text('Gesamt', col6, currentY + 6);
          
          currentY += headerHeight;
          
          doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
        }

        // Artikelname - vollständig anzeigen, mit automatischem Zeilenumbruch falls nötig
        const productName = item.article_text || 'Unbekannter Artikel';
        const maxWidth = col4 - col3 - 2; // Verfügbarer Platz für Artikelname
        
        // Text umbrechen falls zu lang
        const splitName = doc.splitTextToSize(productName, maxWidth);
        
        // Zeilenhöhe dynamisch anpassen basierend auf Textzeilen
        const lineHeight = Math.max(rowHeight, splitName.length * 4 + 2);

        // Zebra-Streifen für bessere Lesbarkeit (mit dynamischer Höhe)
        if (index % 2 === 0) {
          doc.setFillColor(248, 249, 250);
          doc.rect(15, currentY, tableWidth, lineHeight, 'F');
        }

        // Trennlinien zwischen den Artikeln
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(15, currentY, 195, currentY);

        // Artikeldaten
        doc.text((index + 1).toString(), col1, currentY + 6); // Positionsnummer
        doc.text(String(item.quantity || 0), col2 + 3, currentY + 6); // Menge näher zu Artikel
        doc.text(splitName, col3, currentY + 6);
        
        doc.text(item.article_number || '', col4, currentY + 6);
        
        // Preis anzeigen (kundenspezifisch oder normal)
        const displayPrice = this.getItemPrice(item);
        const priceText = displayPrice.toFixed(2) + ' €';
        doc.text(priceText, col5, currentY + 6);
        
        // Gesamtpreis für diesen Artikel
        const itemTotal = displayPrice * (item.quantity || 0);
        doc.text(itemTotal.toFixed(2) + ' €', col6, currentY + 6);

        // Verwende die dynamische Zeilenhöhe
        currentY += lineHeight;
      });

      // Moderne Gesamtbetrag-Sektion
      currentY += 10;
      
      // Rahmen für Gesamtbetrag mit modernem Design
      doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5, 'F');
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(1);
      doc.roundedRect(15, currentY, tableWidth, 15, 5, 5);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
      
      // Nettobetrag berechnen
      const netPrice = this.getOrderTotal();
      
      // Bruttobetrag berechnen
      const grossPrice = this.getOrderTotalGross();
      
      // Positionierung für beide Beträge
      const leftMargin = 25;
      const rightMargin = 120;
      
      // Nettobetrag links
      doc.text('Nettobetrag: ' + netPrice.toFixed(2) + ' €', leftMargin, currentY + 10);
      
      // Bruttobetrag rechts
      doc.text('Bruttobetrag: ' + grossPrice.toFixed(2) + ' €', rightMargin, currentY + 10);
      
      currentY += 25;

      // Moderner Footer
      const footerY = pageHeight - 20;
      
      // Footer-Linie
      doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setLineWidth(1);
      doc.line(15, footerY, 195, footerY);
      
      // Footer-Text
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      
      const footerDate = new Date().toLocaleDateString('de-DE');
      const footerTime = new Date().toLocaleTimeString('de-DE');
      
      doc.text('Erstellt am ' + footerDate + ' um ' + footerTime, 15, footerY + 8);

      // Gesamtseitenzahl berechnen
      totalPages = pageCount;

      // Seitenzahl für alle Seiten hinzufügen
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawPageNumber(i, totalPages);
      }

      // Zurück zur ersten Seite
      doc.setPage(1);

      // PDF-Dokument öffnen
      doc.autoPrint();
      const pdfUrl = doc.output('bloburl');
      window.open(pdfUrl, '_blank');
      
      console.log('✅ PDF erfolgreich im neuen Tab geöffnet');
      
    } catch (error) {
      console.error('❌ Fehler bei der PDF-Generierung:', error);
      alert('Fehler bei der PDF-Generierung. Bitte versuchen Sie es erneut.');
    }
  }

  // Toggle für EK-Preis Blur-Effekt
  toggleCostPriceBlur(): void {
    this.isCostPriceBlurred = !this.isCostPriceBlurred;
    console.log(`🔍 [EK-PREIS] Blur-Effekt ${this.isCostPriceBlurred ? 'aktiviert' : 'deaktiviert'}`);
  }
}