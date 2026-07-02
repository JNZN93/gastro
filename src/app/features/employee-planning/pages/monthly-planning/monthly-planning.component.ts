import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subscription, firstValueFrom, startWith } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule } from '../../models/schedule.model';
import { EMPLOYEE_REPOSITORY, EmployeeRepository } from '../../repositories/employee.repository';
import { SCHEDULE_REPOSITORY, ScheduleRepository } from '../../repositories/schedule.repository';
import { ABSENCE_REPOSITORY, AbsenceRepository } from '../../repositories/absence.repository';
import { ExcelExportService } from '../../services/excel-export.service';
import { MonthlyHoursCalculatorService } from '../../services/monthly-hours-calculator.service';
import {
  PlanningOverviewStatus,
  PlanningStatusService,
} from '../../services/planning-status.service';
import { PlanningTableComponent } from '../../shared/planning-table/planning-table.component';
import { AbsenceCalendarComponent } from '../../shared/absence-calendar/absence-calendar.component';
import { EmployeePlanningNavComponent } from '../../shared/employee-planning-nav/employee-planning-nav.component';
import {
  OvertimeBalanceDialogComponent,
  OvertimeEmployeeSummary,
} from '../../shared/overtime-balance-dialog/overtime-balance-dialog.component';

interface EmployeeOverviewRow {
  employee: Employee;
  schedule: EmployeeSchedule;
  overview: PlanningOverviewStatus;
  totalPlanned: number;
  selected: boolean;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const PAGE_SCROLL_CLASS = 'employee-planning-page';

/** Hauptseite: Monatsplanung mit Master-Detail und integrierter Abwesenheit. */
@Component({
  selector: 'app-monthly-planning',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatCheckboxModule,
    MatButtonToggleModule,
    MatDialogModule,
    PlanningTableComponent,
    AbsenceCalendarComponent,
    EmployeePlanningNavComponent,
  ],
  templateUrl: './monthly-planning.component.html',
  styleUrl: './monthly-planning.component.scss',
})
export class MonthlyPlanningComponent implements OnInit, OnDestroy {
  readonly monthNames = MONTH_NAMES;
  readonly years: number[];

  filterForm: FormGroup;
  overviewRows: EmployeeOverviewRow[] = [];
  selectedEmployeeId: string | null = null;
  selectedForDistribute = new Set<string>();
  detailViewMode: 'month' | 'week' = 'month';
  overviewColumns = ['select', 'name', 'targetHours', 'plannedHours', 'diff', 'absence', 'status', 'flags'];
  isDistributing = false;

  private employeeSubscription?: Subscription;
  private scheduleSubscription?: Subscription;
  private absenceSubscription?: Subscription;
  private filterSubscription?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employeeRepo: EmployeeRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: ScheduleRepository,
    @Inject(ABSENCE_REPOSITORY) private readonly absenceRepo: AbsenceRepository,
    private readonly excelExportService: ExcelExportService,
    private readonly monthlyCalculator: MonthlyHoursCalculatorService,
    private readonly planningStatus: PlanningStatusService,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar
  ) {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);
    const now = new Date();
    this.filterForm = this.fb.group({
      month: [now.getMonth() + 1],
      year: [now.getFullYear()],
    });
  }

  ngOnInit(): void {
    this.enablePageScroll();
    this.employeeSubscription = this.employeeRepo.employees$.subscribe(() => this.refreshView());
    this.scheduleSubscription = this.scheduleRepo.schedules$.subscribe(() => this.refreshView());
    this.absenceSubscription = this.absenceRepo.vacations$.subscribe(() => this.refreshView());
    this.filterSubscription = this.filterForm.valueChanges
      .pipe(startWith(this.filterForm.value))
      .subscribe(() => this.refreshView());
  }

  ngOnDestroy(): void {
    this.disablePageScroll();
    this.employeeSubscription?.unsubscribe();
    this.scheduleSubscription?.unsubscribe();
    this.absenceSubscription?.unsubscribe();
    this.filterSubscription?.unsubscribe();
  }

  get selectedMonth(): number {
    return Number(this.filterForm.get('month')?.value);
  }

  get selectedYear(): number {
    return Number(this.filterForm.get('year')?.value);
  }

  get selectedEmployee(): Employee | null {
    if (!this.selectedEmployeeId) return null;
    return this.employeeRepo.getEmployeeById(this.selectedEmployeeId) ?? null;
  }

  get selectedSchedule(): EmployeeSchedule | null {
    if (!this.selectedEmployeeId) return null;
    return this.scheduleRepo.getOrCreateEmptySchedule(
      this.selectedEmployeeId,
      this.selectedYear,
      this.selectedMonth
    );
  }

  get hasPlannableEmployees(): boolean {
    return this.employeeRepo.getPlannableEmployees().length > 0;
  }

  get hasOverviewEmployees(): boolean {
    return this.employeeRepo.getOverviewEmployees().length > 0;
  }

  selectEmployee(employeeId: string): void {
    this.selectedEmployeeId = employeeId;
  }

  isSelected(employeeId: string): boolean {
    return this.selectedEmployeeId === employeeId;
  }

  toggleDistributeSelection(employeeId: string, checked: boolean): void {
    if (checked) {
      this.selectedForDistribute.add(employeeId);
    } else {
      this.selectedForDistribute.delete(employeeId);
    }
  }

  isSelectedForDistribute(employeeId: string): boolean {
    return this.selectedForDistribute.has(employeeId);
  }

  toggleSelectAll(checked: boolean): void {
    this.selectedForDistribute.clear();
    if (checked) {
      this.overviewRows.forEach((row) => this.selectedForDistribute.add(row.employee.id));
    }
  }

  updateMonthlyTargetsFromWeekly(): void {
    const employees = this.employeeRepo.getPlannableEmployees();
    let updated = 0;
    for (const employee of employees) {
      if (employee.monthlyHoursManual) continue;
      const suggested = this.monthlyCalculator.calculateSuggestedMonthlyHours(
        employee.weeklyHours,
        this.selectedYear,
        this.selectedMonth
      );
      if (Math.abs(suggested - employee.monthlyHours) > 0.01) {
        this.employeeRepo.updateEmployee(employee.id, {
          ...employee,
          monthlyHours: suggested,
          monthlyHoursManual: false,
        });
        updated++;
      }
    }
    this.showMessage(
      updated > 0
        ? `Monatssoll für ${updated} Mitarbeiter aus Wochenstunden aktualisiert.`
        : 'Alle Monatssoll-Werte sind bereits aktuell.'
    );
  }

  distributeHours(): void {
    const ids =
      this.selectedForDistribute.size > 0
        ? [...this.selectedForDistribute]
        : this.overviewRows.map((r) => r.employee.id);

    const employees = ids
      .map((id) => this.employeeRepo.getEmployeeById(id))
      .filter((e): e is Employee => !!e && e.active && !e.archived);

    if (employees.length === 0) {
      this.showMessage('Keine Mitarbeiter zum Verteilen ausgewählt.');
      return;
    }

    this.isDistributing = true;
    try {
      this.scheduleRepo.distributeForEmployees(employees, this.selectedYear, this.selectedMonth);
      this.showMessage(`Stunden für ${employees.length} Mitarbeiter verteilt.`);
    } finally {
      this.isDistributing = false;
    }
  }

  async exportExcel(): Promise<void> {
    const employees = this.employeeRepo.getPlannableEmployees();
    if (employees.length === 0) {
      this.showMessage('Keine aktiven Mitarbeiter zum Exportieren.');
      return;
    }

    const overtimeSummaries: OvertimeEmployeeSummary[] = [];
    const schedules: EmployeeSchedule[] = [];

    for (const employee of employees) {
      const schedule = this.scheduleRepo.getSchedule(employee.id, this.selectedYear, this.selectedMonth);
      if (!schedule) continue;
      schedules.push(schedule);
      const stats = this.scheduleRepo.calculateStats(schedule);
      if (stats.totalHours > employee.monthlyHours) {
        overtimeSummaries.push({
          employee,
          schedule,
          excessHours: stats.totalHours - employee.monthlyHours,
        });
      }
    }

    if (schedules.length === 0) {
      this.showMessage('Bitte zuerst Stunden verteilen.');
      return;
    }

    let balanceBeforeExport = false;
    if (overtimeSummaries.length > 0) {
      const dialogRef = this.dialog.open(OvertimeBalanceDialogComponent, {
        width: '480px',
        data: { employees: overtimeSummaries },
      });
      const result = await firstValueFrom(dialogRef.afterClosed());
      balanceBeforeExport = result?.confirmed ?? false;

      if (balanceBeforeExport) {
        for (const item of overtimeSummaries) {
          this.scheduleRepo.balanceOvertime(item.schedule, item.employee.monthlyHours);
        }
        this.refreshView();
      }
    }

    const finalSchedules = employees
      .map((e) => this.scheduleRepo.getSchedule(e.id, this.selectedYear, this.selectedMonth))
      .filter((s): s is EmployeeSchedule => s !== null);

    try {
      await this.excelExportService.exportMonthlyPlan(
        employees,
        finalSchedules,
        this.selectedYear,
        this.selectedMonth
      );
      this.showMessage('Zeiterfassung wurde exportiert.');
    } catch {
      this.showMessage('Export fehlgeschlagen.');
    }
  }

  onAbsenceChanged(): void {
    this.refreshView();
  }

  setDetailViewMode(mode: 'month' | 'week'): void {
    this.detailViewMode = mode;
  }

  diffClass(diff: number): string {
    if (diff > 0) return 'diff-over';
    if (diff < 0) return 'diff-under';
    return 'diff-ok';
  }

  private refreshView(): void {
    const overviewEmployees = this.employeeRepo.getOverviewEmployees();
    this.overviewRows = overviewEmployees.map((employee) => {
      const schedule = this.scheduleRepo.getOrCreateEmptySchedule(
        employee.id,
        this.selectedYear,
        this.selectedMonth
      );
      const overview = this.planningStatus.getOverviewStatus(
        employee,
        schedule,
        this.selectedYear,
        this.selectedMonth
      );
      const stats = this.scheduleRepo.calculateStats(schedule);
      return {
        employee,
        schedule,
        overview,
        totalPlanned: stats.totalHours,
        selected: this.selectedForDistribute.has(employee.id),
      };
    });

    if (overviewEmployees.length === 0) {
      this.selectedEmployeeId = null;
      return;
    }

    if (this.selectedForDistribute.size === 0) {
      this.employeeRepo
        .getPlannableEmployees()
        .forEach((e) => this.selectedForDistribute.add(e.id));
    }

    const valid = overviewEmployees.some((e) => e.id === this.selectedEmployeeId);
    if (!valid) {
      this.selectedEmployeeId = overviewEmployees[0].id;
    }
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
