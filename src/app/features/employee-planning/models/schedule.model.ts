/** Einzelner Tag in der Monatsplanung. */
export interface WorkDay {
  date: Date;
  plannedHours: number;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isVacation: boolean;
  isUnpaidDayOff: boolean;
}

/** Monatsplan für einen Mitarbeiter. */
export interface EmployeeSchedule {
  employeeId: string;
  year: number;
  /** Monat 1–12 */
  month: number;
  workDays: WorkDay[];
}

/** Serialisierte WorkDay-Struktur für LocalStorage. */
export interface StoredWorkDay {
  date: string;
  plannedHours: number;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isVacation?: boolean;
  isUnpaidDayOff?: boolean;
}

/** Serialisierte Schedule-Struktur für LocalStorage. */
export interface StoredEmployeeSchedule {
  employeeId: string;
  year: number;
  month: number;
  workDays: StoredWorkDay[];
}

/** Aggregierte Statistiken einer Monatsplanung. */
export interface ScheduleStats {
  totalHours: number;
  workDayCount: number;
  holidayCount: number;
  sundayCount: number;
  vacationCount: number;
  unpaidDayOffCount: number;
}
