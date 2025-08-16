import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

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
  showResponseModal: boolean = false;
  responseModalData: {
    isSuccess: boolean;
    title: string;
    message: string;
    details?: string;
  } = {
    isSuccess: false,
    title: '',
    message: ''
  };
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
      
      this.decodeTokenAndLoadData();
    });
  }

  // localStorage Methoden
  private saveToLocalStorage(): void {
    if (!this.customerNumber) return;
    
    const orderData = {
      customerNumber: this.customerNumber,
      articles: this.customerArticlePrices.map(article => ({
        product_id: article.product_id,
        tempQuantity: article.tempQuantity,
        isCustom: article.isCustom,
        article_text: article.article_text // Für benutzerdefinierte Artikel
      })),
      timestamp: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(this.localStorageKey, JSON.stringify(orderData));
      console.log('💾 [PUBLIC-ORDER] Bestellung in localStorage gespeichert:', orderData);
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
          
          // Stelle die Mengen für alle Artikel wieder her
          orderData.articles.forEach((storedArticle: any) => {
            const article = this.customerArticlePrices.find(a => a.product_id === storedArticle.product_id);
            if (article) {
              article.tempQuantity = storedArticle.tempQuantity;
              article.isCustom = storedArticle.isCustom || false;
            }
          });
          
          // Stelle auch benutzerdefinierte Artikel wieder her
          const customArticles = orderData.articles.filter((a: any) => a.isCustom);
          customArticles.forEach((storedCustom: any) => {
            const existingCustom = this.customerArticlePrices.find(a => 
              a.product_id === storedCustom.product_id && a.isCustom
            );
            if (!existingCustom && storedCustom.tempQuantity > 0) {
              // Füge den benutzerdefinierten Artikel wieder hinzu
              const newCustomArticle = {
                product_id: storedCustom.product_id,
                article_text: storedCustom.article_text || 'Eigener Artikel',
                article_number: 'Eigener Artikel',
                unit_price_net: 0,
                tempQuantity: storedCustom.tempQuantity,
                isCustom: true,
                invoice_date: null,
                product_database_id: 571
              };
              this.customerArticlePrices.push(newCustomArticle);
            }
          });
          
          // Gruppen neu aufbauen nach der Wiederherstellung
          this.buildGroups();
        }
      }
    } catch (error) {
      console.error('❌ [PUBLIC-ORDER] Fehler beim Laden aus localStorage:', error);
    }
  }

  private clearLocalStorage(): void {
    if (!this.customerNumber) return;
    
    try {
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
        // Füge das Bild zum Artikel hinzu
        const matchingProduct = this.allProducts.find(product => product.article_number === productId);
        if (matchingProduct && matchingProduct.main_image_url) {
          article.main_image_url = matchingProduct.main_image_url;
          console.log(`🔍 [PUBLIC-ORDER] Bild hinzugefügt für Artikel: ${article.article_text}`);
        }
      }
      
      return isAvailable;
    });
    
    console.log(`🔍 [PUBLIC-ORDER] Artikel gefiltert: ${originalCount} → ${this.customerArticlePrices.length}`);
    
    // Nach dem Filtern gruppieren
    this.buildGroups();

    // Loading beenden, da alle Daten geladen und gefiltert wurden
    this.isLoading = false;
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
    
    // Alle Kategorien initial als zugeklappt setzen
    this.orderedCategories.forEach(category => {
      this.categoryStates[category] = false;
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
          
          // Extrahiere Artikel (der Endpoint gibt ein Array von Artikeln zurück)
          if (Array.isArray(data)) {
            this.customerArticlePrices = data.filter((price: any) => {
              return price.article_text && price.unit_price_net;
            }).map((price: any) => ({
              ...price,
              tempQuantity: null  // Initialisiere tempQuantity mit null
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
            this.loadFromLocalStorage();
          } else {
            this.error = 'Ungültige API-Response: Artikel fehlen';
            this.isLoading = false;
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
        }
      });
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
        updated_at: article.updated_at
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
        total_price: item.total_price
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
        
        // Response-Modal bei Erfolg anzeigen
        this.showResponseModalSuccess();
      },
      error: (error: any) => {
        console.error('❌ [PUBLIC-ORDER] Fehler beim Absenden der Bestellung:', error);
        console.error('❌ [PUBLIC-ORDER] Fehler Details:', error?.message, error?.status, error?.statusText);
        
        this.isSubmitting = false;
        
        // Response-Modal bei Fehler anzeigen
        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
        
        if (error?.status === 400) {
          errorMessage = 'Ungültige Bestelldaten. Bitte überprüfen Sie Ihre Eingaben.';
        } else if (error?.status === 500) {
          errorMessage = 'Server-Fehler. Bitte versuchen Sie es später erneut.';
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        this.showResponseModalError(errorMessage);
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  // Modal-Methoden
  showOrderConfirmation() {
    this.showOrderModal = true;
  }

  closeOrderModal() {
    this.showOrderModal = false;
  }

  showResponseModalSuccess() {
    this.responseModalData = {
      isSuccess: true,
      title: 'Bestellung erfolgreich! 🎉',
      message: 'Ihre Bestellung wurde erfolgreich eingereicht und wird von unserem Team bearbeitet.',
      details: 'Sie erhalten in Kürze eine Bestätigung per E-Mail. Vielen Dank für Ihr Vertrauen!'
    };
    this.showResponseModal = true;
  }

  showResponseModalError(errorMessage: string) {
    this.responseModalData = {
      isSuccess: false,
      title: 'Fehler beim Absenden ❌',
      message: 'Es ist ein Fehler beim Absenden Ihrer Bestellung aufgetreten.',
      details: errorMessage
    };
    this.showResponseModal = true;
  }

  closeResponseModal() {
    this.showResponseModal = false;
    // Bei Erfolg zur Startseite weiterleiten
    if (this.responseModalData.isSuccess) {
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 1000);
    }
  }

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
        updated_at: article.updated_at
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
  }
}
