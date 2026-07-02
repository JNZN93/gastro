import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { EmployeeSchedule, ScheduleStats } from '../models/schedule.model';
import { PlanningService } from './planning.service';
import { VacationService } from './vacation.service';

export type PlanningStatus = 'open' | 'planned' | 'warning' | 'export_ready';

export interface PlanningOverviewStatus {
  status: PlanningStatus;
  label: string;
  isOverTarget: boolean;
  hasWarnings: boolean;
  hoursDiff: number;
  absenceSummary: string;
}

/**
 * Zentrale Status- und Warnlogik für Monatsplanungen.
 */
@Injectable({ providedIn: 'root' })
export class PlanningStatusService {
  constructor(
    private readonly planningService: PlanningService,
    private readonly vacationService: VacationService
  ) {}

  isOverTarget(employee: Employee, schedule: EmployeeSchedule | null): boolean {
    if (!schedule) {
      return false;
    }
    const stats = this.planningService.calculateStats(schedule);
    return stats.totalHours > employee.monthlyHours;
  }

  hasWarnings(employee: Employee, schedule: EmployeeSchedule | null, year: number): boolean {
    if (!schedule) {
      return false;
    }

    if (this.isOverTarget(employee, schedule)) {
      return true;
    }

    const stats = this.planningService.calculateStats(schedule);
    const missingTimes = schedule.workDays.some(
      (day) =>
        day.plannedHours > 0 &&
        !day.isSunday &&
        !day.isHoliday &&
        !day.isVacation &&
        !day.isSick &&
        !day.isUnpaidDayOff &&
        !day.startTime
    );

    if (missingTimes) {
      return true;
    }

    const usedVacation = this.vacationService.getUsedPaidVacationDaysForYear(employee.id, year);
    if (usedVacation > employee.annualVacationDays) {
      return true;
    }

    return stats.totalHours > 0 && stats.workDayCount === 0 && stats.vacationCount === 0;
  }

  getOverviewStatus(
    employee: Employee,
    schedule: EmployeeSchedule | null,
    year: number,
    month: number
  ): PlanningOverviewStatus {
    const stats = schedule
      ? this.planningService.calculateStats(schedule)
      : this.emptyStats();
    const isPlanned = schedule?.workDays.some((day) => day.plannedHours > 0) ?? false;
    const isOverTarget = stats.totalHours > employee.monthlyHours;
    const hasWarnings = this.hasWarnings(employee, schedule, year);
    const hoursDiff = stats.totalHours - employee.monthlyHours;

    const paid = this.vacationService.getAbsenceCountForMonth(employee.id, year, month, 'paid');
    const sick = this.vacationService.getAbsenceCountForMonth(employee.id, year, month, 'sick');
    const unpaid = this.vacationService.getAbsenceCountForMonth(employee.id, year, month, 'unpaid');
    const absenceSummary = `${paid}U · ${sick}K · ${unpaid}F`;

    let status: PlanningStatus = 'open';
    let label = 'Offen';

    if (isOverTarget || hasWarnings) {
      status = 'warning';
      label = 'Warnung';
    } else if (isPlanned) {
      status = 'export_ready';
      label = 'Exportbereit';
    } else if (schedule) {
      status = 'planned';
      label = 'Geplant';
    }

    if (!isPlanned && !hasWarnings) {
      status = 'open';
      label = 'Offen';
    }

    return {
      status,
      label,
      isOverTarget,
      hasWarnings,
      hoursDiff,
      absenceSummary,
    };
  }

  private emptyStats(): ScheduleStats {
    return {
      totalHours: 0,
      workDayCount: 0,
      holidayCount: 0,
      sundayCount: 0,
      vacationCount: 0,
      unpaidDayOffCount: 0,
      sickDayCount: 0,
    };
  }
}
