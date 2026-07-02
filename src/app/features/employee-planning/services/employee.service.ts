import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Employee, EmployeeFormData, StoredEmployee } from '../models/employee.model';

const STORAGE_KEY = 'employee-planning:employees';

/**
 * Verwaltet Mitarbeiterdaten ausschließlich im Browser-LocalStorage.
 * Änderungen werden über ein Observable bereitgestellt.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly employeesSubject = new BehaviorSubject<Employee[]>(this.loadFromStorage());

  readonly employees$: Observable<Employee[]> = this.employeesSubject.asObservable();

  getEmployees(): Employee[] {
    return this.employeesSubject.value;
  }

  getActiveEmployees(): Employee[] {
    return this.getEmployees().filter((e) => e.active && !e.archived);
  }

  /** Aktive, nicht archivierte Mitarbeiter für Planung und Export. */
  getPlannableEmployees(): Employee[] {
    return this.getActiveEmployees();
  }

  /** Alle nicht archivierten Mitarbeiter für die Planungsübersicht (inkl. inaktive). */
  getOverviewEmployees(): Employee[] {
    return this.getEmployees().filter((e) => !e.archived);
  }

  getEmployeeById(id: string): Employee | undefined {
    return this.getEmployees().find((e) => e.id === id);
  }

  createEmployee(data: EmployeeFormData): Employee {
    const employee: Employee = {
      id: crypto.randomUUID(),
      ...data,
      archived: false,
    };
    this.persist([...this.getEmployees(), employee]);
    return employee;
  }

  updateEmployee(id: string, data: EmployeeFormData): Employee | null {
    const employees = this.getEmployees();
    const index = employees.findIndex((e) => e.id === id);
    if (index === -1) {
      return null;
    }

    const existing = employees[index];
    const updated: Employee = {
      ...existing,
      ...data,
      id,
    };
    const next = [...employees];
    next[index] = updated;
    this.persist(next);
    return updated;
  }

  archiveEmployee(id: string): boolean {
    const employees = this.getEmployees();
    const index = employees.findIndex((e) => e.id === id);
    if (index === -1 || employees[index].archived) {
      return false;
    }

    const next = [...employees];
    next[index] = {
      ...next[index],
      archived: true,
      archivedAt: new Date().toISOString(),
      active: false,
    };
    this.persist(next);
    return true;
  }

  reactivateEmployee(id: string): boolean {
    const employees = this.getEmployees();
    const index = employees.findIndex((e) => e.id === id);
    if (index === -1 || !employees[index].archived) {
      return false;
    }

    const next = [...employees];
    next[index] = {
      ...next[index],
      archived: false,
      archivedAt: undefined,
      active: true,
    };
    this.persist(next);
    return true;
  }

  /** @deprecated Verwende archiveEmployee */
  deleteEmployee(id: string): boolean {
    return this.archiveEmployee(id);
  }

  private persist(employees: Employee[]): void {
    const stored: StoredEmployee[] = employees;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    this.employeesSubject.next(employees);
  }

  private loadFromStorage(): Employee[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Array<Partial<StoredEmployee>>;
      return Array.isArray(parsed) ? parsed.map((employee) => this.normalizeEmployee(employee)) : [];
    } catch {
      return [];
    }
  }

  private normalizeEmployee(employee: Partial<StoredEmployee>): Employee {
    const monthlyHours = employee.monthlyHours ?? 160;
    const weeklyHours = employee.weeklyHours ?? this.deriveWeeklyHours(monthlyHours);

    return {
      id: employee.id!,
      firstName: employee.firstName ?? '',
      lastName: employee.lastName ?? '',
      weeklyHours,
      monthlyHours,
      monthlyHoursManual: employee.monthlyHoursManual ?? false,
      annualVacationDays: employee.annualVacationDays ?? 30,
      defaultStartTime: employee.defaultStartTime ?? '09:00',
      active: employee.active ?? true,
      archived: employee.archived ?? false,
      archivedAt: employee.archivedAt,
    };
  }

  /** Schätzt Wochenstunden aus Monatsstunden für Alt-Daten (160 h ≈ 40 h/Woche). */
  private deriveWeeklyHours(monthlyHours: number): number {
    return Math.round(monthlyHours * 100) / 100;
  }
}
