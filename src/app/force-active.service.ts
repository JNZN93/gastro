import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ForceActiveOffer {
  offerId: number;
  offerName: string;
  isActive: boolean;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class ForceActiveService {
  private readonly STORAGE_KEY = 'force_active_offer';
  private forceActiveSubject = new BehaviorSubject<ForceActiveOffer | null>(this.loadFromStorage());

  constructor() { }

  /**
   * Aktiviert ein bestimmtes Angebot als force_active
   */
  activateOffer(offerId: number, offerName: string): void {
    const forceActiveOffer: ForceActiveOffer = {
      offerId,
      offerName,
      isActive: true,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(forceActiveOffer));
    this.forceActiveSubject.next(forceActiveOffer);

    console.log('🔥 Force Active Angebot aktiviert:', forceActiveOffer);
  }

  /**
   * Deaktiviert das force_active Angebot
   */
  deactivateOffer(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.forceActiveSubject.next(null);

    console.log('❌ Force Active Angebot deaktiviert');
  }

  /**
   * Gibt das aktuell force_active Angebot zurück
   */
  getActiveOffer(): ForceActiveOffer | null {
    return this.forceActiveSubject.value;
  }

  /**
   * Observable für Änderungen am force_active Status
   */
  getActiveOfferObservable(): Observable<ForceActiveOffer | null> {
    return this.forceActiveSubject.asObservable();
  }

  /**
   * Prüft ob ein bestimmtes Angebot als force_active markiert ist
   */
  isOfferForceActive(offerId: number): boolean {
    const activeOffer = this.getActiveOffer();
    return activeOffer ? activeOffer.offerId === offerId && activeOffer.isActive : false;
  }

  /**
   * Lädt den force_active Status aus localStorage
   */
  private loadFromStorage(): ForceActiveOffer | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Prüfe ob das gespeicherte Angebot noch gültig ist (z.B. nicht älter als 24h)
        const timestamp = new Date(parsed.timestamp);
        const now = new Date();
        const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < 24) { // 24 Stunden Gültigkeit
          console.log('🔄 Force Active Angebot aus Storage geladen:', parsed);
          return parsed;
        } else {
          // Angebot ist abgelaufen, entfernen
          console.log('⏰ Force Active Angebot abgelaufen, entferne aus Storage');
          localStorage.removeItem(this.STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('❌ Fehler beim Laden des force_active Status:', error);
      localStorage.removeItem(this.STORAGE_KEY);
    }

    return null;
  }

  /**
   * Gibt eine lesbare Beschreibung des aktuellen Status zurück
   */
  getStatusDescription(): string {
    const activeOffer = this.getActiveOffer();
    if (activeOffer) {
      return `Force Active: ${activeOffer.offerName} (ID: ${activeOffer.offerId})`;
    }
    return 'Kein Force Active Angebot';
  }
}
