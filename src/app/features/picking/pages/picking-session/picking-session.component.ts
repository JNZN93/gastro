import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatRippleModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { TextFieldModule } from '@angular/cdk/text-field';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { OrderService } from '../../../../order.service';
import { GlobalService } from '../../../../global.service';
import { ArtikelDataService } from '../../../../artikel-data.service';
import { ArticleSearchService } from '../../../../services/article-search.service';
import { PickingStateService } from '../../services/picking-state.service';
import { PickingPdfService } from '../../services/picking-pdf.service';
import { formatPickingDate } from '../../utils/picking-date.util';
import {
  PickItemState,
  PickingOrder,
  PickingOrderItem,
  PickingProgress,
  PickingState,
  PickingSyncItem,
  ScanResultFeedback,
} from '../../models/picking.models';

interface CatalogArticle {
  id: number;
  article_number: string;
  article_text: string;
  sale_price?: string | number;
  category?: string;
  custom_field_1?: string;
}

interface CustomerSummary {
  customer_number?: string;
  last_name_company?: string;
  first_name?: string;
}

interface PfandProduct {
  id: number;
  article_number: string;
  article_text: string;
  sale_price?: string | number;
  category: string;
}

@Component({
  selector: 'app-picking-session',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatCheckboxModule,
    TextFieldModule,
  ],
  templateUrl: './picking-session.component.html',
  styleUrl: './picking-session.component.scss',
})
export class PickingSessionComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stickyBar') stickyBar?: ElementRef<HTMLElement>;

  orderId = 0;
  bundleOrderIds: number[] = [];
  isBundle = false;
  bundleOrders: PickingOrder[] = [];
  order: PickingOrder | null = null;
  stateItems: PickItemState[] = [];
  progress: PickingProgress = { done: 0, total: 0, percent: 0 };
  stickyBarHeight = 120;
  private originalItems: PickingOrderItem[] = [];
  private originalItemsByOrder = new Map<number, PickingOrderItem[]>();

  isLoading = true;
  isSaving = false;
  isReadOnlySession = false;
  errorMessage = '';
  scanFeedback: ScanResultFeedback | null = null;

  showItemModal = false;
  showStartWarning = false;
  showPrintModal = false;
  showCompleteModal = false;
  showReopenModal = false;
  showAbortModal = false;
  selectedItem: PickItemState | null = null;
  modalPickedQuantity = 0;
  modalNote = '';
  modalUnavailable = false;
  modalLater = false;
  private resumedFromPartial = false;
  modalReplacementSearch = '';
  modalReplacementResults: CatalogArticle[] = [];
  showReplacementSearchDropdown = false;
  modalReplacementArticleNumber = '';
  modalReplacementArticleName = '';
  modalAddPfand = false;
  modalPfandSearch = '';
  modalPfandResults: PfandProduct[] = [];
  modalSelectedPfand: PfandProduct | null = null;
  showModalCalculator = false;
  calcDisplay = '0';
  private calcHasResult = false;
  articleSearchTerm = '';
  articleSearchResults: CatalogArticle[] = [];
  showArticleSearchDropdown = false;
  addArticleQuantity = 1;
  selectedArticleToAdd: CatalogArticle | null = null;
  searchableArtikels: CatalogArticle[] = [];
  modalProductName = '';

  private customerNameByNumber = new Map<string, string>();
  private productById = new Map<number, CatalogArticle>();
  private productByArticleNumber = new Map<string, CatalogArticle>();

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private stickyResizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly orderService: OrderService,
    private readonly globalService: GlobalService,
    private readonly artikelData: ArtikelDataService,
    private readonly articleSearch: ArticleSearchService,
    private readonly pickingState: PickingStateService,
    private readonly pickingPdf: PickingPdfService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const first = Number(params.get('firstId'));
      const second = Number(params.get('secondId'));
      if (first && second) {
        if (first === second) {
          this.router.navigate(['/picking', first]);
          return;
        }
        const low = Math.min(first, second);
        const high = Math.max(first, second);
        if (first !== low || second !== high) {
          this.router.navigate(['/picking/combined', low, high], { replaceUrl: true });
          return;
        }
        this.bundleOrderIds = [low, high];
        this.orderId = low;
        this.isBundle = true;
        this.loadSession();
        return;
      }

      const id = Number(params.get('orderId'));
      if (!id) {
        this.router.navigate(['/picking']);
        return;
      }
      this.bundleOrderIds = [];
      this.isBundle = false;
      this.bundleOrders = [];
      this.orderId = id;
      this.loadSession();
    });
  }

  private get sessionOrders(): PickingOrder[] {
    return this.isBundle && this.bundleOrders.length ? this.bundleOrders : this.order ? [this.order] : [];
  }

  ngAfterViewInit(): void {
    this.observeStickyBar();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    this.stickyResizeObserver?.disconnect();
    this.stickyResizeObserver = null;
  }

  private observeStickyBar(): void {
    const el = this.stickyBar?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.stickyResizeObserver?.disconnect();
    this.stickyResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const height =
        entry.borderBoxSize?.[0]?.blockSize ??
        entry.contentRect.height;
      this.ngZone.run(() => {
        this.stickyBarHeight = Math.ceil(height);
      });
    });
    this.stickyResizeObserver.observe(el);
  }

  async loadSession(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      });

      await this.loadCustomerNames(headers);

      const response = await lastValueFrom(
        this.http.get<{ orders: PickingOrder[] }>(`${environment.apiUrl}/api/orders/all-orders`, {
          headers,
        })
      );

      if (this.isBundle) {
        const bundled = this.bundleOrderIds.map(
          (id) => (response?.orders ?? []).find((entry) => entry.order_id === id) ?? null
        );
        await this.finishBundleLoad(bundled);
        return;
      }

      const order = (response?.orders ?? []).find((entry) => entry.order_id === this.orderId) ?? null;
      if (!order) {
        this.errorMessage = 'Bestellung nicht gefunden oder nicht mehr kommissionierbar.';
        this.order = null;
        return;
      }

      const states = await this.pickingState.getAllStates();
      const liveBundle = this.pickingState.findBundleState(states, order.order_id);
      if (liveBundle?.bundleOrderIds && liveBundle.bundleOrderIds.length > 1) {
        const [first, second] = [...liveBundle.bundleOrderIds].sort((a, b) => a - b);
        await this.router.navigate(['/picking/combined', first, second]);
        return;
      }

      this.resumedFromPartial = order.status === 'partially_picked';

      if (order.status === 'picked' || order.status === 'completed') {
        this.isReadOnlySession = true;
        this.order = order;
        await this.loadProductCatalog();
        this.stateItems = this.createReadOnlyStateItems(order);
        this.enrichStateItemsWithProductMetadata();
        this.refreshProgress();
        return;
      }

      this.isReadOnlySession = false;

      if (order.status !== 'released' && order.status !== 'picking' && order.status !== 'partially_picked') {
        this.errorMessage = 'Diese Bestellung ist nicht zur Kommissionierung freigegeben.';
        this.order = order;
        return;
      }

      if (
        order.status === 'picking' &&
        order.picker_user_id &&
        this.globalService.getUserId() &&
        Number(order.picker_user_id) !== Number(this.globalService.getUserId())
      ) {
        this.errorMessage = `Diese Bestellung wird gerade von ${order.picker_user_name || 'jemand anderem'} kommissioniert.`;
        this.order = order;
        return;
      }

      if (!order.items?.length) {
        this.errorMessage = 'Diese Bestellung enthält keine Positionen.';
        this.order = order;
        return;
      }

      this.order = order;
      await this.loadProductCatalog();
      await this.ensurePickingState(order);
      this.enrichStateItemsWithProductMetadata();
      this.refreshProgress();
    } catch {
      this.errorMessage = 'Bestellung konnte nicht geladen werden.';
    } finally {
      this.isLoading = false;
    }
  }

  private createReadOnlyStateItems(order: PickingOrder): PickItemState[] {
    return this.pickingState.createStateFromOrder(order, this.getStartedBy(), true).items;
  }

  private async finishBundleLoad(bundled: (PickingOrder | null)[]): Promise<void> {
    if (bundled.some((entry) => !entry)) {
      this.errorMessage = 'Eine der Bestellungen wurde nicht gefunden.';
      this.order = null;
      this.bundleOrders = [];
      return;
    }

    const orders = bundled as PickingOrder[];
    const customerNumbers = new Set(
      orders.map((entry) => (entry.customer_number || '').trim()).filter(Boolean)
    );
    if (customerNumbers.size !== 1) {
      this.errorMessage = 'Nur Bestellungen desselben Kunden können zusammen kommissioniert werden.';
      this.order = orders[0];
      this.bundleOrders = orders;
      return;
    }

    const blocked = orders.find(
      (entry) => !['released', 'picking', 'partially_picked', 'picked', 'completed'].includes(entry.status)
    );
    if (blocked) {
      this.errorMessage = `Bestellung #${blocked.order_id} ist nicht zur Kommissionierung freigegeben.`;
      this.order = orders[0];
      this.bundleOrders = orders;
      return;
    }

    const finished = orders.filter(
      (entry) => entry.status === 'picked' || entry.status === 'completed'
    );
    if (finished.length === orders.length) {
      this.errorMessage = 'Beide Bestellungen sind bereits fertig kommissioniert.';
      this.order = orders[0];
      this.bundleOrders = orders;
      return;
    }

    const userId = this.globalService.getUserId();
    const locked = orders.find(
      (entry) =>
        entry.status === 'picking' &&
        entry.picker_user_id &&
        userId &&
        Number(entry.picker_user_id) !== Number(userId)
    );
    if (locked) {
      this.errorMessage = `Bestellung #${locked.order_id} wird gerade von ${locked.picker_user_name || 'jemand anderem'} kommissioniert.`;
      this.order = orders[0];
      this.bundleOrders = orders;
      return;
    }

    const empty = orders.find((entry) => !entry.items?.length);
    if (empty) {
      this.errorMessage = `Bestellung #${empty.order_id} enthält keine Positionen.`;
      this.order = orders[0];
      this.bundleOrders = orders;
      return;
    }

    this.bundleOrders = orders;
    this.order = orders[0];
    this.isReadOnlySession = false;
    await this.loadProductCatalog();
    await this.ensureBundleState(orders);
    this.enrichStateItemsWithProductMetadata();
    this.refreshDisplayOrder();
    this.refreshProgress();
  }

  private async ensureBundleState(orders: PickingOrder[]): Promise<void> {
    const anchorId = orders[0].order_id;
    const existing = await this.pickingState.getState(anchorId);
    const validExisting =
      existing?.bundleOrderIds?.length === orders.length &&
      orders.every((entry) => existing.bundleOrderIds?.includes(entry.order_id)) &&
      this.pickingState.isBundleFingerprintValid(existing, orders)
        ? existing
        : null;

    if (existing && !validExisting) {
      await this.pickingState.deleteRelatedStates(orders.map((entry) => entry.order_id));
    }

    if (validExisting) {
      this.stateItems = validExisting.items;
      this.captureOriginalItems(orders[0], validExisting);
      if (orders.some((entry) => entry.status === 'released' || entry.status === 'partially_picked')) {
        await this.startPicking(true, true);
      }
      return;
    }

    if (orders.some((entry) => entry.status === 'picking')) {
      this.showStartWarning = true;
      const state = this.pickingState.createBundleState(orders, this.getStartedBy(), false);
      this.stateItems = state.items;
      this.captureOriginalItems(orders[0], state);
      return;
    }

    await this.startPicking(true, false);
  }

  openReopenModal(): void {
    if (!this.order || !this.isReadOnlySession || this.isSaving) {
      return;
    }
    this.showReopenModal = true;
  }

  closeReopenModal(): void {
    this.showReopenModal = false;
  }

  private getApiErrorMessage(error: any, fallback: string): string {
    const body = error?.error;
    if (typeof body === 'string' && body.trim()) {
      if (body.includes('Cannot PUT') || body.includes('Cannot GET')) {
        return 'Server-Endpunkt nicht verfügbar. Bitte Backend neu starten.';
      }
      return body.trim();
    }
    if (body?.error) {
      return body.error;
    }
    if (error?.status === 404) {
      return 'Funktion nicht verfügbar. Bitte Backend neu starten.';
    }
    if (error?.status === 0) {
      return 'Verbindung zum Server fehlgeschlagen.';
    }
    if (error?.message) {
      return error.message;
    }
    return fallback;
  }

  async confirmReopenPicking(): Promise<void> {
    if (!this.order || !this.isReadOnlySession) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.isSaving = true;

    try {
      await lastValueFrom(
        this.orderService.reopenPicking(this.order.order_id, token, {
          picker_user_name: this.getStartedBy(),
        })
      );

      const state = this.pickingState.createStateFromOrder(this.order, this.getStartedBy(), true);
      this.stateItems = state.items;
      this.captureOriginalItems(this.order, state);
      this.order.status = 'picking';
      this.order.picker_user_name = this.getStartedBy();
      this.order.picker_user_id = this.globalService.getUserId();
      this.isReadOnlySession = false;

      await this.loadProductCatalog();
      this.enrichStateItemsWithProductMetadata();
      await this.pickingState.saveState({
        ...state,
        items: this.stateItems,
      });
      this.refreshProgress();
      this.closeReopenModal();
      this.setFeedback('success', 'Bestellung kann erneut bearbeitet werden.');
    } catch (error: any) {
      this.setFeedback('error', this.getApiErrorMessage(error, 'Wiederöffnen fehlgeschlagen.'));
    } finally {
      this.isSaving = false;
    }
  }

  private async ensurePickingState(order: PickingOrder): Promise<void> {
    const existing = await this.pickingState.getState(order.order_id);

    if (existing && !this.pickingState.isFingerprintValid(existing, order)) {
      await this.pickingState.deleteState(order.order_id);
    }

    const validExisting =
      existing && this.pickingState.isFingerprintValid(existing, order) ? existing : null;

    if (validExisting) {
      this.stateItems = validExisting.items;
      this.captureOriginalItems(order, validExisting);
      if (order.status === 'released' || order.status === 'partially_picked') {
        await this.startPicking(true, true);
      }
      return;
    }

    if (order.status === 'picking') {
      this.showStartWarning = true;
      const state = this.pickingState.createInitialState(order, this.getStartedBy());
      this.stateItems = state.items;
      this.captureOriginalItems(order, state);
      return;
    }

    await this.startPicking(true, false);
  }

  async startPicking(updateRemoteStatus: boolean, preserveItems = false): Promise<void> {
    if (!this.order) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.isSaving = true;
    this.showStartWarning = false;

    try {
      if (updateRemoteStatus) {
        for (const current of this.sessionOrders) {
          if (current.status !== 'released' && current.status !== 'picking' && current.status !== 'partially_picked') {
            continue;
          }
          await lastValueFrom(
            this.orderService.updateOrderStatusOnly(current.order_id, 'picking', token, {
              picker_user_name: this.getStartedBy(),
            })
          );
          current.status = 'picking';
          current.picker_user_name = this.getStartedBy();
          current.picker_user_id = this.globalService.getUserId();
        }
      }

      if (!preserveItems) {
        const state = this.isBundle
          ? this.pickingState.createBundleState(this.bundleOrders, this.getStartedBy(), false)
          : this.pickingState.createInitialState(this.order, this.getStartedBy());
        if (this.isBundle) {
          await this.pickingState.deleteRelatedStates(this.bundleOrderIds);
        }
        this.stateItems = state.items;
        this.captureOriginalItems(this.order, state);
        this.enrichStateItemsWithProductMetadata();
        this.refreshDisplayOrder();
        await this.pickingState.saveState(this.toStoredState(state));
      } else {
        const existing = await this.pickingState.getState(this.order.order_id);
        this.captureOriginalItems(this.order, existing);
        await this.pickingState.saveState(this.toStoredState(existing));
      }

      this.setFeedback(
        'success',
        this.isBundle ? 'Gemeinsame Kommissionierung gestartet.' : 'Kommissionierung gestartet.'
      );
    } catch (error: any) {
      const message = error?.error?.error || 'Status konnte nicht gesetzt werden.';
      this.setFeedback('error', message);
      this.errorMessage = message;
    } finally {
      this.isSaving = false;
      this.refreshProgress();
    }
  }

  onItemRowClick(item: PickItemState): void {
    this.activateItem(item);
  }

  onItemCheckClick(event: Event, item: PickItemState): void {
    event.stopPropagation();
    this.activateItem(item);
  }

  onItemEditClick(event: Event, item: PickItemState): void {
    event.stopPropagation();
    if (this.isReadOnlySession || this.isItemLocked(item) || this.isSaving) {
      return;
    }
    this.openItemModal(item);
  }

  private activateItem(item: PickItemState): void {
    if (this.isReadOnlySession || this.isItemLocked(item) || this.isSaving) {
      return;
    }
    if (this.itemNeedsModal(item)) {
      this.openItemModal(item);
      return;
    }
    void this.toggleItemChecked(item);
  }

  private itemNeedsModal(item: PickItemState): boolean {
    if (item.status === 'partial' || item.status === 'unavailable' || item.status === 'later') {
      return true;
    }
    if (item.replacementArticleNumber) {
      return true;
    }
    if (item.pickedQuantity > 0 && item.pickedQuantity < item.targetQuantity) {
      return true;
    }
    const originalName = this.getOriginalProductName(item);
    return !!originalName && item.productName.trim() !== originalName.trim();
  }

  private getOriginalProductName(item: PickItemState): string {
    if (item.isAddedLine) {
      return '';
    }
    const originals = item.sourceOrderId
      ? (this.originalItemsByOrder.get(item.sourceOrderId) ?? [])
      : this.originalItems;
    if (item.originalIndex != null && originals[item.originalIndex]) {
      return originals[item.originalIndex].product_name || '';
    }
    const match = originals.find(
      (entry) =>
        entry.product_id === item.productId || entry.product_article_number === item.articleNumber
    );
    return match?.product_name || '';
  }

  private async toggleItemChecked(item: PickItemState): Promise<void> {
    const fullyPicked = item.status === 'picked' && item.pickedQuantity >= item.targetQuantity;
    if (fullyPicked) {
      item.pickedQuantity = 0;
      item.status = 'pending';
    } else {
      item.pickedQuantity = item.targetQuantity;
      if (item.status === 'unavailable') {
        item.status = 'pending';
      }
      item.status = this.pickingState.updateItemStatus(item);
    }

    this.isSaving = true;
    try {
      await this.persistState();
    } catch {
      this.setFeedback('error', 'Position konnte nicht gespeichert werden.');
    } finally {
      this.isSaving = false;
    }
  }

  openItemModal(item: PickItemState): void {
    if (this.isItemLocked(item)) {
      return;
    }
    this.selectedItem = item;
    this.modalProductName = item.productName;
    this.modalPickedQuantity = item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity;
    this.modalNote = item.note || '';
    this.modalUnavailable = item.status === 'unavailable';
    this.modalLater = item.status === 'later';
    this.modalReplacementSearch = '';
    this.modalReplacementResults = [];
    this.showReplacementSearchDropdown = false;
    this.modalReplacementArticleNumber = item.replacementArticleNumber || '';
    this.modalReplacementArticleName = item.replacementArticleName || '';
    this.modalPfandSearch = '';
    this.modalPfandResults = [];
    this.modalSelectedPfand = null;

    const existingPfand = this.findPfandLineForParent(item);
    const suggested = this.getSuggestedPfandForItem(item);
    if (existingPfand || item.pfandEnabled) {
      this.modalAddPfand = true;
      this.modalSelectedPfand = existingPfand
        ? this.toPfandProduct(existingPfand)
        : suggested;
    } else {
      this.modalAddPfand = false;
      if (suggested) {
        this.modalSelectedPfand = suggested;
      }
    }

    this.resetCalculator();
    this.showModalCalculator = false;
    this.showItemModal = true;
  }

  closeItemModal(): void {
    this.showItemModal = false;
    this.selectedItem = null;
    this.showModalCalculator = false;
    this.resetCalculator();
    this.modalReplacementSearch = '';
    this.modalReplacementResults = [];
    this.showReplacementSearchDropdown = false;
    this.modalReplacementArticleNumber = '';
    this.modalReplacementArticleName = '';
    this.modalProductName = '';
    this.modalAddPfand = false;
    this.modalPfandSearch = '';
    this.modalPfandResults = [];
    this.modalSelectedPfand = null;
    this.modalUnavailable = false;
    this.modalLater = false;
  }

  adjustModalQuantity(delta: number): void {
    if (this.modalUnavailable) {
      return;
    }
    this.modalPickedQuantity = this.roundToThreeDecimals(
      Math.max(0, Number(this.modalPickedQuantity || 0) + delta)
    );
  }

  toggleModalCalculator(): void {
    this.showModalCalculator = !this.showModalCalculator;
    if (this.showModalCalculator) {
      this.resetCalculator();
    }
  }

  resetCalculator(): void {
    this.calcDisplay = '0';
    this.calcHasResult = false;
  }

  calcPress(key: string): void {
    if (key === 'C') {
      this.resetCalculator();
      return;
    }

    if (key === 'back') {
      if (this.calcDisplay.length <= 1 || (this.calcDisplay.length === 2 && this.calcDisplay.startsWith('-'))) {
        this.calcDisplay = '0';
      } else {
        this.calcDisplay = this.calcDisplay.slice(0, -1);
      }
      this.calcHasResult = false;
      return;
    }

    if (key === '=') {
      this.calcEquals();
      return;
    }

    if (this.calcHasResult && /[\d.]/.test(key)) {
      this.calcDisplay = key === '.' ? '0.' : key;
      this.calcHasResult = false;
      return;
    }

    if (this.calcHasResult) {
      this.calcHasResult = false;
    }

    if (/[+\-*/]/.test(key)) {
      if (this.calcDisplay === '0' && key === '-') {
        this.calcDisplay = '-';
        return;
      }
      if (/[+\-*/]$/.test(this.calcDisplay)) {
        this.calcDisplay = this.calcDisplay.slice(0, -1) + key;
      } else {
        this.calcDisplay += key;
      }
      return;
    }

    if (key === '.') {
      const parts = this.calcDisplay.split(/[+\-*/]/);
      const current = parts[parts.length - 1] || '';
      if (current.includes('.')) {
        return;
      }
      this.calcDisplay = this.calcDisplay === '0' ? '0.' : `${this.calcDisplay}.`;
      return;
    }

    if (this.calcDisplay === '0') {
      this.calcDisplay = key;
    } else {
      this.calcDisplay += key;
    }
  }

  calcEquals(): void {
    const result = this.evaluateCalcExpression(this.calcDisplay);
    if (!Number.isFinite(result)) {
      this.calcDisplay = 'Fehler';
      this.calcHasResult = false;
      return;
    }
    this.calcDisplay = this.formatCalcValue(result);
    this.calcHasResult = true;
  }

  applyCalcToQuantity(): void {
    if (this.modalUnavailable) {
      return;
    }

    let value: number;
    if (this.calcDisplay === 'Fehler') {
      return;
    }
    if (this.calcHasResult || !/[+\-*/]/.test(this.calcDisplay)) {
      value = Number(this.calcDisplay);
    } else {
      value = this.evaluateCalcExpression(this.calcDisplay);
      if (!Number.isFinite(value)) {
        return;
      }
      this.calcDisplay = this.formatCalcValue(value);
      this.calcHasResult = true;
    }

    this.modalPickedQuantity = this.roundToThreeDecimals(Math.max(0, value));
  }

  private evaluateCalcExpression(expression: string): number {
    const sanitized = expression.replace(/\s/g, '');
    if (!sanitized || sanitized === '-' || !/^-?[\d.+\-*/()]+$/.test(sanitized)) {
      return NaN;
    }
    try {
      return Function(`"use strict"; return (${sanitized})`)() as number;
    } catch {
      return NaN;
    }
  }

  private formatCalcValue(value: number): string {
    const rounded = this.roundToThreeDecimals(value);
    return String(rounded);
  }

  private roundToThreeDecimals(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  async saveItemModal(): Promise<void> {
    if (!this.selectedItem) {
      return;
    }

    if (this.modalLater) {
      this.selectedItem.status = 'later';
      this.selectedItem.note = this.modalNote.trim() || undefined;
      this.selectedItem.pickedQuantity = 0;
    } else if (this.modalUnavailable) {
      this.selectedItem.status = 'unavailable';
      this.selectedItem.note = this.modalNote.trim() || 'Nicht verfügbar';
      this.selectedItem.pickedQuantity = 0;
    } else {
      this.selectedItem.pickedQuantity = this.roundToThreeDecimals(
        Math.max(0, Number(this.modalPickedQuantity) || 0)
      );
      this.selectedItem.note = this.modalNote.trim() || undefined;
      if (this.selectedItem.status === 'unavailable' || this.selectedItem.status === 'later') {
        this.selectedItem.status = 'pending';
      }
      this.selectedItem.status = this.pickingState.updateItemStatus(this.selectedItem);
    }

    this.selectedItem.replacementArticleNumber = this.modalReplacementArticleNumber || undefined;
    this.selectedItem.replacementArticleName = this.modalReplacementArticleName || undefined;

    const trimmedProductName = this.modalProductName.trim();
    if (trimmedProductName) {
      this.selectedItem.productName = trimmedProductName;
    }

    if (!this.modalUnavailable && !this.modalLater && this.modalAddPfand && !this.selectedItem.isPfandLine) {
      const pfandProduct =
        this.modalSelectedPfand || this.getSuggestedPfandForItem(this.selectedItem);
      if (pfandProduct) {
        const pfandQuantity =
          Math.max(0, Number(this.modalPickedQuantity) || 0) || this.selectedItem.targetQuantity;
        this.selectedItem.pfandEnabled = true;
        this.upsertPfandLine(this.selectedItem, pfandProduct, pfandQuantity);
      }
    } else if (
      !this.modalUnavailable &&
      !this.modalLater &&
      !this.modalAddPfand &&
      (this.selectedItem.pfandEnabled || this.findPfandLineForParent(this.selectedItem))
    ) {
      this.selectedItem.pfandEnabled = false;
      this.removePfandLine(this.selectedItem.key);
    }

    await this.persistState();
    this.closeItemModal();
  }

  onModalUnavailableChange(unavailable: boolean): void {
    this.modalUnavailable = unavailable;
    if (unavailable) {
      this.modalLater = false;
      this.modalPickedQuantity = 0;
      this.modalAddPfand = false;
      this.showModalCalculator = false;
      if (!this.modalNote.trim()) {
        this.modalNote = 'Nicht verfügbar';
      }
      return;
    }

    if (this.modalLater) {
      return;
    }

    if (this.selectedItem) {
      this.modalPickedQuantity = this.selectedItem.targetQuantity;
      if (this.selectedItem.pfandEnabled || this.findPfandLineForParent(this.selectedItem)) {
        this.modalAddPfand = true;
      }
    }
    if (this.modalNote.trim() === 'Nicht verfügbar') {
      this.modalNote = '';
    }
  }

  onModalLaterChange(later: boolean): void {
    this.modalLater = later;
    if (!later) {
      if (this.selectedItem && this.modalPickedQuantity <= 0) {
        this.modalPickedQuantity = this.selectedItem.targetQuantity;
      }
      return;
    }
    this.modalUnavailable = false;
    this.modalPickedQuantity = 0;
    this.modalAddPfand = false;
    this.showModalCalculator = false;
    if (this.modalNote.trim() === 'Nicht verfügbar') {
      this.modalNote = '';
    }
  }

  onItemLaterClick(event: Event, item: PickItemState): Promise<void> | void {
    event.stopPropagation();
    if (this.isReadOnlySession || this.isItemLocked(item) || this.isSaving) {
      return;
    }
    if (item.status === 'later') {
      item.status = 'pending';
      item.pickedQuantity = 0;
    } else {
      item.status = 'later';
      item.pickedQuantity = 0;
      item.note = item.note === 'Nicht verfügbar' ? undefined : item.note;
    }
    return this.persistItemChange();
  }

  private async persistItemChange(): Promise<void> {
    this.isSaving = true;
    try {
      await this.persistState();
    } catch {
      this.setFeedback('error', 'Position konnte nicht gespeichert werden.');
    } finally {
      this.isSaving = false;
    }
  }

  getSuggestedPfandForItem(item: PickItemState): PfandProduct | null {
    if (item.isPfandLine || item.category === 'PFAND') {
      return null;
    }

    const articleNumberForPfand = item.replacementArticleNumber || item.articleNumber;
    const product =
      this.productByArticleNumber.get(articleNumberForPfand) ||
      this.productById.get(item.productId);
    return product ? this.getSuggestedPfandForProduct(product) : null;
  }

  canShowPfandOption(): boolean {
    return !!(
      this.selectedItem &&
      !this.selectedItem.isPfandLine &&
      this.selectedItem.category !== 'PFAND' &&
      !this.modalUnavailable
    );
  }

  searchPfandArticles(): void {
    const query = this.modalPfandSearch.trim().toLowerCase();
    if (query.length < 1) {
      this.modalPfandResults = [];
      return;
    }

    this.modalPfandResults = this.globalService
      .getPfandArtikels()
      .filter(
        (pfand) =>
          (pfand.article_number || '').toLowerCase().includes(query) ||
          (pfand.article_text || '').toLowerCase().includes(query)
      )
      .slice(0, 12)
      .map((pfand) => this.toPfandProduct(pfand));
  }

  selectPfandArticle(pfand: PfandProduct): void {
    this.modalSelectedPfand = pfand;
    this.modalAddPfand = true;
    this.modalPfandSearch = `${pfand.article_number} - ${pfand.article_text}`;
    this.modalPfandResults = [];
  }

  clearSelectedPfand(): void {
    this.modalSelectedPfand = null;
    this.modalAddPfand = false;
    this.modalPfandSearch = '';
    this.modalPfandResults = [];
  }

  searchArticlesToAdd(): void {
    if (this.selectedArticleToAdd) {
      return;
    }
    this.articleSearch.filterArticles(this.searchableArtikels, this.articleSearchTerm).subscribe((state) => {
      this.articleSearchResults = state.results;
      this.showArticleSearchDropdown = state.showDropdown;
    });
  }

  selectArticleToAdd(article: CatalogArticle): void {
    this.selectedArticleToAdd = article;
    this.addArticleQuantity = 1;
    this.showArticleSearchDropdown = false;
    this.articleSearchResults = [];
    this.articleSearchTerm = `${article.article_number} - ${article.article_text}`;
  }

  clearSelectedArticleToAdd(): void {
    this.selectedArticleToAdd = null;
    this.articleSearchTerm = '';
    this.addArticleQuantity = 1;
    this.articleSearchResults = [];
    this.showArticleSearchDropdown = false;
  }

  async confirmAddArticleToOrder(): Promise<void> {
    if (!this.selectedArticleToAdd) {
      return;
    }
    await this.addArticleToOrder(this.selectedArticleToAdd);
  }

  async addArticleToOrder(article: CatalogArticle): Promise<void> {
    if (!this.order || this.showStartWarning || this.isSaving) {
      return;
    }

    const product = this.productByArticleNumber.get(article.article_number);
    if (!product?.id) {
      this.setFeedback('error', `Artikel ${article.article_number} nicht im Katalog gefunden.`);
      return;
    }

    const quantity = Math.max(0.001, Number(this.addArticleQuantity) || 1);
    const isSpecialCategory = product.category === 'PFAND' || product.category === 'SCHNELLVERKAUF';

    if (!isSpecialCategory) {
      const existing = this.stateItems.find(
        (item) =>
          item.articleNumber === article.article_number &&
          item.status !== 'unavailable' &&
          !item.isPfandLine &&
          !item.replacementArticleNumber
      );

      if (existing) {
        existing.targetQuantity = Math.round((existing.targetQuantity + quantity) * 1000) / 1000;
        existing.pickedQuantity = Math.min(
          Math.round((existing.pickedQuantity + quantity) * 1000) / 1000,
          existing.targetQuantity
        );
        existing.status = this.pickingState.updateItemStatus(existing);

        const suggestedPfand = this.getSuggestedPfandForProduct(product);
        if (suggestedPfand) {
          this.upsertPfandLine(existing, suggestedPfand, existing.targetQuantity);
        }

        await this.persistAfterAdd(article.article_text);
        return;
      }
    }

    const newItem: PickItemState = {
      key: `added:${product.id}:${Date.now()}`,
      productId: Number(product.id),
      articleNumber: product.article_number,
      productName: product.article_text,
      targetQuantity: quantity,
      pickedQuantity: quantity,
      status: 'picked',
      price: product.sale_price != null ? Number(product.sale_price) : 0,
      differentPrice: null,
      category: product.category,
      customField1: product.custom_field_1,
      isAddedLine: true,
      sourceOrderId: this.order.order_id,
    };
    newItem.status = this.pickingState.updateItemStatus(newItem);
    this.stateItems.push(newItem);
    this.refreshDisplayOrder();

    const suggestedPfand = this.getSuggestedPfandForProduct(product);
    if (suggestedPfand && product.category !== 'PFAND') {
      this.upsertPfandLine(newItem, suggestedPfand, quantity);
    }

    await this.persistAfterAdd(article.article_text);
  }

  private getSuggestedPfandForProduct(
    product: { custom_field_1?: string; category?: string }
  ): PfandProduct | null {
    if (!product.custom_field_1 || product.category === 'PFAND') {
      return null;
    }

    const matching = this.globalService
      .getPfandArtikels()
      .find((pfand) => pfand.article_number === product.custom_field_1);
    return matching ? this.toPfandProduct(matching) : null;
  }

  private async persistAfterAdd(articleLabel: string): Promise<void> {
    this.articleSearchTerm = '';
    this.articleSearchResults = [];
    this.showArticleSearchDropdown = false;
    this.selectedArticleToAdd = null;
    this.addArticleQuantity = 1;
    this.isSaving = true;

    try {
      await this.persistState();
      this.setFeedback('success', `${articleLabel} hinzugefügt.`);
    } catch (error: any) {
      this.setFeedback('error', error?.error?.error || 'Artikel konnte nicht gespeichert werden.');
    } finally {
      this.isSaving = false;
    }
  }

  private async loadProductCatalog(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      const products = await lastValueFrom(this.artikelData.getData());
      const list = Array.isArray(products) ? products : [];
      this.searchableArtikels = this.globalService.filterSchnellverkaufArticles(list);
      this.globalService.setPfandArtikels(list);
      this.productById.clear();
      this.productByArticleNumber.clear();
      for (const product of list) {
        if (product?.id != null) {
          this.productById.set(Number(product.id), product);
        }
        if (product?.article_number) {
          this.productByArticleNumber.set(product.article_number, product);
        }
      }
    } catch {
      // PFAND kann weiterhin manuell gesucht werden, falls Katalog fehlschlägt
    }
  }

  private enrichStateItemsWithProductMetadata(): void {
    for (const item of this.stateItems) {
      const product = this.productById.get(item.productId);
      if (!product) {
        continue;
      }
      item.category = product.category;
      item.customField1 = product.custom_field_1;
      if (product.category === 'PFAND') {
        item.isPfandLine = true;
      }
    }
    this.linkExistingPfandLines();
  }

  private canLinkPfandLine(parent: PickItemState, nextItem: PickItemState): boolean {
    if (
      parent.sourceOrderId &&
      nextItem.sourceOrderId &&
      parent.sourceOrderId !== nextItem.sourceOrderId
    ) {
      return false;
    }
    if (parent.originalIndex == null || nextItem.originalIndex == null) {
      return true;
    }
    return nextItem.originalIndex === parent.originalIndex + 1;
  }

  private linkExistingPfandLines(): void {
    this.pickingState.linkConsecutivePfand(this.stateItems);

    for (let index = 0; index < this.stateItems.length; index++) {
      const item = this.stateItems[index];
      if (item.isPfandLine || item.parentItemKey || item.originalIndex != null) {
        continue;
      }

      const customField1 = item.customField1 || this.productById.get(item.productId)?.custom_field_1;
      if (!customField1) {
        continue;
      }

      const nextItem = this.stateItems[index + 1];
      if (
        nextItem &&
        (nextItem.isPfandLine || nextItem.category === 'PFAND') &&
        nextItem.articleNumber === customField1 &&
        !nextItem.parentItemKey &&
        this.canLinkPfandLine(item, nextItem)
      ) {
        nextItem.parentItemKey = item.key;
        nextItem.isPfandLine = true;
        item.pfandEnabled = true;
      }
    }
  }

  private getPfandLineForParent(parentKey: string): PickItemState | null {
    const parent = this.stateItems.find((item) => item.key === parentKey);
    return parent ? this.findPfandLineForParent(parent) : null;
  }

  private findPfandLineForParent(parent: PickItemState): PickItemState | null {
    const byParentKey = this.stateItems.find(
      (item) =>
        item.isPfandLine &&
        item.parentItemKey === parent.key &&
        item.status !== 'unavailable'
    );
    if (byParentKey) {
      return byParentKey;
    }

    const parentIndex = this.stateItems.indexOf(parent);
    if (parentIndex < 0) {
      return null;
    }

    const pfandArticleNumber = this.getPfandArticleNumberForParent(parent);
    if (!pfandArticleNumber) {
      return null;
    }

    const adjacent = this.stateItems[parentIndex + 1];
    if (
      adjacent &&
      adjacent.status !== 'unavailable' &&
      adjacent.articleNumber === pfandArticleNumber &&
      (adjacent.isPfandLine || adjacent.category === 'PFAND') &&
      (!adjacent.parentItemKey || adjacent.parentItemKey === parent.key)
    ) {
      return adjacent;
    }

    return null;
  }

  private getPfandArticleNumberForParent(parent: PickItemState): string | null {
    const articleNumberForPfand = parent.replacementArticleNumber || parent.articleNumber;
    const product =
      this.productByArticleNumber.get(articleNumberForPfand) ||
      this.productById.get(parent.productId);
    return product?.custom_field_1 || parent.customField1 || null;
  }

  private ensurePfandLinesForSync(): void {
    for (const item of this.stateItems) {
      if (
        item.isPfandLine ||
        item.category === 'PFAND' ||
        item.status === 'unavailable' ||
        !item.pfandEnabled
      ) {
        continue;
      }

      const linkedPfand = this.stateItems.find(
        (line) => line.parentItemKey === item.key && (line.isPfandLine || line.category === 'PFAND')
      );
      if (linkedPfand?.status === 'unavailable') {
        continue;
      }

      const existingPfand = this.findPfandLineForParent(item);
      const pfandProduct = existingPfand
        ? this.toPfandProduct(existingPfand)
        : this.getSuggestedPfandForItem(item);
      if (!pfandProduct) {
        continue;
      }

      const quantity = item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity;
      this.upsertPfandLine(item, pfandProduct, quantity);
    }
  }

  private resolveProductId(item: PickItemState): number | null {
    if (Number.isFinite(item.productId) && item.productId > 0) {
      return item.productId;
    }

    const fromCatalog = this.productByArticleNumber.get(item.articleNumber);
    if (fromCatalog?.id != null && Number(fromCatalog.id) > 0) {
      return Number(fromCatalog.id);
    }

    return null;
  }

  private resolvePfandProductId(pfandProduct: PfandProduct): number | null {
    if (Number.isFinite(pfandProduct.id) && pfandProduct.id > 0) {
      return pfandProduct.id;
    }

    const fromCatalog = this.productByArticleNumber.get(pfandProduct.article_number);
    if (fromCatalog?.id != null && Number(fromCatalog.id) > 0) {
      return Number(fromCatalog.id);
    }

    return null;
  }

  private upsertPfandLine(parentItem: PickItemState, pfandProduct: PfandProduct, quantity: number): void {
    const resolvedProductId = this.resolvePfandProductId(pfandProduct);
    if (!resolvedProductId) {
      return;
    }

    parentItem.pfandEnabled = true;
    const existingPfand = this.findPfandLineForParent(parentItem);
    const existingIndex = existingPfand
      ? this.stateItems.findIndex((item) => item.key === existingPfand.key)
      : -1;
    const parentIndex = this.stateItems.findIndex((item) => item.key === parentItem.key);
    const effectiveQuantity = quantity > 0 ? quantity : parentItem.targetQuantity;

    const pfandState: PickItemState = {
      key:
        existingIndex >= 0
          ? this.stateItems[existingIndex].key
          : `pfand:${parentItem.key}:${resolvedProductId}`,
      productId: resolvedProductId,
      articleNumber: pfandProduct.article_number,
      productName: pfandProduct.article_text,
      targetQuantity: effectiveQuantity,
      pickedQuantity: effectiveQuantity,
      status: 'picked',
      price: pfandProduct.sale_price != null ? Number(pfandProduct.sale_price) : 0,
      differentPrice: null,
      category: 'PFAND',
      isPfandLine: true,
      parentItemKey: parentItem.key,
      sourceOrderId: parentItem.sourceOrderId,
    };

    pfandState.status = this.pickingState.updateItemStatus(pfandState);

    if (existingIndex >= 0) {
      this.stateItems[existingIndex] = {
        ...this.stateItems[existingIndex],
        ...pfandState,
      };
      return;
    }

    if (parentIndex >= 0) {
      this.stateItems.splice(parentIndex + 1, 0, pfandState);
    }
    this.refreshDisplayOrder();
  }

  private removePfandLine(parentKey: string): void {
    const parent = this.stateItems.find((item) => item.key === parentKey);
    if (parent) {
      parent.pfandEnabled = false;
    }

    const pfandLine = parent ? this.findPfandLineForParent(parent) : null;
    if (!pfandLine) {
      return;
    }

    this.stateItems = this.stateItems.filter((item) => item.key !== pfandLine.key);
  }

  private toPfandProduct(source: any): PfandProduct {
    return {
      id: Number(source.id ?? source.product_id),
      article_number: source.article_number,
      article_text: source.article_text || source.article_name || source.productName,
      sale_price: source.sale_price,
      category: 'PFAND',
    };
  }

  searchReplacementArticles(): void {
    this.articleSearch.filterArticles(this.searchableArtikels, this.modalReplacementSearch).subscribe((state) => {
      this.modalReplacementResults = state.results;
      this.showReplacementSearchDropdown = state.showDropdown;
    });
  }

  selectReplacementArticle(article: CatalogArticle): void {
    this.modalReplacementArticleNumber = article.article_number;
    this.modalReplacementArticleName = article.article_text;
    this.modalReplacementSearch = `${article.article_number} - ${article.article_text}`;
    this.modalReplacementResults = [];
    this.showReplacementSearchDropdown = false;

    if (this.selectedItem) {
      const suggested = this.getSuggestedPfandForItem({
        ...this.selectedItem,
        replacementArticleNumber: article.article_number,
      });
      if (suggested) {
        this.modalSelectedPfand = suggested;
      }
    }
  }

  clearReplacementArticle(): void {
    this.modalReplacementArticleNumber = '';
    this.modalReplacementArticleName = '';
    this.modalReplacementSearch = '';
    this.modalReplacementResults = [];
    this.showReplacementSearchDropdown = false;
  }

  openCompleteModal(): void {
    if (!this.order || this.isSaving) {
      return;
    }

    const stateForComplete = {
      orderId: this.order.order_id,
      orderFingerprint: '',
      startedAt: '',
      startedBy: this.getStartedBy(),
      items: this.stateItems,
    };

    if (!this.pickingState.canComplete(stateForComplete)) {
      this.setFeedback('warning', 'Bitte alle Positionen bearbeiten oder als nicht verfügbar markieren.');
      return;
    }

    this.showCompleteModal = true;
  }

  closeCompleteModal(): void {
    this.showCompleteModal = false;
  }

  openAbortModal(): void {
    if (!this.order || this.isSaving) {
      return;
    }
    this.showAbortModal = true;
  }

  closeAbortModal(): void {
    this.showAbortModal = false;
  }

  onBackClick(): void {
    if (this.isSaving) {
      return;
    }
    if (!this.isReadOnlySession && this.order && !this.errorMessage && !this.isLoading) {
      this.openAbortModal();
      return;
    }
    this.router.navigate(['/picking']);
  }

  async completePicking(): Promise<void> {
    if (!this.order) {
      return;
    }

    await this.persistState();
    const existing = await this.pickingState.getState(this.order.order_id);
    const stateForComplete = {
      orderId: this.order.order_id,
      orderFingerprint: existing?.orderFingerprint || '',
      startedAt: existing?.startedAt || new Date().toISOString(),
      startedBy: existing?.startedBy || this.getStartedBy(),
      items: this.stateItems,
    };

    if (!this.pickingState.canComplete(stateForComplete)) {
      this.setFeedback('warning', 'Bitte alle Positionen bearbeiten oder als nicht verfügbar markieren.');
      this.closeCompleteModal();
      return;
    }

    this.isSaving = true;

    try {
      await this.syncOrderToServer(true);
      const hasLater = this.stateItems.some((item) => item.status === 'later');
      if (hasLater) {
        if (this.isBundle) {
          await this.pickingState.deleteRelatedStates(this.bundleOrderIds);
        } else {
          await this.pickingState.deleteState(this.order.order_id);
        }
      } else {
        await this.pickingState.saveState({
          ...this.toStoredState(existing),
          completedAt: new Date().toISOString(),
        });
      }
      this.closeCompleteModal();
      this.router.navigate(['/picking']);
    } catch (error: any) {
      this.setFeedback('error', error?.error?.error || 'Abschluss fehlgeschlagen.');
    } finally {
      this.isSaving = false;
    }
  }

  async releasePicking(): Promise<void> {
    if (!this.order) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    this.isSaving = true;

    try {
      if (this.sessionOrders.some((entry) => entry.status === 'picking')) {
        await this.restoreOriginalItemsOnServer(token);
        for (const current of this.sessionOrders) {
          if (current.status !== 'picking') {
            continue;
          }
          await lastValueFrom(
            this.orderService.updateOrderStatusOnly(
              current.order_id,
              this.resumedFromPartial ? 'partially_picked' : 'released',
              token
            )
          );
        }
      }
      if (this.isBundle) {
        await this.pickingState.deleteRelatedStates(this.bundleOrderIds);
      } else {
        await this.pickingState.deleteState(this.order.order_id);
      }
      this.closeAbortModal();
      this.router.navigate(['/picking']);
    } catch {
      this.setFeedback('error', 'Kommissionierung konnte nicht abgebrochen werden.');
    } finally {
      this.isSaving = false;
    }
  }

  private buildSyncItems(source: PickItemState[] = this.stateItems): PickingSyncItem[] {
    const items: PickingSyncItem[] = [];

    for (const item of source) {
      if (item.status === 'later') {
        const productId = this.resolveProductId(item);
        if (!productId) {
          continue;
        }
        items.push({
          product_id: productId,
          quantity: item.targetQuantity,
          price: item.price,
          different_price: item.differentPrice ?? null,
          description: item.productName,
          defer: true,
        });
        continue;
      }

      if (item.status === 'unavailable') {
        const productId = this.resolveProductId(item);
        if (!productId) {
          continue;
        }
        items.push({
          product_id: productId,
          quantity: 0,
          price: item.price,
          different_price: item.differentPrice ?? null,
          description: item.productName,
          remove: true,
        });
        continue;
      }

      const productId = this.resolveProductId(item);
      if (!productId) {
        continue;
      }

      const quantity = item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity;
      items.push({
        product_id: productId,
        quantity,
        price: item.price,
        different_price: item.differentPrice ?? null,
        description: item.replacementArticleName || item.productName,
        replacement_article_number: item.replacementArticleNumber,
        replacement_article_name: item.replacementArticleName,
      });
    }

    return items;
  }

  private async syncOrderToServer(complete: boolean): Promise<void> {
    if (!this.order) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Nicht angemeldet');
    }

    this.ensurePfandLinesForSync();
    this.refreshDisplayOrder();

    for (const current of this.sessionOrders) {
      if (current.status !== 'picking') {
        continue;
      }
      const items = this.pickingState.itemsInOriginalOrder(this.stateItems, current.order_id);
      await lastValueFrom(
        this.orderService.applyPickingItems(
          current.order_id,
          this.buildSyncItems(items),
          token,
          complete
        )
      );
      if (complete) {
        const orderItems = this.pickingState.itemsInOriginalOrder(this.stateItems, current.order_id);
        current.status = orderItems.some((item) => item.status === 'later') ? 'partially_picked' : 'picked';
      }
    }
  }

  private captureOriginalItems(
    order: PickingOrder,
    existing?: {
      originalItems?: PickingOrderItem[];
      originalItemsByOrder?: Record<number, PickingOrderItem[]>;
    } | null
  ): void {
    this.originalItemsByOrder.clear();
    if (this.isBundle) {
      for (const current of this.bundleOrders) {
        const saved = existing?.originalItemsByOrder?.[current.order_id];
        this.originalItemsByOrder.set(
          current.order_id,
          saved?.length
            ? this.pickingState.cloneOrderItems(saved)
            : this.pickingState.cloneOrderItems(current.items)
        );
      }
      this.originalItems = this.originalItemsByOrder.get(order.order_id) ?? [];
      return;
    }

    this.originalItems = existing?.originalItems?.length
      ? this.pickingState.cloneOrderItems(existing.originalItems)
      : this.pickingState.cloneOrderItems(order.items);
  }

  private async restoreOriginalItemsOnServer(token: string): Promise<void> {
    for (const current of this.sessionOrders) {
      if (current.status !== 'picking') {
        continue;
      }

      const originalItems = this.isBundle
        ? this.originalItemsByOrder.get(current.order_id) ??
          this.pickingState.cloneOrderItems(current.items)
        : this.originalItems.length
          ? this.originalItems
          : this.pickingState.cloneOrderItems(current.items);

      if (!originalItems.length) {
        continue;
      }

      const restoreItems: PickingSyncItem[] = originalItems.map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
        price: item.price != null ? Number(item.price) : 0,
        different_price:
          item.different_price != null && item.different_price !== ''
            ? Number(item.different_price)
            : null,
        description: item.product_name,
        picking_status: item.picking_status ?? null,
      }));

      await lastValueFrom(
        this.orderService.applyPickingItems(current.order_id, restoreItems, token, false)
      );
    }
  }

  private async persistState(): Promise<void> {
    if (!this.order) {
      return;
    }

    const existing = await this.pickingState.getState(this.order.order_id);
    if (!this.isBundle) {
      const originalItems = existing?.originalItems?.length
        ? existing.originalItems
        : this.originalItems.length
          ? this.originalItems
          : this.pickingState.cloneOrderItems(this.order.items);
      this.originalItems = this.pickingState.cloneOrderItems(originalItems);
    } else if (!this.originalItemsByOrder.size) {
      this.captureOriginalItems(this.order, existing);
    }

    await this.pickingState.saveState(this.toStoredState(existing));
    this.refreshProgress();
  }

  private toStoredState(
    base?: {
      orderFingerprint?: string;
      startedAt?: string;
      startedBy?: string;
      completedAt?: string;
    } | null
  ): PickingState {
    const fingerprintSource = this.originalItems.length
      ? this.originalItems
      : this.pickingState.cloneOrderItems(this.order?.items ?? []);

    return {
      orderId: this.order?.order_id ?? this.orderId,
      orderFingerprint:
        base?.orderFingerprint ||
        (this.isBundle
          ? this.pickingState.computeBundleFingerprint(this.bundleOrders)
          : this.pickingState.computeOrderFingerprint(fingerprintSource)),
      originalItems: this.originalItems,
      originalItemsByOrder: this.isBundle
        ? (Object.fromEntries(this.originalItemsByOrder.entries()) as Record<number, PickingOrderItem[]>)
        : undefined,
      bundleOrderIds: this.isBundle ? [...this.bundleOrderIds] : undefined,
      startedAt: base?.startedAt || new Date().toISOString(),
      startedBy: base?.startedBy || this.getStartedBy(),
      completedAt: base?.completedAt,
      items: this.stateItems,
    };
  }

  private refreshDisplayOrder(): void {
    if (!this.isBundle) {
      return;
    }
    this.stateItems = this.pickingState.arrangeForPicking(this.stateItems);
  }

  isItemLocked(item: PickItemState): boolean {
    if (!this.isBundle || item.sourceOrderId == null) {
      return false;
    }
    const source = this.bundleOrders.find((entry) => entry.order_id === item.sourceOrderId);
    return source?.status === 'picked' || source?.status === 'completed';
  }

  private refreshProgress(): void {
    if (this.isReadOnlySession && this.stateItems.length > 0) {
      this.progress = {
        done: this.stateItems.length,
        total: this.stateItems.length,
        percent: 100,
      };
      return;
    }

    this.progress = this.pickingState.getProgress({
      orderId: this.orderId,
      orderFingerprint: '',
      startedAt: '',
      startedBy: '',
      items: this.stateItems,
    });
  }

  private getStartedBy(): string {
    return this.globalService.getUserName() || 'Unbekannt';
  }

  private setFeedback(type: ScanResultFeedback['type'], message: string): void {
    this.scanFeedback = { type, message };
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    this.feedbackTimer = setTimeout(() => {
      this.scanFeedback = null;
    }, 3500);
  }

  getCustomerLabel(): string {
    if (!this.order) {
      return '';
    }
    return (
      this.getCustomerNameFromMasterData(this.order.customer_number) ||
      this.order.company ||
      this.order.customer_number ||
      `Bestellung #${this.order.order_id}`
    );
  }

  private async loadCustomerNames(headers: HttpHeaders): Promise<void> {
    this.customerNameByNumber.clear();

    try {
      const customers = await lastValueFrom(
        this.http.get<CustomerSummary[]>(`${environment.apiUrl}/api/customers`, { headers })
      );

      for (const customer of customers ?? []) {
        const number = (customer.customer_number || '').trim();
        if (!number) {
          continue;
        }

        const normalizedName = [customer.last_name_company, customer.first_name]
          .map((value) => (value || '').trim())
          .filter(Boolean)
          .join(' ')
          .trim();

        if (normalizedName) {
          this.customerNameByNumber.set(number, normalizedName);
        }
      }
    } catch {
      // Fallback auf Bestellungsfelder in getCustomerLabel()
    }
  }

  private getCustomerNameFromMasterData(customerNumber?: string): string {
    if (!customerNumber) {
      return '';
    }
    return this.customerNameByNumber.get(customerNumber.trim()) || '';
  }

  hasSplitFulfillment(): boolean {
    if (!this.isBundle || this.bundleOrders.length < 2) {
      return false;
    }
    return this.bundleOrders[0].fulfillment_type !== this.bundleOrders[1].fulfillment_type;
  }

  getFulfillmentLabel(type?: string): string {
    if (type === 'delivery') {
      return 'Lieferung';
    }
    if (type === 'pickup') {
      return 'Abholung';
    }
    return type || '—';
  }

  getDeliveryLabel(): string {
    const labels = [
      ...new Set(
        this.sessionOrders.map((entry) => formatPickingDate(entry.delivery_date || entry.order_date))
      ),
    ].filter((label) => label && label !== '—');
    if (!labels.length) {
      return formatPickingDate(this.order?.delivery_date || this.order?.order_date);
    }
    return labels.join(' · ');
  }

  getCustomerNotes(): string {
    const notes = this.sessionOrders
      .map((entry) => ({
        id: entry.order_id,
        text: (entry.customer_notes || '').trim(),
      }))
      .filter((entry) => entry.text);

    if (!notes.length) {
      return '';
    }
    if (!this.isBundle || notes.length === 1 || notes.every((entry) => entry.text === notes[0].text)) {
      return notes[0].text;
    }
    return notes.map((entry) => `#${entry.id}: ${entry.text}`).join('\n');
  }

  getOrderSubtitle(): string {
    if (!this.order) {
      return '';
    }
    const picker = this.order.picker_user_name ? ` · ${this.order.picker_user_name}` : '';
    if (this.isBundle && this.bundleOrders.length > 1) {
      const ids = this.bundleOrders.map((entry) => `#${entry.order_id}`).join(' + ');
      return `${ids} · ${this.stateItems.length} Pos.${picker}`;
    }
    return `#${this.order.order_id} · ${this.order.items.length} Pos.${picker}`;
  }

  getAbortDetail(): string {
    if (this.isBundle) {
      return 'Die ursprünglichen Mengen beider Bestellungen bleiben erhalten. Der gemeinsame Fortschritt geht verloren, und beide Bestellungen können wieder einzeln kommissioniert werden.';
    }
    return 'Die ursprünglichen Mengen bleiben erhalten. Der Fortschritt auf diesem Gerät geht verloren, und die Bestellung kann wieder von jemand anderem kommissioniert werden.';
  }

  getCompleteDetail(): string {
    if (this.hasLaterItems()) {
      return 'Die markierten Positionen bleiben im Auftrag und können später kommissioniert werden. Der Auftrag wird als teilweise kommissioniert angezeigt.';
    }
    if (this.isBundle) {
      return 'Beide Bestellungen werden getrennt abgeschlossen. Jede Position landet wieder in ihrer ursprünglichen Bestellung und Position.';
    }
    return 'Möchten Sie die Kommissionierung wirklich abschließen?';
  }

  hasLaterItems(): boolean {
    return this.stateItems.some((item) => item.status === 'later');
  }

  canFinishPicking(): boolean {
    return this.pickingState.canComplete({
      orderId: this.orderId,
      orderFingerprint: '',
      startedAt: '',
      startedBy: '',
      items: this.stateItems,
    });
  }

  openPrintModal(): void {
    if (!this.order || !this.stateItems.length) {
      return;
    }
    this.showPrintModal = true;
  }

  closePrintModal(): void {
    this.showPrintModal = false;
  }

  printSheet(
    mode: 'kommissionierung' | 'both' | 'palettenschein',
    closePrintModal = true
  ): void {
    if (!this.order) {
      return;
    }

    for (const current of this.sessionOrders) {
      const items = this.pickingState.itemsInOriginalOrder(this.stateItems, current.order_id);
      if (mode === 'palettenschein') {
        this.pickingPdf.generatePalettenschein(current, items);
      } else {
        this.pickingPdf.generateKommissionierungsschein(current, items, {
          customerLabel: this.getCustomerLabel(),
          includePalettenschein: mode === 'both',
        });
      }
    }

    if (closePrintModal) {
      this.showPrintModal = false;
    }

    const sheetLabel = this.isBundle ? 'Kommissionierungsscheine' : 'Kommissionierungsschein';
    const feedbackMessage =
      mode === 'both'
        ? this.isBundle
          ? 'PDFs mit Palettenschein erstellt.'
          : 'PDF mit Palettenschein erstellt.'
        : mode === 'palettenschein'
          ? this.isBundle
            ? 'Palettenscheine erstellt.'
            : 'Palettenschein erstellt.'
          : `${sheetLabel} erstellt.`;
    this.setFeedback('success', feedbackMessage);
  }

  getItemStatusLabel(status: PickItemState['status']): string {
    switch (status) {
      case 'picked':
        return 'Fertig';
      case 'partial':
        return 'Teilweise';
      case 'unavailable':
        return 'Nicht verfügbar';
      case 'later':
        return 'Später';
      default:
        return 'Offen';
    }
  }

  getItemStatusClass(status: PickItemState['status']): string {
    return `item-${status}`;
  }

  getItemStatusIcon(status: PickItemState['status']): string {
    switch (status) {
      case 'picked':
        return 'check_circle';
      case 'partial':
        return 'timelapse';
      case 'unavailable':
        return 'cancel';
      case 'later':
        return 'radio_button_unchecked';
      default:
        return 'radio_button_unchecked';
    }
  }

  getFulfillmentIcon(type?: string): string {
    if (type === 'delivery') {
      return 'local_shipping';
    }
    if (type === 'pickup') {
      return 'storefront';
    }
    return 'help_outline';
  }

  isArticleSearchActive(term: string): boolean {
    const trimmed = term.trim();
    return trimmed.length >= 3 || /^\d{8}$|^\d{13}$/.test(trimmed);
  }

  showArticleSearchEmpty(term: string, showDropdown: boolean, resultCount: number): boolean {
    return this.isArticleSearchActive(term) && !showDropdown && resultCount === 0;
  }
}
