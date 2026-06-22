import { Injectable } from '@angular/core';
import Holidays from 'date-holidays';

/** Feiertagsinformation für einen einzelnen Tag. */
export interface HolidayInfo {
  name: string;
}

/**
 * Ermittelt gesetzliche Feiertage für Rheinland-Pfalz (DE-RP)
 * über das npm-Paket date-holidays.
 */
@Injectable({ providedIn: 'root' })
export class HolidayService {
  private readonly holidays = new Holidays('DE', 'RP');

  /** Prüft, ob ein Datum ein Feiertag in Rheinland-Pfalz ist. */
  isHoliday(date: Date): boolean {
    return this.getHolidayInfo(date) !== null;
  }

  /** Liefert den Feiertagsnamen oder null, wenn kein Feiertag. */
  getHolidayInfo(date: Date): HolidayInfo | null {
    const normalized = this.normalizeDate(date);
    const result = this.holidays.isHoliday(normalized);

    if (!result || result.length === 0) {
      return null;
    }

    // Öffentliche Feiertage bevorzugen; sonst ersten Eintrag nehmen
    const publicHoliday = result.find((h) => h.type === 'public') ?? result[0];
    return { name: publicHoliday.name };
  }

  /** Erzeugt ein lokales Datum ohne Zeitzonen-Verschiebung (Mittag). */
  createLocalDate(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  private normalizeDate(date: Date): Date {
    return this.createLocalDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    );
  }
}
