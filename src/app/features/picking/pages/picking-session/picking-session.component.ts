import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ZXingScannerComponent, ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/browser';
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
  PickingProgress,
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
  ean?: string;
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
  imports: [CommonModule, FormsModule, RouterModule, ZXingScannerModule],
  templateUrl: './picking-session.component.html',
  styleUrl: './picking-session.component.scss',
})
export class PickingSessionComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner?: ZXingScannerComponent;
  @ViewChild('eanInput') eanInput?: ElementRef<HTMLInputElement>;
  @ViewChild('stickyBar') stickyBar?: ElementRef<HTMLElement>;

  orderId = 0;
  order: PickingOrder | null = null;
  stateItems: PickItemState[] = [];
  progress: PickingProgress = { done: 0, total: 0, percent: 0 };
  stickyBarHeight = 120;

  isLoading = true;
  isSaving = false;
  isReadOnlySession = false;
  errorMessage = '';
  scanFeedback: ScanResultFeedback | null = null;

  eanInputValue = '';
  isScanning = false;
  showItemModal = false;
  showStartWarning = false;
  showPrintModal = false;
  selectedItem: PickItemState | null = null;
  modalPickedQuantity = 0;
  modalNote = '';
  modalUnavailable = false;
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

  private customerNameByNumber = new Map<string, string>();
  private productById = new Map<number, CatalogArticle>();
  private productByArticleNumber = new Map<string, CatalogArticle>();

  formatsEnabled: BarcodeFormat[] = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ];

  videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: 'environment' },
  };

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
      const id = Number(params.get('orderId'));
      if (!id) {
        this.router.navigate(['/picking']);
        return;
      }
      this.orderId = id;
      this.loadSession();
    });
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

      const order = (response?.orders ?? []).find((entry) => entry.order_id === this.orderId) ?? null;
      if (!order) {
        this.errorMessage = 'Bestellung nicht gefunden oder nicht mehr kommissionierbar.';
        this.order = null;
        return;
      }

      if (order.status === 'picked') {
        this.isReadOnlySession = true;
        this.order = order;
        await this.loadProductCatalog();
        this.stateItems = this.createReadOnlyStateItems(order);
        this.enrichStateItemsWithProductMetadata();
        this.refreshProgress();
        return;
      }

      this.isReadOnlySession = false;

      if (order.status !== 'open' && order.status !== 'picking') {
        this.errorMessage = 'Diese Bestellung ist nicht mehr offen zur Kommissionierung.';
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
      setTimeout(() => this.focusEanInput(), 100);
    }
  }

  private createReadOnlyStateItems(order: PickingOrder): PickItemState[] {
    return order.items.map((item, index) => {
      const quantity = Number(item.quantity);
      const state: PickItemState = {
        key: this.pickingState.buildItemKey(item, index),
        productId: item.product_id,
        articleNumber: item.product_article_number,
        productName: item.product_name,
        targetQuantity: quantity,
        pickedQuantity: quantity,
        status: 'picked',
        price: item.price != null ? Number(item.price) : 0,
        differentPrice:
          item.different_price != null && item.different_price !== ''
            ? Number(item.different_price)
            : null,
      };
      return state;
    });
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
      if (order.status === 'open') {
        await this.startPicking(true, true);
      }
      return;
    }

    if (order.status === 'picking') {
      this.showStartWarning = true;
      this.stateItems = this.pickingState.createInitialState(order, this.getStartedBy()).items;
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
      if (updateRemoteStatus && (this.order.status === 'open' || this.order.status === 'picking')) {
        await lastValueFrom(
          this.orderService.updateOrderStatusOnly(this.order.order_id, 'picking', token, {
            picker_user_name: this.getStartedBy(),
          })
        );
        this.order.status = 'picking';
        this.order.picker_user_name = this.getStartedBy();
        this.order.picker_user_id = this.globalService.getUserId();
      }

      if (!preserveItems) {
        const state = this.pickingState.createInitialState(this.order, this.getStartedBy());
        this.stateItems = state.items;
        this.enrichStateItemsWithProductMetadata();
        await this.pickingState.saveState({ ...state, items: this.stateItems });
      } else {
        const existing = await this.pickingState.getState(this.order.order_id);
        if (existing) {
          await this.pickingState.saveState({ ...existing, items: this.stateItems });
        }
      }

      this.setFeedback('success', 'Kommissionierung gestartet.');
    } catch (error: any) {
      const message = error?.error?.error || 'Status konnte nicht gesetzt werden.';
      this.setFeedback('error', message);
      this.errorMessage = message;
    } finally {
      this.isSaving = false;
      this.refreshProgress();
      this.focusEanInput();
    }
  }

  async onEanSubmit(): Promise<void> {
    const ean = this.eanInputValue.trim();
    if (!ean || !this.order) {
      return;
    }

    this.eanInputValue = '';
    await this.processScan(ean);
    this.focusEanInput();
  }

  onCodeResult(result: string): void {
    if (!result) {
      return;
    }
    this.isScanning = false;
    this.processScan(result);
  }

  private async processScan(ean: string): Promise<void> {
    if (!this.order) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      });

      const response = await lastValueFrom(
        this.http.post<{ success: boolean; data?: { article_number: string } }>(
          `${environment.apiUrl}/api/product-eans/scan`,
          { ean },
          { headers }
        )
      );

      const articleNumber = response?.data?.article_number;
      if (!response?.success || !articleNumber) {
        this.setFeedback('error', `EAN ${ean} nicht gefunden.`);
        return;
      }

      const item = this.findOpenItemByArticle(articleNumber);
      if (!item) {
        this.setFeedback(
          'warning',
          `Artikel ${articleNumber} ist nicht offen in dieser Bestellung.`
        );
        return;
      }

      item.pickedQuantity = Math.min(item.pickedQuantity + 1, item.targetQuantity);
      item.status = this.pickingState.updateItemStatus(item);
      await this.persistState();
      this.setFeedback('success', `${item.productName}: ${item.pickedQuantity}/${item.targetQuantity}`);
    } catch {
      this.setFeedback('error', 'EAN-Scan fehlgeschlagen.');
    }
  }

  private findOpenItemByArticle(articleNumber: string): PickItemState | null {
    return (
      this.stateItems.find(
        (item) =>
          item.articleNumber === articleNumber &&
          item.status !== 'unavailable' &&
          item.pickedQuantity < item.targetQuantity
      ) ?? null
    );
  }

  openItemModal(item: PickItemState): void {
    this.selectedItem = item;
    this.modalPickedQuantity = item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity;
    this.modalNote = item.note || '';
    this.modalUnavailable = item.status === 'unavailable';
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
    this.modalAddPfand = false;
    this.modalPfandSearch = '';
    this.modalPfandResults = [];
    this.modalSelectedPfand = null;
    this.focusEanInput();
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

    if (this.modalUnavailable) {
      this.selectedItem.status = 'unavailable';
      this.selectedItem.note = this.modalNote.trim() || 'Nicht verfügbar';
      this.selectedItem.pickedQuantity = 0;
    } else {
      this.selectedItem.pickedQuantity = this.roundToThreeDecimals(
        Math.max(0, Number(this.modalPickedQuantity) || 0)
      );
      this.selectedItem.note = this.modalNote.trim() || undefined;
      this.selectedItem.status = this.pickingState.updateItemStatus(this.selectedItem);
    }

    this.selectedItem.replacementArticleNumber = this.modalReplacementArticleNumber || undefined;
    this.selectedItem.replacementArticleName = this.modalReplacementArticleName || undefined;

    if (this.modalUnavailable) {
      this.selectedItem.pfandEnabled = false;
      this.removePfandLine(this.selectedItem.key);
    } else if (this.modalAddPfand && !this.selectedItem.isPfandLine) {
      const pfandProduct =
        this.modalSelectedPfand || this.getSuggestedPfandForItem(this.selectedItem);
      if (pfandProduct) {
        const pfandQuantity =
          Math.max(0, Number(this.modalPickedQuantity) || 0) || this.selectedItem.targetQuantity;
        this.selectedItem.pfandEnabled = true;
        this.upsertPfandLine(this.selectedItem, pfandProduct, pfandQuantity);
      }
    } else if (!this.modalAddPfand && (this.selectedItem.pfandEnabled || this.findPfandLineForParent(this.selectedItem))) {
      this.selectedItem.pfandEnabled = false;
      this.removePfandLine(this.selectedItem.key);
    }

    await this.persistState();
    await this.syncOrderToServer(false);
    this.closeItemModal();
  }

  markSelectedUnavailable(): void {
    this.modalUnavailable = true;
    this.modalPickedQuantity = 0;
    this.modalAddPfand = false;
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

        await this.persistAndSyncAfterAdd(article.article_text);
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
    };
    newItem.status = this.pickingState.updateItemStatus(newItem);
    this.stateItems.push(newItem);

    const suggestedPfand = this.getSuggestedPfandForProduct(product);
    if (suggestedPfand && product.category !== 'PFAND') {
      this.upsertPfandLine(newItem, suggestedPfand, quantity);
    }

    await this.persistAndSyncAfterAdd(article.article_text);
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

  private async persistAndSyncAfterAdd(articleLabel: string): Promise<void> {
    this.articleSearchTerm = '';
    this.articleSearchResults = [];
    this.showArticleSearchDropdown = false;
    this.selectedArticleToAdd = null;
    this.addArticleQuantity = 1;
    this.isSaving = true;

    try {
      await this.persistState();
      await this.syncOrderToServer(false);
      this.setFeedback('success', `${articleLabel} hinzugefügt.`);
    } catch (error: any) {
      this.setFeedback('error', error?.error?.error || 'Artikel konnte nicht gespeichert werden.');
    } finally {
      this.isSaving = false;
      this.focusEanInput();
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

  private linkExistingPfandLines(): void {
    for (let index = 0; index < this.stateItems.length; index++) {
      const item = this.stateItems[index];
      if (item.isPfandLine || item.parentItemKey) {
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
        !nextItem.parentItemKey
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
      adjacent.articleNumber === pfandArticleNumber
    ) {
      return adjacent;
    }

    return (
      this.stateItems.find(
        (item) =>
          item.status !== 'unavailable' &&
          item.articleNumber === pfandArticleNumber &&
          (item.isPfandLine || item.category === 'PFAND')
      ) ?? null
    );
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
      return;
    }

    this.isSaving = true;

    try {
      await this.syncOrderToServer(true);
      await this.pickingState.saveState({
        ...stateForComplete,
        completedAt: new Date().toISOString(),
      });
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
      if (this.order.status === 'picking') {
        await lastValueFrom(
          this.orderService.updateOrderStatusOnly(this.order.order_id, 'open', token)
        );
      }
      await this.pickingState.deleteState(this.order.order_id);
      this.router.navigate(['/picking']);
    } catch {
      this.setFeedback('error', 'Freigabe fehlgeschlagen.');
    } finally {
      this.isSaving = false;
    }
  }

  private buildSyncItems(): PickingSyncItem[] {
    const items: PickingSyncItem[] = [];

    for (const item of this.stateItems) {
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

    await lastValueFrom(
      this.orderService.applyPickingItems(
        this.order.order_id,
        this.buildSyncItems(),
        token,
        complete
      )
    );

    if (complete) {
      this.order.status = 'picked';
    } else {
      this.rebuildOrderFromState();
      await this.persistState();
    }
  }

  private rebuildOrderFromState(): void {
    if (!this.order) {
      return;
    }

    this.order.items = this.stateItems
      .filter((item) => item.status !== 'unavailable')
      .map((item) => ({
        product_id: item.productId,
        quantity: item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity,
        price: item.price != null ? String(item.price) : '0',
        different_price: item.differentPrice != null ? String(item.differentPrice) : null,
        product_name: item.replacementArticleName || item.productName,
        product_article_number: item.replacementArticleNumber || item.articleNumber,
      }));
  }

  private async persistState(): Promise<void> {
    if (!this.order) {
      return;
    }

    const existing = await this.pickingState.getState(this.order.order_id);
    this.rebuildOrderFromState();
    const fingerprint = this.pickingState.computeOrderFingerprint(this.order.items);

    await this.pickingState.saveState({
      orderId: this.order.order_id,
      orderFingerprint: fingerprint,
      startedAt: existing?.startedAt || new Date().toISOString(),
      startedBy: existing?.startedBy || this.getStartedBy(),
      completedAt: existing?.completedAt,
      items: this.stateItems,
    });
    this.refreshProgress();
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

  focusEanInput(): void {
    this.eanInput?.nativeElement?.focus();
  }

  openScanner(): void {
    this.isScanning = true;
  }

  closeScanner(): void {
    this.isScanning = false;
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
    return formatPickingDate(this.order?.delivery_date || this.order?.order_date);
  }

  getCustomerNotes(): string {
    return (this.order?.customer_notes || '').trim();
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

  printSheet(includePalettenschein: boolean): void {
    if (!this.order) {
      return;
    }
    this.pickingPdf.generateKommissionierungsschein(this.order, this.stateItems, {
      customerLabel: this.getCustomerLabel(),
      includePalettenschein,
    });
    this.showPrintModal = false;
    this.setFeedback(
      'success',
      includePalettenschein
        ? 'PDF mit Palettenschein erstellt.'
        : 'Kommissionierungsschein erstellt.'
    );
  }

  getItemStatusLabel(status: PickItemState['status']): string {
    switch (status) {
      case 'picked':
        return 'Fertig';
      case 'partial':
        return 'Teilweise';
      case 'unavailable':
        return 'Nicht verfügbar';
      default:
        return 'Offen';
    }
  }

  getItemStatusClass(status: PickItemState['status']): string {
    return `item-${status}`;
  }

  isArticleSearchActive(term: string): boolean {
    const trimmed = term.trim();
    return trimmed.length >= 3 || /^\d{8}$|^\d{13}$/.test(trimmed);
  }

  showArticleSearchEmpty(term: string, showDropdown: boolean, resultCount: number): boolean {
    return this.isArticleSearchActive(term) && !showDropdown && resultCount === 0;
  }
}
