import {
  Component,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule } from '../../models/schedule.model';
import { AbsenceDayResult, AbsenceType } from '../../models/vacation.model';
import { ABSENCE_REPOSITORY, AbsenceRepository } from '../../repositories/absence.repository';
import { SCHEDULE_REPOSITORY, ScheduleRepository } from '../../repositories/schedule.repository';
import { HolidayService } from '../../services/holiday.service';

export interface AbsenceCalendarDay {
  date: Date;
  dayNumber: number;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  absenceType: AbsenceType | null;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Kompakter Abwesenheits-Kalender für ein Einzelperson-Detail. */
@Component({
  selector: 'app-absence-calendar',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSnackBarModule],
  templateUrl: './absence-calendar.component.html',
  styleUrl: './absence-calendar.component.scss',
})
export class AbsenceCalendarComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) employee!: Employee;
  @Input({ required: true }) year!: number;
  @Input({ required: true }) month!: number;
  @Input() schedule: EmployeeSchedule | null = null;
  @Input() compact = false;
  @Input() collapsible = false;
  @Output() absenceChanged = new EventEmitter<void>();

  readonly weekdayLabels = WEEKDAY_LABELS;
  selectedAbsenceType: AbsenceType = 'paid';
  calendarWeeks: (AbsenceCalendarDay | null)[][] = [];
  expanded = false;

  private absenceSubscription?: Subscription;
  private scheduleSubscription?: Subscription;

  constructor(
    @Inject(ABSENCE_REPOSITORY) private readonly absenceRepo: AbsenceRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: ScheduleRepository,
    private readonly holidayService: HolidayService,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.absenceSubscription = this.absenceRepo.vacations$.subscribe(() => this.buildCalendar());
    this.scheduleSubscription = this.scheduleRepo.schedules$.subscribe(() => this.buildCalendar());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['employee'] || changes['year'] || changes['month'] || changes['schedule']) {
      this.buildCalendar();
    }
  }

  ngOnDestroy(): void {
    this.absenceSubscription?.unsubscribe();
    this.scheduleSubscription?.unsubscribe();
  }

  get canAddMorePaidVacation(): boolean {
    const used = this.absenceRepo.getUsedPaidVacationDaysForYear(this.employee.id, this.year);
    return used < this.employee.annualVacationDays;
  }

  get absenceSummary(): string {
    const paid = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'paid');
    const sick = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'sick');
    const unpaid = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'unpaid');
    return `${paid}U · ${sick}K · ${unpaid}F`;
  }

  get canClearMonth(): boolean {
    const paid = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'paid');
    const sick = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'sick');
    const unpaid = this.absenceRepo.getAbsenceCountForMonth(this.employee.id, this.year, this.month, 'unpaid');
    return paid + sick + unpaid > 0;
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  onDayClick(day: AbsenceCalendarDay): void {
    if (day.isSunday) {
      this.showMessage('Sonntage können nicht als Abwesenheit markiert werden.');
      return;
    }

    if (day.isHoliday) {
      this.showMessage('Feiertage können nicht als Abwesenheit markiert werden.');
      return;
    }

    if (this.selectedAbsenceType === 'paid' && !this.canAddMorePaidVacation && day.absenceType !== 'paid') {
      this.showMessage('Kein bezahlter Urlaub mehr verfügbar. Jahreskontingent erreicht.');
      return;
    }

    let result: AbsenceDayResult;

    if (this.schedule) {
      const response = this.scheduleRepo.applyDayAbsenceSelection(
        this.employee,
        this.schedule,
        day.date,
        this.selectedAbsenceType
      );
      result = response.result;
      this.schedule = response.schedule;
    } else {
      result = this.absenceRepo.applyDaySelection(
        this.employee.id,
        day.date,
        this.selectedAbsenceType,
        this.employee.annualVacationDays
      );
    }

    if (result.action === 'blocked') {
      this.showMessage('Kein bezahlter Urlaub mehr verfügbar. Jahreskontingent erreicht.');
      return;
    }

    if (result.action === 'unchanged') {
      return;
    }

    this.absenceChanged.emit();
    this.buildCalendar();
    this.showMessage(this.messageForResult(result));
  }

  clearMonth(): void {
    if (!this.canClearMonth) {
      return;
    }

    this.absenceRepo.clearAbsenceDaysForMonth(this.employee.id, this.year, this.month);

    if (this.schedule) {
      this.schedule = this.scheduleRepo.syncScheduleAbsences(this.employee, this.schedule);
    }

    this.absenceChanged.emit();
    this.buildCalendar();
    this.showMessage('Abwesenheiten für diesen Monat wurden entfernt.');
  }

  dayTooltip(day: AbsenceCalendarDay): string {
    if (day.absenceType === 'paid') {
      return 'Bezahlter Urlaub – erneut klicken zum Entfernen';
    }
    if (day.absenceType === 'sick') {
      return 'Krank – erneut klicken zum Entfernen oder Eintragsart wechseln';
    }
    if (day.absenceType === 'unpaid') {
      return 'Arbeitsfrei – erneut klicken zum Entfernen oder Eintragsart wechseln';
    }
    if (day.isHoliday && day.holidayName) {
      return day.holidayName;
    }
    if (day.isSunday) {
      return 'Sonntag';
    }
    if (this.selectedAbsenceType === 'paid' && !this.canAddMorePaidVacation) {
      return 'Jahreskontingent für Urlaub erreicht';
    }
    return this.selectedAbsenceType === 'paid'
      ? 'Klicken für Urlaub'
      : this.selectedAbsenceType === 'sick'
        ? 'Klicken für Krank'
        : 'Klicken für Arbeitsfrei';
  }

  private buildCalendar(): void {
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const firstDay = this.holidayService.createLocalDate(this.year, this.month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells: (AbsenceCalendarDay | null)[] = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = this.holidayService.createLocalDate(this.year, this.month, d);
      const holidayInfo = this.holidayService.getHolidayInfo(date);
      cells.push({
        date,
        dayNumber: d,
        isSunday: date.getDay() === 0,
        isHoliday: holidayInfo !== null,
        holidayName: holidayInfo?.name,
        absenceType: this.getAbsenceTypeForDate(date),
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

  private getAbsenceTypeForDate(date: Date): AbsenceType | null {
    if (this.schedule) {
      const workDay = this.schedule.workDays.find(
        (day) =>
          day.date.getFullYear() === date.getFullYear() &&
          day.date.getMonth() === date.getMonth() &&
          day.date.getDate() === date.getDate()
      );
      if (workDay?.isVacation) return 'paid';
      if (workDay?.isSick) return 'sick';
      if (workDay?.isUnpaidDayOff) return 'unpaid';
    }
    return this.absenceRepo.getAbsenceType(this.employee.id, date);
  }

  private messageForResult(result: AbsenceDayResult): string {
    switch (result.action) {
      case 'added':
        return result.type === 'paid'
          ? 'Urlaub eingetragen.'
          : result.type === 'sick'
            ? 'Krankheit eingetragen.'
            : 'Arbeitsfrei eingetragen.';
      case 'removed':
        return 'Abwesenheit entfernt.';
      case 'changed':
        return result.type === 'paid'
          ? 'Auf Urlaub geändert.'
          : result.type === 'sick'
            ? 'Auf Krankheit geändert.'
            : 'Auf Arbeitsfrei geändert.';
      default:
        return '';
    }
  }

  private showMessage(message: string): void {
    if (!message) return;
    this.snackBar.open(message, 'OK', { duration: 2500 });
  }
}
