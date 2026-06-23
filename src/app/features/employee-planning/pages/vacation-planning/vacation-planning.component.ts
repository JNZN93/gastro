import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Subscription, startWith } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { AbsenceType } from '../../models/vacation.model';
import { EmployeeService } from '../../services/employee.service';
import { VacationService } from '../../services/vacation.service';
import { HolidayService } from '../../services/holiday.service';
import { EmployeePlanningNavComponent } from '../../shared/employee-planning-nav/employee-planning-nav.component';

/** Kalendertag in der Urlaubsansicht. */
interface CalendarDay {
  date: Date;
  dayNumber: number;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  absenceType: AbsenceType | null;
  isCurrentMonth: boolean;
}

/** Kompakte Zeile in der Mitarbeiter-Übersicht. */
interface EmployeeVacationOverview {
  employee: Employee;
  paidVacationMonth: number;
  sickMonth: number;
  unpaidMonth: number;
  usedPaidVacationYear: number;
  remainingPaidVacationYear: number;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const PAGE_SCROLL_CLASS = 'employee-planning-page';

/** Seite zur Abwesenheitsplanung (Urlaub, Krankheit, Arbeitsfrei) pro Mitarbeiter und Monat. */
@Component({
  selector: 'app-vacation-planning',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    EmployeePlanningNavComponent,
  ],
  templateUrl: './vacation-planning.component.html',
  styleUrl: './vacation-planning.component.scss',
})
export class VacationPlanningComponent implements OnInit, OnDestroy {
  readonly monthNames = MONTH_NAMES;
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly years: number[];

  filterForm: FormGroup;
  activeEmployees: Employee[] = [];
  employeeOverviews: EmployeeVacationOverview[] = [];
  selectedEmployeeId: string | null = null;
  selectedAbsenceType: AbsenceType = 'paid';
  overviewColumns = ['name', 'paidVacationMonth', 'sickMonth', 'unpaidMonth', 'vacationYear'];
  calendarWeeks: (CalendarDay | null)[][] = [];

  private vacationSubscription?: Subscription;
  private employeeSubscription?: Subscription;
  private filterSubscription?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly employeeService: EmployeeService,
    private readonly vacationService: VacationService,
    private readonly holidayService: HolidayService,
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

  get selectedPaidVacationMonthCount(): number {
    if (!this.selectedEmployeeId) {
      return 0;
    }
    return this.vacationService.getAbsenceCountForMonth(
      this.selectedEmployeeId,
      this.selectedYear,
      this.selectedMonth,
      'paid'
    );
  }

  get selectedUnpaidMonthCount(): number {
    if (!this.selectedEmployeeId) {
      return 0;
    }
    return this.vacationService.getAbsenceCountForMonth(
      this.selectedEmployeeId,
      this.selectedYear,
      this.selectedMonth,
      'unpaid'
    );
  }

  get selectedSickMonthCount(): number {
    if (!this.selectedEmployeeId) {
      return 0;
    }
    return this.vacationService.getAbsenceCountForMonth(
      this.selectedEmployeeId,
      this.selectedYear,
      this.selectedMonth,
      'sick'
    );
  }

  get selectedUsedPaidVacationYear(): number {
    if (!this.selectedEmployee) {
      return 0;
    }
    return this.vacationService.getUsedPaidVacationDaysForYear(
      this.selectedEmployee.id,
      this.selectedYear
    );
  }

  get selectedRemainingPaidVacationYear(): number {
    if (!this.selectedEmployee) {
      return 0;
    }
    return this.vacationService.getRemainingPaidVacationDays(
      this.selectedEmployee.id,
      this.selectedYear,
      this.selectedEmployee.annualVacationDays
    );
  }

  get canAddMorePaidVacation(): boolean {
    if (!this.selectedEmployee) {
      return false;
    }
    return this.vacationService.canAddPaidVacation(
      this.selectedEmployee.id,
      this.selectedYear,
      this.selectedEmployee.annualVacationDays
    );
  }

  selectEmployee(employeeId: string): void {
    this.selectedEmployeeId = employeeId;
    this.buildCalendar();
  }

  isSelected(employeeId: string): boolean {
    return this.selectedEmployeeId === employeeId;
  }

  setAbsenceType(type: AbsenceType): void {
    this.selectedAbsenceType = type;
  }

  toggleDay(day: CalendarDay): void {
    if (!this.selectedEmployee || !day.isCurrentMonth) {
      return;
    }

    const result = this.vacationService.applyDaySelection(
      this.selectedEmployee.id,
      day.date,
      this.selectedAbsenceType,
      this.selectedEmployee.annualVacationDays
    );

    if (result.action === 'blocked') {
      this.showMessage('Kein bezahlter Urlaub mehr verfügbar. Jahreskontingent erreicht.');
      return;
    }

    day.absenceType =
      result.action === 'removed'
        ? null
        : result.action === 'added' || result.action === 'changed'
          ? result.type
          : day.absenceType;

    this.updateEmployeeOverviews();
    this.showMessage(this.messageForResult(result));
  }

  clearMonthAbsences(): void {
    if (!this.selectedEmployeeId) {
      return;
    }

    this.vacationService.clearAbsenceDaysForMonth(
      this.selectedEmployeeId,
      this.selectedYear,
      this.selectedMonth
    );
    this.buildCalendar();
    this.updateEmployeeOverviews();
    this.showMessage('Abwesenheiten für diesen Monat wurden entfernt.');
  }

  dayTooltip(day: CalendarDay): string {
    if (day.absenceType === 'paid') {
      return 'Bezahlter Urlaub – Klicken zum Entfernen oder Ändern';
    }
    if (day.absenceType === 'sick') {
      return 'Krank – Klicken zum Entfernen oder Ändern';
    }
    if (day.absenceType === 'unpaid') {
      return 'Arbeitsfrei (unbezahlt) – Klicken zum Entfernen oder Ändern';
    }
    if (day.isHoliday && day.holidayName) {
      return day.holidayName;
    }
    if (day.isSunday) {
      return 'Sonntag';
    }
    if (this.selectedAbsenceType === 'paid' && !this.canAddMorePaidVacation) {
      return 'Jahreskontingent für bezahlten Urlaub erreicht';
    }
    return this.selectedAbsenceType === 'paid'
      ? 'Klicken für bezahlten Urlaub'
      : this.selectedAbsenceType === 'sick'
        ? 'Klicken für Krankheit'
        : 'Klicken für Arbeitsfrei';
  }

  private messageForResult(result: { action: string; type?: AbsenceType }): string {
    switch (result.action) {
      case 'added':
        return result.type === 'paid'
          ? 'Bezahlter Urlaub eingetragen.'
          : result.type === 'sick'
            ? 'Krankheit eingetragen.'
            : 'Arbeitsfrei eingetragen.';
      case 'removed':
        return 'Eintrag entfernt.';
      case 'changed':
        return result.type === 'paid'
          ? 'Auf bezahlten Urlaub geändert.'
          : result.type === 'sick'
            ? 'Auf Krankheit geändert.'
            : 'Auf Arbeitsfrei geändert.';
      default:
        return '';
    }
  }

  private refreshView(): void {
    this.activeEmployees = this.employeeService.getEmployees().filter((e) => e.active);
    this.syncSelectedEmployee();
    this.updateEmployeeOverviews();
    this.buildCalendar();
  }

  private updateEmployeeOverviews(): void {
    this.employeeOverviews = this.activeEmployees.map((employee) => ({
      employee,
      paidVacationMonth: this.vacationService.getAbsenceCountForMonth(
        employee.id,
        this.selectedYear,
        this.selectedMonth,
        'paid'
      ),
      sickMonth: this.vacationService.getAbsenceCountForMonth(
        employee.id,
        this.selectedYear,
        this.selectedMonth,
        'sick'
      ),
      unpaidMonth: this.vacationService.getAbsenceCountForMonth(
        employee.id,
        this.selectedYear,
        this.selectedMonth,
        'unpaid'
      ),
      usedPaidVacationYear: this.vacationService.getUsedPaidVacationDaysForYear(
        employee.id,
        this.selectedYear
      ),
      remainingPaidVacationYear: this.vacationService.getRemainingPaidVacationDays(
        employee.id,
        this.selectedYear,
        employee.annualVacationDays
      ),
    }));
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

  private buildCalendar(): void {
    if (!this.selectedEmployeeId) {
      this.calendarWeeks = [];
      return;
    }

    const year = this.selectedYear;
    const month = this.selectedMonth;
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = this.holidayService.createLocalDate(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: (CalendarDay | null)[] = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = this.holidayService.createLocalDate(year, month, day);
      const holidayInfo = this.holidayService.getHolidayInfo(date);
      cells.push({
        date,
        dayNumber: day,
        isSunday: date.getDay() === 0,
        isHoliday: holidayInfo !== null,
        holidayName: holidayInfo?.name,
        absenceType: this.vacationService.getAbsenceType(this.selectedEmployeeId, date),
        isCurrentMonth: true,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    this.calendarWeeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      this.calendarWeeks.push(cells.slice(i, i + 7));
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
