import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CustomerOrderStateService {
  private readonly STORAGE_KEY = 'customer_order_state';
  private memoryState: any = null;

  saveStateMemory(state: any): void {
    this.memoryState = state;
  }

  saveStatePersistent(state: any): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Fehler beim Speichern in localStorage:', error);
    }
  }

  getState(): any | null {
    if (this.memoryState) {
      return this.memoryState;
    }
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Fehler beim Laden aus localStorage:', error);
      return null;
    }
  }

  clearState(): void {
    this.memoryState = null;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {}
  }

  hasMemoryState(): boolean {
    return this.memoryState !== null;
  }
}


