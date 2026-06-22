import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { EmployeeService } from '../../services/employee.service';
import {
  EmployeeFormComponent,
  EmployeeFormDialogResult,
} from '../../shared/employee-form/employee-form.component';
import { EmployeePlanningNavComponent } from '../../shared/employee-planning-nav/employee-planning-nav.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

const PAGE_SCROLL_CLASS = 'employee-planning-page';

/** Seite zur Verwaltung von Mitarbeitern (CRUD). */
@Component({
  selector: 'app-employee-management',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    EmployeePlanningNavComponent,
  ],
  templateUrl: './employee-management.component.html',
  styleUrl: './employee-management.component.scss',
})
export class EmployeeManagementComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  displayedColumns = ['name', 'monthlyHours', 'annualVacationDays', 'status', 'actions'];

  private subscription?: Subscription;

  constructor(
    private readonly employeeService: EmployeeService,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.enablePageScroll();
    this.subscription = this.employeeService.employees$.subscribe((employees) => {
      this.employees = employees;
    });
  }

  ngOnDestroy(): void {
    this.disablePageScroll();
    this.subscription?.unsubscribe();
  }

  private enablePageScroll(): void {
    document.documentElement.classList.add(PAGE_SCROLL_CLASS);
    document.body.classList.add(PAGE_SCROLL_CLASS);
    document.body.style.overflowY = 'auto';
    document.body.style.overflowX = 'hidden';
    document.documentElement.style.overflowY = 'auto';
  }

  private disablePageScroll(): void {
    document.documentElement.classList.remove(PAGE_SCROLL_CLASS);
    document.body.classList.remove(PAGE_SCROLL_CLASS);
    document.body.style.overflowY = '';
    document.body.style.overflowX = '';
    document.documentElement.style.overflowY = '';
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(EmployeeFormComponent, {
      width: '420px',
      data: { employee: null },
    });

    dialogRef.afterClosed().subscribe((result: EmployeeFormDialogResult | undefined) => {
      if (result?.data) {
        this.employeeService.createEmployee(result.data);
        this.showMessage('Mitarbeiter wurde angelegt.');
      }
    });
  }

  openEditDialog(employee: Employee): void {
    const dialogRef = this.dialog.open(EmployeeFormComponent, {
      width: '420px',
      data: { employee },
    });

    dialogRef.afterClosed().subscribe((result: EmployeeFormDialogResult | undefined) => {
      if (result?.data) {
        this.employeeService.updateEmployee(employee.id, result.data);
        this.showMessage('Mitarbeiter wurde aktualisiert.');
      }
    });
  }

  confirmDelete(employee: Employee): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Mitarbeiter löschen',
        message: `Möchten Sie „${employee.firstName} ${employee.lastName}" wirklich löschen?`,
        confirmLabel: 'Löschen',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.employeeService.deleteEmployee(employee.id);
        this.showMessage('Mitarbeiter wurde gelöscht.');
      }
    });
  }

  private showMessage(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }
}
