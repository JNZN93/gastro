import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
    MatButtonToggleModule,
  ],
  templateUrl: './picking-queue.component.html',
  styleUrl: './picking-queue.component.scss',
})
export class PickingQueueComponent implements OnInit {
  isLoading = false;
  errorMessage = '';
  searchTerm = '';
  dateFilter: 'all' | 'today' | 'tomorrow' = 'all';
  statusFilter: 'pickable' | 'picking' | 'picked' | 'all' = 'all';

  orders: PickingOrder[] = [];
  localStates = new Map<number, PickingState>();
  customerNameByNumber = new Map<string, string>();
  customerByNumber = new Map<string, PickingAddressCustomer>();
  queueEntries: QueueEntry[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly pickingState: PickingStateService
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
          order.status === 'open' ||
          order.status === 'picking' ||
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
        const localState = this.localStates.get(order.order_id) ?? null;
        const validState =
          localState && this.pickingState.isFingerprintValid(localState, order)
            ? localState
            : null;

        return {
          order,
          localState: validState,
          progress: this.getQueueProgress(order, validState),
        };
      })
      .sort((a, b) => this.compareQueueEntries(a, b));
  }

  private matchesStatusFilter(order: PickingOrder): boolean {
    if (this.statusFilter === 'all') {
      return true;
    }
    if (this.statusFilter === 'picking') {
      return order.status === 'picking';
    }
    if (this.statusFilter === 'picked') {
      return order.status === 'picked' || order.status === 'completed';
    }
    return order.status === 'open' || order.status === 'picking';
  }

  private getQueueProgress(order: PickingOrder, localState: PickingState | null): PickingProgress {
    if (order.status === 'picked' || order.status === 'completed') {
      const total = order.items?.length ?? 0;
      return {
        done: total,
        total,
        percent: total > 0 ? 100 : 0,
      };
    }
    return this.pickingState.getProgress(localState);
  }

  private matchesDateFilter(order: PickingOrder): boolean {
    if (this.dateFilter === 'all') {
      return true;
    }

    const target = this.dateFilter === 'today' ? this.todayIso() : this.tomorrowIso();
    const deliveryDate = this.normalizeDate(order.delivery_date);
    const orderDate = this.normalizeDate(order.order_date);

    return deliveryDate === target || (!deliveryDate && orderDate === target);
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
      if (status === 'picking') return 0;
      if (status === 'open') return 1;
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

  onDateFilterChanged(value: 'all' | 'today' | 'tomorrow'): void {
    this.dateFilter = value;
    this.rebuildQueue();
  }

  onStatusFilterChanged(value: 'pickable' | 'picking' | 'picked' | 'all'): void {
    this.statusFilter = value;
    this.rebuildQueue();
  }

  openOrder(orderId: number): void {
    this.router.navigate(['/picking', orderId]);
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
      case 'picking':
        return 'Wird kommissioniert';
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
      case 'picking':
        return 'hourglass_top';
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

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private tomorrowIso(): string {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
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
