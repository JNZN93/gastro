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

  computeOrderFingerprint(items: PickingOrderItem[]): string {
    return items
      .map((item, index) => `${index}:${item.product_id}:${item.product_article_number}:${item.quantity}`)
      .join('|');
  }

  buildItemKey(item: PickingOrderItem, index: number): string {
    return `${item.product_id}:${index}`;
  }

  createInitialState(order: PickingOrder, startedBy: string): PickingState {
    return {
      orderId: order.order_id,
      orderFingerprint: this.computeOrderFingerprint(order.items),
      startedAt: new Date().toISOString(),
      startedBy,
      items: order.items.map((item, index) => ({
        key: this.buildItemKey(item, index),
        productId: item.product_id,
        articleNumber: item.product_article_number,
        productName: item.product_name,
        targetQuantity: Number(item.quantity),
        pickedQuantity: 0,
        status: 'pending' as const,
        price: item.price != null ? Number(item.price) : 0,
        differentPrice:
          item.different_price != null && item.different_price !== ''
            ? Number(item.different_price)
            : null,
      })),
    };
  }

  isFingerprintValid(state: PickingState, order: PickingOrder): boolean {
    return state.orderFingerprint === this.computeOrderFingerprint(order.items);
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
