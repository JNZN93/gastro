import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-public-order-review',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="review-page">
      <div class="topbar">
        <button class="back" (click)="goBack()">← Zurück</button>
        <div class="heading">
          <h1>Bestellübersicht</h1>
          <div class="customer" *ngIf="customer?.last_name_company">für {{ customer.last_name_company }}</div>
        </div>
      </div>

      <div class="content">
        <ng-container *ngIf="items && items.length; else empty">
          <div class="items">
            <div class="item-card" *ngFor="let item of items; trackBy: trackByItem">
              <div class="media">
                <img *ngIf="item.main_image_url" [src]="item.main_image_url" [alt]="item.article_text" />
                <div *ngIf="!item.main_image_url" class="placeholder">📦</div>
              </div>
              <div class="info">
                <div class="name">{{ item.article_text }}</div>
                <div class="meta">Art.-Nr.: {{ item.article_number || item.product_id }}</div>
              </div>
              <div class="actions">
                <div class="quantity-controls">
                  <button class="qty-btn minus" (click)="reduceQuantity(item)" [disabled]="item.quantity <= 1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                    </svg>
                  </button>
                  <span class="qty-display">{{ item.quantity }}</span>
                  <button class="qty-btn plus" (click)="increaseQuantity(item)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                  </button>
                </div>
                <button class="remove-btn" (click)="removeItem(item)" title="Entfernen">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </ng-container>
        <ng-template #empty>
          <div class="empty">Keine Artikel ausgewählt.</div>
        </ng-template>
      </div>

      <div class="bottombar" *ngIf="items && items.length">
        <!-- Test Button für PFAND-Logik -->
        <button class="test-button" (click)="testPfandLogic()" title="PFAND-Logik testen (ohne Bestellung abzusenden)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          <span>PFAND-Logik testen</span>
        </button>
        
        <button class="submit" (click)="submitOrder()" [disabled]="isSubmitting">
          <span *ngIf="!isSubmitting">Bestellung absenden</span>
          <span *ngIf="isSubmitting">Sende...</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .review-page { 
      height: 100vh; 
      background: #f8f9fb; 
      display: flex; 
      flex-direction: column;
      overflow: hidden;
    }
    .topbar { 
      height: var(--header-height, 80px);
      flex-shrink: 0;
      z-index: 5; 
      display: flex; 
      align-items: center; 
      gap: 12px; 
      padding: 12px 16px; 
      background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%); 
      border-bottom: 1px solid #eee; 
    }
    .back { 
      appearance: none; 
      border: 1px solid #ddd; 
      background: #fff; 
      padding: 8px 12px; 
      border-radius: 10px; 
      cursor: pointer; 
      font-weight: 500; 
    }
    .heading h1 { 
      margin: 0; 
      font-size: 20px; 
    }
    .customer { 
      color: #6b7280; 
      font-size: 12px; 
      margin-top: 2px; 
    }
    .content { 
      height: var(--content-height, calc(100vh - 160px));
      max-width: 1000px; 
      margin: 0 auto; 
      padding: 16px; 
      overflow-y: auto; 
      -webkit-overflow-scrolling: touch;
      width: 100%;
      box-sizing: border-box;
    }
    .items { 
      display: flex; 
      flex-direction: column; 
      gap: 12px; 
      margin-bottom: 24px; 
    }
    .item-card { 
      display: grid; 
      grid-template-columns: 72px 1fr auto; 
      gap: 12px; 
      align-items: center; 
      background: #fff; 
      border: 1px solid #eee; 
      border-radius: 14px; 
      padding: 10px 12px; 
      box-shadow: 0 4px 12px rgba(0,0,0,0.04); 
    }
    .media { 
      width: 72px; 
      height: 72px; 
      border-radius: 10px; 
      background: #f2f2f2; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      overflow: hidden; 
    }
    .media img { 
      width: 100%; 
      height: 100%; 
      object-fit: cover; 
    }
    .placeholder { 
      font-size: 28px; 
    }
    .info { 
      min-width: 0; 
    }
    .name { 
      font-weight: 600; 
      color: #111827; 
      word-break: break-word; 
      font-size: 14px;
      line-height: 1.3;
    }
    .meta { 
      color: #6b7280; 
      font-size: 11px; 
      margin-top: 2px; 
    }
    .actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .quantity-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 2px;
    }
    .qty-btn {
      appearance: none;
      border: none;
      background: #fff;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: all 0.2s;
    }
    .qty-btn:hover:not(:disabled) {
      background: #f3f4f6;
      transform: translateY(-1px);
    }
    .qty-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .qty-btn svg {
      width: 16px;
      height: 16px;
      stroke: #374151;
    }
    .qty-display {
      min-width: 24px;
      text-align: center;
      font-weight: 600;
      color: #111827;
      font-size: 14px;
    }
    .remove-btn {
      appearance: none;
      border: none;
      background: #fee2e2;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .remove-btn:hover {
      background: #fecaca;
      transform: translateY(-1px);
    }
    .remove-btn svg {
      width: 14px;
      height: 14px;
      stroke: #dc2626;
    }
    .empty { 
      max-width: 1000px; 
      margin: 40px auto; 
      text-align: center; 
      color: #6b7280; 
    }
    .bottombar { 
      height: var(--button-height, 80px);
      flex-shrink: 0;
      max-width: 1000px; 
      margin: 0 auto; 
      padding: 16px; 
      background: #fff; 
      border-top: 1px solid #eee; 
      box-shadow: 0 -4px 12px rgba(0,0,0,0.1); 
      z-index: 10;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
    }
    .submit { 
      width: 100%; 
      appearance: none; 
      border: none; 
      background: #ff7a00; 
      color: #fff; 
      padding: 14px 20px; 
      border-radius: 12px; 
      font-weight: 700; 
      cursor: pointer; 
      box-shadow: 0 6px 16px rgba(255,122,0,0.35); 
      font-size: 16px; 
    }
    .submit[disabled] { 
      opacity: 0.6; 
      cursor: not-allowed; 
      box-shadow: none; 
    }

    // Test Button für PFAND-Logik
    .test-button {
      width: 100%;
      appearance: none;
      border: none;
      background: #3b82f6;
      color: #fff;
      padding: 12px 20px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
      font-size: 14px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s ease;

      &:hover {
        background: #1d4ed8;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
      }

      &:active {
        transform: translateY(0);
      }

      svg {
        width: 18px;
        height: 18px;
      }
    }
    
    /* Mobile-specific improvements */
    @media (max-width: 767px) {
      .topbar {
        padding: 12px;
      }
      .content {
        padding: 12px;
      }
      .bottombar {
        padding: 12px 16px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom));
      }
      .submit {
        padding: 16px 20px;
        font-size: 16px;
      }
      .item-card {
        grid-template-columns: 64px 1fr auto;
        gap: 10px;
        padding: 8px 10px;
      }
      .media {
        width: 64px;
        height: 64px;
      }
      .name {
        font-size: 13px;
      }
      .meta {
        font-size: 10px;
      }
      .qty-btn {
        width: 26px;
        height: 26px;
      }
      .qty-btn svg {
        width: 14px;
        height: 14px;
      }
      .remove-btn {
        width: 26px;
        height: 26px;
      }
      .remove-btn svg {
        width: 12px;
        height: 12px;
      }
    }
    
    @media (min-width: 768px) {
      .item-card { 
        grid-template-columns: 88px 1fr auto; 
        padding: 14px 16px; 
      }
      .media { 
        width: 88px; 
        height: 88px; 
      }
      .heading h1 { 
        font-size: 22px; 
      }
      .name {
        font-size: 15px;
      }
      .meta {
        font-size: 12px;
      }
    }
  `]
})
export class PublicOrderReviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  token = '';
  items: any[] = [];
  total = 0;
  isSubmitting = false;
  customer: any = null;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.token = params['token'];
    });

    // Daten aus history.state übernehmen
    const state = history.state || {};
    this.items = state.items || [];
    this.total = state.total || 0;
    this.customer = state.customer || null;



    // Gerätespezifische Höhenanpassung
    this.adjustHeightForDevice();

    // Automatisch nach oben scrollen, damit die Artikelliste sichtbar ist
    setTimeout(() => {
      const contentElement = document.querySelector('.content');
      if (contentElement) {
        contentElement.scrollTop = 0;
      }
    }, 100);


  }

  private adjustHeightForDevice() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    
    if (isIOS) {
      // iPhone-spezifische Höhen - Content noch kleiner für bessere Sichtbarkeit
      document.documentElement.style.setProperty('--header-height', '70px');
      document.documentElement.style.setProperty('--button-height', '70px');
      document.documentElement.style.setProperty('--content-height', 'calc(100vh - 240px)'); // Noch kleiner gemacht
    } else if (isAndroid) {
      // Android-spezifische Höhen - bleiben wie sie sind
      document.documentElement.style.setProperty('--header-height', '75px');
      document.documentElement.style.setProperty('--button-height', '75px');
      document.documentElement.style.setProperty('--content-height', 'calc(100vh - 150px)');
    } else {
      // Desktop-Fallback
      document.documentElement.style.setProperty('--header-height', '80px');
      document.documentElement.style.setProperty('--button-height', '80px');
      document.documentElement.style.setProperty('--content-height', 'calc(100vh - 160px)');
    }
  }

  trackByItem(index: number, item: any): string {
    return item.article_number || item.product_id || index.toString();
  }

  reduceQuantity(item: any) {
    if (item.quantity > 1) {
      item.quantity--;
      this.updateTotal(); // Nur den Total aktualisieren, nicht das komplette Array
    }
  }

  increaseQuantity(item: any) {
    item.quantity++;
    this.updateTotal(); // Nur den Total aktualisieren, nicht das komplette Array
  }

  removeItem(item: any) {
    // Bestätigungsabfrage vor dem Entfernen
    if (confirm(`Möchten Sie "${item.article_text}" wirklich aus der Bestellung entfernen?`)) {
      this.items = this.items.filter(i => 
        (i.article_number || i.product_id) !== (item.article_number || item.product_id)
      );
      this.updateTotal(); // Total nach dem Entfernen aktualisieren
    }
  }

  private updateTotal() {
    // Nur den Gesamtpreis aktualisieren, nicht das komplette Array kopieren
    if (this.items.length > 0) {
      this.total = this.items.reduce((sum, item) => {
        // Verwende sale_price falls vorhanden, sonst 0 (für PFAND-Artikel)
        const price = item.sale_price || 0;
        return sum + (price * item.quantity);
      }, 0);
    }
    
    // Manuell Change Detection triggern für bessere Performance
    this.cdr.detectChanges();
  }

  goBack() {
    this.router.navigate([`/customer-order/${this.token}`]);
  }

  submitOrder() {
    // PFAND-Artikel automatisch hinzufügen BEVOR die Bestellung abgesendet wird
    this.addPfandArticlesToOrder();
    
    // In dieser öffentlichen Version triggert die Review-Seite die Absendelogik nicht selbst,
    // sondern navigiert zurück und sendet ein Event. Alternativ: Direkt POSTen.
    // Für Einfachheit navigieren wir zurück und setzen einen Flag über state.
    this.isSubmitting = true;
    this.router.navigate([`/customer-order/${this.token}`], { state: { submitNow: true } });
  }

    // Neue Methode: PFAND-Artikel automatisch zur Bestellung hinzufügen
  addPfandArticlesToOrder() {
    console.log('🔄 [PUBLIC-PFAND-LOGIC] Starte PFAND-Artikel Logik...');
    
    // Lade alle verfügbaren PFAND-Artikel vom api/products Endpoint
    this.loadPfandArticles().then(pfandArticles => {
      console.log('📦 [PUBLIC-PFAND-LOGIC] Verfügbare PFAND-Artikel geladen:', pfandArticles);
      
      // Erstelle eine Kopie der Artikel für die Verarbeitung
      const itemsCopy = [...this.items];
      const newItems: any[] = [];
      
      // Durchlaufe alle Artikel
      itemsCopy.forEach((artikel, index) => {
        // Prüfe, ob der Artikel ein product_custom_field_1 hat (PFAND-Referenz)
        if (artikel.product_custom_field_1) {
          console.log(`🔍 [PUBLIC-PFAND-LOGIC] Artikel ${artikel.article_text} hat product_custom_field_1: ${artikel.product_custom_field_1}`);
          
          // Suche nach dem echten PFAND-Artikel in den geladenen PFAND-Artikeln
          const realPfandArticle = pfandArticles.find(pfand => 
            pfand.article_number === artikel.product_custom_field_1 || 
            pfand.product_id === artikel.product_custom_field_1
          );
          
          if (realPfandArticle) {
            console.log(`✅ [PUBLIC-PFAND-LOGIC] Echten PFAND-Artikel gefunden: ${realPfandArticle.article_text}`);
            
            // Erstelle einen PFAND-Artikel basierend auf dem echten PFAND-Artikel
            const pfandItem = {
              ...realPfandArticle, // Alle echten PFAND-Daten übernehmen
              quantity: artikel.quantity, // Menge vom Hauptartikel übernehmen
              parent_article_number: artikel.article_number || artikel.product_id, // Referenz zum Hauptartikel
              is_pfand: true, // Markierung als PFAND-Artikel
              description: `Pfand für ${artikel.article_text}` // Beschreibung anpassen
            };
            
            // Füge den echten PFAND-Artikel zur Liste der neuen Artikel hinzu
            newItems.push({
              item: pfandItem,
              insertAfterIndex: index
            });
            
            console.log(`➕ [PUBLIC-PFAND-LOGIC] Echter PFAND-Artikel wird hinzugefügt: ${pfandItem.article_text}, Menge: ${pfandItem.quantity}, Preis: ${pfandItem.sale_price}€`);
          } else {
            console.log(`❌ [PUBLIC-PFAND-LOGIC] Kein echter PFAND-Artikel gefunden für Referenz: ${artikel.product_custom_field_1}`);
            console.log(`🔍 [PUBLIC-PFAND-LOGIC] Verfügbare PFAND-Artikel:`, pfandArticles);
            
            // Fallback: Erstelle einen simulierten PFAND-Artikel
            const fallbackPfandItem = {
              article_text: `PFAND ${artikel.article_text}`,
              article_number: artikel.product_custom_field_1,
              quantity: artikel.quantity,
              sale_price: 0.25, // Standard PFAND-Preis
              main_image_url: artikel.main_image_url, // Gleiches Bild
              category: 'PFAND',
              product_custom_field_1: null,
              parent_article_number: artikel.article_number || artikel.product_id,
              is_pfand: true,
              description: `Pfand für ${artikel.article_text} (simuliert)`
            };
            
            newItems.push({
              item: fallbackPfandItem,
              insertAfterIndex: index
            });
            
            console.log(`⚠️ [PUBLIC-PFAND-LOGIC] Simulierter PFAND-Artikel als Fallback hinzugefügt: ${fallbackPfandItem.article_text}`);
          }
        } else {
          console.log(`ℹ️ [PUBLIC-PFAND-LOGIC] Artikel ${artikel.article_text} hat kein product_custom_field_1`);
        }
      });
      
      // Füge alle PFAND-Artikel in umgekehrter Reihenfolge hinzu (damit die Indizes stimmen)
      newItems.reverse().forEach(({ item, insertAfterIndex }) => {
        this.items.splice(insertAfterIndex + 1, 0, item);
      });
      
      console.log(`🎯 [PUBLIC-PFAND-LOGIC] PFAND-Logik abgeschlossen. ${newItems.length} PFAND-Artikel hinzugefügt.`);
      console.log(`📋 [PUBLIC-PFAND-LOGIC] Neuer Artikel-Array:`, this.items);
      
      // Aktualisiere den Gesamtpreis
      this.updateTotal();
      
      // Manuell Change Detection triggern
      this.cdr.detectChanges();
    });
  }

  // Neue Methode: Lade alle PFAND-Artikel vom api/products Endpoint
  private async loadPfandArticles(): Promise<any[]> {
    try {
      console.log('📡 [PUBLIC-PFAND-LOGIC] Lade PFAND-Artikel von api/products...');
      
      // Lade alle Produkte und filtere nach PFAND-Kategorie
      const response = await fetch('https://multi-mandant-ecommerce.onrender.com/api/products');
      const allProducts = await response.json();
      
      // Filtere nur PFAND-Artikel
      const pfandArticles = allProducts.filter((product: any) => product.category === 'PFAND');
      
      console.log(`📦 [PUBLIC-PFAND-LOGIC] ${pfandArticles.length} PFAND-Artikel gefunden:`, pfandArticles);
      
      return pfandArticles;
    } catch (error) {
      console.error('❌ [PUBLIC-PFAND-LOGIC] Fehler beim Laden der PFAND-Artikel:', error);
      return [];
    }
  }



  // Test-Methode: PFAND-Logik testen ohne Bestellung abzusenden
  testPfandLogic() {
    console.log('🧪 [PUBLIC-PFAND-TEST] Test-Button geklickt - Starte PFAND-Logik Test...');
    console.log('📋 [PUBLIC-PFAND-TEST] Aktuelle Artikel vor PFAND-Logik:', this.items);
    

    
    // Führe die PFAND-Logik aus
    this.addPfandArticlesToOrder();
    
    console.log('🧪 [PUBLIC-PFAND-TEST] PFAND-Logik Test abgeschlossen!');
    console.log('📋 [PUBLIC-PFAND-TEST] Artikel nach PFAND-Logik:', this.items);
    
    // Zeige eine Benachrichtigung an den Benutzer
    alert(`PFAND-Logik Test abgeschlossen!\n\nNeue Artikel hinzugefügt: ${this.items.length - this.items.filter(item => !item.is_pfand).length}\nNeuer Gesamtpreis: ${this.total.toFixed(2)}€`);
  }


}


