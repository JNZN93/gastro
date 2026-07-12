import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PickingOrder } from '../../models/picking.models';
import { PickingState, PickingProgress } from '../../models/picking.models';
import { PickingStateService } from '../../services/picking-state.service';

interface QueueEntry {
  order: PickingOrder;
  progress: PickingProgress;
  localState: PickingState | null;
}

interface CustomerSummary {
  customer_number?: string;
  last_name_company?: string;
  first_name?: string;
}

@Component({
  selector: 'app-picking-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './picking-queue.component.html',
  styleUrl: './picking-queue.component.scss',
})
export class PickingQueueComponent implements OnInit {
  isLoading = false;
  errorMessage = '';
  searchTerm = '';
  dateFilter: 'all' | 'today' | 'tomorrow' = 'all';
  statusFilter: 'pickable' | 'picking' | 'all' = 'pickable';

  orders: PickingOrder[] = [];
  localStates = new Map<number, PickingState>();
  customerNameByNumber = new Map<string, string>();
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
        (order) => order.status === 'open' || order.status === 'picking'
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
          progress: this.pickingState.getProgress(validState),
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
    return order.status === 'open' || order.status === 'picking';
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
      this.getCustomerNameFromMasterData(order.customer_number),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  }

  private compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
    const statusWeight = (status: string) => (status === 'picking' ? 0 : 1);
    const statusDiff = statusWeight(a.order.status) - statusWeight(b.order.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const dateA = a.order.delivery_date || a.order.order_date || '';
    const dateB = b.order.delivery_date || b.order.order_date || '';
    return dateA.localeCompare(dateB);
  }

  onFiltersChanged(): void {
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

  getFulfillmentLabel(type?: string): string {
    if (type === 'delivery') {
      return 'Lieferung';
    }
    if (type === 'pickup') {
      return 'Abholung';
    }
    return type || '—';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'open':
        return 'Offen';
      case 'picking':
        return 'Wird kommissioniert';
      case 'picked':
        return 'Fertig kommissioniert';
      case 'delivered':
        return 'Ausgeliefert';
      case 'in_progress':
        return 'In Bearbeitung';
      default:
        return status;
    }
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
