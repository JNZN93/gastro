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
        <button class="clear-cart" (click)="clearCart()" *ngIf="items && items.length > 0">
          Warenkorb leeren
        </button>
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
        <button class="submit" (click)="openConfirmModal()" [disabled]="isSubmitting">
          <span *ngIf="!isSubmitting">Bestellung absenden</span>
          <span *ngIf="isSubmitting">Sende...</span>
        </button>
      </div>
      
      <!-- Confirmation Modal -->
      <div class="confirm-backdrop" *ngIf="showConfirmModal">
        <div class="confirm-modal">
          <h2>Bestellung absenden?</h2>
          <p>Möchten Sie die Bestellung jetzt absenden?</p>
          <div class="confirm-actions">
            <button class="btn-cancel" (click)="closeConfirmModal()">Abbrechen</button>
            <button class="btn-confirm" (click)="confirmSubmit()" [disabled]="isSubmitting">Ja, absenden</button>
          </div>
        </div>
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
      justify-content: space-between;
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
    .clear-cart {
      appearance: none;
      border: 1px solid #dc2626;
      background: #fff;
      color: #dc2626;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s;
    }
    .clear-cart:hover {
      background: #dc2626;
      color: #fff;
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

    /* Confirmation modal */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }
    .confirm-modal {
      width: 90%;
      max-width: 420px;
      background: #fff;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    }
    .confirm-modal h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
    }
    .confirm-modal p {
      margin: 0 0 16px 0;
      color: #374151;
      font-size: 14px;
    }
    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .btn-cancel {
      appearance: none;
      border: 1px solid #d1d5db;
      background: #fff;
      color: #374151;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    .btn-confirm {
      appearance: none;
      border: none;
      background: #ff7a00;
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      box-shadow: 0 6px 16px rgba(255,122,0,0.35);
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
  showConfirmModal = false;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.token = params['token'];
    });

    // Artikel aus localStorage laden
    this.loadFromLocalStorage();

    // Gerätespezifische Höhenanpassung
    this.adjustHeightForDevice();

    // Automatisch nach oben scrollen, damit die Artikelliste sichtbar ist
    setTimeout(() => {
      const contentElement = document.querySelector('.content');
      if (contentElement) {
        contentElement.scrollTop = 0;
      }
    }, 100);

    // PFAND-Verknüpfungen analysieren nach dem Laden der Artikel
    setTimeout(() => {
      if (this.items && this.items.length > 0) {
        this.loadPfandArticles().then(pfandArticles => {
          if (pfandArticles && pfandArticles.length > 0) {
            this.logPfandVerknuepfungen(this.items, pfandArticles);
          }
        });
      }
    }, 500);
  }

  private loadFromLocalStorage() {
    if (!this.token) return;
    
    try {
      // WICHTIG: Verwende direkt den customer_order_10.001 Key
      const storageKey = 'customer_order_10.001';
      console.log(`🔍 Lade Daten direkt aus localStorage Key: ${storageKey}`);
      
      const storedData = localStorage.getItem(storageKey);
      if (!storedData) {
        console.log(`⚠️ Keine Bestellung im localStorage gefunden für Key: ${storageKey}`);
        this.items = [];
        return;
      }

      const orderData = JSON.parse(storedData);
      console.log(`📦 Bestelldaten gefunden für Key: ${storageKey}`);

      // Setze Customer-Informationen
      if (orderData.customerNumber && !this.customer) {
        this.customer = { customer_number: orderData.customerNumber };
        console.log(`👤 Customer gesetzt: ${orderData.customerNumber}`);
      }

      let entries: any[] = [];
      if (Array.isArray(orderData.articles)) {
        entries = orderData.articles;
      } else if (orderData.items && typeof orderData.items === 'object') {
        entries = Object.values(orderData.items);
      }

      console.log(`📦 Rohe Einträge gefunden: ${entries.length}`);

      // WICHTIG: Nur Artikel mit Menge > 0 laden (nur die tatsächlich hinzugefügten)
      const validEntries = entries.filter((article: any) => {
        const quantity = article.tempQuantity || article.quantity || 0;
        const isValid = quantity > 0;
        if (!isValid) {
          console.log(`❌ Artikel ${article.article_text} hat Menge 0 - wird gefiltert`);
        }
        return isValid;
      });

      console.log(`✅ Gültige Einträge nach Filterung: ${validEntries.length}`);

      // Konvertiere tempQuantity -> quantity und stelle unit_price für Total sicher
      // WICHTIG: Alle Artikel müssen das gleiche Schema haben
      this.items = validEntries.map((article: any) => {
        // WICHTIG: tempQuantity hat Vorrang vor quantity
        const finalQuantity = article.tempQuantity !== undefined ? article.tempQuantity : (article.quantity || 0);
        
        console.log(`🔍 Artikel ${article.article_text}: tempQuantity=${article.tempQuantity}, quantity=${article.quantity}, finalQuantity=${finalQuantity}`);
        console.log(`🔍 Artikel ${article.article_text}: product_database_id=${article.product_database_id}, id=${article.id}`);
        console.log(`🔍 Artikel ${article.article_text}: Vollständiger Artikel:`, article);
        
        // Einheitliches Schema für alle Artikel
        return {
          // Basis-Identifikation (immer vorhanden)
          product_id: article.product_id || article.article_number || article.id,
          article_number: article.article_number || article.product_id || article.id,
          
          // Anzeige-Informationen
          article_text: article.article_text,
          main_image_url: article.main_image_url,
          
          // Preise (unit_price_net und sale_price)
          unit_price_net: article.unit_price_net || 0,
          sale_price: article.sale_price, // WICHTIG: sale_price wiederherstellen
          
          // Mengen (einheitlich)
          quantity: finalQuantity,
          tempQuantity: finalQuantity,
          
          // Zusätzliche Felder
          product_custom_field_1: article.product_custom_field_1,
          isCustom: article.isCustom || false,
          is_pfand: article.is_pfand || false,
          
          // WICHTIG: product_database_id für den id Key im Payload
          product_database_id: article.product_database_id
        };
      });
      
      this.total = this.calculateTotal();
      console.log(`📱 Artikel erfolgreich geladen: ${this.items.length} Artikel`);
      
    } catch (error) {
      console.error('❌ Fehler beim Laden aus localStorage:', error);
      this.items = []; // Bei Fehler auch leeres Array setzen
    }
  }

  private saveToLocalStorage() {
    if (!this.token) return;
    
    try {
      const customerNumber = this.customer?.customer_number || this.customer?.customer_id;
      if (!customerNumber) return;
      
      const storageKey = `customer_order_${customerNumber}`;
      const storedRaw = localStorage.getItem(storageKey);
      let stored: any = storedRaw ? JSON.parse(storedRaw) : {};
      if (!stored || typeof stored !== 'object') stored = {};
      if (!stored.items || typeof stored.items !== 'object') stored.items = {};

      // Metadaten updaten
      stored.customerNumber = String(customerNumber);
      stored.token = this.token;

      // Nur Artikel mit Menge > 0 speichern
      const presentKeys = new Set<string>();
      for (const item of this.items) {
        const quantity = Number(item.quantity);
        const key = String(item.article_number || item.product_id);

        // Nur Artikel mit Menge > 0 speichern
        if (!quantity || quantity <= 0 || isNaN(quantity)) {
          continue;
        }

        presentKeys.add(key);
        console.log(`💾 [LOCALSTORAGE] Speichere Artikel ${key}:`, {
          product_id: item.product_id,
          article_number: item.article_number,
          article_text: item.article_text,
          unit_price_net: Number(item.unit_price_net || 0) || 0,
          main_image_url: item.main_image_url,
          product_custom_field_1: item.product_custom_field_1,
          product_database_id: item.product_database_id,
          isCustom: !!item.isCustom,
          tempQuantity: quantity
        });
        stored.items[key] = {
          product_id: item.product_id,
          article_number: item.article_number,
          article_text: item.article_text,
          unit_price_net: Number(item.unit_price_net || 0) || 0,
          sale_price: item.sale_price, // WICHTIG: sale_price auch speichern
          main_image_url: item.main_image_url,
          product_custom_field_1: item.product_custom_field_1,
          product_database_id: item.product_database_id,
          isCustom: !!item.isCustom,
          is_pfand: !!item.is_pfand, // WICHTIG: is_pfand Flag auch speichern
          tempQuantity: quantity
        };
      }

      // Entferne alle Einträge, die nicht mehr vorhanden sind
      const keys = Object.keys(stored.items);
      for (const k of keys) {
        if (!presentKeys.has(k)) {
          delete stored.items[k];
        }
      }

      stored.timestamp = new Date().toISOString();

      localStorage.setItem(storageKey, JSON.stringify(stored));
      console.log('💾 Kompakte Bestellung gespeichert (Review):', stored);
    } catch (error) {
      console.error('❌ Fehler beim Speichern in localStorage:', error);
    }
  }

  // Neue Methode: Berechne den Gesamtpreis
  private calculateTotal(): number {
    if (this.items.length === 0) return 0;
    
    return this.items.reduce((sum, item) => {
      // Für PFAND-Artikel: Verwende sale_price, für normale Artikel: unit_price_net
      const price = item.is_pfand ? (item.sale_price || 0) : (item.unit_price_net || 0);
      return sum + (price * item.quantity);
    }, 0);
  }

  // Neue Methode: Lösche alle localStorage-Einträge für diesen Kunden
  private clearAllLocalStorage() {
    try {
      const customerNumber = this.customer?.customer_number || this.customer?.customer_id;
      if (!customerNumber) return;
      
      // Lösche den Key: customer_order_<customer_number>
      const storageKey = `customer_order_${customerNumber}`;
      localStorage.removeItem(storageKey);
      
      // Zusätzlich: Lösche auch alle anderen Keys, die mit diesem Token verknüpft sind
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('customer_order_')) {
          try {
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (parsed && parsed.token === this.token) {
                localStorage.removeItem(key);
                console.log('🗑️ Zusätzlicher localStorage-Key gelöscht:', key);
              }
            }
          } catch {}
        }
      }
      
      console.log('🗑️ localStorage komplett geleert für Kunde:', customerNumber);
    } catch (error) {
      console.error('❌ Fehler beim Löschen der localStorage-Einträge:', error);
    }
  }

  // Synchronisiere Änderungen zurück in den Haupt-Warenkorb-Speicher der Public-Order-Seite
  private syncToMainLocalStorage(): void {
    // Nicht mehr nötig, da wir jetzt den gleichen Key verwenden
    // Die saveToLocalStorage() Methode speichert bereits in den richtigen Key
    console.log('🔄 Synchronisation nicht mehr nötig - verwende bereits den gleichen Key');
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
      this.updateItemInLocalStorage(item); // Änderungen sofort in localStorage speichern
      this.cdr.detectChanges(); // Change Detection triggern
    }
  }

  increaseQuantity(item: any) {
    item.quantity++;
    this.updateTotal(); // Nur den Total aktualisieren, nicht das komplette Array
    this.updateItemInLocalStorage(item); // Änderungen sofort in localStorage speichern
    this.cdr.detectChanges(); // Change Detection triggern
  }

  removeItem(item: any) {
    // Bestätigungsabfrage vor dem Entfernen
    if (confirm(`Möchten Sie "${item.article_text}" wirklich aus der Bestellung entfernen?`)) {
      // Artikel aus dem Array entfernen
      this.items = this.items.filter(i => 
        (i.article_number || i.product_id) !== (item.article_number || item.product_id)
      );
      
      // Total nach dem Entfernen aktualisieren
      this.updateTotal();
      
      // WICHTIG: localStorage sofort bereinigen - entferne den gelöschten Artikel
      this.removeItemFromLocalStorage(item);
      
      // Change Detection triggern
      this.cdr.detectChanges();
    }
  }

  private updateTotal() {
    // Nur den Gesamtpreis aktualisieren, nicht das komplette Array kopieren
    if (this.items.length > 0) {
      this.total = this.items.reduce((sum, item) => {
        // Für PFAND-Artikel: Verwende sale_price, für normale Artikel: unit_price_net
        const price = item.is_pfand ? (item.sale_price || 0) : (item.unit_price_net || 0);
        return sum + (price * item.quantity);
      }, 0);
    }
    
    // Manuell Change Detection triggern für bessere Performance
    this.cdr.detectChanges();
  }

  openConfirmModal() {
    this.showConfirmModal = true;
    this.cdr.markForCheck();
  }

  closeConfirmModal() {
    this.showConfirmModal = false;
    this.cdr.markForCheck();
  }

  confirmSubmit() {
    this.showConfirmModal = false;
    this.cdr.markForCheck();
    this.submitOrder();
  }

  goBack() {
    // Vor dem Zurück-Navigieren synchronisieren
    this.syncToMainLocalStorage();
    this.router.navigate([`/customer-order/${this.token}`]);
  }

    clearCart() {
    // Bestätigungsabfrage
    if (confirm('Sind Sie sicher, dass Sie den gesamten Warenkorb leeren möchten? Alle ausgewählten Artikel werden entfernt.')) {
      // Alle Artikel entfernen
      this.items = [];
      this.total = 0;
      
      // Alle localStorage-Einträge für diesen Kunden löschen
      this.clearAllLocalStorage();
      
      // Haupt-Warenkorb auch leeren (Synchronisation)
      this.syncToMainLocalStorage();
      
      // Change Detection triggern
      this.cdr.detectChanges();
    }
  }

  async submitOrder() {
    console.log('🚀 [PUBLIC-REVIEW] Bestellung wird abgesendet...');
    console.log('📋 [PUBLIC-REVIEW] Artikel vor PFAND-Logik:', this.items);
    
    // PFAND-Artikel nur für den Order-Payload laden (nicht visuell anzeigen)
    const pfandArticles = await this.loadPfandArticles();
    
    console.log('📋 [PUBLIC-REVIEW] Artikel bleiben unverändert (keine visuelle PFAND-Anzeige)');
    console.log('💰 [PUBLIC-REVIEW] Gesamtpreis bleibt unverändert');
    
    // PFAND-Artikel nur für den Payload vorbereiten (nicht in this.items)
    const pfandItemsForPayload: any[] = [];
    this.items.forEach((artikel) => {
      if (artikel.product_custom_field_1) {
        const realPfandArticle = pfandArticles.find(pfand => 
          pfand.article_number === artikel.product_custom_field_1 || 
          pfand.product_id === artikel.product_custom_field_1
        );
        
        if (realPfandArticle) {
          pfandItemsForPayload.push({
            article_number: realPfandArticle.article_number || realPfandArticle.product_id,
            quantity: artikel.quantity,
            sale_price: realPfandArticle.sale_price,
            description: realPfandArticle.article_text,
            article_text: realPfandArticle.article_text,
            unit_price_net: realPfandArticle.unit_price_net || 0,
            different_price: realPfandArticle.unit_price_net || 0,
            id: realPfandArticle.id || realPfandArticle.product_id,
            total_price: (artikel.quantity * (realPfandArticle.sale_price || 0)),
            product_custom_field_1: realPfandArticle.product_custom_field_1
          });
        }
      }
    });
    
    console.log(`🔍 [REVIEW] PFAND-Artikel für Payload vorbereitet: ${pfandItemsForPayload.length}`);
    console.log(`🔍 [REVIEW] Normale Artikel: ${this.items.length}`);
    console.log(`🔍 [REVIEW] Gesamtartikel im Payload: ${this.items.length + pfandItemsForPayload.length}`);
    
    // Bestellung direkt von der Review-Seite abschicken
    this.isSubmitting = true;
    
    // Bestellung an den API-Endpoint senden - nur customer_number verfügbar
    const orderData = {
      // Nur die verfügbare customer_number senden
      customer_number: this.customer?.customer_number || this.customer?.customer_id,
      
      // Bestellungsdaten
      status: 'open',
      customer_notes: '',
      shipping_address: '',
      fulfillment_type: 'delivery',
      total_price: this.total,
      delivery_date: new Date().toISOString().split('T')[0]
    };

    const completeOrder = {
      orderData: orderData,
      orderItems: [
        // Normale Artikel
        ...this.items.map(item => {
          console.log(`🔍 [PAYLOAD] Normaler Artikel ${item.article_text}: product_database_id=${item.product_database_id}`);
          
          // Für normale Artikel: Verwende sale_price falls verfügbar, sonst unit_price_net
          const salePrice = item.sale_price || item.unit_price_net || 0;
          console.log(`💰 [PAYLOAD] Normaler Artikel ${item.article_text}: sale_price=${item.sale_price}€, unit_price_net=${item.unit_price_net}€, final=${salePrice}€`);
          
          return {
            article_number: item.article_number || item.product_id,
            quantity: item.quantity,
            sale_price: salePrice,
            description: item.article_text,
            article_text: item.article_text,
            unit_price_net: item.unit_price_net || 0,
            different_price: item.unit_price_net || 0,
            id: item.product_database_id,
            total_price: (item.quantity * salePrice),
            product_custom_field_1: item.product_custom_field_1
          };
        }),
        // PFAND-Artikel (nur im Payload, nicht visuell)
        ...pfandItemsForPayload
      ]
    };

    // 🔍 PAYLOAD LOGGING - Bestellung wird abgesendet
    console.log('🚀 [REVIEW] Bestellung wird abgesendet:');
    console.log('📋 [REVIEW] Vollständiges Order-Payload:', JSON.stringify(completeOrder, null, 2));
    console.log('💰 [REVIEW] Gesamtpreis:', this.total);
    console.log('📦 [REVIEW] Anzahl Artikel:', this.items.length);
    console.log('👤 [REVIEW] Kunde:', completeOrder.orderData.customer_number);
    console.log('📅 [REVIEW] Lieferdatum:', completeOrder.orderData.delivery_date);
    console.log('📍 [REVIEW] Lieferart:', completeOrder.orderData.fulfillment_type);
    console.log('🏠 [REVIEW] Lieferadresse:', orderData.shipping_address);
    console.log('📝 [REVIEW] Anmerkungen:', orderData.customer_notes);
    console.log('🌐 [REVIEW] Endpoint:', 'https://multi-mandant-ecommerce.onrender.com/api/orders/without-auth');
    
    // Zusätzliches Logging für PFAND-Artikel
    console.log('🔍 [REVIEW] PFAND-Artikel im Payload:', pfandItemsForPayload.map((item: any) => ({
      name: item.article_text,
      quantity: item.quantity,
      unit_price_net: item.unit_price_net || 0,
      sale_price: item.sale_price || 'Nicht gesetzt',
      total_price: (item.quantity * (item.sale_price || item.unit_price_net || 0))
    })));
    
    fetch('https://multi-mandant-ecommerce.onrender.com/api/orders/without-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completeOrder)
    })
    .then(response => response.json())
    .then(data => {
      console.log('✅ Bestellung erfolgreich abgesendet:', data);
      this.isSubmitting = false;
      
      // Alle localStorage-Einträge für diesen Kunden löschen
      this.clearAllLocalStorage();
      
      // Erfolgreich - zur Startseite weiterleiten
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 1000);
    })
    .catch(error => {
      console.error('❌ Fehler beim Absenden der Bestellung:', error);
      this.isSubmitting = false;
      alert('Fehler beim Absenden der Bestellung. Bitte versuchen Sie es erneut.');
    });
  }

  // Neue Methode: PFAND-Artikel automatisch zur Bestellung hinzufügen
  addPfandArticlesToOrder() {
    console.log('🔄 [REVIEW] Starte PFAND-Artikel Logik...');
    console.log('📋 [REVIEW] Aktuelle Artikel vor PFAND-Logik:', this.items);
    
    // Lade alle verfügbaren PFAND-Artikel vom api/products Endpoint
    this.loadPfandArticles().then(pfandArticles => {
      console.log('📦 [REVIEW] Verfügbare PFAND-Artikel geladen:', pfandArticles);
      
      // Entferne vorhandene PFAND-Artikel, um Duplikate zu vermeiden
      const baseItems = this.items.filter(i => !i.is_pfand);
      
      // Erstelle eine neue Liste für die finale Bestellung
      const finalItems: any[] = [];
      
      // Durchlaufe alle Basisartikel
      baseItems.forEach((artikel) => {
        // Füge den Hauptartikel hinzu
        finalItems.push(artikel);
        
        // Prüfe, ob der Artikel ein product_custom_field_1 hat (PFAND-Referenz)
        if (artikel.product_custom_field_1) {
          console.log(`🔍 [REVIEW] Artikel ${artikel.article_text} hat PFAND-Referenz: ${artikel.product_custom_field_1}`);
          
          // Suche nach dem echten PFAND-Artikel in den geladenen PFAND-Artikeln
          const realPfandArticle = pfandArticles.find(pfand => 
            pfand.article_number === artikel.product_custom_field_1 || 
            pfand.product_id === artikel.product_custom_field_1
          );
          
          if (realPfandArticle) {
            console.log(`✅ [REVIEW] PFAND-Artikel gefunden: ${realPfandArticle.article_text}`);
            
            // Erstelle einen PFAND-Artikel mit dem gleichen Schema wie in orderItems
            const pfandItem = {
              // Basis-Felder (wie im localStorage)
              product_id: realPfandArticle.article_number || realPfandArticle.product_id,
              article_number: realPfandArticle.article_number || realPfandArticle.product_id,
              article_text: realPfandArticle.article_text,
              unit_price_net: realPfandArticle.unit_price_net || 0,
              main_image_url: realPfandArticle.main_image_url,
              product_custom_field_1: realPfandArticle.product_custom_field_1,
              isCustom: false,
              is_pfand: true,
              
              // Menge und Referenz - WICHTIG: Gleiche Menge wie der Hauptartikel
              quantity: artikel.quantity,
              tempQuantity: artikel.quantity,
              parent_article_number: artikel.article_number || artikel.product_id,
              
              // Zusätzliche Felder für Kompatibilität
              sale_price: realPfandArticle.sale_price,
              
              // Alle Felder die in orderItems benötigt werden
              category: realPfandArticle.category,
              created_at: realPfandArticle.created_at,
              customer_id: artikel.customer_id,
              id: realPfandArticle.id || realPfandArticle.product_id,
              invoice_date: realPfandArticle.invoice_date,
              invoice_id: realPfandArticle.invoice_id,
              product_category: realPfandArticle.product_category,
              product_database_id: realPfandArticle.id || realPfandArticle.product_id,
              product_name: realPfandArticle.article_text,
              unit_price_gross: realPfandArticle.unit_price_gross || realPfandArticle.unit_price_net || 0,
              vat_percentage: realPfandArticle.vat_percentage,
              updated_at: realPfandArticle.updated_at
            };
            
            // Füge den PFAND-Artikel direkt nach dem Hauptartikel hinzu
            finalItems.push(pfandItem);
            console.log(`➕ [REVIEW] PFAND-Artikel hinzugefügt: ${pfandItem.article_text}, Menge: ${pfandItem.quantity}, Preis: ${pfandItem.unit_price_net}€`);
            console.log(`💰 [REVIEW] PFAND-Artikel sale_price: ${pfandItem.sale_price}€ (von API: ${realPfandArticle.sale_price}€)`);
          } else {
            console.log(`❌ [REVIEW] Kein PFAND-Artikel gefunden für Referenz: ${artikel.product_custom_field_1}`);
          }
        } else {
          console.log(`ℹ️ [REVIEW] Artikel ${artikel.article_text} hat keine PFAND-Referenz`);
        }
      });
      
      // Setze die finale Liste
      this.items = finalItems;
      
      console.log(`🎯 [REVIEW] PFAND-Logik abgeschlossen. ${finalItems.length - baseItems.length} PFAND-Artikel hinzugefügt.`);
      console.log(`📋 [REVIEW] Finale Artikel-Liste:`, this.items);
      
      // Aktualisiere den Gesamtpreis
      this.updateTotal();
      
      // Manuell Change Detection triggern
      this.cdr.detectChanges();
    });
  }

  // Neue Methode: PFAND-Artikel synchron hinzufügen
  async addPfandArticlesToOrderSync() {
    console.log('🔄 [REVIEW] Starte PFAND-Artikel Logik (Sync)...');
    console.log('📋 [REVIEW] Aktuelle Artikel vor PFAND-Logik:', this.items);
    
    try {
      // Lade alle verfügbaren PFAND-Artikel vom api/products Endpoint
      const pfandArticles = await this.loadPfandArticles();
      console.log('📦 [REVIEW] Verfügbare PFAND-Artikel geladen:', pfandArticles);
      
      // Entferne vorhandene PFAND-Artikel, um Duplikate zu vermeiden
      const baseItems = this.items.filter(i => !i.is_pfand);
      
      // Erstelle eine neue Liste für die finale Bestellung
      const finalItems: any[] = [];
      
      // Durchlaufe alle Basisartikel
      baseItems.forEach((artikel) => {
        // Füge den Hauptartikel hinzu
        finalItems.push(artikel);
        
        // Prüfe, ob der Artikel ein product_custom_field_1 hat (PFAND-Referenz)
        if (artikel.product_custom_field_1) {
          console.log(`🔍 [REVIEW] Artikel ${artikel.article_text} hat PFAND-Referenz: ${artikel.product_custom_field_1}`);
          
          // Suche nach dem echten PFAND-Artikel in den geladenen PFAND-Artikeln
          const realPfandArticle = pfandArticles.find(pfand => 
            pfand.article_number === artikel.product_custom_field_1 || 
            pfand.product_id === artikel.product_custom_field_1
          );
          
          if (realPfandArticle) {
            console.log(`✅ [REVIEW] PFAND-Artikel gefunden: ${realPfandArticle.article_text}`);
            
            // Erstelle einen PFAND-Artikel mit dem gleichen Schema wie in orderItems
            const pfandItem = {
              // Basis-Felder (wie im localStorage)
              product_id: realPfandArticle.article_number || realPfandArticle.product_id,
              article_number: realPfandArticle.article_number || realPfandArticle.product_id,
              article_text: realPfandArticle.article_text,
              unit_price_net: realPfandArticle.unit_price_net || 0,
              main_image_url: realPfandArticle.main_image_url,
              product_custom_field_1: realPfandArticle.product_custom_field_1,
              isCustom: false,
              is_pfand: true,
              
              // Menge und Referenz - WICHTIG: Gleiche Menge wie der Hauptartikel
              quantity: artikel.quantity,
              tempQuantity: artikel.quantity,
              parent_article_number: artikel.article_number || artikel.product_id,
              
              // Zusätzliche Felder für Kompatibilität
              sale_price: realPfandArticle.sale_price,
              
              // Alle Felder die in orderItems benötigt werden
              category: realPfandArticle.category,
              created_at: realPfandArticle.created_at,
              customer_id: artikel.customer_id,
              id: realPfandArticle.id || realPfandArticle.product_id,
              invoice_date: realPfandArticle.invoice_date,
              invoice_id: realPfandArticle.invoice_id,
              product_category: realPfandArticle.product_category,
              product_database_id: realPfandArticle.id || realPfandArticle.product_id,
              product_name: realPfandArticle.article_text,
              unit_price_gross: realPfandArticle.unit_price_gross || realPfandArticle.unit_price_net || 0,
              vat_percentage: realPfandArticle.vat_percentage,
              updated_at: realPfandArticle.updated_at
            };
            
            // Füge den PFAND-Artikel direkt nach dem Hauptartikel hinzu
            finalItems.push(pfandItem);
            console.log(`➕ [REVIEW] PFAND-Artikel hinzugefügt: ${pfandItem.article_text}, Menge: ${pfandItem.quantity}, Preis: ${pfandItem.unit_price_net}€`);
            console.log(`💰 [REVIEW] PFAND-Artikel sale_price: ${pfandItem.sale_price}€ (von API: ${realPfandArticle.sale_price}€)`);
          } else {
            console.log(`❌ [REVIEW] Kein PFAND-Artikel gefunden für Referenz: ${artikel.product_custom_field_1}`);
          }
        } else {
          console.log(`ℹ️ [REVIEW] Artikel ${artikel.article_text} hat keine PFAND-Referenz`);
        }
      });
      
      // Setze die finale Liste
      this.items = finalItems;
      
      console.log(`🎯 [REVIEW] PFAND-Logik abgeschlossen. ${finalItems.length - baseItems.length} PFAND-Artikel hinzugefügt.`);
      console.log(`📋 [REVIEW] Finale Artikel-Liste:`, this.items);
      
      // Aktualisiere den Gesamtpreis
      this.updateTotal();
      
      // Manuell Change Detection triggern
      this.cdr.detectChanges();
      
    } catch (error) {
      console.error('❌ [REVIEW] Fehler in der PFAND-Logik:', error);
      // Bei Fehler trotzdem fortfahren mit den ursprünglichen Artikeln
    }
  }

  // Neue Methode: Aktualisiere einen Artikel direkt im localStorage
  private updateItemInLocalStorage(item: any): void {
    try {
      const customerNumber = this.customer?.customer_number || this.customer?.customer_id;
      if (!customerNumber) return;
      
      const storageKey = `customer_order_${customerNumber}`;
      const storedRaw = localStorage.getItem(storageKey);
      if (!storedRaw) return;
      
      let stored = JSON.parse(storedRaw);
      if (!stored || !stored.items) return;
      
      // Aktualisiere den Artikel im localStorage
      const itemKey = String(item.article_number || item.product_id);
      if (stored.items[itemKey]) {
        stored.items[itemKey].tempQuantity = item.quantity;
        console.log(`🔄 Artikel ${itemKey} im localStorage aktualisiert - neue Menge: ${item.quantity}`);
        
        // Aktualisiere den localStorage
        localStorage.setItem(storageKey, JSON.stringify(stored));
      }
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren des Artikels im localStorage:', error);
    }
  }

  // Neue Methode: Entferne einen Artikel direkt aus dem localStorage
  private removeItemFromLocalStorage(item: any): void {
    try {
      const customerNumber = this.customer?.customer_number || this.customer?.customer_id;
      if (!customerNumber) return;
      
      const storageKey = `customer_order_${customerNumber}`;
      const storedRaw = localStorage.getItem(storageKey);
      if (!storedRaw) return;
      
      let stored = JSON.parse(storedRaw);
      if (!stored || !stored.items) return;
      
      // Entferne den Artikel aus dem localStorage
      const itemKey = String(item.article_number || item.product_id);
      if (stored.items[itemKey]) {
        delete stored.items[itemKey];
        console.log(`🗑️ Artikel ${itemKey} aus localStorage entfernt`);
        
        // Aktualisiere den localStorage
        localStorage.setItem(storageKey, JSON.stringify(stored));
      }
    } catch (error) {
      console.error('❌ Fehler beim Entfernen des Artikels aus localStorage:', error);
    }
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
      
      // Stelle sicher, dass sale_price für alle PFAND-Artikel verfügbar ist
      const pfandArticlesWithSalePrice = pfandArticles.map((pfand: any) => ({
        ...pfand,
        sale_price: pfand.sale_price
      }));
      
      console.log(`📦 [PUBLIC-PFAND-LOGIC] ${pfandArticlesWithSalePrice.length} PFAND-Artikel gefunden:`, pfandArticlesWithSalePrice);
      console.log(`💰 [PUBLIC-PFAND-LOGIC] PFAND-Artikel mit sale_price:`, pfandArticlesWithSalePrice.map((p: any) => ({
        article_text: p.article_text,
        sale_price: p.sale_price,
        unit_price_net: p.unit_price_net,
        raw_data: p
      })));
      
      return pfandArticlesWithSalePrice;
    } catch (error) {
      console.error('❌ [PUBLIC-PFAND-LOGIC] Fehler beim Laden der PFAND-Artikel:', error);
      return [];
    }
  }

  // Neue Methode: Detailliertes PFAND-Verknüpfungs-Logging
  private logPfandVerknuepfungen(items: any[], pfandArticles: any[]): void {
    console.log('\n🔍 [PUBLIC-REVIEW] === PFAND-VERKNÜPFUNGS-ANALYSE START ===');
    
    const baseItems = items.filter(i => !i.is_pfand);
    console.log(`📦 [PUBLIC-REVIEW] Analysiere ${baseItems.length} Basisartikel auf PFAND-Verknüpfungen...`);
    
    baseItems.forEach((artikel, index) => {
      console.log(`\n🔍 [PUBLIC-REVIEW] === PFAND-SUCHE FÜR ARTIKEL ${index + 1} ===`);
      console.log(`📦 Artikel: ${artikel.article_text}`);
      console.log(`🔢 Artikel-Nr.: ${artikel.article_number || artikel.product_id}`);
      console.log(`🔗 PFAND-Referenz: ${artikel.product_custom_field_1 || 'KEINE'}`);
      
      if (artikel.product_custom_field_1) {
        // Suche nach dem passenden PFAND-Artikel
        const realPfandArticle = pfandArticles.find(pfand => 
          pfand.article_number === artikel.product_custom_field_1 || 
          pfand.product_id === artikel.product_custom_field_1
        );
        
        if (realPfandArticle) {
          console.log(`✅ [REVIEW] PFAND-Artikel GEFUNDEN!`);
          console.log(`📋 PFAND-Name: ${realPfandArticle.article_text}`);
          console.log(`🔢 PFAND-Artikel-Nr.: ${realPfandArticle.article_number || realPfandArticle.product_id}`);
          console.log(`💰 PFAND-Preis (sale_price): ${realPfandArticle.sale_price || 'Nicht gesetzt'}€`);
          console.log(`💰 PFAND-Preis (unit_price_net): ${realPfandArticle.unit_price_net || 'Nicht gesetzt'}€`);
          console.log(`🔗 Verknüpfung erfolgreich: ${artikel.article_text} → ${realPfandArticle.article_text}`);
          console.log(`🔍 [REVIEW] === PFAND-SUCHE ERFOLGREICH ===`);
        } else {
          console.log(`❌ [REVIEW] PFAND-Artikel NICHT GEFUNDEN!`);
          console.log(`⚠️ Verknüpfung fehlgeschlagen für Referenz: ${artikel.product_custom_field_1}`);
          console.log(`🔍 Verfügbare PFAND-Artikel zur Fehlersuche:`, pfandArticles.map((p: any) => ({
            article_number: p.article_number,
            product_id: p.product_id,
            article_text: p.article_text
          })));
          console.log(`🔍 [REVIEW] === PFAND-SUCHE FEHLGESCHLAGEN ===`);
        }
      } else {
        console.log(`ℹ️ Keine PFAND-Referenz vorhanden`);
        console.log(`📋 Keine PFAND-Verknüpfung erforderlich`);
      }
    });
    
    console.log('\n🔍 [PUBLIC-REVIEW] === PFAND-VERKNÜPFUNGS-ANALYSE ENDE ===');
  }
}


