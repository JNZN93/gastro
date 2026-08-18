import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OffersService, OfferWithProducts } from '../offers.service';
import { forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';
// private stateService = inject(CustomerOrderStateService); // Entferne State Service

@Component({
  selector: 'app-customer-order-public',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-order-public.component.html',
  styleUrl: './customer-order-public.component.scss'
})
export class CustomerOrderPublicComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private offersService = inject(OffersService);

  token: string = '';
  customerNumber: string = '';
  customer: any = null;
  customerArticlePrices: any[] = [];
  allProducts: any[] = []; // Neue Eigenschaft für alle Produkte
  activeOffers: OfferWithProducts[] = []; // Neue Eigenschaft für aktive Angebote
  isLoading: boolean = true;
  error: string = '';
  isSubmitting: boolean = false;
  successMessage: string = '';
  showOrderModal: boolean = false;
  showCustomArticleForm: boolean = false;
  pendingSubmit: boolean = false;
  customArticle: any = {
    article_text: '',
    tempQuantity: null,
    isCustom: true
  };

  // Gruppierung nach Kategorien
  groupedArticles: { [category: string]: any[] } = {};
  orderedCategories: string[] = [];
  
  // Neue Eigenschaft für den Zustand der Kategorien (aufgeklappt/zugeklappt)
  categoryStates: { [category: string]: boolean } = {};
  
  // Suchfunktion
  searchTerm: string = '';
  filteredGroupedArticles: { [category: string]: any[] } = {};
  filteredOrderedCategories: string[] = [];

  // localStorage Key für diesen Kunden
  private get localStorageKey(): string {
    return `customer_order_${this.customerNumber}`;
  }

  /** Stabiler Warenkorb-Key: Custom-Artikel über product_id, sonst product_id/article_number */
  private getCartItemKey(article: any): string {
    if (!article) return '';
    const productId = article.product_id != null ? String(article.product_id) : '';
    const isCustom =
      !!article.isCustom ||
      productId.startsWith('custom_') ||
      article.article_number === 'Eigener Artikel';

    if (isCustom && productId) {
      return productId;
    }

    return String(article.product_id || article.article_number || '');
  }

  /** Behält pro Artikelnummer nur den neuesten Kundenpreis (invoice_date). */
  private dedupeCustomerArticlePrices(prices: any[]): any[] {
    if (!Array.isArray(prices) || prices.length === 0) return [];

    const latestByKey = new Map<string, any>();
    for (const price of prices) {
      const productKey = String(price?.product_id || price?.article_number || '').trim().toLowerCase();
      const key = productKey || `id:${price?.id}`;
      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, price);
        continue;
      }

      const existingDate = existing.invoice_date ? new Date(existing.invoice_date).getTime() : 0;
      const nextDate = price.invoice_date ? new Date(price.invoice_date).getTime() : 0;
      if (nextDate > existingDate || (nextDate === existingDate && (price.id || 0) > (existing.id || 0))) {
        latestByKey.set(key, price);
      }
    }
    return Array.from(latestByKey.values());
  }

  trackByArticleId(index: number, article: any): string {
    return String(article?.id ?? article?.product_id ?? index);
  }

  /** Findet Produkt in der Katalogliste unabhängig von number/string Typunterschieden */
  private findMatchingCatalogProduct(article: any): any | undefined {
    if (!article || !this.allProducts?.length) return undefined;
    const productId = article.product_id != null ? String(article.product_id) : '';
    const articleNumber = article.article_number != null ? String(article.article_number) : '';

    return this.allProducts.find((product: any) => {
      const pArticle = product.article_number != null ? String(product.article_number) : '';
      const pId = product.id != null ? String(product.id) : '';
      const pProductId = product.product_id != null ? String(product.product_id) : '';
      return (
        (productId && (pArticle === productId || pId === productId || pProductId === productId)) ||
        (articleNumber && (pArticle === articleNumber || pId === articleNumber || pProductId === articleNumber))
      );
    });
  }

  /** Bei neuem QR-Token denselben Kunden-Warenkorb behalten und Token aktualisieren */
  private migrateCartTokenIfNeeded(): void {
    if (!this.customerNumber || !this.token) return;

    try {
      const storedRaw = localStorage.getItem(this.localStorageKey);
      if (!storedRaw) return;

      const stored = JSON.parse(storedRaw);
      if (!stored || typeof stored !== 'object') return;

      if (
        String(stored.customerNumber) === String(this.customerNumber) &&
        stored.token !== this.token
      ) {
        stored.token = this.token;
        stored.timestamp = new Date().toISOString();
        localStorage.setItem(this.localStorageKey, JSON.stringify(stored));
        console.log('🔄 [PUBLIC-ORDER] Warenkorb-Token für neuen QR aktualisiert');
      }
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler bei Token-Migration:', error);
    }
  }

  // Methode zum Umschalten des Zustands einer Kategorie
  toggleCategory(category: string): void {
    this.categoryStates[category] = !this.categoryStates[category];
  }

  // Zählt die Anzahl der Artikel mit Menge > 0 in einer Kategorie
  getArticlesWithQuantityCount(category: string): number {
    const articles = this.getFilteredArticlesForCategory(category);
    return articles.filter(article => article.tempQuantity && article.tempQuantity > 0).length;
  }
  
  // Gibt die gefilterten Artikel für eine Kategorie zurück
  getFilteredArticlesForCategory(category: string): any[] {
    if (this.searchTerm.trim()) {
      return this.filteredGroupedArticles[category] || [];
    }
    return this.groupedArticles[category] || [];
  }
  
  // Gibt die gefilterten Kategorien zurück
  getFilteredCategories(): string[] {
    if (this.searchTerm.trim()) {
      return this.filteredOrderedCategories;
    }
    return this.orderedCategories;
  }
  
  // Suchfunktion (basierend auf customer-orders Komponente)
  onSearchChange(): void {
    const trimmedTerm = this.searchTerm.trim();
    
    if (!trimmedTerm) {
      // Wenn Suchfeld leer ist, alle Kategorien schließen
      this.orderedCategories.forEach(category => {
        this.categoryStates[category] = false;
      });
      this.filteredGroupedArticles = {};
      this.filteredOrderedCategories = [];
      return;
    }
    
    // Mindestlänge prüfen (außer bei EAN)
    const isEanSearch = /^\d{8}$|^\d{13}$/.test(trimmedTerm);
    if (!isEanSearch && trimmedTerm.length < 3) {
      this.filteredGroupedArticles = {};
      this.filteredOrderedCategories = [];
      return;
    }
    
    // Filtere Artikel basierend auf Suchbegriff (wie in customer-orders)
    const filteredGroups: { [key: string]: any[] } = {};
    
    for (const category of this.orderedCategories) {
      const articles = this.groupedArticles[category] || [];
      
      let filteredArticles: any[] = [];
      
      if (isEanSearch) {
        // EAN-Suche: Exakte Übereinstimmung
        filteredArticles = articles.filter(article => {
          const ean = (article.ean || '').toLowerCase();
          return ean === trimmedTerm.toLowerCase();
        });
      } else {
        // Normale Text-Suche: Teile Suchbegriff in Wörter auf
        const terms = trimmedTerm.toLowerCase().split(/\s+/);
        
        filteredArticles = articles.filter((article) => {
          const articleText = (article.article_text || '').toLowerCase();
          const articleNumber = (article.article_number || article.product_id || '').toString().toLowerCase();
          const ean = (article.ean || '').toLowerCase();
          
          // Jedes Wort muss in mindestens einem Feld enthalten sein
          return terms.every((term) =>
            articleText.includes(term) ||
            articleNumber.includes(term) ||
            ean.includes(term)
          );
        });
        
        // Intelligente Sortierung (wie in customer-orders)
        filteredArticles = filteredArticles.sort((a, b) => {
          const searchTermLower = trimmedTerm.toLowerCase();
          
          // Exakte Matches
          const aArticleNumberExact = (a.article_number || a.product_id || '').toString().toLowerCase() === searchTermLower;
          const bArticleNumberExact = (b.article_number || b.product_id || '').toString().toLowerCase() === searchTermLower;
          const aArticleTextExact = (a.article_text || '').toLowerCase() === searchTermLower;
          const bArticleTextExact = (b.article_text || '').toLowerCase() === searchTermLower;
          const aEanExact = (a.ean || '').toLowerCase() === searchTermLower;
          const bEanExact = (b.ean || '').toLowerCase() === searchTermLower;
          
          // Starts-with Matches
          const aArticleNumberStartsWith = (a.article_number || a.product_id || '').toString().toLowerCase().startsWith(searchTermLower);
          const bArticleNumberStartsWith = (b.article_number || b.product_id || '').toString().toLowerCase().startsWith(searchTermLower);
          const aArticleTextStartsWith = (a.article_text || '').toLowerCase().startsWith(searchTermLower);
          const bArticleTextStartsWith = (b.article_text || '').toLowerCase().startsWith(searchTermLower);
          const aEanStartsWith = (a.ean || '').toLowerCase().startsWith(searchTermLower);
          const bEanStartsWith = (b.ean || '').toLowerCase().startsWith(searchTermLower);
          
          // Exakte Matches zuerst
          if (aArticleNumberExact && !bArticleNumberExact) return -1;
          if (!aArticleNumberExact && bArticleNumberExact) return 1;
          if (aArticleTextExact && !bArticleTextExact) return -1;
          if (!aArticleTextExact && bArticleTextExact) return 1;
          if (aEanExact && !bEanExact) return -1;
          if (!aEanExact && bEanExact) return 1;
          
          // Starts-with Matches
          if (aArticleNumberStartsWith && !bArticleNumberStartsWith) return -1;
          if (!aArticleNumberStartsWith && bArticleNumberStartsWith) return 1;
          if (aArticleTextStartsWith && !bArticleTextStartsWith) return -1;
          if (!aArticleTextStartsWith && bArticleTextStartsWith) return 1;
          if (aEanStartsWith && !bEanStartsWith) return -1;
          if (!aEanStartsWith && bEanStartsWith) return 1;
          
          // Alphabetische Sortierung
          return (a.article_text || '').localeCompare(b.article_text || '');
        });
      }
      
      if (filteredArticles.length > 0) {
        filteredGroups[category] = filteredArticles;
      }
    }
    
    this.filteredGroupedArticles = filteredGroups;
    this.filteredOrderedCategories = Object.keys(filteredGroups);
    
    // Öffne alle gefilterten Kategorien automatisch
    this.filteredOrderedCategories.forEach(category => {
      this.categoryStates[category] = true;
    });
    
    console.log('🔍 [SEARCH] Suche nach:', trimmedTerm);
    console.log('🔍 [SEARCH] EAN-Suche:', isEanSearch);
    console.log('🔍 [SEARCH] Gefundene Kategorien:', this.filteredOrderedCategories);
    console.log('🔍 [SEARCH] Gefundene Artikel:', Object.values(filteredGroups).flat().length);
  }
  
  // Suchfeld leeren
  clearSearch(): void {
    this.searchTerm = '';
    this.onSearchChange();
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.token = params['token'];
      console.log('🔍 [PUBLIC-ORDER] Token aus URL extrahiert:', this.token);
      
      // Zeige Token in der Konsole für Debugging
      if (this.token) {
        console.log('🔍 [PUBLIC-ORDER] Token Länge:', this.token.length);
        console.log('🔍 [PUBLIC-ORDER] Token (erste 20 Zeichen):', this.token.substring(0, 20) + '...');
        console.log('🔍 [PUBLIC-ORDER] Vollständige URL:', window.location.href);
        console.log('🔍 [PUBLIC-ORDER] URL Parameter:', params);
      } else {
        console.error('❌ [PUBLIC-ORDER] Kein Token in der URL gefunden');
        console.error('❌ [PUBLIC-ORDER] Alle URL Parameter:', params);
      }
      
      // Prüfe localStorage für gespeicherte Bestellung
      const localStorageData = this.getLocalStorageData();
      if (localStorageData && localStorageData.token === this.token) {
        console.log('🔄 [PUBLIC-ORDER] Gespeicherte Bestellung aus localStorage gefunden');
        this.restoreFromLocalStorage(localStorageData);
      } else {
        this.decodeTokenAndLoadData();
      }
    });

    // Prüfen, ob von der Review-Seite mit Submit-Flag zurück navigiert wurde
    const state = history.state || {};
    if (state.submitNow) {
      this.pendingSubmit = true;
    }
  }

  // Neue Methode zum Abrufen der localStorage-Daten
  private getLocalStorageData(): any {
    if (!this.token) return null;
    
    try {
      // Verwende nur noch den einen Key: customer_order_<customer_number>
      const customerNumber = this.extractCustomerNumberFromToken();
      if (customerNumber) {
        const storageKey = `customer_order_${customerNumber}`;
        const storedData = localStorage.getItem(storageKey);
        
        if (storedData) {
          const orderData = JSON.parse(storedData);
          // Prüfe ob der Token übereinstimmt
          if (orderData.token === this.token) {
            console.log('📱 [PUBLIC-ORDER] Passende Bestellung in localStorage gefunden:', orderData);
            return orderData;
          }
        }
      }
      
      console.log('📱 [PUBLIC-ORDER] Keine passende Bestellung in localStorage gefunden');
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Laden aus localStorage:', error);
    }
    return null;
  }

  // Neue Methode: Extrahiere Kundennummer aus dem Token
  private extractCustomerNumberFromToken(): string | null {
    try {
      // Prüfe alle localStorage-Einträge nach einem passenden Token
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('customer_order_')) {
          try {
            const storedData = localStorage.getItem(key);
            if (storedData) {
              const orderData = JSON.parse(storedData);
              if (orderData.token === this.token) {
                // Token gefunden, gib die Kundennummer zurück
                return orderData.customerNumber;
              }
            }
          } catch (error) {
            // Ignoriere ungültige localStorage-Einträge
            continue;
          }
        }
      }
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Extrahieren der Kundennummer aus Token:', error);
    }
    return null;
  }

  // Neue Methode zum Wiederherstellen aus localStorage
  private restoreFromLocalStorage(localStorageData: any) {
    console.log('🔄 [PUBLIC-ORDER] Stelle Bestellung aus localStorage wieder her:', localStorageData);
    
    // Setze die Kundennummer
    this.customerNumber = localStorageData.customerNumber;
    
    // Lade die Kundendaten von der API
    // Die Mengen werden nach dem Laden der Produkte in filterArticlesByProducts() wiederhergestellt
    this.loadCustomerData();
  }

  // localStorage Methoden (kompakte Speicherung und inkrementelle Updates)
  private saveToLocalStorage(): void {
    if (!this.customerNumber || !this.token) return;

    try {
      // Bestehenden Speicher lesen (Kompatibilität mit Altformat)
      const storedRaw = localStorage.getItem(this.localStorageKey);
      let stored: any = storedRaw ? JSON.parse(storedRaw) : {};
      if (!stored || typeof stored !== 'object') stored = {};
      if (!stored.items || typeof stored.items !== 'object') stored.items = {};

      // Metadaten setzen/aktualisieren
      stored.customerNumber = this.customerNumber;
      stored.token = this.token;

      // Alte kollidierende Custom-Keys bereinigen (früher alle unter "Eigener Artikel")
      if (stored.items['Eigener Artikel']) {
        delete stored.items['Eigener Artikel'];
      }

      // Pro Artikel nur notwendige Felder speichern.
      // Bei Duplikaten mit gleicher product_id darf eine leere Menge den Warenkorb
      // des anderen Eintrags nicht mehr überschreiben/löschen.
      const qtyByKey = new Map<string, { article: any; quantity: number }>();
      for (const article of this.customerArticlePrices) {
        const key = this.getCartItemKey(article);
        if (!key) continue;

        const rawQty = article.tempQuantity;
        const quantity = Number(rawQty);
        const hasQuantity =
          rawQty !== null &&
          rawQty !== undefined &&
          rawQty !== '' &&
          !isNaN(quantity) &&
          quantity > 0;

        if (!hasQuantity) continue;

        const existing = qtyByKey.get(key);
        if (!existing || quantity >= existing.quantity) {
          qtyByKey.set(key, { article, quantity });
        }
      }

      for (const article of this.customerArticlePrices) {
        const key = this.getCartItemKey(article);
        if (key && !qtyByKey.has(key) && stored.items[key]) {
          delete stored.items[key];
        }
      }

      for (const [key, { article, quantity }] of qtyByKey) {
        stored.items[key] = {
          // Identifikation
          product_id: article.product_id,
          article_number: article.article_number,
          // Anzeige-/Logik-Felder (nur nötigste)
          article_text: article.article_text,
          unit_price_net: Number(article.unit_price_net) || 0,
          sale_price: article.sale_price || article.unit_price, // WICHTIG: sale_price auch speichern
          main_image_url: article.main_image_url,
          product_custom_field_1: article.product_custom_field_1,
          product_database_id: article.product_database_id,
          isCustom: !!article.isCustom,
          // Angebots-spezifische Felder
          isOfferProduct: !!article.isOfferProduct,
          offerId: article.offerId,
          // Menge
          tempQuantity: quantity
        };
      }

      stored.timestamp = new Date().toISOString();

      localStorage.setItem(this.localStorageKey, JSON.stringify(stored));
      console.log('💾 [PUBLIC-ORDER] Kompakte Bestellung gespeichert:', stored);
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Speichern in localStorage:', error);
    }
  }

  private loadFromLocalStorage(): void {
    if (!this.customerNumber) return;
    
    try {
      const storedData = localStorage.getItem(this.localStorageKey);
      if (storedData) {
        const orderData = JSON.parse(storedData);
        
        // Prüfe ob der gespeicherte Daten für den aktuellen Kunden sind
        if (orderData.customerNumber === this.customerNumber) {
          console.log('📱 [PUBLIC-ORDER] Gespeicherte Bestellung aus localStorage geladen:', orderData);
          
          // Unterstütze Altformat (articles: []) und neues Format (items: {})
          const storedEntries: any[] = Array.isArray(orderData.articles)
            ? orderData.articles
            : orderData.items && typeof orderData.items === 'object'
              ? Object.values(orderData.items)
              : [];

          // Stelle die Mengen für alle Artikel wieder her
          storedEntries.forEach((storedArticle: any) => {
            // Suche nach dem Artikel basierend auf verschiedenen Feldern (string-sicher)
            let article = this.customerArticlePrices.find(
              a => String(a.product_id) === String(storedArticle.product_id)
            );
            
            // Fallback: Suche nach article_number (nicht für Custom-Artikel – alle teilen denselben Label-Wert)
            if (
              !article &&
              storedArticle.article_number &&
              storedArticle.article_number !== 'Eigener Artikel' &&
              !storedArticle.isCustom
            ) {
              article = this.customerArticlePrices.find(
                a => String(a.article_number) === String(storedArticle.article_number)
              );
            }
            
            // Fallback: Suche nach article_text
            if (!article && storedArticle.article_text && !storedArticle.isCustom) {
              article = this.customerArticlePrices.find(a => a.article_text === storedArticle.article_text);
            }
            
            // Fallback: Angebotsprodukte – nur exakter Produkt-Match, kein „erstes Angebot“
            if (!article && storedArticle.isOfferProduct) {
              article = this.customerArticlePrices.find(a =>
                a.isOfferProduct &&
                a.offerId === storedArticle.offerId &&
                (String(a.product_id) === String(storedArticle.product_id) ||
                  String(a.article_number) === String(storedArticle.article_number))
              );
            }
            
            if (article) {
              // Verwende tempQuantity aus dem localStorage, falls vorhanden
              if (storedArticle.tempQuantity !== undefined && storedArticle.tempQuantity !== null) {
                article.tempQuantity = storedArticle.tempQuantity;
                console.log(`🔄 [PUBLIC-ORDER] Menge wiederhergestellt für ${article.article_text}: ${storedArticle.tempQuantity}`);
              }
              
              article.isCustom = storedArticle.isCustom || false;
              
              // Stelle auch product_custom_field_1 wieder her (falls vorhanden)
              if (storedArticle.product_custom_field_1) {
                article.product_custom_field_1 = storedArticle.product_custom_field_1;
                console.log(`🔄 [PUBLIC-ORDER] PFAND-Referenz wiederhergestellt für ${article.article_text}: ${storedArticle.product_custom_field_1}`);
              }
            } else {
              // Falls Custom-Artikel: neu hinzufügen
              if (storedArticle?.isCustom && (storedArticle.tempQuantity || 0) > 0) {
                const newCustomArticle = {
                  product_id: storedArticle.product_id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  article_text: storedArticle.article_text || 'Eigener Artikel',
                  article_number: 'Eigener Artikel',
                  unit_price_net: Number(storedArticle.unit_price_net) || 0,
                  tempQuantity: storedArticle.tempQuantity,
                  isCustom: true,
                  invoice_date: null,
                  product_database_id: 571,
                  category: 'Eigene Artikel',
                  product_category: 'Eigene Artikel',
                  main_image_url: storedArticle.main_image_url
                };
                this.customerArticlePrices.push(newCustomArticle);
                console.log(`🔄 [PUBLIC-ORDER] Custom-Artikel rekonstruiert: ${newCustomArticle.article_text}`);
              } else {
                console.log(`⚠️ [PUBLIC-ORDER] Artikel nicht gefunden für localStorage-Daten:`, storedArticle);
              }
            }
          });
          
          // Custom-Artikel wurden oben bereits rekonstruiert, falls nötig
          
          // Gruppen neu aufbauen nach der Wiederherstellung
          this.buildGroups();
        }
      }
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Laden aus localStorage:', error);
    }
  }

  private clearLocalStorage(): void {
    if (!this.customerNumber || !this.token) return;
    
    try {
      // Lösche nur den einen Key: customer_order_<customer_number>
      localStorage.removeItem(this.localStorageKey);
      console.log('🗑️ [PUBLIC-ORDER] localStorage für Kunde geleert:', this.customerNumber);
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Leeren des localStorage:', error);
    }
  }

  // Token dekodieren und Kundendaten laden
  private decodeTokenAndLoadData() {
    if (!this.token) {
      console.error('❌ [PUBLIC-ORDER] Kein Token in der URL gefunden');
      this.error = 'Kein Token in der URL gefunden. Bitte überprüfen Sie den QR-Code.';
      this.isLoading = false;
      return;
    }
    
          console.log('🔍 [PUBLIC-ORDER] Starte Token-Dekodierung...');
      console.log('🔍 [PUBLIC-ORDER] Aktuelle URL:', window.location.href);
      console.log('🔍 [PUBLIC-ORDER] Token aus URL:', this.token);
      
      console.log('🔍 [PUBLIC-ORDER] Sende Token an API:', this.token);
      console.log('🔍 [PUBLIC-ORDER] API URL:', `${environment.apiUrl}/api/auth/decode-customer-token`);
      console.log('🔍 [PUBLIC-ORDER] Request Body:', { token: this.token });

    this.http.post(`${environment.apiUrl}/api/auth/decode-customer-token`, {
      token: this.token
    }).subscribe({
      next: (response: any) => {
        console.log('🔍 [PUBLIC-ORDER] Token erfolgreich dekodiert:', response);
        
        if (response && response.customerNumber) {
          this.customerNumber = response.customerNumber;
          console.log('🔍 [PUBLIC-ORDER] Kundennummer aus Token extrahiert:', this.customerNumber);
          console.log('🔍 [PUBLIC-ORDER] Response vollständig:', response);
          console.log('🔍 [PUBLIC-ORDER] Token erfolgreich dekodiert für Kundennummer:', this.customerNumber);
          console.log('🔍 [PUBLIC-ORDER] Starte Laden der Kundendaten...');
          console.log('🔍 [PUBLIC-ORDER] Token war gültig und wurde erfolgreich verarbeitet');

          // Warenkorb behalten, wenn QR neu generiert wurde (neues Token, gleicher Kunde)
          this.migrateCartTokenIfNeeded();
          
          // Nach der Token-Dekodierung die Kundendaten laden
          this.loadCustomerData();
        } else {
          console.error('❌ [PUBLIC-ORDER] Keine Kundennummer im Token gefunden');
          console.error('❌ [PUBLIC-ORDER] Response:', response);
          console.error('❌ [PUBLIC-ORDER] Response Typ:', typeof response);
          console.error('❌ [PUBLIC-ORDER] Response Keys:', response ? Object.keys(response) : 'keine');
          console.error('❌ [PUBLIC-ORDER] Token war ungültig oder fehlerhaft');
          this.error = 'Ungültiger Token. Kundennummer konnte nicht ermittelt werden.';
          this.isLoading = false;
        }
      },
              error: (error: any) => {
          console.error('❌ [PUBLIC-ORDER] Fehler beim Dekodieren des Tokens:', error);
          console.error('❌ [PUBLIC-ORDER] Fehler Status:', error?.status);
          console.error('❌ [PUBLIC-ORDER] Fehler Message:', error?.message);
          console.error('❌ [PUBLIC-ORDER] Fehler Details:', error);
          
          if (error?.status === 400) {
            this.error = 'Ungültiger Token. Bitte überprüfen Sie den QR-Code.';
          } else if (error?.status === 500) {
            this.error = 'Server-Fehler beim Verarbeiten des Tokens. Bitte versuchen Sie es später erneut.';
          } else {
            this.error = `Fehler beim Verarbeiten des Tokens: ${error?.message || 'Unbekannter Fehler'}`;
          }
          
          this.isLoading = false;
        }
    });
  }

  // Neue Methode zum Laden aller Produkte
  loadAllProducts() {
    console.log('🔍 [PUBLIC-ORDER] Lade alle Produkte von api/products...');

    return this.http.get(`${environment.apiUrl}/api/products`);
  }

  // Neue Methode zum Laden aktiver Angebote
  loadActiveOffers() {
    console.log('🔍 [PUBLIC-ORDER] Lade aktive Angebote...');
    
    // Verwende den Endpunkt für aktive Angebote mit Produkten
    return this.offersService.getAllOffersWithProducts();
  }

  // Neue Methode: Lade alle Produkte und Angebote parallel und warte auf beide
  private loadAllProductsAndOffers() {
    console.log('🔍 [PUBLIC-ORDER] Starte paralleles Laden von Produkten und Angeboten...');
    
    forkJoin({
      products: this.loadAllProducts(),
      offers: this.loadActiveOffers()
    }).subscribe({
      next: (result: any) => {
        console.log('🔍 [PUBLIC-ORDER] Alle Daten erfolgreich geladen');

        // Logge die Rohdaten vom Offers-Endpunkt
        if (result.offers && result.offers.data) {
          console.log('🔍 [PUBLIC-ORDER] ROHDATEN vom Offers-Endpunkt:', {
            total: result.offers.total,
            dataLength: result.offers.data.length,
            offers: result.offers.data.map((offer: any) => ({
              id: offer.id,
              name: offer.name,
              is_active: offer.is_active,
              start_date: offer.start_date,
              end_date: offer.end_date,
              products_count: offer.products?.length || 0,
              discount_percentage: offer.discount_percentage,
              discount_amount: offer.discount_amount,
              offer_type: offer.offer_type,
              products: offer.products?.map((p: any) => ({
                id: p.id,
                article_text: p.article_text,
                article_number: p.article_number,
                product_id: p.product_id,
                product_database_id: p.product_database_id,
                offer_price: p.offer_price,
                use_offer_price: p.use_offer_price
              })) || []
            }))
          });
        }
        
        // Produkte verarbeiten
        if (result.products) {
          this.allProducts = result.products;
          console.log('🔍 [PUBLIC-ORDER] Alle Produkte geladen:', this.allProducts.length);
        } else {
          this.allProducts = [];
          console.log('🔍 [PUBLIC-ORDER] Keine Produkte geladen, verwende leeres Array');
        }
        
        // Angebote verarbeiten
        if (result.offers && result.offers.data) {
          console.log('🔍 [PUBLIC-ORDER] Alle Angebote von API erhalten:', result.offers.data.length);
          console.log('🔍 [PUBLIC-ORDER] Übersicht aller Angebote mit Produktanzahlen:', result.offers.data.map((offer: OfferWithProducts) => ({
            name: offer.name,
            productsCount: offer.products?.length || 0,
            is_active: offer.is_active
          })));

          console.log('🔍 [PUBLIC-ORDER] Alle Angebote Details:', result.offers.data.map((offer: OfferWithProducts) => ({
            name: offer.name,
            is_active: offer.is_active,
            start_date: offer.start_date,
            end_date: offer.end_date,
            startDateObj: new Date(offer.start_date),
            endDateObj: new Date(offer.end_date),
            now: new Date(),
            isActive: offer.is_active && new Date(offer.start_date) <= new Date() && new Date(offer.end_date) >= new Date()
          })));

          this.activeOffers = result.offers.data.filter((offer: OfferWithProducts) => {
            const isActive = offer.is_active &&
              new Date(offer.start_date) <= new Date() &&
              new Date(offer.end_date) >= new Date();

            if (!isActive) {
              console.log('🔍 [PUBLIC-ORDER] Angebot gefiltert:', offer.name, {
                is_active: offer.is_active,
                start_date: offer.start_date,
                end_date: offer.end_date,
                startValid: new Date(offer.start_date) <= new Date(),
                endValid: new Date(offer.end_date) >= new Date()
              });
            }

            return isActive;
          });

          console.log('🔍 [PUBLIC-ORDER] Aktive Angebote gefiltert:', this.activeOffers.length);
          console.log('🔍 [PUBLIC-ORDER] Aktive Angebote Namen:', this.activeOffers.map(offer => offer.name));
          console.log('🔍 [PUBLIC-ORDER] Aktive Angebote mit Produktzahlen:', this.activeOffers.map(offer => ({
            name: offer.name,
            productsCount: offer.products?.length || 0
          })));
        } else {
          this.activeOffers = [];
          console.log('🔍 [PUBLIC-ORDER] Keine Angebote geladen, verwende leeres Array');
        }
        
        // Jetzt alle Daten verarbeiten (Produkte filtern, Angebote hinzufügen, gruppieren)
        this.processAllData();
      },
      error: (error: any) => {
        console.error('❌ [PUBLIC-ORDER] Fehler beim parallelen Laden der Daten:', error);
        
        // Bei Fehler trotzdem mit leeren Arrays fortfahren
        this.allProducts = [];
        this.activeOffers = [];
        
        // Trotzdem verarbeiten
        this.processAllData();
      }
    });
  }

  // Neue Methode: Verarbeite alle geladenen Daten
  private processAllData() {
    console.log('🔍 [PUBLIC-ORDER] Starte finale Datenverarbeitung...');
    
    // Artikel mit Produktdaten anreichern und filtern
    this.filterArticlesByProducts();
    
    // Artikel mit Angebotspreisen aktualisieren
    this.updateArticlesWithOffers();
    
    // Gruppen neu aufbauen
    this.buildGroups();
    
    // Gespeicherte Bestellung aus localStorage wiederherstellen
    this.loadFromLocalStorage();
    
    // Loading beenden
    this.isLoading = false;
    
    // Pending Submit prüfen
    this.triggerPendingSubmitIfReady();
  }

  // Neue Methode zum Aktualisieren der Artikel mit Angebotspreisen
  updateArticlesWithOffers() {
    if (this.activeOffers.length === 0) {
      console.log('🔍 [PUBLIC-ORDER] Keine aktiven Angebote gefunden');
      return;
    }

    console.log('🔍 [PUBLIC-ORDER] Aktualisiere Artikel mit Angebotspreisen...');
    console.log('🔍 [PUBLIC-ORDER] Anzahl aktiver Angebote für Verarbeitung:', this.activeOffers.length);

    const totalExpectedOfferProducts = this.activeOffers.reduce((sum, offer) => sum + (offer.products?.length || 0), 0);
    console.log('🔍 [PUBLIC-ORDER] Erwartete Gesamtanzahl Offer Products:', totalExpectedOfferProducts);

    let totalOfferProductsAdded = 0;

    // Durchlaufe alle aktiven Angebote
    this.activeOffers.forEach(offer => {
      console.log(`🔍 [PUBLIC-ORDER] Verarbeite Angebot "${offer.name}" mit ${offer.products?.length || 0} Produkten`);

      if (offer.products && offer.products.length > 0) {
        offer.products.forEach((offerProduct, index) => {
          console.log(`🔍 [PUBLIC-ORDER] Offer Product ${index + 1}:`, {
            article_text: offerProduct.article_text,
            article_number: offerProduct.article_number,
            product_id: offerProduct.product_id,
            product_database_id: offerProduct.product_database_id,
            offer_price: offerProduct.offer_price,
            use_offer_price: offerProduct.use_offer_price,
            sale_price: offerProduct.sale_price,
            min_quantity: offerProduct.min_quantity,
            max_quantity: offerProduct.max_quantity,
            main_image_url: offerProduct.main_image_url,
            ean: offerProduct.ean,
            unit: offerProduct.unit,
            article_notes: offerProduct.article_notes,
            article_type: offerProduct.article_type,
            custom_field_1: offerProduct.custom_field_1,
            db_index: offerProduct.db_index
          });
          // Finde den entsprechenden Artikel in customerArticlePrices
          const articleIndex = this.customerArticlePrices.findIndex(article =>
            article.article_number === offerProduct.article_number ||
            article.product_id === offerProduct.product_id ||
            article.product_database_id === offerProduct.product_database_id
          );

          console.log(`🔍 [PUBLIC-ORDER] Suche nach Artikel für Offer Product:`, {
            offerProduct_article_number: offerProduct.article_number,
            offerProduct_product_id: offerProduct.product_id,
            offerProduct_product_database_id: offerProduct.product_database_id,
            articleFound: articleIndex !== -1,
            articleIndex: articleIndex
          });
          
          if (articleIndex !== -1) {
            const article = this.customerArticlePrices[articleIndex];

            // Füge Angebotsinformationen hinzu - Produkt bleibt in seiner ursprünglichen Kategorie!
            article.hasOffer = true;
            article.isOfferProduct = true; // Markiere als Offer Product
            article.offerName = offer.name;
            article.offerDescription = offer.description;
            article.offerType = offer.offer_type;

            if (offerProduct.use_offer_price && offerProduct.offer_price) {
              article.offerPrice = Number(offerProduct.offer_price);
              article.originalPrice = article.sale_price || article.unit_price_net;
            } else if (offer.discount_percentage) {
              article.offerDiscountPercentage = offer.discount_percentage;
              article.originalPrice = article.sale_price || article.unit_price_net;
              article.offerPrice = article.originalPrice * (1 - offer.discount_percentage / 100);
            } else if (offer.discount_amount) {
              article.offerDiscountAmount = offer.discount_amount;
              article.originalPrice = article.sale_price || article.unit_price_net;
              article.offerPrice = Math.max(0, article.originalPrice - offer.discount_amount);
            }

            // Angebotsbeschränkungen
            if (offerProduct.min_quantity) {
              article.offerMinQuantity = offerProduct.min_quantity;
            }
            if (offerProduct.max_quantity) {
              article.offerMaxQuantity = offerProduct.max_quantity;
            }

            console.log(`🔍 [PUBLIC-ORDER] ✅ BESTEHENDER ARTIKEL mit Angebot angereichert: ${article.article_text} (${article.category})`);
            console.log(`🔍 [PUBLIC-ORDER] Angebot für Artikel ${article.article_text}: ${offer.name}`);
          } else {
            // Artikel nicht in customerArticlePrices gefunden - als neues Angebotsprodukt hinzufügen
            console.log(`🔍 [PUBLIC-ORDER] ❌ KEIN ARTIKEL GEFUNDEN - Füge neues Angebotsprodukt hinzu:`, {
              offerProduct: offerProduct.article_text,
              article_number: offerProduct.article_number,
              product_id: offerProduct.product_id,
              product_database_id: offerProduct.product_database_id,
              reason: 'Artikel nicht in customerArticlePrices gefunden'
            });
            
            const newOfferArticle = {
              // Basis-Artikel-Informationen
              article_text: offerProduct.article_text || 'Angebotsprodukt',
              article_number: offerProduct.article_number || offerProduct.product_id?.toString(),
              product_id: offerProduct.product_id,
              product_database_id: offerProduct.product_database_id,
              unit_price_net: offerProduct.offer_price || 0,
              sale_price: offerProduct.offer_price || 0,
              cost_price: 0,
              category: 'Aktuelle Angebote',
              product_category: 'Aktuelle Angebote', // Beide Kategorie-Felder setzen
              main_image_url: offerProduct.main_image_url,
              ean: offerProduct.ean,
              unit: offerProduct.unit,
              article_notes: offerProduct.article_notes,
              article_type: offerProduct.article_type,
              custom_field_1: offerProduct.custom_field_1,
              db_index: offerProduct.db_index,
              gross_price: 0,
              sale_price_2: 0,
              sale_price_3: 0,
              sale_price_quantity_2: 0,
              sale_price_quantity_3: 0,
              tax_code: 0,
              is_active: true,
              customer_id: this.customerNumber,
              invoice_date: null,
              last_order_date: null,
              total_quantity: 0,
              total_amount: 0,
              average_price: 0,
              product_custom_field_1: offerProduct.custom_field_1,
              
              // Angebots-spezifische Felder
              tempQuantity: null,
              hasOffer: true,
              offerName: offer.name,
              offerDescription: offer.description,
              offerType: offer.offer_type,
              offerPrice: offerProduct.use_offer_price && offerProduct.offer_price ? 
                Number(offerProduct.offer_price) : 
                (offer.discount_percentage ? 
                  (offerProduct.sale_price || 0) * (1 - offer.discount_percentage / 100) :
                  offer.discount_amount ? 
                    Math.max(0, (offerProduct.sale_price || 0) - offer.discount_amount) :
                    offerProduct.sale_price || 0
                ),
              originalPrice: offerProduct.sale_price || 0,
              offerDiscountPercentage: offer.discount_percentage || null,
              offerDiscountAmount: offer.discount_amount || null,
              offerMinQuantity: offerProduct.min_quantity || null,
              offerMaxQuantity: offerProduct.max_quantity || null,
              
              // Markiere als Angebotsprodukt
              isOfferProduct: true,
              offerId: offer.id
            };
            
            this.customerArticlePrices.push(newOfferArticle);
            totalOfferProductsAdded++;
            console.log(`🔍 [PUBLIC-ORDER] Neues Angebotsprodukt hinzugefügt:`, newOfferArticle.article_text);
          }
        });
      }
    });

    console.log('🔍 [PUBLIC-ORDER] Gesamt Angebotsprodukte hinzugefügt:', totalOfferProductsAdded);
    console.log('🔍 [PUBLIC-ORDER] Vergleich: Erwartet vs. Hinzugefügt:', {
      erwartet: totalExpectedOfferProducts,
      hinzugefuegt: totalOfferProductsAdded,
      differenz: totalExpectedOfferProducts - totalOfferProductsAdded,
      note: 'Nach Filterung sollten alle erhalten bleiben!'
    });
    
    // Nach dem Hinzufügen der Angebotsprodukte die Gruppen neu aufbauen
    this.buildGroups();

    // Debug: Anzahl der Angebotsprodukte in der Kategorie zählen
    const offersCategoryCount = this.groupedArticles['Aktuelle Angebote']?.length || 0;
    const allOfferProductsInArticles = this.customerArticlePrices.filter(article => article.isOfferProduct).length;
    const productsWithOffers = this.customerArticlePrices.filter(article => article.hasOffer).length;

    console.log('🔍 [PUBLIC-ORDER] Angebotsprodukte in Kategorie "Aktuelle Angebote":', offersCategoryCount);
    console.log('🔍 [PUBLIC-ORDER] Gesamt Offer Products in customerArticlePrices:', allOfferProductsInArticles);
    console.log('🔍 [PUBLIC-ORDER] Produkte mit Angeboten (hasOffer):', productsWithOffers);
    console.log('🔍 [PUBLIC-ORDER] Alle Kategorien und deren Anzahl:', Object.keys(this.groupedArticles).map(cat => `${cat}: ${this.groupedArticles[cat].length}`));

    // Debug: Zeige alle Produkte in der Angebotskategorie
    if (this.groupedArticles['Aktuelle Angebote']) {
      console.log('🔍 [PUBLIC-ORDER] Produkte in "Aktuelle Angebote" Kategorie:');
      this.groupedArticles['Aktuelle Angebote'].forEach((product, index) => {
        console.log(`🔍 [PUBLIC-ORDER] Angebot ${index + 1}: ${product.article_text}`, {
          product_id: product.product_id,
          isOfferProduct: product.isOfferProduct,
          offerName: product.offerName,
          category: product.category
        });
      });
    }

    // Debug: Zeige alle Produkte mit Angeboten, die nicht in der Angebotskategorie sind
    const productsWithOffersNotInOffersCategory = this.customerArticlePrices.filter(article =>
      (article.isOfferProduct || article.hasOffer) && this.getCategoryForArticle(article) !== 'Aktuelle Angebote'
    );

    if (productsWithOffersNotInOffersCategory.length > 0) {
      console.log('🔍 [PUBLIC-ORDER] ❌ Produkte mit Angeboten NICHT in "Aktuelle Angebote" Kategorie:', productsWithOffersNotInOffersCategory.map(p => ({
        article_text: p.article_text,
        category: p.category,
        isOfferProduct: p.isOfferProduct,
        hasOffer: p.hasOffer
      })));
    } else {
      console.log('🔍 [PUBLIC-ORDER] ✅ Alle Produkte mit Angeboten sind korrekt in "Aktuelle Angebote" Kategorie');
    }
  }

  // Neue Methode zum Filtern der Artikel basierend auf der Produktliste
  filterArticlesByProducts() {
    if (this.allProducts.length === 0) {
      console.log('🔍 [PUBLIC-ORDER] Keine Produkte geladen, verwende alle Artikel');
      // Keine Filterung möglich, aber trotzdem gruppieren
      this.buildGroups();
      // Loading beenden, da keine weiteren API-Calls mehr erfolgen
      this.isLoading = false;
      this.triggerPendingSubmitIfReady();
      return;
    }

    console.log('🔍 [PUBLIC-ORDER] Filtere Artikel basierend auf Produktliste...');
    
    // Erstelle ein Set aller verfügbaren article_numbers aus der Produktliste (string-normalisiert)
    const availableArticleNumbers = new Set(
      this.allProducts
        .map(product => product.article_number != null ? String(product.article_number) : '')
        .filter(Boolean)
    );
    
    console.log('🔍 [PUBLIC-ORDER] Verfügbare Artikelnummern:', Array.from(availableArticleNumbers));
    console.log('🔍 [PUBLIC-ORDER] Verfügbare Produkte Details:', this.allProducts.map(p => ({
      article_number: p.article_number,
      article_text: p.article_text
    })));
    
    // Filtere die customerArticlePrices und füge Bilder hinzu
    const originalCount = this.customerArticlePrices.length;
    this.customerArticlePrices = this.customerArticlePrices.filter(article => {
      const productId = article.product_id != null ? String(article.product_id) : '';
      const articleNumber = article.article_number != null ? String(article.article_number) : '';

      // Benutzerdefinierte Artikel (custom_*) immer anzeigen
      if (productId && productId.startsWith('custom_')) {
        console.log(`🔍 [PUBLIC-ORDER] Benutzerdefinierter Artikel beibehalten: ${article.article_text}`);
        return true;
      }

      // Offer Products IMMER behalten, auch wenn sie nicht in der Produktliste stehen
      if (article.isOfferProduct) {
        console.log(`🔍 [PUBLIC-ORDER] Offer Product behalten: ${article.article_text} (product_id: ${productId})`, {
          offerName: article.offerName || 'N/A'
        });

        // Versuche trotzdem Bild und custom_field_1 hinzuzufügen, falls verfügbar
        const matchingProduct = this.findMatchingCatalogProduct(article);
        if (matchingProduct) {
          if (matchingProduct.main_image_url) {
            article.main_image_url = matchingProduct.main_image_url;
            console.log(`🔍 [PUBLIC-ORDER] Bild hinzugefügt für Offer Product: ${article.article_text}`);
          }

          if (!article.product_custom_field_1 && matchingProduct.product_custom_field_1) {
            article.product_custom_field_1 = matchingProduct.product_custom_field_1;
            console.log(`🔍 [PUBLIC-ORDER] product_custom_field_1 ergänzt für Offer Product: ${article.article_text}: ${matchingProduct.product_custom_field_1}`);
          }
        }

        return true; // Offer Products immer behalten!
      }

      const isAvailable =
        (productId && availableArticleNumbers.has(productId)) ||
        (articleNumber && availableArticleNumbers.has(articleNumber));

      if (!isAvailable) {
        console.log(`🔍 [PUBLIC-ORDER] Artikel gefiltert: ${article.article_text} (product_id: ${productId})`, {
          isOfferProduct: article.isOfferProduct || false,
          offerName: article.offerName || 'N/A'
        });
      } else {
        // Füge das Bild und custom_field_1 zum Artikel hinzu
        const matchingProduct = this.findMatchingCatalogProduct(article);
        if (matchingProduct) {
          // Bild hinzufügen
          if (matchingProduct.main_image_url) {
            article.main_image_url = matchingProduct.main_image_url;
            console.log(`🔍 [PUBLIC-ORDER] Bild hinzugefügt für Artikel: ${article.article_text}`);
          }

          // product_custom_field_1 anreichern (für PFAND-Logik), aber niemals vorhandenen API-Wert überschreiben
          if (!article.product_custom_field_1 && matchingProduct.product_custom_field_1) {
            article.product_custom_field_1 = matchingProduct.product_custom_field_1;
            console.log(`🔍 [PUBLIC-ORDER] product_custom_field_1 ergänzt für Artikel: ${article.article_text}: ${matchingProduct.product_custom_field_1}`);
          }
        }
      }

      return isAvailable;
    });
    
    console.log(`🔍 [PUBLIC-ORDER] Artikel gefiltert: ${originalCount} → ${this.customerArticlePrices.length}`);

    // Debug: Zähle Angebotsprodukte nach Filterung
    const offerProductsAfterFilter = this.customerArticlePrices.filter(article => article.isOfferProduct).length;
    console.log('🔍 [PUBLIC-ORDER] Angebotsprodukte nach Filterung:', offerProductsAfterFilter);

    // Debug: Vergleich vor/nach Filterung für Offer Products
    const filteredCount = originalCount - this.customerArticlePrices.length;
    const filteredOfferProducts = this.customerArticlePrices.filter(article =>
      !article.isOfferProduct && !article.product_id?.toString().startsWith('custom_')
    ).length;

    console.log('🔍 [PUBLIC-ORDER] Offer Products Filterung:', {
      vorFilterung: offerProductsAfterFilter + filteredCount,
      nachFilterung: offerProductsAfterFilter,
      gefiltert: filteredCount,
      offerProductsErhalten: offerProductsAfterFilter,
      note: 'Offer Products werden nicht mehr gefiltert!'
    });
    
    
    // Nach dem Filtern gruppieren
    this.buildGroups();

    // Gespeicherte Bestellung aus localStorage wiederherstellen
    this.loadFromLocalStorage();

    // Loading wird in processAllData() beendet
    // this.isLoading = false;
    // this.triggerPendingSubmitIfReady();
  }

  private normalizeCategoryName(name: any): string {
    return (name ?? '').toString().trim();
  }

  private getCategoryForArticle(article: any): string {
    // Eigene (neu hinzugefügte) Artikel in eigene Kategorie
    if (article?.isCustom || (typeof article?.product_id === 'string' && article.product_id.startsWith('custom_'))) {
      return 'Eigene Artikel';
    }

    // Offer Products und Produkte mit Angeboten immer in "Aktuelle Angebote" Kategorie
    if (article?.isOfferProduct || article?.hasOffer) {
      console.log(`🔍 [PUBLIC-ORDER] Produkt mit Angebot "${article.article_text}" wird in "Aktuelle Angebote" Kategorie einsortiert`, {
        isOfferProduct: article?.isOfferProduct,
        hasOffer: article?.hasOffer,
        originalCategory: article?.category || article?.product_category
      });
      return 'Aktuelle Angebote';
    }

    const category = this.normalizeCategoryName(article?.product_category || article?.category || 'Sonstiges');
    return category || 'Sonstiges';
  }

  private buildGroups(): void {
    const groups: { [key: string]: any[] } = {};
    for (const article of this.customerArticlePrices) {
      const category = this.getCategoryForArticle(article);
      if (!groups[category]) groups[category] = [];
      groups[category].push(article);
    }

    // Kategorien sortieren (Aktuelle Angebote zuerst, dann alphabetisch, Eigene Artikel zuletzt)
    const allCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    const NEW_CAT = 'Eigene Artikel';
    const OFFERS_CAT = 'Aktuelle Angebote';
    
    // Aktuelle Angebote zuerst, dann alphabetisch sortiert, Eigene Artikel zuletzt
    if (groups[OFFERS_CAT] && groups[OFFERS_CAT].length > 0) {
      if (groups[NEW_CAT] && groups[NEW_CAT].length > 0) {
        this.orderedCategories = [OFFERS_CAT, ...allCategories.filter(c => c !== OFFERS_CAT && c !== NEW_CAT), NEW_CAT];
      } else {
        this.orderedCategories = [OFFERS_CAT, ...allCategories.filter(c => c !== OFFERS_CAT)];
      }
    } else if (groups[NEW_CAT] && groups[NEW_CAT].length > 0) {
      this.orderedCategories = allCategories.filter(c => c !== NEW_CAT).concat(NEW_CAT);
    } else {
      this.orderedCategories = allCategories;
    }
    
    this.groupedArticles = groups;
    
    // Kategorien-States erhalten, neue initial schließen
    this.orderedCategories.forEach(category => {
      if (this.categoryStates[category] === undefined) {
        this.categoryStates[category] = false;
      }
    });
  }

  loadCustomerData() {
    this.isLoading = true;
    console.log('🔍 [PUBLIC-ORDER] Starte Laden der Kundendaten für Nummer:', this.customerNumber);
    
    // Neuer Endpoint: Kundendaten + Artikel mit Preisen in einem Call
    const apiUrl = `${environment.apiUrl}/api/customer-article-prices/customer-without-auth`;
    const requestBody = { customerNumber: this.customerNumber };
    
    console.log('🔍 [PUBLIC-ORDER] Lade Daten von:', apiUrl, 'mit Body:', requestBody);
    
    this.http.post(apiUrl, requestBody).subscribe({
        next: (data: any) => {
          console.log('🔍 [PUBLIC-ORDER] API Response erhalten:', data);
          
          // Logge die ersten Artikel um zu sehen, welche Felder verfügbar sind
          if (Array.isArray(data) && data.length > 0) {
            console.log('🔍 [PUBLIC-ORDER] Erster Artikel vom API:', data[0]);
            console.log('🔍 [PUBLIC-ORDER] Verfügbare Felder im ersten Artikel:', Object.keys(data[0]));
            console.log('🔍 [PUBLIC-ORDER] product_custom_field_1 vom API:', data[0].product_custom_field_1);
          }
          
          // Extrahiere Artikel (der Endpoint gibt ein Array von Artikeln zurück)
          if (Array.isArray(data)) {
            this.customerArticlePrices = this.dedupeCustomerArticlePrices(
              data.filter((price: any) => {
              // article_text erforderlich; Preis 0 ist erlaubt (früher falsy und wurde ausgefiltert)
              const hasText = !!price.article_text;
              const hasPrice =
                price.unit_price_net !== null &&
                price.unit_price_net !== undefined &&
                price.unit_price_net !== '';
              return hasText && hasPrice;
            }).map((price: any) => ({
              ...price,
              tempQuantity: null,  // Initialisiere tempQuantity mit null
              product_custom_field_1: price.product_custom_field_1 || null // Stelle sicher, dass PFAND-Referenz gesetzt wird
            }))
            );
            
            // Erstelle einen minimalen Kunden mit der Kundennummer aus dem ersten Artikel
            if (this.customerArticlePrices.length > 0) {
              const firstArticle = this.customerArticlePrices[0];
              this.customer = {
                id: 0,
                customer_number: firstArticle.customer_id,
                last_name_company: `Kunde ${firstArticle.customer_id}`,
                name_addition: '',
                email: '',
                street: '',
                city: '',
                postal_code: '',
                _country_code: ''
              };
            } else {
              // Fallback wenn keine Artikel vorhanden
              this.customer = {
                id: 0,
                customer_number: this.customerNumber,
                last_name_company: `Kunde ${this.customerNumber}`,
                name_addition: '',
                email: '',
                street: '',
                city: '',
                postal_code: '',
                _country_code: ''
              };
            }
            
            console.log('🔍 [PUBLIC-ORDER] Kunde erstellt:', this.customer);
            console.log('🔍 [PUBLIC-ORDER] Artikel geladen:', this.customerArticlePrices.length);
            
            // Nach dem Laden der Kundendaten alle Produkte und Angebote parallel laden
            this.loadAllProductsAndOffers();
            
            // Gespeicherte Bestellung aus localStorage wiederherstellen
            // Warte bis alle Daten geladen sind, dann stelle localStorage wieder her
            // Dies geschieht in der finalen Verarbeitung nach dem Aufbau der Gruppen
          } else {
            this.error = 'Ungültige API-Response: Artikel fehlen';
            this.isLoading = false;
            this.triggerPendingSubmitIfReady();
          }
        },
        error: (error: any) => {
          console.error('❌ [PUBLIC-ORDER] Fehler beim Laden der Daten:', error);
          console.error('❌ [PUBLIC-ORDER] Fehler Details:', error?.message, error?.status, error?.statusText);
          console.error('❌ [PUBLIC-ORDER] Fehler vollständig:', error);
          
          if (error?.status === 404) {
            this.error = `Kunde mit Nummer ${this.customerNumber} nicht gefunden.`;
          } else if (error?.status === 400) {
            this.error = 'Ungültige Anfrage. Bitte überprüfen Sie die Kundennummer.';
          } else if (error?.status === 401) {
            this.error = 'Ungültiger Token. Bitte überprüfen Sie den QR-Code.';
          } else if (error?.status === 500) {
            this.error = 'Server-Fehler. Bitte versuchen Sie es später erneut.';
          } else {
            this.error = `Fehler beim Laden der Daten: ${error?.message || 'Unbekannter Fehler'}`;
          }
          
          this.isLoading = false;
          this.triggerPendingSubmitIfReady();
        }
      });
  }

  private triggerPendingSubmitIfReady() {
    if (this.pendingSubmit && !this.isLoading) {
      this.pendingSubmit = false;
      // Sicherheit: nur senden, wenn es Artikel gibt
      if (this.hasAnyQuantity()) {
        this.submitOrder();
      }
    }
  }

  submitOrder() {
    // Sammle alle Artikel mit Mengen > 0
    const itemsWithQuantity = this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .map(article => {
        // Berechne Bruttopreis für diesen Artikel
        const grossPrice = article.hasOffer && article.offerPrice 
          ? this.getOfferGrossPrice(article)
          : this.getGrossPrice(article);
        const quantity = Number(article.tempQuantity) || 0;
        
        return {
          product_id: article.product_id,
          article_text: article.article_text,
          article_number: article.article_number,
          quantity: quantity,
          unit_price: grossPrice, // Bruttopreis verwenden
          total_price: grossPrice * quantity, // Bruttopreis * Menge
          // Alle zusätzlichen Felder aus der API-Response hinzufügen
          category: article.category,
          created_at: article.created_at,
          customer_id: article.customer_id,
          id: article.id,
          invoice_date: article.invoice_date,
          invoice_id: article.invoice_id,
          product_category: article.product_category,
          product_database_id: article.product_database_id,
          product_name: article.product_name,
          unit_price_gross: grossPrice, // Bruttopreis
          unit_price_net: Number(article.unit_price_net) || 0, // Netto für Referenz
          vat_percentage: article.vat_percentage,
          updated_at: article.updated_at,
          product_custom_field_1: article.product_custom_field_1 // PFAND-Referenz hinzufügen
        };
      });

    if (itemsWithQuantity.length === 0) {
      alert('Bitte geben Sie mindestens eine Menge für einen Artikel ein.');
      return;
    }

    this.isSubmitting = true;
    
    const orderData = {
      customer_number: this.customer.customer_number,
      customer_street: this.customer.street || '',
      customer_country_code: this.customer._country_code || 'DE',
      customer_postal_code: this.customer.postal_code || '',
      customer_city: this.customer.city || '',
      different_company_name: null,
      status: 'open',
      customer_notes: '',
      shipping_address: '',
      fulfillment_type: 'delivery',
      total_price: itemsWithQuantity.reduce((total, item) => total + item.total_price, 0),
      delivery_date: new Date().toISOString().split('T')[0] // Heute als Standard
    };

    const completeOrder = {
      orderData: orderData,
      orderItems: itemsWithQuantity.map(item => ({
        article_number: item.product_id,
        quantity: item.quantity,
        sale_price: item.unit_price,
        description: item.article_text,
        // Alle zusätzlichen Felder aus der API-Response hinzufügen
        article_text: item.article_text,
        category: item.category,
        created_at: item.created_at,
        customer_id: item.customer_id,
        article_id: item.id,
        invoice_date: item.invoice_date,
        invoice_id: item.invoice_id,
        product_category: item.product_category,
        id: item.product_database_id,
        product_name: item.product_name,
        unit_price_gross: item.unit_price_gross,
        unit_price_net: item.unit_price,
        vat_percentage: item.vat_percentage,
        updated_at: item.updated_at,
        total_price: item.total_price,
        product_custom_field_1: item.product_custom_field_1 // PFAND-Referenz hinzufügen
      }))
    };

    // 🔍 PAYLOAD LOGGING - Bestellung wird abgesendet
    console.log('🚀 [PUBLIC-ORDER] Bestellung wird abgesendet:');
    console.log('📋 [PUBLIC-ORDER] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('💰 [PUBLIC-ORDER] Gesamtpreis:', completeOrder.orderData.total_price);
    console.log('📦 [PUBLIC-ORDER] Anzahl Artikel:', completeOrder.orderItems.length);
    console.log('👤 [PUBLIC-ORDER] Kunde:', completeOrder.orderData.customer_number);
    console.log('📅 [PUBLIC-ORDER] Lieferdatum:', completeOrder.orderData.delivery_date);
    console.log('📍 [PUBLIC-ORDER] Lieferart:', completeOrder.orderData.fulfillment_type);
    console.log('🌐 [PUBLIC-ORDER] Endpoint:', `${environment.apiUrl}/api/orders/without-auth`);

    // Verwende den neuen Endpoint ohne Auth
    this.http.post(`${environment.apiUrl}/api/orders/without-auth`, completeOrder).subscribe({
      next: (response: any) => {
        console.log('✅ [PUBLIC-ORDER] Bestellung erfolgreich abgesendet! Response:', response);
        
        // Alle Mengen zurücksetzen
        this.customerArticlePrices.forEach(article => {
          article.tempQuantity = null;
        });
        
        // localStorage für diesen Kunden leeren
        this.clearLocalStorage();
        
        this.isSubmitting = false;
        
        // Bestellung erfolgreich - zur Startseite weiterleiten
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1000);
      },
      error: (error: any) => {
        console.error('❌ [PUBLIC-ORDER] Fehler beim Absenden der Bestellung:', error);
        console.error('❌ [PUBLIC-ORDER] Fehler Details:', error?.message, error?.status, error?.statusText);
        
        this.isSubmitting = false;
        
        // Fehler in der Konsole loggen
        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
        
        if (error?.status === 400) {
          errorMessage = 'Ungültige Bestelldaten. Bitte überprüfen Sie Ihre Eingaben.';
        } else if (error?.status === 500) {
          errorMessage = 'Server-Fehler. Bitte versuchen Sie es später erneut.';
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        console.error('Fehler beim Absenden der Bestellung:', errorMessage);
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  // Modal-Methoden
  showOrderConfirmation() {
    // Statt Modal zu öffnen, zur öffentlichen Review-Seite navigieren
    if (this.token) {
      // Offene Mengenfelder normalisieren, bevor gespeichert wird
      for (const article of this.customerArticlePrices) {
        const raw = article.tempQuantity;
        if (raw === '' || raw === null || raw === undefined) {
          article.tempQuantity = null;
        } else {
          const quantity = Number(raw);
          article.tempQuantity = !isNaN(quantity) && quantity > 0 ? quantity : null;
        }
      }

      // Stelle sicher, dass die aktuelle Auswahl im einheitlichen Key gespeichert ist
      this.saveToLocalStorage();
      
      // Navigation mit Fehlerbehandlung
      this.router.navigate([`/customer-order/${this.token}/review`]).then(() => {
        console.log('✅ [PUBLIC-ORDER] Navigation zur Review-Seite erfolgreich');
      }).catch(error => {
        console.error('❌ [PUBLIC-ORDER] Navigation fehlgeschlagen:', error);
        
        // Benutzerfreundliche Fehlermeldung
        alert('Navigation fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.');
      });
    }
  }

  closeOrderModal() {
    this.showOrderModal = false;
  }

  // showResponseModalSuccess() { // Entferne Response Modal Methoden
  //   this.responseModalData = {
  //     isSuccess: true,
  //     title: 'Bestellung erfolgreich! 🎉',
  //     message: 'Ihre Bestellung wurde erfolgreich eingereicht und wird von unserem Team bearbeitet.',
  //     details: 'Sie erhalten in Kürze eine Bestätigung per E-Mail. Vielen Dank für Ihr Vertrauen!'
  //   };
  //   this.showResponseModal = true;
  // }

  // showResponseModalError(errorMessage: string) { // Entferne Response Modal Methoden
  //   this.responseModalData = {
  //     isSuccess: false,
  //     title: 'Fehler beim Absenden ❌',
  //     message: 'Es ist ein Fehler beim Absenden Ihrer Bestellung aufgetreten.',
  //     details: errorMessage
  //   };
  //   this.showResponseModal = true;
  // }

  // closeResponseModal() { // Entferne Response Modal Methoden
  //   this.showResponseModal = false;
  //   // Bei Erfolg zur Startseite weiterleiten
  //   if (this.responseModalData.isSuccess) {
  //     setTimeout(() => {
  //       this.router.navigate(['/']);
  //     }, 1000);
  //   }
  // }

  confirmAndSubmitOrder() {
    this.closeOrderModal();
    this.submitOrder();
  }

  getOrderItems() {
    return this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .map(article => {
        // Nettopreis für Anzeige (Modal)
        const netPrice = article.hasOffer && (article.offerPrice != null && article.offerPrice !== '')
          ? this.getOfferNetPrice(article)
          : this.getNetPrice(article);
        const quantity = Number(article.tempQuantity) || 0;
        
        return {
          product_id: article.product_id,
          article_text: article.article_text,
          article_number: article.article_number || (article.isCustom ? 'Eigener Artikel' : ''),
          quantity: quantity,
          unit_price: netPrice, // Netto für Anzeige
          total_price: netPrice * quantity,
          invoice_date: article.invoice_date,
          isCustom: article.isCustom || false,
          main_image_url: article.main_image_url,
          category: article.category,
          created_at: article.created_at,
          customer_id: article.customer_id,
          id: article.id,
          invoice_id: article.invoice_id,
          product_category: article.product_category,
          product_database_id: article.product_database_id,
          product_name: article.product_name,
          unit_price_gross: this.getOfferGrossPrice(article), // Brutto für API/Referenz
          unit_price_net: netPrice,
          vat_percentage: article.vat_percentage,
          updated_at: article.updated_at,
          product_custom_field_1: article.product_custom_field_1
        };
      });
  }

  // Plus-Button: Menge erhöhen
  increaseQuantity(article: any) {
    if (!article.tempQuantity || article.tempQuantity <= 0) {
      article.tempQuantity = 1;
    } else {
      article.tempQuantity = Number(article.tempQuantity) + 1;
    }
    
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }

  // Minus-Button: Menge verringern
  decreaseQuantity(article: any) {
    if (article.tempQuantity && article.tempQuantity > 0) {
      article.tempQuantity = Number(article.tempQuantity) - 1;
    } else {
      article.tempQuantity = null;
    }
    
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }

  getOrderTotal(): number {
    return this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .reduce((total, article) => {
        const quantity = Number(article.tempQuantity) || 0;
        // Verwende Bruttopreis (Angebotspreis falls vorhanden, sonst normaler Bruttopreis)
        const price = article.hasOffer && article.offerPrice 
          ? this.getOfferGrossPrice(article)
          : this.getGrossPrice(article);
        return total + (price * quantity);
      }, 0);
  }

  // Hilfsmethode zum Konvertieren von Strings zu Zahlen
  toNumber(value: any): number {
    return Number(value) || 0;
  }
  
  // Gibt den Nettopreis eines Artikels zurück (Anzeige)
  getNetPrice(article: any): number {
    return Number(article.unit_price_net) || 0;
  }

  // Gibt den Nettopreis für Angebote zurück (Anzeige)
  getOfferNetPrice(article: any): number {
    if (article.hasOffer && (article.offerPrice != null && article.offerPrice !== '')) {
      return Number(article.offerPrice) || 0;
    }
    return this.getNetPrice(article);
  }

  // Berechnet den Bruttopreis (verwendet unit_price_gross falls vorhanden, sonst berechnet aus Netto + MwSt)
  getGrossPrice(article: any): number {
    // Wenn unit_price_gross vorhanden ist, verwende es
    if (article.unit_price_gross && Number(article.unit_price_gross) > 0) {
      return Number(article.unit_price_gross);
    }
    
    // Sonst berechne aus Netto + MwSt
    const netPrice = Number(article.unit_price_net) || 0;
    const vatPercentage = Number(article.vat_percentage) || 19; // Standard: 19% MwSt
    
    return netPrice * (1 + vatPercentage / 100);
  }
  
  // Berechnet den Bruttopreis für Angebote
  getOfferGrossPrice(article: any): number {
    if (!article.hasOffer || !article.offerPrice) {
      return this.getGrossPrice(article);
    }
    
    // Für Angebote: Berechne Brutto aus Angebots-Nettopreis
    const offerNetPrice = Number(article.offerPrice) || 0;
    const vatPercentage = Number(article.vat_percentage) || 19;
    
    return offerNetPrice * (1 + vatPercentage / 100);
  }

  // Gesamtsumme Netto (für Anzeige)
  getOrderTotalNet(): number {
    return this.customerArticlePrices
      .filter(article => article.tempQuantity && article.tempQuantity > 0)
      .reduce((total, article) => {
        const quantity = Number(article.tempQuantity) || 0;
        const price = article.hasOffer && (article.offerPrice != null && article.offerPrice !== '')
          ? this.getOfferNetPrice(article)
          : this.getNetPrice(article);
        return total + (price * quantity);
      }, 0);
  }

  // Methode die aufgerufen wird, wenn die Menge im Input bestätigt wird (blur)
  onQuantityChange(article?: any): void {
    if (article) {
      const raw = article.tempQuantity;
      if (raw === '' || raw === null || raw === undefined) {
        article.tempQuantity = null;
      } else {
        const quantity = Number(raw);
        article.tempQuantity = !isNaN(quantity) && quantity > 0 ? quantity : null;
      }
    }
    this.saveToLocalStorage();
  }

  // Prüft, ob mindestens ein Artikel eine Menge hat
  // Warenkorb-Statistiken
  getCartItemCount(): number {
    return this.customerArticlePrices.filter(article => article.tempQuantity && article.tempQuantity > 0).length;
  }
  
  getCartTotalQuantity(): number {
    return this.customerArticlePrices.reduce((total, article) => {
      return total + (article.tempQuantity || 0);
    }, 0);
  }
  
  hasAnyQuantity(): boolean {
    return this.customerArticlePrices.some(article => 
      article.tempQuantity && article.tempQuantity > 0
    );
  }

  openImage(article: any) {
    if (!article) return;
    const articleNumber = article.article_number || article.product_id;
    const imageUrl = article.main_image_url;
    const title = article.article_text;
    this.router.navigate([`/customer-order/${this.token}/image/${articleNumber}`], {
      state: { imageUrl, title }
    });
  }

  // Benutzerdefinierte Artikel Methoden
  addCustomArticle() {
    this.showCustomArticleForm = true;
    this.customArticle = {
      article_text: '',
      tempQuantity: 1,
      isCustom: true
    };
  }

  increaseCustomQuantity() {
    if (!this.customArticle.tempQuantity || this.customArticle.tempQuantity <= 0) {
      this.customArticle.tempQuantity = 1;
    } else {
      this.customArticle.tempQuantity = Number(this.customArticle.tempQuantity) + 1;
    }
    
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }

  decreaseCustomQuantity() {
    if (this.customArticle.tempQuantity && this.customArticle.tempQuantity > 0) {
      this.customArticle.tempQuantity = Number(this.customArticle.tempQuantity) - 1;
    } else {
      this.customArticle.tempQuantity = null;
    }
    
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }

  saveCustomArticle() {
    if (this.customArticle.article_text && this.customArticle.tempQuantity && this.customArticle.tempQuantity > 0) {
      // Erstelle einen neuen benutzerdefinierten Artikel
      const newCustomArticle = {
        product_id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // Eindeutige ID
        article_text: this.customArticle.article_text,
        article_number: 'Eigener Artikel',
        unit_price_net: 0, // Preis ist 0 für benutzerdefinierte Artikel
        tempQuantity: this.customArticle.tempQuantity,
        isCustom: true,
        invoice_date: null,
        product_database_id: 571 // Eigene Artikel bekommen immer product_database_id 571
      };

      // Füge den Artikel zur Liste hinzu
      this.customerArticlePrices.push(newCustomArticle);

      // Gruppen aktualisieren
      this.buildGroups();

      // Bestellung in localStorage speichern
      this.saveToLocalStorage();

      // Verstecke das Formular
      this.showCustomArticleForm = false;
      
      // Setze das benutzerdefinierte Artikel-Objekt zurück
      this.customArticle = {
        article_text: '',
        tempQuantity: null,
        isCustom: true
      };
    }
  }

  cancelCustomArticle() {
    this.showCustomArticleForm = false;
    this.customArticle = {
      article_text: '',
      tempQuantity: null,
      isCustom: true
    };
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }
}
