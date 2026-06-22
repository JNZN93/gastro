/** Repräsentiert einen Mitarbeiter mit Sollstunden pro Monat. */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  monthlyHours: number;
  /** Bezahlte Urlaubstage pro Kalenderjahr */
  annualVacationDays: number;
  /** Standard-Arbeitsbeginn im Format HH:mm */
  defaultStartTime: string;
  active: boolean;
}

/** Formulardaten zum Anlegen/Bearbeiten eines Mitarbeiters. */
export interface EmployeeFormData {
  firstName: string;
  lastName: string;
  monthlyHours: number;
  annualVacationDays: number;
  defaultStartTime: string;
  active: boolean;
}

/** Serialisierte Form für LocalStorage (identisch zu Employee). */
export type StoredEmployee = Employee;
