import { Injectable } from '@angular/core';
import { AbsenceRepository } from './absence.repository';
import { VacationService } from '../services/vacation.service';

@Injectable({ providedIn: 'root' })
export class LocalStorageAbsenceRepository implements AbsenceRepository {
  constructor(private readonly vacationService: VacationService) {}

  get vacations$() {
    return this.vacationService.vacations$;
  }

  getAbsenceType(...args: Parameters<VacationService['getAbsenceType']>) {
    return this.vacationService.getAbsenceType(...args);
  }

  setAbsenceForDay(...args: Parameters<VacationService['setAbsenceForDay']>) {
    return this.vacationService.setAbsenceForDay(...args);
  }

  applyDaySelection(...args: Parameters<VacationService['applyDaySelection']>) {
    return this.vacationService.applyDaySelection(...args);
  }

  getAbsenceCountForMonth(...args: Parameters<VacationService['getAbsenceCountForMonth']>) {
    return this.vacationService.getAbsenceCountForMonth(...args);
  }

  getUsedPaidVacationDaysForYear(...args: Parameters<VacationService['getUsedPaidVacationDaysForYear']>) {
    return this.vacationService.getUsedPaidVacationDaysForYear(...args);
  }

  getRemainingPaidVacationDays(...args: Parameters<VacationService['getRemainingPaidVacationDays']>) {
    return this.vacationService.getRemainingPaidVacationDays(...args);
  }

  clearAbsenceDaysForMonth(...args: Parameters<VacationService['clearAbsenceDaysForMonth']>) {
    return this.vacationService.clearAbsenceDaysForMonth(...args);
  }
}
