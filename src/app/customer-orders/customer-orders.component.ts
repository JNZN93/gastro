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
import 'jspdf-autotable';
import { IndexedDBService } from '../indexeddb.service';
import { OffersService, OfferWithProducts, OfferProduct } from '../offers.service';
import { ForceActiveService } from '../force-active.service';
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
  private forceActiveSubscription: Subscription | null = null;
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
            
            // Angebote laden und anwenden (erstes Angebot verwenden)
            this.loadAndApplyFirstOffer();

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
        bestPrice = offerPrice; // Angebotspreis ist günstiger
        priceSource = 'offer_price';
        console.log(`🏷️ [PRICE-LOGIC] Angebotspreis €${offerPrice} ist günstiger als ${priceSource === 'different_price' ? 'Kundenpreis' : 'Standardpreis'} €${bestPrice}`);
      }
    }

    // WICHTIG: Setze different_price immer auf den günstigsten ermittelten Preis
    // Dadurch wird in der UI der richtige Preis angezeigt
    item.different_price = bestPrice;
    console.log(`💾 [PRICE-LOGIC] Günstigster Preis €${bestPrice} als different_price gespeichert (Quelle: ${priceSource})`);

    console.log(`✅ [PRICE-LOGIC] Finaler Preis für ${item?.article_text}: €${bestPrice} (Quelle: ${priceSource})`);
    return bestPrice;
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
    
    // Setze den Kunden basierend auf der Kundennummer oder E-Mail
    if (orderData.customer) {
      if (orderData.customer.customer_number) {
        console.log('👤 [LOAD-ORDER-DATA] Suche Kunde mit Kundennummer:', orderData.customer.customer_number);
        
        // Lade den Kunden direkt aus der API
        this.loadCustomerByNumber(orderData.customer.customer_number, orderData);
      } else if (orderData.customer.email) {
        console.log('👤 [LOAD-ORDER-DATA] Keine Kundennummer, suche Kunde mit E-Mail:', orderData.customer.email);
        
        // Lade den Kunden anhand der E-Mail
        this.loadCustomerByEmail(orderData.customer.email, orderData);
      } else {
        console.log('⚠️ [LOAD-ORDER-DATA] Weder Kundennummer noch E-Mail vorhanden');
      }
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



  // Neue Methode zum Laden eines Kunden anhand der E-Mail
  private loadCustomerByEmail(email: string, orderData: any): void {
    console.log('🔍 [LOAD-CUSTOMER-BY-EMAIL] Lade Kunde mit E-Mail:', email);
    
    const token = localStorage.getItem('token');
    
    // Versuche zuerst, den Kunden aus der bereits geladenen Kundenliste zu finden
    const foundCustomer = this.customers.find(customer => 
      customer.email && customer.email.toLowerCase() === email.toLowerCase()
    );
    
    if (foundCustomer) {
      console.log('✅ [LOAD-CUSTOMER-BY-EMAIL] Kunde in lokaler Liste gefunden:', foundCustomer);
      this.setCustomerFromOrderData(foundCustomer, orderData);
      return;
    }
    
    // Wenn nicht in lokaler Liste, lade alle Kunden und suche dann
    console.log('🔄 [LOAD-CUSTOMER-BY-EMAIL] Kunde nicht in lokaler Liste, lade alle Kunden...');
    
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
      const customer = this.customers.find(c => 
        c.email && c.email.toLowerCase() === email.toLowerCase()
      );
      
      if (customer) {
        console.log('✅ [LOAD-CUSTOMER-BY-EMAIL] Kunde gefunden:', customer);
        this.setCustomerFromOrderData(customer, orderData);
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
        this.setCustomerFromOrderData(fallbackCustomer, orderData);
      }
    })
    .catch(error => {
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
      this.setCustomerFromOrderData(fallbackCustomer, orderData);
    });
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
    this.openOrderConfirmationModal();
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
    
    // Konstanten für das Layout - DIN A4 Portrait optimiert
    // Verfügbarer Platz: A4 = 297mm hoch, Header braucht ~35mm, Footer ~20mm
    // Rest für Tabelle: ~240mm. Bei durchschnittlich 18mm pro Zeile (inkl. lange Namen)
    // 12 Artikel + Tabellen-Header = 13 Zeilen à 18mm = 234mm + Sicherheitspuffer
    const itemsPerPage = 12; // Optimiert für A4 Format mit Platz für lange Artikelnamen
    const totalPages = Math.ceil(prices.length / itemsPerPage);

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

    // Daten für die Tabelle vorbereiten (ohne Preis-Spalte)
    const tableData = prices.map((p: any) => [
      p.article_text || '-',
      p.article_number || p.product_id || '-',
      '' // Leere Menge zum Ausfüllen
    ]);

    // Füge 10 leere Zeilen am Ende hinzu für handschriftliche Einträge
    for (let i = 0; i < 10; i++) {
      tableData.push(['', '', '']); // Leere Artikel, leere Artikelnummer, leere Menge
    }

    // Excel-ähnliche Tabelle mit jsPDF-AutoTable
    import('jspdf-autotable').then(({ default: autoTable }) => {
      // Alle Seiten manuell erstellen
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          doc.addPage();
        }
        
        // Header auf jede Seite setzen
        addCustomerHeader(page + 1, totalPages);
        
        // Artikel für diese Seite
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, tableData.length);
        const pageData = tableData.slice(startIndex, endIndex);
        
        // Tabelle auf diese Seite zeichnen - WICHTIG: pageBreak deaktivieren
        // startY nach Header positioniert (Header endet bei Y=42, +8px Abstand = 50)
        autoTable(doc, {
          startY: 50,
          head: [['Artikel', 'Art.-Nr.', 'Menge']],
          body: pageData,
          theme: 'grid',
          pageBreak: 'avoid', // Verhindert automatische Seitenumbrüche
          tableWidth: 'wrap',
          styles: {
            fontSize: 11, // Größere Schrift für bessere OCR-Erkennung der Tabellendaten
            cellPadding: 5,
            lineWidth: 0.3, // Dickere Linien für bessere OCR-Erkennung
            lineColor: [100, 100, 100], // Dunkleres Grau für besseren Kontrast (OCR-optimal)
            fillColor: [255, 255, 255] // Weißer Hintergrund für alle Zeilen
          },
          headStyles: {
            fillColor: [0, 0, 0], // Schwarzer Hintergrund für maximalen Kontrast (OCR-optimal)
            textColor: [255, 255, 255], // Weißer Text für maximalen Kontrast
            fontStyle: 'bold',
            fontSize: 12 // Größere Schrift für bessere OCR-Erkennung
          },
          columnStyles: {
            0: { cellWidth: 90, halign: 'left' }, // Artikel (schmaler für mehr Platz)
            1: { cellWidth: 60, halign: 'left' }, // Art.-Nr. (breiter für mehr Platz)
            2: { cellWidth: 30, halign: 'center' } // Menge (bleibt gleich)
          },
          margin: { left: 15, right: 35 }, // Tabelle weiter links, rechter Rand größer
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

    // Bestellübersicht erstellen
    const orderSummary = this.orderItems.map(item => 
      `${item.quantity}x ${item.article_text} - €${((item.different_price !== undefined ? item.different_price : item.sale_price) * item.quantity).toFixed(2)}`
    ).join('\n');
    
    const totalPrice = this.getOrderTotal();
    const customerName = this.globalService.selectedCustomerForOrders.last_name_company;
    
    // Erweiterte Bestellübersicht mit Datumsfeldern
    let confirmMessage = `📋 Auftrag bestätigen\n\nKunde: ${customerName}\n\nArtikel:\n${orderSummary}\n\nGesamtpreis: €${totalPrice.toFixed(2)}`;
    
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
    
    confirmMessage += `\n\nMöchten Sie diesen Auftrag speichern?`;
    
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
  }

  confirmOrderSave(): void {
    if (!this.orderConfirmationData) {
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

    // Datumsfelder nur mitsenden, wenn ausgefüllt
    if (this.orderDate) {
      customerData.order_date = this.orderDate;
    }
    if (this.deliveryDate) {
      customerData.delivery_date = this.deliveryDate;
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

    console.log('🚀 [CUSTOMER-ORDERS] Bestellung wird abgesendet:');
    console.log('📋 [CUSTOMER-ORDERS] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('💰 [CUSTOMER-ORDERS] Gesamtpreis:', completeOrder.orderData.total_price);
    console.log('📦 [CUSTOMER-ORDERS] Anzahl Artikel:', completeOrder.orderItems.length);
    console.log('👤 [CUSTOMER-ORDERS] Kunde:', completeOrder.orderData.customer_name);
    console.log('🆔 [CUSTOMER-ORDERS] Kunden-ID:', completeOrder.orderData.customer_id);
    console.log('📅 [CUSTOMER-ORDERS] Bestelldatum:', completeOrder.orderData.order_date || 'Nicht gesetzt');
    console.log('🚚 [CUSTOMER-ORDERS] Lieferdatum:', completeOrder.orderData.delivery_date || 'Nicht gesetzt');
    console.log('🏢 [CUSTOMER-ORDERS] Firmenname geändert:', !!completeOrder.orderData.different_company_name);
    console.log('🔑 [CUSTOMER-ORDERS] Token vorhanden:', !!token);
    console.log('🌐 [CUSTOMER-ORDERS] Endpoint:', '${environment.apiUrl}/api/orders');
    console.log('📊 [CUSTOMER-ORDERS] Artikel-Details:', completeOrder.orderItems.map(item => ({
      artikel: item.article_text,
      menge: item.quantity,
      preis: item.different_price !== undefined ? item.different_price : item.sale_price,
      beschreibung: item.description
    })));

    console.log('💾 [SAVE-ORDER] Auftrag wird gespeichert:', completeOrder);
    
    fetch(`${environment.apiUrl}/api/orders`, {
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
      this.closeOrderConfirmationModal();
      this.clearAllOrderData();
    })
    .catch(error => {
      console.error('Fehler beim Speichern des Auftrags:', error);
      alert('Fehler beim Speichern des Auftrags: ' + error.message);
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

  // Navigation method
  goBack(): void {
    this.router.navigate(['/admin']);
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
}