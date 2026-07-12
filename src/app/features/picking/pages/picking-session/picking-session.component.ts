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
import { PickingStateService } from '../../services/picking-state.service';
import { PickingPdfService } from '../../services/picking-pdf.service';
import {
  PickItemState,
  PickingOrder,
  PickingProgress,
  PickingSyncItem,
  ScanResultFeedback,
} from '../../models/picking.models';

interface ReplacementArticle {
  article_number: string;
  article_text: string;
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
  modalReplacementResults: ReplacementArticle[] = [];
  modalReplacementArticleNumber = '';
  modalReplacementArticleName = '';
  isSearchingReplacement = false;
  modalAddPfand = false;
  modalPfandSearch = '';
  modalPfandResults: PfandProduct[] = [];
  modalSelectedPfand: PfandProduct | null = null;

  private productById = new Map<number, PfandProduct & { custom_field_1?: string }>();

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
    this.modalReplacementArticleNumber = item.replacementArticleNumber || '';
    this.modalReplacementArticleName = item.replacementArticleName || '';
    this.modalPfandSearch = '';
    this.modalPfandResults = [];
    this.modalSelectedPfand = null;

    const existingPfand = this.getPfandLineForParent(item.key);
    if (existingPfand) {
      this.modalAddPfand = true;
      this.modalSelectedPfand = this.toPfandProduct(existingPfand);
    } else {
      this.modalAddPfand = false;
      const suggested = this.getSuggestedPfandForItem(item);
      if (suggested) {
        this.modalSelectedPfand = suggested;
      }
    }

    this.showItemModal = true;
  }

  closeItemModal(): void {
    this.showItemModal = false;
    this.selectedItem = null;
    this.modalReplacementSearch = '';
    this.modalReplacementResults = [];
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
    const next = Math.max(0, Number(this.modalPickedQuantity || 0) + delta);
    this.modalPickedQuantity = Math.round(next * 1000) / 1000;
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
      this.selectedItem.pickedQuantity = Math.max(0, Number(this.modalPickedQuantity) || 0);
      this.selectedItem.note = this.modalNote.trim() || undefined;
      this.selectedItem.status = this.pickingState.updateItemStatus(this.selectedItem);
    }

    this.selectedItem.replacementArticleNumber = this.modalReplacementArticleNumber || undefined;
    this.selectedItem.replacementArticleName = this.modalReplacementArticleName || undefined;

    if (this.modalUnavailable) {
      this.removePfandLine(this.selectedItem.key);
    } else if (this.modalAddPfand && !this.selectedItem.isPfandLine) {
      const pfandProduct =
        this.modalSelectedPfand || this.getSuggestedPfandForItem(this.selectedItem);
      if (pfandProduct) {
        const pfandQuantity =
          Math.max(0, Number(this.modalPickedQuantity) || 0) || this.selectedItem.targetQuantity;
        this.upsertPfandLine(this.selectedItem, pfandProduct, pfandQuantity);
      }
    } else if (!this.modalAddPfand) {
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
      [...this.productById.values()].find((entry) => entry.article_number === articleNumberForPfand) ||
      this.productById.get(item.productId);
    const customField1 = product?.custom_field_1 || item.customField1;
    if (!customField1) {
      return null;
    }

    const matching = this.globalService.getPfandArtikels().find(
      (pfand) => pfand.article_number === customField1
    );
    return matching ? this.toPfandProduct(matching) : null;
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

  private async loadProductCatalog(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      const products = await lastValueFrom(this.artikelData.getData());
      const list = Array.isArray(products) ? products : [];
      this.globalService.setPfandArtikels(list);
      this.productById.clear();
      for (const product of list) {
        if (product?.id != null) {
          this.productById.set(Number(product.id), product);
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
      }
    }
  }

  private getPfandLineForParent(parentKey: string): PickItemState | null {
    return (
      this.stateItems.find(
        (item) => item.isPfandLine && item.parentItemKey === parentKey && item.status !== 'unavailable'
      ) ?? null
    );
  }

  private upsertPfandLine(parentItem: PickItemState, pfandProduct: PfandProduct, quantity: number): void {
    const existingIndex = this.stateItems.findIndex(
      (item) => item.isPfandLine && item.parentItemKey === parentItem.key
    );
    const parentIndex = this.stateItems.findIndex((item) => item.key === parentItem.key);
    const effectiveQuantity = quantity > 0 ? quantity : parentItem.targetQuantity;

    const pfandState: PickItemState = {
      key:
        existingIndex >= 0
          ? this.stateItems[existingIndex].key
          : `pfand:${parentItem.key}:${pfandProduct.id}`,
      productId: pfandProduct.id,
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
    this.stateItems = this.stateItems.filter(
      (item) => !(item.isPfandLine && item.parentItemKey === parentKey)
    );
  }

  private toPfandProduct(source: any): PfandProduct {
    return {
      id: Number(source.id),
      article_number: source.article_number,
      article_text: source.article_text || source.article_name || source.productName,
      sale_price: source.sale_price,
      category: 'PFAND',
    };
  }

  async searchReplacementArticles(): Promise<void> {
    const token = localStorage.getItem('token');
    const query = this.modalReplacementSearch.trim();

    if (!token || query.length < 2) {
      this.modalReplacementResults = [];
      return;
    }

    this.isSearchingReplacement = true;

    try {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      });

      const response = await lastValueFrom(
        this.http.get<{ success: boolean; data: ReplacementArticle[] }>(
          `${environment.apiUrl}/api/product-eans/articles/search`,
          {
            headers,
            params: { q: query },
          }
        )
      );

      this.modalReplacementResults = response?.success ? response.data || [] : [];
    } catch {
      this.modalReplacementResults = [];
    } finally {
      this.isSearchingReplacement = false;
    }
  }

  selectReplacementArticle(article: ReplacementArticle): void {
    this.modalReplacementArticleNumber = article.article_number;
    this.modalReplacementArticleName = article.article_text;
    this.modalReplacementSearch = `${article.article_number} - ${article.article_text}`;
    this.modalReplacementResults = [];

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
  }

  async completePicking(): Promise<void> {
    if (!this.order) {
      return;
    }

    const state = await this.pickingState.getState(this.order.order_id);
    if (!state || !this.pickingState.canComplete(state)) {
      this.setFeedback('warning', 'Bitte alle Positionen bearbeiten oder als nicht verfügbar markieren.');
      return;
    }

    this.isSaving = true;

    try {
      await this.syncOrderToServer(true);
      state.completedAt = new Date().toISOString();
      await this.pickingState.saveState(state);
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
    return this.stateItems.map((item) => {
      if (item.status === 'unavailable') {
        return {
          product_id: item.productId,
          quantity: 0,
          price: item.price,
          different_price: item.differentPrice ?? null,
          description: item.productName,
          remove: true,
        };
      }

      const quantity =
        item.pickedQuantity > 0 ? item.pickedQuantity : item.targetQuantity;

      return {
        product_id: item.productId,
        quantity,
        price: item.price,
        different_price: item.differentPrice ?? null,
        description: item.replacementArticleName || item.productName,
        replacement_article_number: item.replacementArticleNumber,
        replacement_article_name: item.replacementArticleName,
      };
    });
  }

  private async syncOrderToServer(complete: boolean): Promise<void> {
    if (!this.order) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Nicht angemeldet');
    }

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
    return this.order.company || this.order.name || this.order.customer_number || `Bestellung #${this.order.order_id}`;
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
    const value = this.order?.delivery_date || this.order?.order_date;
    if (!value) {
      return 'Kein Datum';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const datePart = date.toLocaleDateString('de-DE');
    if (value.includes('T')) {
      const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return `${datePart} · ${timePart}`;
    }
    return datePart;
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
}
