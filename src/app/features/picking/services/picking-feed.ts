export interface PickingFeedOrder {
  order_id: number;
  status: string;
  name?: string;
  company?: string;
  customer_number?: string;
  order_date?: string;
  delivery_date?: string;
  created_at?: string;
  updated_at?: string;
  picker_user_id?: number | null;
  picker_user_name?: string | null;
}

export type PickingStatusFilter = 'pickable' | 'picking' | 'picked' | 'all';

export interface PickingFeedFilter {
  statusFilter: PickingStatusFilter;
  selectedDate: string;
  searchTerm: string;
  extraName?: string;
}

/** Merkt sich, welche Aufträge die Ansicht schon kennt. Die erste Lieferung ist die Basis. */
export class PickingFeedTracker {
  private known = new Set<number>();
  private baselineReady = false;
  private latest: PickingFeedOrder[] = [];

  acknowledge(ids: number[]): PickingFeedOrder[] {
    for (const id of ids) {
      this.known.add(id);
    }
    this.baselineReady = true;
    return this.incoming();
  }

  apply(orders: PickingFeedOrder[]): PickingFeedOrder[] {
    this.latest = orders;
    if (!this.baselineReady) {
      for (const order of orders) {
        this.known.add(order.order_id);
      }
      this.baselineReady = true;
    }
    return this.incoming();
  }

  incoming(): PickingFeedOrder[] {
    return this.latest.filter((order) => !this.known.has(order.order_id));
  }
}

export function feedCustomerLabel(order: PickingFeedOrder): string {
  return (
    order.company ||
    order.name ||
    order.customer_number ||
    `Bestellung #${order.order_id}`
  );
}

export function feedMatchesQueue(order: PickingFeedOrder, filter: PickingFeedFilter): boolean {
  if (!matchesStatus(order.status, filter.statusFilter)) {
    return false;
  }
  if (!matchesDate(order, filter.selectedDate)) {
    return false;
  }
  return matchesSearch(order, filter.searchTerm, filter.extraName);
}

function matchesStatus(status: string, statusFilter: PickingStatusFilter): boolean {
  if (statusFilter === 'all') {
    return true;
  }
  if (statusFilter === 'picking') {
    return status === 'picking' || status === 'partially_picked';
  }
  if (statusFilter === 'picked') {
    return status === 'picked' || status === 'completed';
  }
  return status === 'released' || status === 'picking' || status === 'partially_picked';
}

function matchesDate(order: PickingFeedOrder, selectedDate: string): boolean {
  if (!selectedDate) {
    return true;
  }
  const deliveryDate = (order.delivery_date || '').slice(0, 10);
  const orderDate = (order.order_date || '').slice(0, 10);
  return deliveryDate === selectedDate || (!deliveryDate && orderDate === selectedDate);
}

function matchesSearch(order: PickingFeedOrder, searchTerm: string, extraName?: string): boolean {
  const term = searchTerm.trim().toLowerCase();
  if (!term) {
    return true;
  }
  const haystack = [
    order.order_id,
    order.name,
    order.company,
    order.customer_number,
    order.picker_user_name,
    extraName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}
