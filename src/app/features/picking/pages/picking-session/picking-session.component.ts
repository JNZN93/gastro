import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { PickingStateService } from '../../services/picking-state.service';
import {
  PickItemState,
  PickingOrder,
  PickingProgress,
  ScanResultFeedback,
} from '../../models/picking.models';

interface ReplacementArticle {
  article_number: string;
  article_text: string;
}

@Component({
  selector: 'app-picking-session',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ZXingScannerModule],
  templateUrl: './picking-session.component.html',
  styleUrl: './picking-session.component.scss',
})
export class PickingSessionComponent implements OnInit, OnDestroy {
  @ViewChild(ZXingScannerComponent) scanner?: ZXingScannerComponent;
  @ViewChild('eanInput') eanInput?: ElementRef<HTMLInputElement>;

  orderId = 0;
  order: PickingOrder | null = null;
  stateItems: PickItemState[] = [];
  progress: PickingProgress = { done: 0, total: 0, percent: 0 };

  isLoading = true;
  isSaving = false;
  errorMessage = '';
  scanFeedback: ScanResultFeedback | null = null;

  eanInputValue = '';
  isScanning = false;
  showItemModal = false;
  showStartWarning = false;
  selectedItem: PickItemState | null = null;
  modalPickedQuantity = 0;
  modalNote = '';
  modalUnavailable = false;
  modalReplacementSearch = '';
  modalReplacementResults: ReplacementArticle[] = [];
  modalReplacementArticleNumber = '';
  modalReplacementArticleName = '';
  isSearchingReplacement = false;

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

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly orderService: OrderService,
    private readonly globalService: GlobalService,
    private readonly pickingState: PickingStateService
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

  ngOnDestroy(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
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

      if (order.status !== 'open' && order.status !== 'in_progress') {
        this.errorMessage = 'Diese Bestellung ist nicht mehr offen zur Kommissionierung.';
        this.order = order;
        return;
      }

      if (!order.items?.length) {
        this.errorMessage = 'Diese Bestellung enthält keine Positionen.';
        this.order = order;
        return;
      }

      this.order = order;
      await this.ensurePickingState(order);
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

    if (order.status === 'in_progress') {
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
      if (updateRemoteStatus && this.order.status === 'open') {
        await lastValueFrom(
          this.orderService.updateOrderStatusOnly(this.order.order_id, 'in_progress', token)
        );
        this.order.status = 'in_progress';
      }

      if (!preserveItems) {
        const state = this.pickingState.createInitialState(this.order, this.getStartedBy());
        this.stateItems = state.items;
        await this.pickingState.saveState(state);
      } else {
        const existing = await this.pickingState.getState(this.order.order_id);
        if (existing) {
          await this.pickingState.saveState({ ...existing, items: this.stateItems });
        }
      }

      this.setFeedback('success', 'Kommissionierung gestartet.');
    } catch {
      this.setFeedback('error', 'Status konnte nicht gesetzt werden.');
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
    this.showItemModal = true;
  }

  closeItemModal(): void {
    this.showItemModal = false;
    this.selectedItem = null;
    this.modalReplacementSearch = '';
    this.modalReplacementResults = [];
    this.modalReplacementArticleNumber = '';
    this.modalReplacementArticleName = '';
    this.focusEanInput();
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

    await this.persistState();
    this.closeItemModal();
  }

  markSelectedUnavailable(): void {
    this.modalUnavailable = true;
    this.modalPickedQuantity = 0;
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

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    this.isSaving = true;

    try {
      await lastValueFrom(
        this.orderService.updateOrderStatusOnly(this.order.order_id, 'completed', token)
      );
      state.completedAt = new Date().toISOString();
      await this.pickingState.saveState(state);
      this.router.navigate(['/picking']);
    } catch {
      this.setFeedback('error', 'Abschluss fehlgeschlagen.');
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
      if (this.order.status === 'in_progress') {
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

  private async persistState(): Promise<void> {
    if (!this.order) {
      return;
    }

    const existing = await this.pickingState.getState(this.order.order_id);
    const base =
      existing && this.pickingState.isFingerprintValid(existing, this.order)
        ? existing
        : this.pickingState.createInitialState(this.order, this.getStartedBy());

    await this.pickingState.saveState({
      ...base,
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
