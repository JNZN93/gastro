import { Provider } from '@angular/core';
import { ABSENCE_REPOSITORY } from './absence.repository';
import { EMPLOYEE_REPOSITORY } from './employee.repository';
import { SCHEDULE_REPOSITORY } from './schedule.repository';
import { LocalStorageAbsenceRepository } from './local-storage-absence.repository';
import { LocalStorageEmployeeRepository } from './local-storage-employee.repository';
import { LocalStorageScheduleRepository } from './local-storage-schedule.repository';

/** Provider für LocalStorage-Repository-Implementierungen. */
export const EMPLOYEE_PLANNING_REPOSITORY_PROVIDERS: Provider[] = [
  { provide: EMPLOYEE_REPOSITORY, useExisting: LocalStorageEmployeeRepository },
  { provide: SCHEDULE_REPOSITORY, useExisting: LocalStorageScheduleRepository },
  { provide: ABSENCE_REPOSITORY, useExisting: LocalStorageAbsenceRepository },
];
