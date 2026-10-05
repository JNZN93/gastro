import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom, Subscription } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PickingFeedService } from '../../services/picking-feed.service';
import {
  BoardColumnKey,
  PickingFeedOrder,
  boardColumn,
  isBoardOrderForDate,
} from '../../services/picking-feed';

interface CustomerSummary {
  customer_number?: string;
  last_name_company?: string;
  first_name?: string;
}

interface BoardColumn {
  key: BoardColumnKey;
  title: string;
  orders: PickingFeedOrder[];
}

@Component({
  selector: 'app-picking-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './picking-board.component.html',
  styleUrl: './picking-board.component.scss',
})
export class PickingBoardComponent implements OnInit, OnDestroy {
  orders: PickingFeedOrder[] = [];
  loaded = false;
  errorMessage = '';
  now = new Date();

  private customerNameByNumber = new Map<string, string>();
  private feedSubscription?: Subscription;
  private clock?: ReturnType<typeof setInterval>;
  private loadTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly http: HttpClient,
    private readonly pickingFeed: PickingFeedService
  ) {}

  ngOnInit(): void {
    document.body.classList.add('picking-board-mode');
    this.tick();
    this.clock = setInterval(() => this.tick(), 1000);
    void this.loadCustomerNames();

    this.pickingFeed.retain();
    let first = true;
    this.feedSubscription = this.pickingFeed.updates$.subscribe((update) => {
      this.orders = update.orders;
      if (first) {
        first = false;
        if (update.orders.length > 0) {
          this.markLoaded();
        }
        return;
      }
      this.markLoaded();
    });

    this.loadTimer = setTimeout(() => {
      if (!this.loaded) {
        this.errorMessage = 'Bestellungen konnten nicht geladen werden.';
        this.loaded = true;
      }
    }, 8000);
  }

  ngOnDestroy(): void {
    document.body.classList.remove('picking-board-mode');
    if (this.clock) {
      clearInterval(this.clock);
    }
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
    }
    this.feedSubscription?.unsubscribe();
    this.pickingFeed.release();
  }

  get todayIso(): string {
    const year = this.now.getFullYear();
    const month = String(this.now.getMonth() + 1).padStart(2, '0');
    const day = String(this.now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  get dateLabel(): string {
    return this.now.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  get timeLabel(): string {
    return this.now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  get columns(): BoardColumn[] {
    const groups: Record<BoardColumnKey, PickingFeedOrder[]> = {
      released: [],
      picking: [],
      done: [],
    };

    for (const order of this.orders) {
      if (!isBoardOrderForDate(order, this.todayIso)) {
        continue;
      }
      const column = boardColumn(order.status);
      if (column) {
        groups[column].push(order);
      }
    }

    for (const list of Object.values(groups)) {
      list.sort((a, b) => recency(b) - recency(a) || b.order_id - a.order_id);
    }

    return [
      { key: 'released', title: 'Freigegeben', orders: groups.released },
      { key: 'picking', title: 'Wird kommissioniert', orders: groups.picking },
      { key: 'done', title: 'Fertig kommissioniert', orders: groups.done },
    ];
  }

  customerName(order: PickingFeedOrder): string {
    const fromMaster = order.customer_number
      ? this.customerNameByNumber.get(order.customer_number.trim())
      : '';
    return fromMaster || order.company || order.name || order.customer_number || 'Kunde';
  }

  private tick(): void {
    this.now = new Date();
  }

  private markLoaded(): void {
    this.loaded = true;
    this.errorMessage = '';
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = undefined;
    }
  }

  private async loadCustomerNames(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      const customers = await lastValueFrom(
        this.http.get<CustomerSummary[]>(`${environment.apiUrl}/api/customers`, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }),
        })
      );

      this.customerNameByNumber.clear();
      for (const customer of customers ?? []) {
        const number = (customer.customer_number || '').trim();
        if (!number) {
          continue;
        }
        const name = [customer.last_name_company, customer.first_name]
          .map((value) => (value || '').trim())
          .filter(Boolean)
          .join(' ')
          .trim();
        if (name) {
          this.customerNameByNumber.set(number, name);
        }
      }
    } catch {
      /* Anzeige fällt auf Name und Firma der Bestellung zurück. */
    }
  }
}

function recency(order: PickingFeedOrder): number {
  const stamp = Date.parse(order.updated_at || order.created_at || order.order_date || '');
  return Number.isFinite(stamp) ? stamp : 0;
}
