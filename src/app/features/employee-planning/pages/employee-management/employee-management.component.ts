import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { EMPLOYEE_REPOSITORY, EmployeeRepository } from '../../repositories/employee.repository';
import { SCHEDULE_REPOSITORY, ScheduleRepository } from '../../repositories/schedule.repository';
import { Inject } from '@angular/core';
import {
  EmployeeFormComponent,
  EmployeeFormDialogResult,
} from '../../shared/employee-form/employee-form.component';
import { EmployeePlanningNavComponent } from '../../shared/employee-planning-nav/employee-planning-nav.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';

interface EmployeeTableRow {
  employee: Employee;
  expanded: boolean;
}

const PAGE_SCROLL_CLASS = 'employee-planning-page';

/** Seite zur Verwaltung von Mitarbeitern (CRUD). */
@Component({
  selector: 'app-employee-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    EmployeePlanningNavComponent,
  ],
  templateUrl: './employee-management.component.html',
  styleUrl: './employee-management.component.scss',
})
export class EmployeeManagementComponent implements OnInit, OnDestroy {
  allEmployees: Employee[] = [];
  filteredRows: EmployeeTableRow[] = [];
  filterForm: FormGroup;
  displayedColumns = ['expand', 'name', 'weeklyHours', 'monthlyHours', 'annualVacationDays', 'status', 'actions'];

  private subscription?: Subscription;
  private filterSubscription?: Subscription;
  private expandedIds = new Set<string>();

  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employeeRepo: EmployeeRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: ScheduleRepository,
    private readonly fb: FormBuilder,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      search: [''],
      status: ['all' as StatusFilter],
    });
  }

  ngOnInit(): void {
    this.enablePageScroll();
    this.subscription = this.employeeRepo.employees$.subscribe((employees) => {
      this.allEmployees = employees;
      this.applyFilters();
    });
    this.filterSubscription = this.filterForm.valueChanges.subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.disablePageScroll();
    this.subscription?.unsubscribe();
    this.filterSubscription?.unsubscribe();
  }

  toggleExpand(employeeId: string): void {
    if (this.expandedIds.has(employeeId)) {
      this.expandedIds.delete(employeeId);
    } else {
      this.expandedIds.add(employeeId);
    }
    this.applyFilters();
  }

  isExpanded(employeeId: string): boolean {
    return this.expandedIds.has(employeeId);
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(EmployeeFormComponent, {
      width: '460px',
      data: { employee: null },
    });

    dialogRef.afterClosed().subscribe((result: EmployeeFormDialogResult | undefined) => {
      if (result?.data) {
        this.employeeRepo.createEmployee(result.data);
        this.showMessage('Mitarbeiter wurde angelegt.');
      }
    });
  }

  openEditDialog(employee: Employee): void {
    const dialogRef = this.dialog.open(EmployeeFormComponent, {
      width: '460px',
      data: { employee },
    });

    dialogRef.afterClosed().subscribe((result: EmployeeFormDialogResult | undefined) => {
      if (result?.data) {
        this.employeeRepo.updateEmployee(employee.id, result.data);
        this.showMessage('Mitarbeiter wurde aktualisiert.');
      }
    });
  }

  confirmArchive(employee: Employee): void {
    const hasSchedules = this.scheduleRepo.hasScheduleForEmployee(employee.id);
    const message = hasSchedules
      ? `„${employee.firstName} ${employee.lastName}" archivieren? Bestehende Planungen bleiben erhalten, der Mitarbeiter erscheint nicht mehr in der Monatsplanung.`
      : `„${employee.firstName} ${employee.lastName}" archivieren?`;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: 'Mitarbeiter archivieren',
        message,
        confirmLabel: 'Archivieren',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.employeeRepo.archiveEmployee(employee.id);
        this.showMessage('Mitarbeiter wurde archiviert.');
      }
    });
  }

  reactivate(employee: Employee): void {
    this.employeeRepo.reactivateEmployee(employee.id);
    this.showMessage('Mitarbeiter wurde reaktiviert.');
  }

  rowClass(employee: Employee): string {
    if (employee.archived) {
      return 'archived-row';
    }
    if (!employee.active) {
      return 'inactive-row';
    }
    return '';
  }

  statusLabel(employee: Employee): string {
    if (employee.archived) {
      return 'Archiviert';
    }
    return employee.active ? 'Aktiv' : 'Inaktiv';
  }

  private applyFilters(): void {
    const search = String(this.filterForm.get('search')?.value ?? '')
      .trim()
      .toLowerCase();
    const status = this.filterForm.get('status')?.value as StatusFilter;

    let employees = [...this.allEmployees];

    if (status === 'active') {
      employees = employees.filter((e) => e.active && !e.archived);
    } else if (status === 'inactive') {
      employees = employees.filter((e) => !e.active && !e.archived);
    } else if (status === 'archived') {
      employees = employees.filter((e) => e.archived);
    }

    if (search) {
      employees = employees.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(search)
      );
    }

    employees.sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'));

    this.filteredRows = employees.map((employee) => ({
      employee,
      expanded: this.expandedIds.has(employee.id),
    }));
  }

  private enablePageScroll(): void {
    document.documentElement.classList.add(PAGE_SCROLL_CLASS);
    document.body.classList.add(PAGE_SCROLL_CLASS);
    document.body.style.overflowY = 'auto';
    document.documentElement.style.overflowY = 'auto';
  }

  private disablePageScroll(): void {
    document.documentElement.classList.remove(PAGE_SCROLL_CLASS);
    document.body.classList.remove(PAGE_SCROLL_CLASS);
    document.body.style.overflowY = '';
    document.documentElement.style.overflowY = '';
  }

  private showMessage(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }
}
