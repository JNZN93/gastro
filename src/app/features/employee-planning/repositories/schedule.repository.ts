import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Employee } from '../models/employee.model';
import { EmployeeSchedule } from '../models/schedule.model';
import { AbsenceDayResult, AbsenceType } from '../models/vacation.model';

export interface ScheduleRepository {
  readonly schedules$: Observable<EmployeeSchedule[]>;
  getSchedule(employeeId: string, year: number, month: number): EmployeeSchedule | null;
  getOrCreateEmptySchedule(employeeId: string, year: number, month: number): EmployeeSchedule;
  distributeForEmployees(employees: Employee[], year: number, month: number): EmployeeSchedule[];
  updateDayAbsence(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    absenceType: AbsenceType | null
  ): { schedule: EmployeeSchedule; result: AbsenceDayResult };
  applyDayAbsenceSelection(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    selectedType: AbsenceType
  ): { schedule: EmployeeSchedule; result: AbsenceDayResult };
  syncScheduleAbsences(employee: Employee, schedule: EmployeeSchedule): EmployeeSchedule;
  updateDayPlannedHours(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    plannedHours: number
  ): EmployeeSchedule;
  updateDayStartTime(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    startTime: string
  ): EmployeeSchedule | null;
  updateDayEndTime(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    endTime: string
  ): EmployeeSchedule | null;
  updateDayBreakMinutes(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    breakMinutes: number
  ): EmployeeSchedule | null;
  copyDayToWeekdays(
    employee: Employee,
    schedule: EmployeeSchedule,
    sourceDate: Date
  ): EmployeeSchedule;
  balanceOvertime(schedule: EmployeeSchedule, monthlyHours: number): EmployeeSchedule;
  hasScheduleForEmployee(employeeId: string): boolean;
  calculateStats(schedule: EmployeeSchedule): import('../models/schedule.model').ScheduleStats;
}

export const SCHEDULE_REPOSITORY = new InjectionToken<ScheduleRepository>('ScheduleRepository');
