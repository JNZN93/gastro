import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Employee, EmployeeFormData } from '../models/employee.model';

export interface EmployeeRepository {
  readonly employees$: Observable<Employee[]>;
  getEmployees(): Employee[];
  getPlannableEmployees(): Employee[];
  getOverviewEmployees(): Employee[];
  getEmployeeById(id: string): Employee | undefined;
  createEmployee(data: EmployeeFormData): Employee;
  updateEmployee(id: string, data: EmployeeFormData): Employee | null;
  archiveEmployee(id: string): boolean;
  reactivateEmployee(id: string): boolean;
}

export const EMPLOYEE_REPOSITORY = new InjectionToken<EmployeeRepository>('EmployeeRepository');
