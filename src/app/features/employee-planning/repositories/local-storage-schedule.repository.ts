import { Injectable } from '@angular/core';
import { ScheduleRepository } from './schedule.repository';
import { PlanningService } from '../services/planning.service';

@Injectable({ providedIn: 'root' })
export class LocalStorageScheduleRepository implements ScheduleRepository {
  constructor(private readonly planningService: PlanningService) {}

  get schedules$() {
    return this.planningService.schedules$;
  }

  getSchedule(...args: Parameters<PlanningService['getSchedule']>) {
    return this.planningService.getSchedule(...args);
  }

  getOrCreateEmptySchedule(...args: Parameters<PlanningService['getOrCreateEmptySchedule']>) {
    return this.planningService.getOrCreateEmptySchedule(...args);
  }

  distributeForEmployees(...args: Parameters<PlanningService['distributeForEmployees']>) {
    return this.planningService.distributeForEmployees(...args);
  }

  updateDayAbsence(...args: Parameters<PlanningService['updateDayAbsence']>) {
    return this.planningService.updateDayAbsence(...args);
  }

  applyDayAbsenceSelection(...args: Parameters<PlanningService['applyDayAbsenceSelection']>) {
    return this.planningService.applyDayAbsenceSelection(...args);
  }

  syncScheduleAbsences(...args: Parameters<PlanningService['syncScheduleAbsences']>) {
    return this.planningService.syncScheduleAbsences(...args);
  }

  updateDayPlannedHours(...args: Parameters<PlanningService['updateDayPlannedHours']>) {
    return this.planningService.updateDayPlannedHours(...args);
  }

  updateDayStartTime(...args: Parameters<PlanningService['updateDayStartTime']>) {
    return this.planningService.updateDayStartTime(...args);
  }

  updateDayEndTime(...args: Parameters<PlanningService['updateDayEndTime']>) {
    return this.planningService.updateDayEndTime(...args);
  }

  updateDayBreakMinutes(...args: Parameters<PlanningService['updateDayBreakMinutes']>) {
    return this.planningService.updateDayBreakMinutes(...args);
  }

  balanceOvertime(...args: Parameters<PlanningService['balanceOvertime']>) {
    return this.planningService.balanceOvertime(...args);
  }

  copyDayToWeekdays(...args: Parameters<PlanningService['copyDayToWeekdays']>) {
    return this.planningService.copyDayToWeekdays(...args);
  }

  hasScheduleForEmployee(...args: Parameters<PlanningService['hasScheduleForEmployee']>) {
    return this.planningService.hasScheduleForEmployee(...args);
  }

  calculateStats(...args: Parameters<PlanningService['calculateStats']>) {
    return this.planningService.calculateStats(...args);
  }
}
