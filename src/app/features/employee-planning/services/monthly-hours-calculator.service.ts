import { Injectable } from '@angular/core';
import { HolidayService } from './holiday.service';

export const DEFAULT_WEEKLY_WORK_DAYS = 5;
export const MIN_WEEKLY_WORK_DAYS = 1;
export const MAX_WEEKLY_WORK_DAYS = 6;
export const WEEKLY_WORK_DAY_CHOICES = [1, 2, 3, 4, 5, 6] as const;

export function normalizeWeeklyWorkDays(value: number | undefined | null): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WEEKLY_WORK_DAYS;
  }
  return Math.min(MAX_WEEKLY_WORK_DAYS, Math.max(MIN_WEEKLY_WORK_DAYS, parsed));
}

export function normalizeWeeklyWorkWeekdays(
  weekdays?: number[] | null,
  weeklyWorkDays?: number | null
): number[] {
  const count = normalizeWeeklyWorkDays(weeklyWorkDays ?? (weekdays?.length || DEFAULT_WEEKLY_WORK_DAYS));
  return [1, 2, 3, 4, 5, 6].slice(0, count);
}

/**
 * Berechnet Monats-Sollstunden aus Wochenstunden:
 * weeklyHours × (Mo–Fr ohne Feiertage / 5)
 * Unabhängig von der Anzahl geplanter Arbeitstage pro Woche.
 */
@Injectable({ providedIn: 'root' })
export class MonthlyHoursCalculatorService {
  constructor(private readonly holidayService: HolidayService) {}

  normalizeWeeklyWorkDays(value: number | undefined | null): number {
    return normalizeWeeklyWorkDays(value);
  }

  normalizeWeeklyWorkWeekdays(
    weekdays?: number[] | null,
    weeklyWorkDays?: number | null
  ): number[] {
    return normalizeWeeklyWorkWeekdays(weekdays, weeklyWorkDays);
  }

  formatWeeklyWorkDaysOption(weeklyWorkDays: number): string {
    const days = this.normalizeWeeklyWorkDays(weeklyWorkDays);
    return days === 1 ? '1 Tag/Woche' : `${days} Tage/Woche`;
  }

  /** Montag 12:00 der ISO-Woche als Vergleichsschlüssel. */
  getWeekStart(date: Date): Date {
    const start = new Date(date);
    const weekday = start.getDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    start.setDate(start.getDate() + diff);
    start.setHours(12, 0, 0, 0);
    return start;
  }

  isSameWeek(a: Date, b: Date): boolean {
    return this.getWeekStart(a).getTime() === this.getWeekStart(b).getTime();
  }

  /** Stundenanteil des i-ten Arbeitstags einer Woche (0-basiert). */
  dayShareForIndex(index: number, weeklyHours: number, weeklyWorkDays: number): number {
    const days = this.normalizeWeeklyWorkDays(weeklyWorkDays);
    if (index < 0 || index >= days || weeklyHours <= 0) {
      return 0;
    }

    const totalHundredths = Math.round(weeklyHours * 100);
    const baseHundredths = Math.floor(totalHundredths / days);
    const extraHundredths = totalHundredths % days;
    const hundredths = baseHundredths + (index < extraHundredths ? 1 : 0);
    return hundredths / 100;
  }

  countWorkDaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = this.holidayService.createLocalDate(year, month, day);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) {
        continue;
      }
      if (this.holidayService.isHoliday(date)) {
        continue;
      }
      count++;
    }

    return count;
  }

  calculateSuggestedMonthlyHours(weeklyHours: number, year: number, month: number): number {
    const workDays = this.countWorkDaysInMonth(year, month);
    if (workDays <= 0 || weeklyHours <= 0) {
      return 0;
    }
    return Math.round(weeklyHours * (workDays / 5) * 100) / 100;
  }
}
