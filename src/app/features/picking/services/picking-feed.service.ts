import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, lastValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PickingFeedOrder, PickingFeedTracker } from './picking-feed';

const POLL_MS = 25_000;

export interface PickingFeedUpdate {
  orders: PickingFeedOrder[];
  incoming: PickingFeedOrder[];
}

@Injectable({
  providedIn: 'root',
})
export class PickingFeedService {
  private readonly tracker = new PickingFeedTracker();
  private readonly updatesSubject = new BehaviorSubject<PickingFeedUpdate>({ orders: [], incoming: [] });
  readonly updates$ = this.updatesSubject.asObservable();

  private holders = 0;
  private timer: number | null = null;
  private polling = false;
  private rerun = false;
  private bound = false;

  constructor(private readonly http: HttpClient) {}

  retain(): void {
    this.holders += 1;
    if (this.holders === 1) {
      this.bind();
      void this.poll();
      this.arm();
    }
  }

  release(): void {
    this.holders = Math.max(0, this.holders - 1);
    if (this.holders === 0) {
      this.unbind();
      this.clearTimer();
    }
  }

  acknowledge(ids: number[]): void {
    const incoming = this.tracker.acknowledge(ids);
    this.updatesSubject.next({
      orders: this.updatesSubject.value.orders,
      incoming,
    });
  }

  poll(): Promise<void> {
    if (this.holders === 0) {
      return Promise.resolve();
    }
    if (this.polling) {
      this.rerun = true;
      return Promise.resolve();
    }
    this.polling = true;
    const run = async () => {
      try {
        do {
          this.rerun = false;
          await this.fetchOnce();
        } while (this.rerun);
      } finally {
        this.polling = false;
      }
    };
    return run();
  }

  private async fetchOnce(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    try {
      const response = await lastValueFrom(
        this.http.get<{ orders?: unknown[] }>(`${environment.apiUrl}/api/orders/picking-feed`, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }),
        })
      );
      const orders = (response?.orders ?? [])
        .map((row) => normalizeFeedOrder(row))
        .filter((row): row is PickingFeedOrder => !!row);
      const incoming = this.tracker.apply(orders);
      this.updatesSubject.next({ orders, incoming });
    } catch {
      /* Die sichtbare Liste bleibt unverändert. */
    }
  }

  private bind(): void {
    if (this.bound || typeof window === 'undefined') {
      return;
    }
    this.bound = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    navigator.serviceWorker?.addEventListener('message', this.onWorkerMessage);
  }

  private unbind(): void {
    if (!this.bound || typeof window === 'undefined') {
      return;
    }
    this.bound = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    navigator.serviceWorker?.removeEventListener('message', this.onWorkerMessage);
  }

  private arm(): void {
    this.clearTimer();
    if (typeof window === 'undefined') {
      return;
    }
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) {
        return;
      }
      void this.poll();
    }, POLL_MS);
  }

  private clearTimer(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      void this.poll();
    }
  };

  private onOnline = (): void => {
    void this.poll();
  };

  private onWorkerMessage = (event: Event): void => {
    const data = (event as MessageEvent).data as { type?: string } | undefined;
    if (data?.type === 'PICKING_FEED') {
      void this.poll();
    }
  };
}

function normalizeFeedOrder(raw: unknown): PickingFeedOrder | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const orderId = Number(row['order_id']);
  if (!Number.isFinite(orderId)) {
    return null;
  }
  const pickerId = row['picker_user_id'];
  return {
    order_id: orderId,
    status: String(row['status'] || ''),
    name: stringOrEmpty(row['name']),
    company: stringOrEmpty(row['company']),
    customer_number: stringOrEmpty(row['customer_number']),
    order_date: stringOrEmpty(row['order_date']),
    delivery_date: stringOrEmpty(row['delivery_date']),
    created_at: stringOrEmpty(row['created_at']),
    updated_at: stringOrEmpty(row['updated_at']),
    picker_user_id: pickerId == null || pickerId === '' ? null : Number(pickerId),
    picker_user_name: row['picker_user_name'] ? String(row['picker_user_name']) : null,
  };
}

function stringOrEmpty(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value);
}
