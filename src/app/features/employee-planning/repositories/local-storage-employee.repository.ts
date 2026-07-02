import { Injectable } from '@angular/core';
import { EmployeeRepository } from './employee.repository';
import { EmployeeService } from '../services/employee.service';

@Injectable({ providedIn: 'root' })
export class LocalStorageEmployeeRepository implements EmployeeRepository {
  constructor(private readonly employeeService: EmployeeService) {}

  get employees$() {
    return this.employeeService.employees$;
  }

  getEmployees(): ReturnType<EmployeeService['getEmployees']> {
    return this.employeeService.getEmployees();
  }

  getPlannableEmployees(): ReturnType<EmployeeService['getPlannableEmployees']> {
    return this.employeeService.getPlannableEmployees();
  }

  getOverviewEmployees(): ReturnType<EmployeeService['getOverviewEmployees']> {
    return this.employeeService.getOverviewEmployees();
  }

  getEmployeeById(id: string): ReturnType<EmployeeService['getEmployeeById']> {
    return this.employeeService.getEmployeeById(id);
  }

  createEmployee(data: Parameters<EmployeeService['createEmployee']>[0]) {
    return this.employeeService.createEmployee(data);
  }

  updateEmployee(id: string, data: Parameters<EmployeeService['updateEmployee']>[1]) {
    return this.employeeService.updateEmployee(id, data);
  }

  archiveEmployee(id: string) {
    return this.employeeService.archiveEmployee(id);
  }

  reactivateEmployee(id: string) {
    return this.employeeService.reactivateEmployee(id);
  }
}
