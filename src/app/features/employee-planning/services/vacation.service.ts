import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AbsenceDayResult, AbsenceType, VacationEntry } from '../models/vacation.model';
import { HolidayService } from './holiday.service';

const STORAGE_KEY = 'employee-planning:vacations';

/**
 * Verwaltet bezahlten Urlaub und unbezahltes Arbeitsfrei pro Mitarbeiter.
 */
@Injectable({ providedIn: 'root' })
export class VacationService {
  private readonly vacationsSubject = new BehaviorSubject<VacationEntry[]>(this.loadFromStorage());

  readonly vacations$: Observable<VacationEntry[]> = this.vacationsSubject.asObservable();

  constructor(private readonly holidayService: HolidayService) {}

  getAbsenceType(employeeId: string, date: Date): AbsenceType | null {
    const key = this.formatDateKey(date);
    const entry = this.vacationsSubject.value.find(
      (item) => item.employeeId === employeeId && item.date === key
    );
    return entry?.type ?? null;
  }

  isPaidVacationDay(employeeId: string, date: Date): boolean {
    return this.getAbsenceType(employeeId, date) === 'paid';
  }

  isUnpaidDayOff(employeeId: string, date: Date): boolean {
    return this.getAbsenceType(employeeId, date) === 'unpaid';
  }

  isSickDay(employeeId: string, date: Date): boolean {
    return this.getAbsenceType(employeeId, date) === 'sick';
  }

  /** @deprecated Verwende isPaidVacationDay */
  isVacationDay(employeeId: string, date: Date): boolean {
    return this.isPaidVacationDay(employeeId, date);
  }

  getUsedPaidVacationDaysForYear(employeeId: string, year: number): number {
    const prefix = `${year}-`;
    return this.vacationsSubject.value.filter(
      (entry) => entry.employeeId === employeeId && entry.type === 'paid' && entry.date.startsWith(prefix)
    ).length;
  }

  getRemainingPaidVacationDays(employeeId: string, year: number, annualAllowance: number): number {
    return Math.max(0, annualAllowance - this.getUsedPaidVacationDaysForYear(employeeId, year));
  }

  canAddPaidVacation(employeeId: string, year: number, annualAllowance: number): boolean {
    return this.getRemainingPaidVacationDays(employeeId, year, annualAllowance) > 0;
  }

  getAbsenceCountForMonth(
    employeeId: string,
    year: number,
    month: number,
    type?: AbsenceType
  ): number {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    return this.vacationsSubject.value.filter((entry) => {
      if (entry.employeeId !== employeeId || !entry.date.startsWith(prefix)) {
        return false;
      }
      return type ? entry.type === type : true;
    }).length;
  }

  getVacationCountForMonth(employeeId: string, year: number, month: number): number {
    return this.getAbsenceCountForMonth(employeeId, year, month, 'paid');
  }

  applyDaySelection(
    employeeId: string,
    date: Date,
    selectedType: AbsenceType,
    annualAllowance: number
  ): AbsenceDayResult {
    const key = this.formatDateKey(date);
    const year = date.getFullYear();
    const vacations = [...this.vacationsSubject.value];
    const index = vacations.findIndex(
      (entry) => entry.employeeId === employeeId && entry.date === key
    );

    if (index >= 0) {
      const current = vacations[index];
      if (current.type === selectedType) {
        vacations.splice(index, 1);
        this.persist(vacations);
        return { action: 'removed' };
      }

      if (selectedType === 'paid' && !this.canAddPaidVacation(employeeId, year, annualAllowance)) {
        return { action: 'blocked', reason: 'quota_exceeded' };
      }

      vacations[index] = { ...current, type: selectedType };
      this.persist(vacations);
      return { action: 'changed', type: selectedType };
    }

    if (selectedType === 'paid' && !this.canAddPaidVacation(employeeId, year, annualAllowance)) {
      return { action: 'blocked', reason: 'quota_exceeded' };
    }

    vacations.push({ employeeId, date: key, type: selectedType });
    this.persist(vacations);
    return { action: 'added', type: selectedType };
  }

  /** Setzt oder entfernt die Abwesenheit an einem Tag (ohne Toggle-Verhalten). */
  setAbsenceForDay(
    employeeId: string,
    date: Date,
    type: AbsenceType | null,
    annualAllowance: number
  ): AbsenceDayResult {
    const key = this.formatDateKey(date);
    const year = date.getFullYear();
    const current = this.getAbsenceType(employeeId, date);

    if (type === current) {
      return { action: 'unchanged' };
    }

    const vacations = [...this.vacationsSubject.value];
    const index = vacations.findIndex(
      (entry) => entry.employeeId === employeeId && entry.date === key
    );

    if (type === null) {
      if (index < 0) {
        return { action: 'unchanged' };
      }
      vacations.splice(index, 1);
      this.persist(vacations);
      return { action: 'removed' };
    }

    if (type === 'paid' && current !== 'paid' && !this.canAddPaidVacation(employeeId, year, annualAllowance)) {
      return { action: 'blocked', reason: 'quota_exceeded' };
    }

    if (index >= 0) {
      vacations[index] = { ...vacations[index], type };
      this.persist(vacations);
      return { action: 'changed', type };
    }

    vacations.push({ employeeId, date: key, type });
    this.persist(vacations);
    return { action: 'added', type };
  }

  clearAbsenceDaysForMonth(employeeId: string, year: number, month: number): void {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const vacations = this.vacationsSubject.value.filter(
      (entry) => !(entry.employeeId === employeeId && entry.date.startsWith(prefix))
    );
    this.persist(vacations);
  }

  clearVacationDaysForMonth(employeeId: string, year: number, month: number): void {
    this.clearAbsenceDaysForMonth(employeeId, year, month);
  }

  formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  parseDateKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number);
    return this.holidayService.createLocalDate(year, month, day);
  }

  private persist(vacations: VacationEntry[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vacations));
    this.vacationsSubject.next(vacations);
  }

  private loadFromStorage(): VacationEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Array<VacationEntry & { type?: AbsenceType }>;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        type: entry.type ?? 'paid',
      }));
    } catch {
      return [];
    }
  }
}
