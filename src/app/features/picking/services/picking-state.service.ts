import { Injectable } from '@angular/core';
import {
  PickItemState,
  PickItemStatus,
  PickingOrder,
  PickingOrderItem,
  PickingProgress,
  PickingState,
} from '../models/picking.models';

const DB_NAME = 'GastroPickingDB';
const DB_VERSION = 1;
const STORE_NAME = 'pickingStates';

@Injectable({ providedIn: 'root' })
export class PickingStateService {
  private db: IDBDatabase | null = null;

  async initDB(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject('IndexedDB konnte nicht geöffnet werden');

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'orderId' });
        }
      };
    });
  }

  cloneOrderItems(items: PickingOrderItem[] = []): PickingOrderItem[] {
    return items.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      price: item.price,
      different_price: item.different_price ?? null,
      product_name: item.product_name,
      product_article_number: item.product_article_number,
    }));
  }

  computeOrderFingerprint(items: PickingOrderItem[]): string {
    return items
      .map((item, index) => `${index}:${item.product_id}:${item.product_article_number}:${item.quantity}`)
      .join('|');
  }

  buildItemKey(item: PickingOrderItem, index: number): string {
    return `${item.product_id}:${index}`;
  }

  createInitialState(order: PickingOrder, startedBy: string): PickingState {
    return this.createStateFromOrder(order, startedBy, false);
  }

  createStateFromOrder(order: PickingOrder, startedBy: string, markAsPicked: boolean): PickingState {
    const originalItems = this.cloneOrderItems(order.items);
    return {
      orderId: order.order_id,
      orderFingerprint: this.computeOrderFingerprint(originalItems),
      startedAt: new Date().toISOString(),
      startedBy,
      originalItems,
      items: originalItems.map((item, index) => {
        const quantity = Number(item.quantity);
        return {
          key: this.buildItemKey(item, index),
          productId: item.product_id,
          articleNumber: item.product_article_number,
          productName: item.product_name,
          targetQuantity: quantity,
          pickedQuantity: markAsPicked ? quantity : 0,
          status: (markAsPicked ? 'picked' : 'pending') as PickItemStatus,
          price: item.price != null ? Number(item.price) : 0,
          differentPrice:
            item.different_price != null && item.different_price !== ''
              ? Number(item.different_price)
              : null,
          sourceOrderId: order.order_id,
          originalIndex: index,
        };
      }),
    };
  }

  isFingerprintValid(state: PickingState, order: PickingOrder): boolean {
    return state.orderFingerprint === this.computeOrderFingerprint(order.items);
  }

  computeBundleFingerprint(orders: PickingOrder[]): string {
    return [...orders]
      .sort((a, b) => a.order_id - b.order_id)
      .map((order) => `${order.order_id}=${this.computeOrderFingerprint(order.items)}`)
      .join('||');
  }

  isBundleFingerprintValid(state: PickingState, orders: PickingOrder[]): boolean {
    return state.orderFingerprint === this.computeBundleFingerprint(orders);
  }

  createBundleState(orders: PickingOrder[], startedBy: string, markAsPicked = false): PickingState {
    const sorted = [...orders].sort((a, b) => a.order_id - b.order_id);
    const originalItemsByOrder: Record<number, PickingOrderItem[]> = {};
    const items: PickItemState[] = [];

    for (const order of sorted) {
      const partial = this.createStateFromOrder(order, startedBy, markAsPicked);
      originalItemsByOrder[order.order_id] = partial.originalItems ?? [];
      items.push(
        ...partial.items.map((item) => ({
          ...item,
          key: `${order.order_id}:${item.key}`,
        }))
      );
    }

    const anchor = sorted[0];
    return {
      orderId: anchor.order_id,
      bundleOrderIds: sorted.map((order) => order.order_id),
      orderFingerprint: this.computeBundleFingerprint(sorted),
      startedAt: new Date().toISOString(),
      startedBy,
      originalItems: originalItemsByOrder[anchor.order_id],
      originalItemsByOrder,
      items: this.arrangeForPicking(items),
    };
  }

  findBundleState(states: PickingState[], orderId: number): PickingState | null {
    return (
      states.find(
        (state) =>
          (state.bundleOrderIds?.length ?? 0) > 1 &&
          !!state.bundleOrderIds?.includes(orderId) &&
          !state.completedAt
      ) ?? null
    );
  }

  /**
   * Pfand, das in der Bestellung direkt auf den Artikel folgt, an diese Position hängen.
   * Danach bleibt es beim Sortieren unter dem Artikel und wird beim Speichern wieder direkt dahinter geschrieben.
   */
  linkConsecutivePfand(items: PickItemState[]): void {
    for (const item of items) {
      if (item.isPfandLine || item.parentItemKey || item.originalIndex == null || !item.customField1) {
        continue;
      }

      const successor = items.find(
        (candidate) =>
          candidate !== item &&
          !candidate.parentItemKey &&
          candidate.originalIndex === item.originalIndex! + 1 &&
          candidate.sourceOrderId === item.sourceOrderId &&
          candidate.articleNumber === item.customField1 &&
          (candidate.isPfandLine === true || candidate.category === 'PFAND')
      );
      if (!successor) {
        continue;
      }

      successor.parentItemKey = item.key;
      successor.isPfandLine = true;
      item.pfandEnabled = true;
    }
  }

  /**
   * Gleiche Artikel untereinander. Angehängtes Pfand steht direkt unter dem Artikel.
   */
  arrangeForPicking(items: PickItemState[]): PickItemState[] {
    const pfandByParent = new Map<string, PickItemState[]>();
    const parents: PickItemState[] = [];

    for (const item of items) {
      if (this.isAttachedPfand(item)) {
        const list = pfandByParent.get(item.parentItemKey!) ?? [];
        list.push(item);
        pfandByParent.set(item.parentItemKey!, list);
        continue;
      }
      parents.push(item);
    }

    parents.sort((a, b) => {
      const articleDiff = a.articleNumber.localeCompare(b.articleNumber, 'de', { numeric: true });
      if (articleDiff !== 0) {
        return articleDiff;
      }
      const orderDiff = (a.sourceOrderId ?? 0) - (b.sourceOrderId ?? 0);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    });

    const arranged: PickItemState[] = [];
    for (const parent of parents) {
      arranged.push(parent);
      arranged.push(...(pfandByParent.get(parent.key) ?? []));
    }
    return arranged;
  }

  /**
   * Positionen einer Bestellung in der ursprünglichen Reihenfolge.
   * Hinzugefügte Zeilen stehen am Ende, Pfand direkt hinter der Elternposition.
   */
  itemsInOriginalOrder(items: PickItemState[], orderId: number): PickItemState[] {
    const relevant = items.filter(
      (item) => item.sourceOrderId == null || item.sourceOrderId === orderId
    );
    const pfandByParent = new Map<string, PickItemState[]>();
    const parents: PickItemState[] = [];

    for (const item of relevant) {
      if (this.isAttachedPfand(item)) {
        const list = pfandByParent.get(item.parentItemKey!) ?? [];
        list.push(item);
        pfandByParent.set(item.parentItemKey!, list);
        continue;
      }
      parents.push(item);
    }

    const hasOriginalIndex = parents.some((item) => item.originalIndex != null);
    if (hasOriginalIndex) {
      parents.sort((a, b) => {
        const indexA = a.originalIndex ?? Number.MAX_SAFE_INTEGER;
        const indexB = b.originalIndex ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }

    const ordered: PickItemState[] = [];
    for (const parent of parents) {
      ordered.push(parent);
      ordered.push(...(pfandByParent.get(parent.key) ?? []));
    }
    return ordered;
  }

  async deleteRelatedStates(orderIds: number[]): Promise<void> {
    const states = await this.getAllStates();
    const related = states.filter((state) => {
      const ids = state.bundleOrderIds?.length ? state.bundleOrderIds : [state.orderId];
      return ids.some((id) => orderIds.includes(id));
    });

    for (const state of related) {
      await this.deleteState(state.orderId);
    }
  }

  private isAttachedPfand(item: PickItemState): boolean {
    return !!item.parentItemKey && (item.isPfandLine === true || item.category === 'PFAND');
  }

  getProgress(state: PickingState | null): PickingProgress {
    if (!state || state.items.length === 0) {
      return { done: 0, total: 0, percent: 0 };
    }

    const total = state.items.length;
    const done = state.items.filter((item) => item.status !== 'pending').length;

    return {
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }

  canComplete(state: PickingState): boolean {
    return state.items.every((item) => item.status !== 'pending');
  }

  updateItemStatus(item: PickItemState): PickItemStatus {
    if (item.status === 'unavailable') {
      return 'unavailable';
    }
    if (item.pickedQuantity <= 0) {
      return 'pending';
    }
    if (item.pickedQuantity >= item.targetQuantity) {
      return 'picked';
    }
    return 'partial';
  }

  async getState(orderId: number): Promise<PickingState | null> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(orderId);

      request.onsuccess = () => resolve((request.result as PickingState) ?? null);
      request.onerror = () => reject('Fehler beim Laden des Pick-Status');
    });
  }

  async getAllStates(): Promise<PickingState[]> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result as PickingState[]) ?? []);
      request.onerror = () => reject('Fehler beim Laden der Pick-Status');
    });
  }

  async saveState(state: PickingState): Promise<void> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state);

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Fehler beim Speichern des Pick-Status');
    });
  }

  async deleteState(orderId: number): Promise<void> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Datenbank nicht initialisiert');
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(orderId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Fehler beim Löschen des Pick-Status');
    });
  }
}
