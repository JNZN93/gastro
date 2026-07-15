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
import { AbsenceDayResult, AbsenceType } from '../models/vacation.model';
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
        isSick: absenceType === 'sick',
      });
    }

    return workDays;
  }

  /**
   * Verteilt Monatsstunden gleichmäßig auf Arbeitstage und bezahlte Urlaubstage.
   * Sonntage, Feiertage und unbezahltes Arbeitsfrei erhalten 0 Stunden.
   * Einzelwerte mit 2 Nachkommastellen verteilen; Rest auf die ersten Tage.
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

    // Gleichmäßige Verteilung in 0,01-h-Schritten über alle Arbeitstage
    const totalHundredths = Math.round(monthlyHours * 100);
    const workDayCount = workingIndices.length;
    const baseHundredths = Math.floor(totalHundredths / workDayCount);
    const extraHundredths = totalHundredths % workDayCount;

    for (let i = 0; i < workingIndices.length; i++) {
      const index = workingIndices[i];
      const hundredths = baseHundredths + (i < extraHundredths ? 1 : 0);
      result[index].plannedHours = hundredths / 100;
    }

    return result;
  }

  /** Plant alle aktiven Mitarbeiter für den gewählten Monat. */
  distributeForActiveEmployees(
    employees: Employee[],
    year: number,
    month: number
  ): EmployeeSchedule[] {
    const plannable = employees.filter((e) => e.active && !e.archived);
    return this.distributeForEmployees(plannable, year, month);
  }

  /** Verteilt Stunden für ausgewählte Mitarbeiter. */
  distributeForEmployees(
    employees: Employee[],
    year: number,
    month: number
  ): EmployeeSchedule[] {
    const schedules: EmployeeSchedule[] = [];

    for (const employee of employees) {
      if (!employee.active || employee.archived) {
        continue;
      }
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

  hasScheduleForEmployee(employeeId: string): boolean {
    return this.schedulesSubject.value.some((s) => s.employeeId === employeeId);
  }

  /** Gleicht Überstunden aus, indem Stunden von Tagen mit den meisten Stunden abgezogen werden. */
  balanceOvertime(schedule: EmployeeSchedule, monthlyHours: number): EmployeeSchedule {
    const stats = this.calculateStats(schedule);
    if (stats.totalHours <= monthlyHours) {
      return schedule;
    }

    let excessHundredths = Math.round((stats.totalHours - monthlyHours) * 100);
    const employee = this.employeeService.getEmployeeById(schedule.employeeId);
    const defaultStartTime = employee?.defaultStartTime ?? '09:00';

    const workDays = schedule.workDays.map((day) => ({ ...day }));
    const adjustableIndices = workDays
      .map((day, index) => ({ day, index }))
      .filter(
        ({ day }) =>
          day.plannedHours > 0 &&
          !day.isSunday &&
          !day.isHoliday &&
          !day.isUnpaidDayOff
      )
      .sort((a, b) => b.day.plannedHours - a.day.plannedHours);

    for (const { index } of adjustableIndices) {
      if (excessHundredths <= 0) {
        break;
      }
      const currentHundredths = Math.round(workDays[index].plannedHours * 100);
      const reduceBy = Math.min(excessHundredths, currentHundredths);
      const newHundredths = currentHundredths - reduceBy;
      workDays[index].plannedHours = newHundredths / 100;
      excessHundredths -= reduceBy;
    }

    const enriched = workDays.map((day) =>
      this.timeCalculation.recalculateWorkDay(day, defaultStartTime)
    );

    return this.saveSchedule({ ...schedule, workDays: enriched });
  }

  /** Kopiert einen Tag auf alle gleichen Wochentage im Monat. */
  copyDayToWeekdays(
    employee: Employee,
    schedule: EmployeeSchedule,
    sourceDate: Date
  ): EmployeeSchedule {
    const sourceDay = schedule.workDays.find((day) => this.isSameDate(day.date, sourceDate));
    if (!sourceDay) {
      return schedule;
    }

    const weekday = sourceDate.getDay();
    const workDays = schedule.workDays.map((day) => {
      if (day.date.getDay() !== weekday || this.isSameDate(day.date, sourceDate)) {
        return day;
      }
      if (day.isSunday || day.isHoliday || day.isUnpaidDayOff) {
        return day;
      }

      const copied: WorkDay = {
        ...day,
        plannedHours: sourceDay.plannedHours,
        startTime: sourceDay.startTime,
        endTime: sourceDay.endTime,
        breakMinutes: sourceDay.breakMinutes,
        isVacation: sourceDay.isVacation,
        isSick: sourceDay.isSick,
        isUnpaidDayOff: sourceDay.isUnpaidDayOff,
      };
      return this.timeCalculation.recalculateWorkDay(copied, employee.defaultStartTime);
    });

    return this.saveSchedule({ ...schedule, workDays });
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
    let sickDayCount = 0;

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
      if (day.isSick) {
        sickDayCount++;
      }
      if (!day.isSunday && !day.isHoliday && !day.isVacation && !day.isUnpaidDayOff && !day.isSick) {
        workDayCount++;
      }
    }

    return {
      totalHours: this.timeCalculation.roundHours(totalHours),
      workDayCount,
      holidayCount,
      sundayCount,
      vacationCount,
      unpaidDayOffCount,
      sickDayCount,
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
          isSick: absenceType === 'sick',
        };
      }),
    };
  }

  /** Synchronisiert Abwesenheiten aus dem Vacation-Service in die Planung. */
  syncScheduleAbsences(employee: Employee, schedule: EmployeeSchedule): EmployeeSchedule {
    const synced = this.applyVacationToSchedule(schedule);
    const hasPlannedHours = synced.workDays.some((day) => day.plannedHours > 0);

    if (!hasPlannedHours) {
      return this.saveSchedule(synced);
    }

    const redistributed = this.distributeHours(employee.monthlyHours, synced.workDays);
    const enriched = redistributed.map((day) =>
      this.timeCalculation.enrichWorkDay(day, employee.defaultStartTime)
    );
    return this.saveSchedule({ ...schedule, workDays: enriched });
  }

  /**
   * Kalender-Klick: gewählte Eintragsart anwenden (Toggle wie in der Urlaubsplanung)
   * und Planung synchronisieren.
   */
  applyDayAbsenceSelection(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    selectedType: AbsenceType
  ): { schedule: EmployeeSchedule; result: AbsenceDayResult } {
    const result = this.vacationService.applyDaySelection(
      employee.id,
      date,
      selectedType,
      employee.annualVacationDays
    );

    if (result.action === 'blocked' || result.action === 'unchanged') {
      return { schedule, result };
    }

    const updated = this.syncScheduleAbsences(employee, schedule);
    return { schedule: updated, result };
  }

  /** Ändert die Abwesenheit eines Tages und verteilt die Monatsstunden neu. */
  updateDayAbsence(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    absenceType: AbsenceType | null
  ): { schedule: EmployeeSchedule; result: AbsenceDayResult } {
    const result = this.vacationService.setAbsenceForDay(
      employee.id,
      date,
      absenceType,
      employee.annualVacationDays
    );

    if (result.action === 'blocked' || result.action === 'unchanged') {
      return { schedule, result };
    }

    const updated = this.syncScheduleAbsences(employee, schedule);
    return { schedule: updated, result };
  }

  /** Passt die geplanten Netto-Stunden eines einzelnen Tages an. */
  updateDayPlannedHours(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    plannedHours: number
  ): EmployeeSchedule {
    const rounded = this.timeCalculation.roundHours(Math.max(0, plannedHours));
    const workDays = schedule.workDays.map((day) => {
      if (!this.isSameDate(day.date, date)) {
        return day;
      }
      if (day.isSunday || day.isHoliday || day.isUnpaidDayOff) {
        return day;
      }

      const updated = { ...day, plannedHours: rounded };
      return this.timeCalculation.recalculateWorkDay(updated, employee.defaultStartTime);
    });

    return this.saveSchedule({ ...schedule, workDays });
  }

  /** Passt den Arbeitsbeginn eines Tages an. */
  updateDayStartTime(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    startTime: string
  ): EmployeeSchedule | null {
    return this.updateEditableWorkDay(schedule, date, (day) =>
      this.timeCalculation.applyStartTime(day, startTime, employee.defaultStartTime)
    );
  }

  /** Passt das Arbeitsende eines Tages an. */
  updateDayEndTime(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    endTime: string
  ): EmployeeSchedule | null {
    return this.updateEditableWorkDay(schedule, date, (day) =>
      this.timeCalculation.applyEndTime(day, endTime, employee.defaultStartTime)
    );
  }

  /** Passt die Pause eines Tages an. */
  updateDayBreakMinutes(
    employee: Employee,
    schedule: EmployeeSchedule,
    date: Date,
    breakMinutes: number
  ): EmployeeSchedule | null {
    return this.updateEditableWorkDay(schedule, date, (day) =>
      this.timeCalculation.applyBreakMinutes(day, breakMinutes, employee.defaultStartTime)
    );
  }

  private updateEditableWorkDay(
    schedule: EmployeeSchedule,
    date: Date,
    transform: (day: WorkDay) => WorkDay | null
  ): EmployeeSchedule | null {
    let updatedDay: WorkDay | null = null;

    const workDays = schedule.workDays.map((day) => {
      if (!this.isSameDate(day.date, date) || !this.isEditableWorkDay(day)) {
        return day;
      }

      updatedDay = transform(day);
      return updatedDay ?? day;
    });

    if (!updatedDay) {
      return null;
    }

    return this.saveSchedule({ ...schedule, workDays });
  }

  private isEditableWorkDay(day: WorkDay): boolean {
    return (
      !day.isSunday &&
      !day.isHoliday &&
      !day.isUnpaidDayOff &&
      !day.isVacation &&
      !day.isSick
    );
  }

  private isSameDate(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
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
      isSick: day.isSick,
    };
  }

  private deserializeWorkDay(stored: StoredWorkDay): WorkDay {
    const [year, month, day] = stored.date.split('-').map(Number);
    const date = this.holidayService.createLocalDate(year, month, day);
    const holidayInfo = this.holidayService.getHolidayInfo(date);

    return {
      date,
      plannedHours: stored.plannedHours,
      startTime: stored.startTime,
      endTime: stored.endTime,
      breakMinutes: stored.breakMinutes ?? 0,
      isSunday: date.getDay() === 0,
      isHoliday: holidayInfo !== null,
      holidayName: holidayInfo?.name,
      isVacation: stored.isVacation ?? false,
      isUnpaidDayOff: stored.isUnpaidDayOff ?? false,
      isSick: stored.isSick ?? false,
    };
  }
}
