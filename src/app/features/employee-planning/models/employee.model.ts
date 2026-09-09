/** Repräsentiert einen Mitarbeiter mit Sollstunden pro Monat. */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  /** Vertrags-Wochenstunden */
  weeklyHours: number;
  /** Anzahl Arbeitstage pro Woche (1–6), abgeleitet aus weeklyWorkWeekdays. */
  weeklyWorkDays: number;
  /** Gewählte Wochentage (1=Mo … 6=Sa). */
  weeklyWorkWeekdays: number[];
  monthlyHours: number;
  /** true wenn monthlyHours manuell vom Vorschlag abweicht */
  monthlyHoursManual: boolean;
  /** Bezahlte Urlaubstage pro Kalenderjahr */
  annualVacationDays: number;
  /** Standard-Arbeitsbeginn im Format HH:mm */
  defaultStartTime: string;
  active: boolean;
  /** Soft-Delete – archivierte Mitarbeiter erscheinen ausgegraut */
  archived: boolean;
  archivedAt?: string;
}

/** Formulardaten zum Anlegen/Bearbeiten eines Mitarbeiters. */
export interface EmployeeFormData {
  firstName: string;
  lastName: string;
  weeklyHours: number;
  weeklyWorkDays: number;
  weeklyWorkWeekdays: number[];
  monthlyHours: number;
  monthlyHoursManual: boolean;
  annualVacationDays: number;
  defaultStartTime: string;
  active: boolean;
}

/** Serialisierte Form für LocalStorage. */
export type StoredEmployee = Employee;
