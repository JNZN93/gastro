import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatRippleModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { environment } from '../../../../../environments/environment';
import { GlobalService } from '../../../../global.service';
import { PickingOrder } from '../../models/picking.models';
import { PickingState, PickingProgress } from '../../models/picking.models';
import { PickingStateService } from '../../services/picking-state.service';
import { formatPickingDate } from '../../utils/picking-date.util';
import { formatPickingAddress, PickingAddressCustomer } from '../../utils/picking-address.util';
import {
  displayPickerName,
  getStoredPickerName,
  isUsablePickerName,
  markPickerNameConfirmed,
  saveStoredPickerName,
} from '../../utils/picking-picker-name.util';
import { PUSH_DENIED_HINT, PushUiStatus, WebPushService } from '../../../../pwa/web-push.service';
import { PickingFeedService } from '../../services/picking-feed.service';
import {
  feedCustomerLabel,
  feedMatchesQueue,
  PickingFeedOrder,
} from '../../services/picking-feed';

interface QueueEntry {
  order: PickingOrder;
  progress: PickingProgress;
  localState: PickingState | null;
}

interface CustomerSummary {
  customer_number?: string;
  last_name_company?: string;
  first_name?: string;
  name_addition?: string;
  street?: string;
  postal_code?: string;
  city?: string;
}

@Component({
  selector: 'app-picking-queue',
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
  ],
  templateUrl: './picking-queue.component.html',
  styleUrl: './picking-queue.component.scss',
})
export class PickingQueueComponent implements OnInit, OnDestroy {
  isLoading = false;
  errorMessage = '';
  offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
  pushStatus: PushUiStatus = 'off';
  pushBusy = false;
  pushHint = '';
  searchTerm = '';
  selectedDate = this.localIso(0);
  statusFilter: 'pickable' | 'picking' | 'picked' | 'all' = 'all';

  orders: PickingOrder[] = [];
  selectedOrderIds: number[] = [];
  combineMessage = '';
  localStates = new Map<number, PickingState>();
  customerNameByNumber = new Map<string, string>();
  customerByNumber = new Map<string, PickingAddressCustomer>();
  queueEntries: QueueEntry[] = [];
  showPickerNameModal = false;
  pickerNameInput = '';
  pickerNameError = '';
  incoming: PickingFeedOrder[] = [];
  revealing = false;
  freshOrderIds = new Set<number>();
  private pendingPickingRoute: any[] | null = null;
  private feedSubscription?: Subscription;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly pickingState: PickingStateService,
    private readonly globalService: GlobalService,
    private readonly webPush: WebPushService,
    private readonly pickingFeed: PickingFeedService
  ) {}

  ngOnInit(): void {
    window.addEventListener('online', this.onConnectivity);
    window.addEventListener('offline', this.onConnectivity);
    this.pickingFeed.retain();
    this.feedSubscription = this.pickingFeed.updates$.subscribe((update) => {
      this.incoming = update.incoming;
      this.patchKnownOrders(update.orders);
    });
    this.loadQueue();
    void this.refreshPush();
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onConnectivity);
    window.removeEventListener('offline', this.onConnectivity);
    this.feedSubscription?.unsubscribe();
    this.pickingFeed.release();
  }

  get pushIcon(): string {
    return this.pushStatus === 'on' ? 'notifications_active' : 'notifications_off';
  }

  get pushLabel(): string {
    if (this.pushStatus === 'on') {
      return 'Mitteilungen ausschalten';
    }
    if (this.pushStatus === 'ios-install') {
      return 'Zuerst zum Home-Bildschirm hinzufügen';
    }
    if (this.pushStatus === 'denied') {
      return 'Mitteilungen sind blockiert';
    }
    return 'Mitteilungen für freigegebene Bestellungen';
  }

  async togglePush(): Promise<void> {
    if (this.pushBusy) {
      return;
    }
    if (this.pushStatus === 'denied') {
      this.pushHint = PUSH_DENIED_HINT;
      return;
    }
    this.pushBusy = true;
    this.pushHint = '';
    try {
      if (this.pushStatus === 'on') {
        await this.webPush.disable();
      } else {
        await this.webPush.enable();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mitteilungen konnten nicht geändert werden.';
      if (message === PUSH_DENIED_HINT) {
        this.pushHint = PUSH_DENIED_HINT;
      } else {
        alert(message);
      }
    } finally {
      this.pushBusy = false;
      await this.refreshPush();
    }
  }

  private async refreshPush(): Promise<void> {
    await this.webPush.refreshIfEnabled();
    this.pushStatus = await this.webPush.status();
  }

  private onConnectivity = (): void => {
    const wasOffline = this.offline;
    this.offline = !navigator.onLine;
    if (wasOffline && navigator.onLine) {
      void this.loadQueue();
    }
  };

  async loadQueue(): Promise<void> {
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

      this.orders = (response?.orders ?? []).filter(
        (order) =>
          order.status === 'released' ||
          order.status === 'picking' ||
          order.status === 'partially_picked' ||
          order.status === 'picked' ||
          order.status === 'completed'
      );

      await this.loadCustomerNames(headers);

      const states = await this.pickingState.getAllStates();
      this.localStates = new Map(states.map((state) => [state.orderId, state]));
      this.freshOrderIds = new Set();
      this.pickingFeed.acknowledge(this.orders.map((order) => order.order_id));
      this.rebuildQueue();
    } catch {
      this.errorMessage = this.offline
        ? 'Offline und noch keine Aufträge auf diesem Gerät gespeichert.'
        : 'Bestellungen konnten nicht geladen werden.';
      this.orders = [];
      this.queueEntries = [];
    } finally {
      this.isLoading = false;
    }
  }

  rebuildQueue(): void {
    const term = this.searchTerm.trim().toLowerCase();

    this.queueEntries = this.orders
      .filter((order) => this.matchesStatusFilter(order))
      .filter((order) => this.matchesDateFilter(order))
      .filter((order) => this.matchesSearch(order, term))
      .map((order) => {
        const bundleState = this.pickingState.findBundleState(
          [...this.localStates.values()],
          order.order_id
        );
        const localState = bundleState ?? this.localStates.get(order.order_id) ?? null;
        const validState =
          localState && this.isQueueStateValid(localState, order) ? localState : null;

        return {
          order,
          localState: validState,
          progress: this.getQueueProgress(order, validState),
        };
      })
      .sort((a, b) => this.compareQueueEntries(a, b));

    this.selectedOrderIds = this.selectedOrderIds.filter((id) =>
      this.orders.some((order) => order.order_id === id)
    );
  }

  private isQueueStateValid(state: PickingState, order: PickingOrder): boolean {
    if ((state.bundleOrderIds?.length ?? 0) > 1) {
      const bundled = (state.bundleOrderIds ?? [])
        .map((id) => this.orders.find((entry) => entry.order_id === id))
        .filter((entry): entry is PickingOrder => !!entry);
      if (bundled.length !== state.bundleOrderIds?.length) {
        return false;
      }
      return this.pickingState.isBundleFingerprintValid(state, bundled);
    }
    return this.pickingState.isFingerprintValid(state, order);
  }

  private matchesStatusFilter(order: PickingOrder): boolean {
    if (this.statusFilter === 'all') {
      return true;
    }
    if (this.statusFilter === 'picking') {
      return order.status === 'picking' || order.status === 'partially_picked';
    }
    if (this.statusFilter === 'picked') {
      return order.status === 'picked' || order.status === 'completed';
    }
    return order.status === 'released' || order.status === 'picking' || order.status === 'partially_picked';
  }

  private getQueueProgress(order: PickingOrder, localState: PickingState | null): PickingProgress {
    if (order.status === 'partially_picked' && !localState) {
      const total = order.items?.length ?? 0;
      const done = (order.items ?? []).filter((item) => item.picking_status === 'picked').length;
      return {
        done,
        total,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }
    if (order.status === 'picked' || order.status === 'completed') {
      const total = order.items?.length ?? 0;
      return {
        done: total,
        total,
        percent: total > 0 ? 100 : 0,
      };
    }
    if (localState?.bundleOrderIds && localState.bundleOrderIds.length > 1) {
      const items = localState.items.filter(
        (item) => item.sourceOrderId == null || item.sourceOrderId === order.order_id
      );
      return this.pickingState.getProgress({ ...localState, items });
    }
    return this.pickingState.getProgress(localState);
  }

  private matchesDateFilter(order: PickingOrder): boolean {
    if (!this.selectedDate) {
      return true;
    }

    const deliveryDate = this.normalizeDate(order.delivery_date);
    const orderDate = this.normalizeDate(order.order_date);

    return deliveryDate === this.selectedDate || (!deliveryDate && orderDate === this.selectedDate);
  }

  private matchesSearch(order: PickingOrder, term: string): boolean {
    if (!term) {
      return true;
    }

    const haystack = [
      order.order_id,
      order.name,
      order.company,
      order.customer_number,
      order.email,
      order.picker_user_name,
      order.customer_notes,
      this.getFullAddress(order),
      this.getCustomerNameFromMasterData(order.customer_number),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  }

  private compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
    const finishedDiff = Number(this.isFinished(a.order)) - Number(this.isFinished(b.order));
    if (finishedDiff !== 0) {
      return finishedDiff;
    }

    const recencyDiff = this.orderTimestamp(b.order) - this.orderTimestamp(a.order);
    if (recencyDiff !== 0) {
      return recencyDiff;
    }
    return b.order.order_id - a.order.order_id;
  }

  private isFinished(order: PickingOrder): boolean {
    return order.status === 'picked' || order.status === 'completed';
  }

  private orderTimestamp(order: PickingOrder): number {
    const raw = String(order.created_at || order.order_date || '').trim().replace(' ', 'T');
    const time = Date.parse(raw);
    return Number.isNaN(time) ? 0 : time;
  }

  matchingIncoming(): PickingFeedOrder[] {
    return this.incoming.filter((order) =>
      feedMatchesQueue(order, {
        statusFilter: this.statusFilter,
        selectedDate: this.selectedDate,
        searchTerm: this.searchTerm,
        extraName: this.getCustomerNameFromMasterData(order.customer_number),
      })
    );
  }

  incomingHiddenCount(): number {
    return Math.max(0, this.incoming.length - this.matchingIncoming().length);
  }

  incomingLabel(): string {
    const matching = this.matchingIncoming();
    const hidden = this.incomingHiddenCount();
    if (matching.length === 1 && hidden === 0) {
      const order = matching[0];
      return `Neu: #${order.order_id} · ${feedCustomerLabel(order)}`;
    }
    if (matching.length > 0 && hidden === 0) {
      return `${matching.length} neue Freigaben`;
    }
    if (matching.length > 0) {
      return `${matching.length} neue Freigaben · ${hidden} außerhalb des Filters`;
    }
    if (hidden === 1) {
      return '1 neue Freigabe passt nicht zum aktuellen Filter';
    }
    return `${hidden} neue Freigaben passen nicht zum aktuellen Filter`;
  }

  isFresh(orderId: number): boolean {
    return this.freshOrderIds.has(orderId);
  }

  async revealIncoming(): Promise<void> {
    const matching = this.matchingIncoming();
    if (!matching.length || this.revealing) {
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    this.revealing = true;
    try {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      });
      const loaded = await Promise.all(
        matching.map(async (hint) => {
          const response = await lastValueFrom(
            this.http.get<{ order: PickingOrder }>(
              `${environment.apiUrl}/api/orders/${hint.order_id}/with-items?scope=picking`,
              { headers }
            )
          );
          return response?.order ?? null;
        })
      );
      const fresh = loaded.filter((order): order is PickingOrder => !!order?.order_id);
      for (const order of fresh) {
        order.order_id = Number(order.order_id);
        if (!Array.isArray(order.items)) {
          order.items = [];
        }
      }
      if (!fresh.length) {
        return;
      }
      const freshIds = fresh.map((order) => order.order_id);
      this.orders = [...fresh.filter((order) => !this.orders.some((existing) => existing.order_id === order.order_id)), ...this.orders];
      const entries = fresh.map((order) => this.toQueueEntry(order));
      const freshIdSet = new Set(freshIds);
      this.queueEntries = [...entries, ...this.queueEntries.filter((entry) => !freshIdSet.has(entry.order.order_id))];
      this.freshOrderIds = new Set([...this.freshOrderIds, ...freshIds]);
      this.pickingFeed.acknowledge(freshIds);
      this.errorMessage = '';
      const firstId = freshIds[0];
      queueMicrotask(() => {
        document.getElementById(`order-card-${firstId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    } catch {
      /* Hinweis bleibt stehen, die bestehende Liste auch. */
    } finally {
      this.revealing = false;
    }
  }

  private patchKnownOrders(feedOrders: PickingFeedOrder[]): void {
    for (const hint of feedOrders) {
      const local = this.orders.find((order) => order.order_id === hint.order_id);
      if (!local) {
        continue;
      }
      local.status = hint.status;
      local.picker_user_id = hint.picker_user_id;
      local.picker_user_name = hint.picker_user_name ?? local.picker_user_name;
    }
  }

  private toQueueEntry(order: PickingOrder): QueueEntry {
    const bundleState = this.pickingState.findBundleState([...this.localStates.values()], order.order_id);
    const localState = bundleState ?? this.localStates.get(order.order_id) ?? null;
    const validState = localState && this.isQueueStateValid(localState, order) ? localState : null;
    return {
      order,
      localState: validState,
      progress: this.getQueueProgress(order, validState),
    };
  }

  onSearchChanged(value: string): void {
    this.searchTerm = value;
    this.rebuildQueue();
  }

  onDateChanged(value: string): void {
    this.selectedDate = value || '';
    this.rebuildQueue();
  }

  onAllDates(): void {
    this.selectedDate = '';
    this.rebuildQueue();
  }

  openDatePicker(input: HTMLInputElement): void {
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Der Browser öffnet den Picker über das native Datumsfeld.
    }
  }

  onStatusFilterChanged(value: 'pickable' | 'picking' | 'picked' | 'all'): void {
    this.statusFilter = value;
    this.rebuildQueue();
  }

  onOrderClick(order: PickingOrder): void {
    const partnerId = this.bundlePartnerId(order.order_id);
    if (partnerId) {
      this.openCombined(order.order_id, partnerId);
      return;
    }

    if (!this.canSelect(order)) {
      this.router.navigate(['/picking', order.order_id]);
      return;
    }

    this.combineMessage = '';

    if (this.isSelected(order.order_id)) {
      this.selectedOrderIds = this.selectedOrderIds.filter((id) => id !== order.order_id);
      return;
    }

    if (this.selectedOrderIds.length >= 2) {
      this.combineMessage =
        'Es können zwei Bestellungen zusammengelegt werden. Tippe eine Auswahl erneut an, um sie aufzuheben.';
      return;
    }

    if (this.selectedOrderIds.length === 1 && !this.sameCustomerAsSelection(order)) {
      this.combineMessage = 'Nur Bestellungen desselben Kunden können zusammengelegt werden.';
      return;
    }

    this.selectedOrderIds = [...this.selectedOrderIds, order.order_id];
  }

  canSelect(order: PickingOrder): boolean {
    if (this.bundlePartnerId(order.order_id)) {
      return false;
    }
    if (order.status !== 'released' && order.status !== 'picking') {
      return false;
    }
    if (!order.items?.length) {
      return false;
    }
    const userId = this.globalService.getUserId();
    if (
      order.status === 'picking' &&
      order.picker_user_id &&
      userId &&
      Number(order.picker_user_id) !== Number(userId)
    ) {
      return false;
    }
    return true;
  }

  isSelected(orderId: number): boolean {
    return this.selectedOrderIds.includes(orderId);
  }

  clearSelection(): void {
    this.selectedOrderIds = [];
    this.combineMessage = '';
  }

  selectionSharesCustomer(): boolean {
    const selected = this.selectedOrders();
    if (selected.length !== 2) {
      return false;
    }
    return this.ordersShareCustomer(selected[0], selected[1]);
  }

  private sameCustomerAsSelection(order: PickingOrder): boolean {
    const selected = this.selectedOrders()[0];
    if (!selected) {
      return true;
    }
    return this.ordersShareCustomer(selected, order);
  }

  private ordersShareCustomer(left: PickingOrder, right: PickingOrder): boolean {
    const leftNumber = (left.customer_number || '').trim();
    const rightNumber = (right.customer_number || '').trim();
    return !!leftNumber && leftNumber === rightNumber;
  }

  private openCombined(orderId: number, partnerId: number): void {
    const [first, second] = [orderId, partnerId].sort((a, b) => a - b);
    this.router.navigate(['/picking/combined', first, second]);
  }

  canStartCombined(): boolean {
    return (
      this.selectedOrderIds.length === 2 &&
      this.selectionSharesCustomer() &&
      this.selectedOrders().every((order) => this.canSelect(order))
    );
  }

  startCombined(): void {
    if (this.selectedOrderIds.length === 2 && !this.selectionSharesCustomer()) {
      this.combineMessage = 'Nur Bestellungen desselben Kunden können zusammengelegt werden.';
      return;
    }
    if (!this.canStartCombined()) {
      return;
    }

    const [first, second] = [...this.selectedOrderIds].sort((a, b) => a - b);
    const conflict = this.conflictingBundle(first, second);
    if (conflict) {
      this.combineMessage = `Eine Auswahl wird bereits zusammen mit #${conflict} kommissioniert.`;
      return;
    }

    this.askPickerNameThenNavigate(['/picking/combined', first, second]);
  }

  startSelected(): void {
    if (this.selectedOrderIds.length === 1) {
      this.askPickerNameThenNavigate(['/picking', this.selectedOrderIds[0]]);
      return;
    }
    this.startCombined();
  }

  private askPickerNameThenNavigate(route: any[]): void {
    this.pendingPickingRoute = route;
    this.pickerNameInput = getStoredPickerName();
    this.pickerNameError = '';
    this.showPickerNameModal = true;
  }

  closePickerNameModal(): void {
    this.showPickerNameModal = false;
    this.pickerNameError = '';
    this.pendingPickingRoute = null;
  }

  confirmPickerName(): void {
    const name = this.pickerNameInput.trim();
    if (!isUsablePickerName(name)) {
      this.pickerNameError = name.includes('@')
        ? 'Bitte den Namen eingeben, nicht die E-Mail.'
        : 'Bitte den Namen der kommissionierenden Person eingeben.';
      return;
    }

    saveStoredPickerName(name);
    markPickerNameConfirmed();
    this.showPickerNameModal = false;
    const route = this.pendingPickingRoute;
    this.pendingPickingRoute = null;
    if (route) {
      this.router.navigate(route);
    }
  }

  bundlePartnerId(orderId: number): number | null {
    const state = this.pickingState.findBundleState([...this.localStates.values()], orderId);
    if (!state?.bundleOrderIds) {
      return null;
    }
    return state.bundleOrderIds.find((id) => id !== orderId) ?? null;
  }

  private selectedOrders(): PickingOrder[] {
    return this.selectedOrderIds
      .map((id) => this.orders.find((order) => order.order_id === id))
      .filter((order): order is PickingOrder => !!order);
  }

  private conflictingBundle(first: number, second: number): number | null {
    for (const id of [first, second]) {
      const state = this.pickingState.findBundleState([...this.localStates.values()], id);
      if (!state?.bundleOrderIds) {
        continue;
      }
      const ids = [...state.bundleOrderIds].sort((a, b) => a - b);
      if (ids.length === 2 && ids[0] === first && ids[1] === second) {
        continue;
      }
      return state.bundleOrderIds.find((orderId) => orderId !== id) ?? null;
    }
    return null;
  }

  getCustomerLabel(order: PickingOrder): string {
    return (
      this.getCustomerNameFromMasterData(order.customer_number) ||
      order.company ||
      order.name ||
      order.customer_number ||
      `Bestellung #${order.order_id}`
    );
  }

  getOrderDateLabel(order: PickingOrder): string {
    return formatPickingDate(order.delivery_date || order.order_date);
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

  getCustomerNotes(order: PickingOrder): string {
    return (order.customer_notes || '').trim();
  }

  getPickerDisplayName(order: PickingOrder): string {
    return displayPickerName(order.picker_user_name);
  }

  getFullAddress(order: PickingOrder): string {
    const customer = order.customer_number
      ? this.customerByNumber.get(order.customer_number.trim())
      : undefined;
    return formatPickingAddress(order, customer);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'open':
        return 'Offen';
      case 'parked':
        return 'Geparkt';
      case 'released':
        return 'Freigegeben';
      case 'picking':
        return 'Wird kommissioniert';
      case 'partially_picked':
        return 'Teilweise kommissioniert';
      case 'picked':
      case 'completed':
        return 'Fertig';
      case 'delivered':
        return 'Ausgeliefert';
      case 'in_progress':
        return 'In Bearbeitung';
      default:
        return status;
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'open':
        return 'inventory_2';
      case 'parked':
        return 'local_parking';
      case 'released':
        return 'task_alt';
      case 'picking':
        return 'hourglass_top';
      case 'partially_picked':
        return 'schedule';
      case 'picked':
      case 'completed':
        return 'check_circle';
      default:
        return 'info';
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

  private localIso(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeDate(value?: string): string {
    if (!value) {
      return '';
    }
    return value.slice(0, 10);
  }

  private async loadCustomerNames(headers: HttpHeaders): Promise<void> {
    this.customerNameByNumber.clear();
    this.customerByNumber.clear();

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

        this.customerByNumber.set(number, {
          name_addition: customer.name_addition,
          street: customer.street,
          postal_code: customer.postal_code,
          city: customer.city,
        });
      }
    } catch {
      // Falls Kundendaten nicht geladen werden können, wird auf Order-Felder zurückgegriffen.
    }
  }

  private getCustomerNameFromMasterData(customerNumber?: string): string {
    if (!customerNumber) {
      return '';
    }
    return this.customerNameByNumber.get(customerNumber.trim()) || '';
  }
}
