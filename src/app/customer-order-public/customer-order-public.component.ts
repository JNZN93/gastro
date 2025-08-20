import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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

  token: string = '';
  customerNumber: string = '';
  customer: any = null;
  customerArticlePrices: any[] = [];
  allProducts: any[] = []; // Neue Eigenschaft für alle Produkte
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

  // localStorage Key für diesen Kunden
  private get localStorageKey(): string {
    return `customer_order_${this.customerNumber}`;
  }

  // Methode zum Umschalten des Zustands einer Kategorie
  toggleCategory(category: string): void {
    this.categoryStates[category] = !this.categoryStates[category];
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

      // Pro Artikel nur notwendige Felder speichern und Mengen inkrementell updaten
      for (const article of this.customerArticlePrices) {
        const quantity = Number(article.tempQuantity);
        const key = String(article.article_number || article.product_id);

        if (!quantity || quantity <= 0 || isNaN(quantity)) {
          // Menge 0/null -> Eintrag entfernen
          if (stored.items[key]) delete stored.items[key];
          continue;
        }

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
            // Suche nach dem Artikel basierend auf verschiedenen Feldern
            let article = this.customerArticlePrices.find(a => a.product_id === storedArticle.product_id);
            
            // Fallback: Suche nach article_number
            if (!article && storedArticle.article_number) {
              article = this.customerArticlePrices.find(a => a.article_number === storedArticle.article_number);
            }
            
            // Fallback: Suche nach article_text
            if (!article && storedArticle.article_text) {
              article = this.customerArticlePrices.find(a => a.article_text === storedArticle.article_text);
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
                  product_id: storedArticle.product_id || `custom_${Date.now()}`,
                  article_text: storedArticle.article_text || 'Eigener Artikel',
                  article_number: 'Eigener Artikel',
                  unit_price_net: Number(storedArticle.unit_price_net) || 0,
                  tempQuantity: storedArticle.tempQuantity,
                  isCustom: true,
                  invoice_date: null,
                  product_database_id: 571,
                  category: 'NEU HINZUGEFÜGT',
                  product_category: 'NEU HINZUGEFÜGT',
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
      console.log('🔍 [PUBLIC-ORDER] API URL:', 'https://multi-mandant-ecommerce.onrender.com/api/auth/decode-customer-token');
      console.log('🔍 [PUBLIC-ORDER] Request Body:', { token: this.token });
    
    this.http.post('https://multi-mandant-ecommerce.onrender.com/api/auth/decode-customer-token', {
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
    
    this.http.get('https://multi-mandant-ecommerce.onrender.com/api/products').subscribe({
      next: (products: any) => {
        this.allProducts = products;
        console.log('🔍 [PUBLIC-ORDER] Alle Produkte geladen:', this.allProducts.length);
        
        // Nach dem Laden der Produkte die Artikel filtern
        this.filterArticlesByProducts();
      },
      error: (error: any) => {
        console.error('❌ [PUBLIC-ORDER] Fehler beim Laden der Produkte:', error);
        // Bei Fehler trotzdem mit den ursprünglichen Artikeln fortfahren
        this.filterArticlesByProducts();
      }
    });
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
    
    // Erstelle ein Set aller verfügbaren article_numbers aus der Produktliste
    const availableArticleNumbers = new Set(
      this.allProducts.map(product => product.article_number)
    );
    
    console.log('🔍 [PUBLIC-ORDER] Verfügbare Artikelnummern:', Array.from(availableArticleNumbers));
    
    // Filtere die customerArticlePrices und füge Bilder hinzu
    const originalCount = this.customerArticlePrices.length;
    this.customerArticlePrices = this.customerArticlePrices.filter(article => {
      const productId = article.product_id;
      
      // Benutzerdefinierte Artikel (custom_*) immer anzeigen
      if (productId && productId.toString().startsWith('custom_')) {
        console.log(`🔍 [PUBLIC-ORDER] Benutzerdefinierter Artikel beibehalten: ${article.article_text}`);
        return true;
      }
      
      const isAvailable = availableArticleNumbers.has(productId);
      
      if (!isAvailable) {
        console.log(`🔍 [PUBLIC-ORDER] Artikel gefiltert: ${article.article_text} (product_id: ${productId})`);
      } else {
        // Füge das Bild und custom_field_1 zum Artikel hinzu
        const matchingProduct = this.allProducts.find(product => product.article_number === productId);
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
    
    
    // Nach dem Filtern gruppieren
    this.buildGroups();

    // Gespeicherte Bestellung aus localStorage wiederherstellen
    this.loadFromLocalStorage();

    // Loading beenden, da alle Daten geladen und gefiltert wurden
    this.isLoading = false;
    this.triggerPendingSubmitIfReady();
  }

  private normalizeCategoryName(name: any): string {
    return (name ?? '').toString().trim();
  }

  private getCategoryForArticle(article: any): string {
    // Eigene (neu hinzugefügte) Artikel in eigene Kategorie
    if (article?.isCustom || (typeof article?.product_id === 'string' && article.product_id.startsWith('custom_'))) {
      return 'NEU HINZUGEFÜGT';
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

    // Kategorien sortieren (NEU HINZUGEFÜGT nur anzeigen wenn Artikel vorhanden, Rest alphabetisch)
    const allCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    const NEW_CAT = 'NEU HINZUGEFÜGT';
    
    // Nur NEU HINZUGEFÜGT Kategorie anzeigen wenn Artikel vorhanden
    if (groups[NEW_CAT] && groups[NEW_CAT].length > 0) {
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
    const apiUrl = 'https://multi-mandant-ecommerce.onrender.com/api/customer-article-prices/customer-without-auth';
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
            this.customerArticlePrices = data.filter((price: any) => {
              return price.article_text && price.unit_price_net;
            }).map((price: any) => ({
              ...price,
              tempQuantity: null,  // Initialisiere tempQuantity mit null
              product_custom_field_1: price.product_custom_field_1 || null // Stelle sicher, dass PFAND-Referenz gesetzt wird
            }));
            
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
            
            // Nach dem Laden der Kundendaten alle Produkte laden und Artikel filtern
            this.loadAllProducts();
            
            // Gespeicherte Bestellung aus localStorage wiederherstellen
            // Warte bis die Produkte geladen sind, dann stelle localStorage wieder her
            // Dies geschieht in filterArticlesByProducts() nach dem Aufbau der Gruppen
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
      .map(article => ({
        product_id: article.product_id,
        article_text: article.article_text,
        article_number: article.article_number,
        quantity: Number(article.tempQuantity),
        unit_price: Number(article.unit_price_net) || 0,
        total_price: (Number(article.unit_price_net) || 0) * Number(article.tempQuantity),
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
        unit_price_gross: article.unit_price_gross,
        vat_percentage: article.vat_percentage,
        updated_at: article.updated_at,
        product_custom_field_1: article.product_custom_field_1 // PFAND-Referenz hinzufügen
      }));

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
    console.log('🌐 [PUBLIC-ORDER] Endpoint:', 'https://multi-mandant-ecommerce.onrender.com/api/orders/without-auth');

    // Verwende den neuen Endpoint ohne Auth
    this.http.post('https://multi-mandant-ecommerce.onrender.com/api/orders/without-auth', completeOrder).subscribe({
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
      .map(article => ({
        product_id: article.product_id,
        article_text: article.article_text,
        article_number: article.article_number || (article.isCustom ? 'Eigener Artikel' : ''),
        quantity: Number(article.tempQuantity),
        unit_price: Number(article.unit_price_net) || 0,
        total_price: (Number(article.tempQuantity) || 0) * (Number(article.unit_price_net) || 0),
        invoice_date: article.invoice_date,
        isCustom: article.isCustom || false,
        main_image_url: article.main_image_url, // Bild-URL hinzufügen
        // Alle zusätzlichen Felder aus der API-Response hinzufügen
        category: article.category,
        created_at: article.created_at,
        customer_id: article.customer_id,
        id: article.id,
        invoice_id: article.invoice_id,
        product_category: article.product_category,
        product_database_id: article.product_database_id,
        product_name: article.product_name,
        unit_price_gross: article.unit_price_gross,
        vat_percentage: article.vat_percentage,
        updated_at: article.updated_at,
        product_custom_field_1: article.product_custom_field_1 // PFAND-Referenz hinzufügen! ✅
      }));
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
        const price = Number(article.unit_price_net) || 0;
        return total + (price * quantity);
      }, 0);
  }

  // Hilfsmethode zum Konvertieren von Strings zu Zahlen
  toNumber(value: any): number {
    return Number(value) || 0;
  }

  // Methode die aufgerufen wird, wenn sich die Menge über das Input-Feld ändert
  onQuantityChange(): void {
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
  }

  // Prüft, ob mindestens ein Artikel eine Menge hat
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
      tempQuantity: null,
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
        product_id: `custom_${Date.now()}`, // Eindeutige ID für benutzerdefinierte Artikel
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
