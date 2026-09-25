import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
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
export class PickingQueueComponent implements OnInit {
  isLoading = false;
  errorMessage = '';
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

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly pickingState: PickingStateService,
    private readonly globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.loadQueue();
  }

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
      this.rebuildQueue();
    } catch {
      this.errorMessage = 'Bestellungen konnten nicht geladen werden.';
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
    const statusWeight = (status: string) => {
      if (status === 'picking' || status === 'partially_picked') return 0;
      if (status === 'released') return 1;
      if (status === 'picked') return 2;
      return 3;
    };
    const statusDiff = statusWeight(a.order.status) - statusWeight(b.order.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const dateA = a.order.delivery_date || a.order.order_date || '';
    const dateB = b.order.delivery_date || b.order.order_date || '';
    return dateA.localeCompare(dateB);
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

    this.openCombined(first, second);
  }

  startSelected(): void {
    if (this.selectedOrderIds.length === 1) {
      this.router.navigate(['/picking', this.selectedOrderIds[0]]);
      return;
    }
    this.startCombined();
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
