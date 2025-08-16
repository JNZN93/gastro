import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CustomerOrderStateService } from '../customer-order-state.service';

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
  private stateService = inject(CustomerOrderStateService);

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
  pendingSubmit: boolean = false;
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
  // Letzter Artikel, dessen Bild geöffnet wurde
  private lastOpenedArticleId: string | null = null;
  // Loading-Modal für State-Wiederherstellung
  showStateRestoreModal: boolean = false;
  loadingProgress: number = 0;

  // localStorage Key für diesen Kunden
  private get localStorageKey(): string {
    return `customer_order_${this.customerNumber}`;
  }

  private saveCompleteState() {
    const completeState = {
      customer: this.customer,
      customerNumber: this.customerNumber,
      token: this.token,
      articles: this.customerArticlePrices.map(a => ({ ...a })),
      groupedArticles: this.groupedArticles,
      orderedCategories: this.orderedCategories,
      categoryStates: this.categoryStates,
      showCustomArticleForm: this.showCustomArticleForm,
      customArticle: this.customArticle,
      isLoading: this.isLoading,
      isSubmitting: this.isSubmitting,
      error: this.error,
      successMessage: this.successMessage,
      showOrderModal: this.showOrderModal,
      showResponseModal: this.showResponseModal,
      responseModalData: this.responseModalData,
      pendingSubmit: this.pendingSubmit,
      scrollPosition: { scrollTop: window.scrollY, scrollLeft: window.scrollX },
      lastOpenedArticleId: this.lastOpenedArticleId,
      activeCategory: this.getActiveCategory(),
      savedAt: new Date().toISOString()
    };
    this.stateService.saveStateMemory(completeState);
    this.stateService.saveStatePersistent(completeState);
  }

  private getActiveCategory(): string | null {
    const categories = document.querySelectorAll('.category-section');
    for (const category of Array.from(categories)) {
      const rect = (category as HTMLElement).getBoundingClientRect();
      if (rect.top <= 100 && rect.bottom >= 100) {
        return (category as HTMLElement).getAttribute('data-category');
      }
    }
    return null;
  }

  private restoreFromState(state: any) {
    // Loading-Modal anzeigen und Fortschritt zurücksetzen
    this.showStateRestoreModal = true;
    this.loadingProgress = 0;
    
    // State laden (0-30%)
    this.loadingProgress = 30;
    
    this.customer = state.customer;
    this.customerNumber = state.customerNumber;
    this.token = state.token;
    this.customerArticlePrices = (state.articles || []).map((a: any) => ({ ...a }));
    this.groupedArticles = state.groupedArticles || {};
    this.orderedCategories = state.orderedCategories || [];
    this.categoryStates = state.categoryStates || {};
    this.showCustomArticleForm = !!state.showCustomArticleForm;
    this.customArticle = state.customArticle || { article_text: '', tempQuantity: null, isCustom: true };
    this.isLoading = false;
    this.isSubmitting = false;
    this.error = state.error || '';
    this.successMessage = state.successMessage || '';
    this.showOrderModal = !!state.showOrderModal;
    this.showResponseModal = !!state.showResponseModal;
    this.responseModalData = state.responseModalData || this.responseModalData;
    this.pendingSubmit = !!state.pendingSubmit;
    this.lastOpenedArticleId = state.lastOpenedArticleId || null;

    this.buildGroups();

    setTimeout(() => {
      // Artikel wiederherstellen (30-70%)
      this.loadingProgress = 70;
      
      this.restoreScrollPosition(state.scrollPosition);
      this.restoreViewportState(state.activeCategory);
      if (this.lastOpenedArticleId) {
        this.scrollToArticle(this.lastOpenedArticleId);
      }
      
      // Position setzen (70-100%)
      setTimeout(() => {
        this.loadingProgress = 100;
        
        // Länger warten und weicheren Übergang
        setTimeout(() => {
          // Fade-Out-Effekt starten
          const modal = document.querySelector('.state-restore-modal');
          if (modal) {
            modal.classList.add('fade-out');
          }
          
          // Nach dem Fade-Out das Modal komplett ausblenden
          setTimeout(() => {
            this.showStateRestoreModal = false;
            // Reset des Fortschritts
            this.loadingProgress = 0;
          }, 500); // 500ms für den Fade-Out
        }, 800); // Länger warten für weicheren Übergang
      }, 500); // Länger warten für DOM rendering
    }, 500); // Länger warten für DOM rendering
  }

  private restoreScrollPosition(scrollData: any) {
    if (scrollData && typeof scrollData.scrollTop === 'number') {
      window.scrollTo({ top: scrollData.scrollTop, left: scrollData.scrollLeft || 0, behavior: 'instant' });
    }
  }

  private restoreViewportState(activeCategory: string | null) {
    if (!activeCategory) return;
    this.categoryStates[activeCategory] = true;
    this.scrollToCategory(activeCategory);
  }

  private scrollToCategory(categoryName: string) {
    const el = document.querySelector(`[data-category="${categoryName}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }

  private scrollToElement(element: HTMLElement) {
    // Mehrere Scroll-Strategien versuchen
    try {
      // Strategie 1: scrollIntoView mit instant
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      
      // Verifiziere die Position nach dem Scroll
      setTimeout(() => {
        this.verifyScrollPosition(element);
      }, 50);
      
    } catch (error) {
      this.scrollWithWindowScrollTo(element);
    }
  }

  private scrollWithWindowScrollTo(element: HTMLElement) {
    try {
      // Strategie 2: window.scrollTo mit berechneter Position
      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset + rect.top - (window.innerHeight / 2) + (rect.height / 2);
      
      window.scrollTo({ top: scrollTop, behavior: 'instant' });
      
      // Verifiziere die Position nach dem Scroll
      setTimeout(() => {
        this.verifyScrollPosition(element);
      }, 50);
      
    } catch (error2) {
      // Strategie 3: Smooth scroll als Fallback
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private verifyScrollPosition(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const isCentered = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) < 50;
    
    // Falls nicht zentriert, versuche es nochmal mit einer anderen Strategie
    if (!isCentered) {
      this.correctScrollPosition(element);
    }
  }

  private correctScrollPosition(element: HTMLElement) {
    // Versuche mehrere Korrektur-Strategien
    try {
      // Strategie 1: Direkte scrollIntoView mit center
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      
      // Warte kurz und verifiziere
      setTimeout(() => {
        this.verifyScrollPosition(element);
      }, 100);
      
    } catch (error) {
      this.correctScrollPositionStrategy2(element);
    }
  }

  private correctScrollPositionStrategy2(element: HTMLElement) {
    try {
      // Strategie 2: window.scroll mit präziser Berechnung
      const rect = element.getBoundingClientRect();
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetScrollTop = currentScrollTop + rect.top - (window.innerHeight / 2) + (rect.height / 2);
      

      
      // Verwende document.documentElement.scrollTop für bessere Kompatibilität
      if (document.documentElement.scrollTop !== undefined) {
        document.documentElement.scrollTop = targetScrollTop;
      } else if (document.body.scrollTop !== undefined) {
        document.body.scrollTop = targetScrollTop;
      } else {
        window.scrollTo(0, targetScrollTop);
      }
      
      // Verifiziere nach kurzer Verzögerung
      setTimeout(() => {
        this.verifyScrollPosition(element);
      }, 100);
      
    } catch (error) {
      this.correctScrollPositionStrategy3(element);
    }
  }

  private correctScrollPositionStrategy3(element: HTMLElement) {
    try {
      // Strategie 3: Smooth scroll als letzter Ausweg
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Verifiziere nach dem Smooth-Scroll
      setTimeout(() => {
        this.verifyScrollPosition(element);
      }, 500); // Länger warten bei smooth scroll
      
    } catch (error) {
      // Alle Scroll-Strategien fehlgeschlagen
    }
  }

  private scrollToArticle(articleId: string) {
    
    // Versuche zuerst nach der exakten ID zu suchen
    let el = document.querySelector(`[data-article-id="${articleId}"]`);
    
    // Falls nicht gefunden, suche nach dem Artikel in den Daten und verwende die korrekte ID
    if (!el) {
      const article = this.customerArticlePrices.find(a => 
        String(a.article_number || a.product_id) === articleId
      );
      
      if (article) {
        const correctId = String(article.article_number || article.product_id);
        
        // Versuche mit der korrekten ID zu suchen
        el = document.querySelector(`[data-article-id="${correctId}"]`);
        
        if (el) {
          // Artikel mit korrigierter ID gefunden
        } else {
          // Kategorie öffnen falls sie zugeklappt ist
          const category = this.getCategoryForArticle(article);
          if (category && !this.categoryStates[category]) {
            this.categoryStates[category] = true;
            this.buildGroups();
          }
          
          // Nach dem DOM-Update nochmal versuchen
          setTimeout(() => {
            const el2 = document.querySelector(`[data-article-id="${correctId}"]`);
            if (el2) {
              this.scrollToElement(el2 as HTMLElement);
            } else {
              // Letzter Versuch: Suche nach dem Artikel-Text
              const textElements = Array.from(document.querySelectorAll('.article-text'));
              const matchingElement = textElements.find(el => el.textContent?.trim() === article.article_text);
              if (matchingElement) {
                const articleElement = matchingElement.closest('.product-card, .table-row');
                if (articleElement) {
                  this.scrollToElement(articleElement as HTMLElement);
                }
              }
            }
          }, 200);
        }
      }
    }
    
    // Falls der Artikel gefunden wurde, scrolle dorthin
    if (el) {
      // Stelle sicher, dass die Kategorie geöffnet ist
      const articleCard = (el as HTMLElement).closest('.product-card, .table-row');
      if (articleCard) {
        const categorySection = articleCard.closest('.category-content');
        if (categorySection) {
          const categoryHeader = categorySection.previousElementSibling;
          if (categoryHeader && categoryHeader.classList.contains('category-header')) {
            const categoryName = categoryHeader.querySelector('.category-name')?.textContent;
            if (categoryName && !this.categoryStates[categoryName]) {
              this.categoryStates[categoryName] = true;
              this.buildGroups();
              
              // Nach dem DOM-Update nochmal scrollen
              setTimeout(() => {
                const el2 = document.querySelector(`[data-article-id="${articleId}"]`);
                if (el2) {
                  this.scrollToElement(el2 as HTMLElement);
                }
              }, 100);
              return;
            }
          }
        }
      }
      
      // Direkt scrollen
      this.scrollToElement(el as HTMLElement);
    }
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
      
      const savedState = this.stateService.getState();
      if (savedState && savedState.token === this.token) {
        console.log('🔄 [PUBLIC-ORDER] Restauriere gespeicherten State (ohne API-Calls)');
        this.restoreFromState(savedState);
        if (this.stateService.hasMemoryState()) {
          this.stateService.clearState();
        }
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
    this.triggerPendingSubmitIfReady();

    // Falls ein gespeicherter State existiert (z. B. nach Refresh), danach Scroll wiederherstellen
    const st = this.stateService.getState();
    if (st && st.token === this.token) {
      setTimeout(() => {
        this.restoreScrollPosition(st.scrollPosition);
        this.restoreViewportState(st.activeCategory);
      }, 0);
    }
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
    // Statt Modal zu öffnen, zur öffentlichen Review-Seite navigieren
    if (this.token) {
      this.router.navigate([`/customer-order/${this.token}/review`], {
        state: {
          customer: this.customer,
          items: this.getOrderItems(),
          total: this.getOrderTotal()
        }
      });
    }
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
    this.saveCompleteState();
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
    this.saveCompleteState();
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
    this.saveCompleteState();
  }

  // Prüft, ob mindestens ein Artikel eine Menge hat
  hasAnyQuantity(): boolean {
    return this.customerArticlePrices.some(article => 
      article.tempQuantity && article.tempQuantity > 0
    );
  }

  openImage(article: any) {
    if (!article) return;
    this.lastOpenedArticleId = String(article.article_number || article.product_id);
    console.log('📸 [PUBLIC-ORDER] Bild geöffnet für Artikel:', {
      articleNumber: article.article_number,
      productId: article.product_id,
      lastOpenedArticleId: this.lastOpenedArticleId
    });
    this.saveCompleteState();
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
    this.saveCompleteState();
  }

  decreaseCustomQuantity() {
    if (this.customArticle.tempQuantity && this.customArticle.tempQuantity > 0) {
      this.customArticle.tempQuantity = Number(this.customArticle.tempQuantity) - 1;
    } else {
      this.customArticle.tempQuantity = null;
    }
    
    // Bestellung in localStorage speichern
    this.saveToLocalStorage();
    this.saveCompleteState();
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
      this.saveCompleteState();

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
    this.saveCompleteState();
  }
}
