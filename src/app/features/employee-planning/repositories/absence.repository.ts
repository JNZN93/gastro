import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { AbsenceDayResult, AbsenceType } from '../models/vacation.model';

export interface AbsenceRepository {
  readonly vacations$: Observable<import('../models/vacation.model').VacationEntry[]>;
  getAbsenceType(employeeId: string, date: Date): AbsenceType | null;
  setAbsenceForDay(
    employeeId: string,
    date: Date,
    type: AbsenceType | null,
    annualAllowance: number
  ): AbsenceDayResult;
  applyDaySelection(
    employeeId: string,
    date: Date,
    selectedType: AbsenceType,
    annualAllowance: number
  ): AbsenceDayResult;
  getAbsenceCountForMonth(
    employeeId: string,
    year: number,
    month: number,
    type?: AbsenceType
  ): number;
  getUsedPaidVacationDaysForYear(employeeId: string, year: number): number;
  getRemainingPaidVacationDays(employeeId: string, year: number, annualAllowance: number): number;
  clearAbsenceDaysForMonth(employeeId: string, year: number, month: number): void;
}

export const ABSENCE_REPOSITORY = new InjectionToken<AbsenceRepository>('AbsenceRepository');
