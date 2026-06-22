import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Employee } from '../models/employee.model';
import {
  EmployeeSchedule,
  ScheduleStats,
  StoredEmployeeSchedule,
  StoredWorkDay,
  WorkDay,
} from '../models/schedule.model';
import { HolidayService } from './holiday.service';
import { TimeCalculationService } from './time-calculation.service';
import { EmployeeService } from './employee.service';
import { VacationService } from './vacation.service';

const STORAGE_KEY = 'employee-planning:schedules';

/**
 * Erstellt Monatsplanungen, verteilt Sollstunden auf Arbeitstage
 * und persistiert Ergebnisse im LocalStorage.
 */
@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly schedulesSubject = new BehaviorSubject<EmployeeSchedule[]>(
    this.loadFromStorage()
  );

  readonly schedules$: Observable<EmployeeSchedule[]> = this.schedulesSubject.asObservable();

  getAllSchedules(): EmployeeSchedule[] {
    return this.schedulesSubject.value;
  }

  constructor(
    private readonly holidayService: HolidayService,
    private readonly timeCalculation: TimeCalculationService,
    private readonly employeeService: EmployeeService,
    private readonly vacationService: VacationService
  ) {}

  getSchedule(employeeId: string, year: number, month: number): EmployeeSchedule | null {
    const schedule = this.schedulesSubject.value.find(
      (s) => s.employeeId === employeeId && s.year === year && s.month === month
    );
    if (!schedule) {
      return null;
    }
    return this.enrichScheduleTimes(schedule, employeeId);
  }

  /** Erzeugt leere Monatstage inkl. Sonntags-, Feiertags- und Urlaubsmarierung. */
  buildMonthWorkDays(employeeId: string, year: number, month: number): WorkDay[] {
    const daysInMonth = new Date(year, month, 0).getDate();
    const workDays: WorkDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = this.holidayService.createLocalDate(year, month, day);
      const isSunday = date.getDay() === 0;
      const holidayInfo = this.holidayService.getHolidayInfo(date);
      const absenceType = this.vacationService.getAbsenceType(employeeId, date);

      workDays.push({
        date,
        plannedHours: 0,
        breakMinutes: 0,
        isSunday,
        isHoliday: holidayInfo !== null,
        holidayName: holidayInfo?.name,
        isVacation: absenceType === 'paid',
        isUnpaidDayOff: absenceType === 'unpaid',
      });
    }

    return workDays;
  }

  /**
   * Verteilt Monatsstunden gleichmäßig auf Arbeitstage und bezahlte Urlaubstage.
   * Sonntage, Feiertage und unbezahltes Arbeitsfrei erhalten 0 Stunden.
   * Einzelwerte werden auf 0,25 h gerundet; Rest am letzten verteilten Tag.
   */
  distributeHours(monthlyHours: number, workDays: WorkDay[]): WorkDay[] {
    const result = workDays.map((day) => ({
      ...day,
      plannedHours: 0,
      startTime: undefined,
      endTime: undefined,
      breakMinutes: 0,
    }));
    const workingIndices: number[] = [];

    result.forEach((day, index) => {
      if (!day.isSunday && !day.isHoliday && !day.isUnpaidDayOff) {
        workingIndices.push(index);
      }
    });

    if (workingIndices.length === 0 || monthlyHours <= 0) {
      return result;
    }

    // Gleichmäßige Verteilung in Viertelstunden-Schritten über alle Arbeitstage
    const totalQuarters = Math.round(monthlyHours * 4);
    const workDayCount = workingIndices.length;
    const baseQuarters = Math.floor(totalQuarters / workDayCount);
    const extraQuarters = totalQuarters % workDayCount;

    for (let i = 0; i < workingIndices.length; i++) {
      const index = workingIndices[i];
      const quarters = baseQuarters + (i < extraQuarters ? 1 : 0);
      result[index].plannedHours = quarters / 4;
    }

    return result;
  }

  /** Plant alle aktiven Mitarbeiter für den gewählten Monat. */
  distributeForActiveEmployees(
    employees: Employee[],
    year: number,
    month: number
  ): EmployeeSchedule[] {
    const activeEmployees = employees.filter((e) => e.active);
    const schedules: EmployeeSchedule[] = [];

    for (const employee of activeEmployees) {
      const baseDays = this.buildMonthWorkDays(employee.id, year, month);
      const distributed = this.distributeHours(employee.monthlyHours, baseDays);
      const enriched = distributed.map((day) =>
        this.timeCalculation.enrichWorkDay(day, employee.defaultStartTime)
      );
      const schedule = this.saveSchedule({
        employeeId: employee.id,
        year,
        month,
        workDays: enriched,
      });
      schedules.push(schedule);
    }

    return schedules;
  }

  saveSchedule(schedule: EmployeeSchedule): EmployeeSchedule {
    const schedules = [...this.schedulesSubject.value];
    const index = schedules.findIndex(
      (s) =>
        s.employeeId === schedule.employeeId &&
        s.year === schedule.year &&
        s.month === schedule.month
    );

    if (index >= 0) {
      schedules[index] = schedule;
    } else {
      schedules.push(schedule);
    }

    this.persist(schedules);
    return schedule;
  }

  /** Liefert eine leere Planung nur mit Kalenderdaten (ohne Stundenverteilung). */
  getOrCreateEmptySchedule(
    employeeId: string,
    year: number,
    month: number
  ): EmployeeSchedule {
    const existing = this.getSchedule(employeeId, year, month);
    if (existing) {
      return this.enrichScheduleTimes(existing, employeeId);
    }

    return {
      employeeId,
      year,
      month,
      workDays: this.buildMonthWorkDays(employeeId, year, month),
    };
  }

  calculateStats(schedule: EmployeeSchedule): ScheduleStats {
    let totalHours = 0;
    let workDayCount = 0;
    let holidayCount = 0;
    let sundayCount = 0;
    let vacationCount = 0;
    let unpaidDayOffCount = 0;

    for (const day of schedule.workDays) {
      totalHours += day.plannedHours;
      if (day.isSunday) {
        sundayCount++;
      }
      if (day.isHoliday) {
        holidayCount++;
      }
      if (day.isVacation) {
        vacationCount++;
      }
      if (day.isUnpaidDayOff) {
        unpaidDayOffCount++;
      }
      if (!day.isSunday && !day.isHoliday && !day.isVacation && !day.isUnpaidDayOff) {
        workDayCount++;
      }
    }

    return {
      totalHours: this.roundToQuarter(totalHours),
      workDayCount,
      holidayCount,
      sundayCount,
      vacationCount,
      unpaidDayOffCount,
    };
  }

  /** Aktualisiert Abwesenheitsmarkierung in bestehenden Planungen (ohne Stunden zu ändern). */
  applyVacationToSchedule(schedule: EmployeeSchedule): EmployeeSchedule {
    return {
      ...schedule,
      workDays: schedule.workDays.map((day) => {
        const absenceType = this.vacationService.getAbsenceType(schedule.employeeId, day.date);
        return {
          ...day,
          isVacation: absenceType === 'paid',
          isUnpaidDayOff: absenceType === 'unpaid',
        };
      }),
    };
  }

  private roundToQuarter(hours: number): number {
    return Math.round(hours * 4) / 4;
  }

  private persist(schedules: EmployeeSchedule[]): void {
    const stored: StoredEmployeeSchedule[] = schedules.map((s) => this.serializeSchedule(s));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    this.schedulesSubject.next(schedules);
  }

  private loadFromStorage(): EmployeeSchedule[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as StoredEmployeeSchedule[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((s) => this.deserializeSchedule(s));
    } catch {
      return [];
    }
  }

  private enrichScheduleTimes(schedule: EmployeeSchedule, employeeId: string): EmployeeSchedule {
    const employee = this.employeeService.getEmployeeById(employeeId);
    const defaultStartTime = employee?.defaultStartTime ?? '09:00';

    const withVacation = this.applyVacationToSchedule(schedule);

    return {
      ...withVacation,
      workDays: withVacation.workDays.map((day) =>
        this.timeCalculation.recalculateWorkDay(day, defaultStartTime)
      ),
    };
  }

  private serializeSchedule(schedule: EmployeeSchedule): StoredEmployeeSchedule {
    return {
      employeeId: schedule.employeeId,
      year: schedule.year,
      month: schedule.month,
      workDays: schedule.workDays.map((day) => this.serializeWorkDay(day)),
    };
  }

  private deserializeSchedule(stored: StoredEmployeeSchedule): EmployeeSchedule {
    return {
      employeeId: stored.employeeId,
      year: stored.year,
      month: stored.month,
      workDays: stored.workDays.map((day) => this.deserializeWorkDay(day)),
    };
  }

  private serializeWorkDay(day: WorkDay): StoredWorkDay {
    const y = day.date.getFullYear();
    const m = String(day.date.getMonth() + 1).padStart(2, '0');
    const d = String(day.date.getDate()).padStart(2, '0');
    return {
      date: `${y}-${m}-${d}`,
      plannedHours: day.plannedHours,
      startTime: day.startTime,
      endTime: day.endTime,
      breakMinutes: day.breakMinutes,
      isSunday: day.isSunday,
      isHoliday: day.isHoliday,
      holidayName: day.holidayName,
      isVacation: day.isVacation,
      isUnpaidDayOff: day.isUnpaidDayOff,
    };
  }

  private deserializeWorkDay(stored: StoredWorkDay): WorkDay {
    const [year, month, day] = stored.date.split('-').map(Number);
    return {
      date: this.holidayService.createLocalDate(year, month, day),
      plannedHours: stored.plannedHours,
      startTime: stored.startTime,
      endTime: stored.endTime,
      breakMinutes: stored.breakMinutes ?? 0,
      isSunday: stored.isSunday,
      isHoliday: stored.isHoliday,
      holidayName: stored.holidayName,
      isVacation: stored.isVacation ?? false,
      isUnpaidDayOff: stored.isUnpaidDayOff ?? false,
    };
  }
}
