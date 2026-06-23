/** Art der Abwesenheit an einem Tag. */
export type AbsenceType = 'paid' | 'unpaid' | 'sick';

/** Einzelner Abwesenheitstag eines Mitarbeiters (serialisiert als YYYY-MM-DD). */
export interface VacationEntry {
  employeeId: string;
  date: string;
  type: AbsenceType;
}

/** Ergebnis beim Setzen eines Abwesenheitstags. */
export type AbsenceDayResult =
  | { action: 'added'; type: AbsenceType }
  | { action: 'removed' }
  | { action: 'changed'; type: AbsenceType }
  | { action: 'blocked'; reason: 'quota_exceeded' }
  | { action: 'unchanged' };
