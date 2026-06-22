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
    return this.getEmployees().filter((e) => e.active);
  }

  getEmployeeById(id: string): Employee | undefined {
    return this.getEmployees().find((e) => e.id === id);
  }

  createEmployee(data: EmployeeFormData): Employee {
    const employee: Employee = {
      id: crypto.randomUUID(),
      ...data,
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

    const updated: Employee = { id, ...data };
    const next = [...employees];
    next[index] = updated;
    this.persist(next);
    return updated;
  }

  deleteEmployee(id: string): boolean {
    const next = this.getEmployees().filter((e) => e.id !== id);
    if (next.length === this.getEmployees().length) {
      return false;
    }
    this.persist(next);
    return true;
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
      const parsed = JSON.parse(raw) as StoredEmployee[];
      return Array.isArray(parsed)
        ? parsed.map((employee) => ({
            ...employee,
            defaultStartTime: employee.defaultStartTime ?? '09:00',
            annualVacationDays: employee.annualVacationDays ?? 30,
          }))
        : [];
    } catch {
      return [];
    }
  }
}
