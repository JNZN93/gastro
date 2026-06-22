import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Subscription, startWith } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule, ScheduleStats } from '../../models/schedule.model';
import { EmployeeService } from '../../services/employee.service';
import { PlanningService } from '../../services/planning.service';
import { VacationService } from '../../services/vacation.service';
import { ExcelExportService } from '../../services/excel-export.service';
import { PlanningTableComponent } from '../../shared/planning-table/planning-table.component';
import { EmployeePlanningNavComponent } from '../../shared/employee-planning-nav/employee-planning-nav.component';

/** Kompakte Zeile in der Mitarbeiter-Übersicht. */
interface EmployeeOverview {
  employee: Employee;
  stats: ScheduleStats;
  isPlanned: boolean;
}

/** Monatsnamen für die Auswahl (Index 0 = Januar). */
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const PAGE_SCROLL_CLASS = 'employee-planning-page';

/** Seite zur Monatsplanung mit automatischer Stundenverteilung. */
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
    PlanningTableComponent,
    EmployeePlanningNavComponent,
  ],
  templateUrl: './monthly-planning.component.html',
  styleUrl: './monthly-planning.component.scss',
})
export class MonthlyPlanningComponent implements OnInit, OnDestroy {
  readonly monthNames = MONTH_NAMES;
  readonly years: number[];

  filterForm: FormGroup;
  activeEmployees: Employee[] = [];
  employeeOverviews: EmployeeOverview[] = [];
  selectedEmployeeId: string | null = null;
  overviewColumns = ['name', 'targetHours', 'plannedHours', 'workDays', 'status'];
  schedulesByEmployee = new Map<string, EmployeeSchedule>();
  isDistributing = false;

  private allSchedules: EmployeeSchedule[] = [];
  private employeeSubscription?: Subscription;
  private scheduleSubscription?: Subscription;
  private vacationSubscription?: Subscription;
  private filterSubscription?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly employeeService: EmployeeService,
    private readonly planningService: PlanningService,
    private readonly vacationService: VacationService,
    private readonly excelExportService: ExcelExportService,
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

    this.employeeSubscription = this.employeeService.employees$.subscribe(() => {
      this.refreshView();
    });

    this.scheduleSubscription = this.planningService.schedules$.subscribe((schedules) => {
      this.allSchedules = schedules;
      this.refreshView();
    });

    this.vacationSubscription = this.vacationService.vacations$.subscribe(() => {
      this.refreshView();
    });

    this.filterSubscription = this.filterForm.valueChanges
      .pipe(startWith(this.filterForm.value))
      .subscribe(() => {
        this.refreshView();
      });
  }

  ngOnDestroy(): void {
    this.disablePageScroll();
    this.employeeSubscription?.unsubscribe();
    this.scheduleSubscription?.unsubscribe();
    this.vacationSubscription?.unsubscribe();
    this.filterSubscription?.unsubscribe();
  }

  get selectedMonth(): number {
    return Number(this.filterForm.get('month')?.value);
  }

  get selectedYear(): number {
    return Number(this.filterForm.get('year')?.value);
  }

  get selectedEmployee(): Employee | null {
    if (!this.selectedEmployeeId) {
      return null;
    }
    return this.activeEmployees.find((e) => e.id === this.selectedEmployeeId) ?? null;
  }

  getScheduleForEmployee(employeeId: string): EmployeeSchedule | null {
    return this.schedulesByEmployee.get(employeeId) ?? null;
  }

  selectEmployee(employeeId: string): void {
    this.selectedEmployeeId = employeeId;
  }

  isSelected(employeeId: string): boolean {
    return this.selectedEmployeeId === employeeId;
  }

  onPeriodChanged(): void {
    this.refreshView();
  }

  distributeHours(): void {
    if (this.activeEmployees.length === 0) {
      this.showMessage('Keine aktiven Mitarbeiter vorhanden.');
      return;
    }

    this.isDistributing = true;
    try {
      this.planningService.distributeForActiveEmployees(
        this.employeeService.getEmployees(),
        this.selectedYear,
        this.selectedMonth
      );
      this.showMessage('Stunden wurden erfolgreich verteilt.');
    } finally {
      this.isDistributing = false;
    }
  }

  async exportExcel(): Promise<void> {
    if (this.activeEmployees.length === 0) {
      this.showMessage('Keine aktiven Mitarbeiter zum Exportieren.');
      return;
    }

    const schedules = this.activeEmployees
      .map((e) => this.getScheduleForEmployee(e.id))
      .filter((s): s is EmployeeSchedule => s !== null);

    if (schedules.length === 0) {
      this.showMessage('Bitte zuerst Stunden verteilen.');
      return;
    }

    try {
      await this.excelExportService.exportMonthlyPlan(
        this.activeEmployees,
        schedules,
        this.selectedYear,
        this.selectedMonth
      );
      this.showMessage('Zeiterfassung wurde exportiert.');
    } catch {
      this.showMessage('Export fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  private refreshView(): void {
    this.activeEmployees = this.employeeService.getEmployees().filter((e) => e.active);
    this.loadSchedulesForPeriod(this.allSchedules, this.selectedYear, this.selectedMonth);
  }

  private loadSchedulesForPeriod(
    allSchedules: EmployeeSchedule[],
    year: number,
    month: number
  ): void {
    if (!year || !month) {
      return;
    }

    this.schedulesByEmployee.clear();

    for (const employee of this.activeEmployees) {
      const schedule =
        allSchedules.find(
          (s) => s.employeeId === employee.id && s.year === year && s.month === month
        ) ?? null;

      const resolved =
        schedule !== null
          ? this.planningService.getSchedule(employee.id, year, month)!
          : this.planningService.getOrCreateEmptySchedule(employee.id, year, month);

      this.schedulesByEmployee.set(employee.id, resolved);
    }

    this.updateEmployeeOverviews();
    this.syncSelectedEmployee();
  }

  private updateEmployeeOverviews(): void {
    this.employeeOverviews = this.activeEmployees.map((employee) => {
      const schedule = this.schedulesByEmployee.get(employee.id);
      const stats = schedule
        ? this.planningService.calculateStats(schedule)
        : { totalHours: 0, workDayCount: 0, holidayCount: 0, sundayCount: 0, vacationCount: 0, unpaidDayOffCount: 0 };
      const isPlanned = schedule?.workDays.some((day) => day.plannedHours > 0) ?? false;

      return { employee, stats, isPlanned };
    });
  }

  private syncSelectedEmployee(): void {
    if (this.activeEmployees.length === 0) {
      this.selectedEmployeeId = null;
      return;
    }

    const isCurrentSelectionValid = this.activeEmployees.some(
      (employee) => employee.id === this.selectedEmployeeId
    );
    if (!isCurrentSelectionValid) {
      this.selectedEmployeeId = this.activeEmployees[0].id;
    }
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

  private showMessage(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }
}
