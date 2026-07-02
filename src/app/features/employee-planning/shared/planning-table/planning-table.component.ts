import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule, ScheduleStats, WorkDay } from '../../models/schedule.model';
import { AbsenceType } from '../../models/vacation.model';
import { PlanningService } from '../../services/planning.service';
import { TimeCalculationService } from '../../services/time-calculation.service';

/** Tabellarische Monatsübersicht für einen einzelnen Mitarbeiter. */
@Component({
  selector: 'app-planning-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatCardModule, MatSnackBarModule],
  templateUrl: './planning-table.component.html',
  styleUrl: './planning-table.component.scss',
})
export class PlanningTableComponent implements OnChanges {
  @Input({ required: true }) employee!: Employee;
  @Input() schedule: EmployeeSchedule | null = null;
  @Input() editable = true;
  @Input() viewMode: 'month' | 'week' = 'month';
  @Output() dayClick = new EventEmitter<WorkDay>();

  displayedColumns = ['date', 'weekday', 'holiday', 'start', 'end', 'break', 'hours'];
  displayDays: WorkDay[] = [];
  weekGroups: WorkDay[][] = [];
  stats: ScheduleStats = {
    totalHours: 0,
    workDayCount: 0,
    holidayCount: 0,
    sundayCount: 0,
    vacationCount: 0,
    unpaidDayOffCount: 0,
    sickDayCount: 0,
  };

  private readonly weekdayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
  private readonly dateFormatter = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  constructor(
    private readonly planningService: PlanningService,
    private readonly timeCalculation: TimeCalculationService,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.schedule) {
      this.stats = this.planningService.calculateStats(this.schedule);
      this.updateDisplayDays();
    } else {
      this.stats = {
        totalHours: 0,
        workDayCount: 0,
        holidayCount: 0,
        sundayCount: 0,
        vacationCount: 0,
        unpaidDayOffCount: 0,
        sickDayCount: 0,
      };
      this.displayDays = [];
      this.weekGroups = [];
    }

    if (changes['viewMode'] && this.schedule) {
      this.updateDisplayDays();
    }
  }

  onDayRowClick(day: WorkDay): void {
    this.dayClick.emit(day);
  }

  private updateDisplayDays(): void {
    if (!this.schedule) {
      return;
    }

    if (this.viewMode === 'month') {
      this.displayDays = this.schedule.workDays;
      this.weekGroups = [];
      return;
    }

    const today = new Date();
    const refDate =
      today.getFullYear() === this.schedule.year && today.getMonth() + 1 === this.schedule.month
        ? today
        : this.schedule.workDays[0]?.date ?? today;

    const startOfWeek = this.getMonday(refDate);
    const weekDays: WorkDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const match = this.schedule.workDays.find(
        (d) =>
          d.date.getFullYear() === date.getFullYear() &&
          d.date.getMonth() === date.getMonth() &&
          d.date.getDate() === date.getDate()
      );
      if (match) {
        weekDays.push(match);
      }
    }

    this.displayDays = weekDays;
    this.weekGroups = [weekDays];
  }

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  get isOverMonthlyTarget(): boolean {
    return this.stats.totalHours > this.employee.monthlyHours;
  }

  formatDate(date: Date): string {
    return this.dateFormatter.format(date);
  }

  formatWeekday(date: Date): string {
    const name = this.weekdayFormatter.format(date);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  getAbsenceValue(day: WorkDay): string {
    if (day.isVacation) {
      return 'paid';
    }
    if (day.isSick) {
      return 'sick';
    }
    if (day.isUnpaidDayOff) {
      return 'unpaid';
    }
    return '';
  }

  canEditAbsence(day: WorkDay): boolean {
    return this.editable && !day.isSunday && !day.isHoliday;
  }

  canEditHours(day: WorkDay): boolean {
    return this.editable && !day.isSunday && !day.isHoliday && !day.isUnpaidDayOff;
  }

  canEditTimes(day: WorkDay): boolean {
    return (
      this.editable &&
      !day.isSunday &&
      !day.isHoliday &&
      !day.isUnpaidDayOff &&
      !day.isVacation &&
      !day.isSick
    );
  }

  getStartTimeValue(day: WorkDay): string {
    return day.startTime ?? this.employee.defaultStartTime;
  }

  getEndTimeValue(day: WorkDay): string {
    return day.endTime ?? '';
  }

  formatHolidayLabel(
    isSunday: boolean,
    isHoliday: boolean,
    isVacation: boolean,
    isUnpaidDayOff: boolean,
    isSick: boolean,
    holidayName?: string
  ): string {
    if (isVacation) {
      return 'Bezahlter Urlaub';
    }
    if (isSick) {
      return 'Krank';
    }
    if (isUnpaidDayOff) {
      return 'Arbeitsfrei';
    }
    if (isSunday) {
      return 'Sonntag';
    }
    if (isHoliday && holidayName) {
      return holidayName;
    }
    if (isHoliday) {
      return 'Feiertag';
    }
    return '—';
  }

  onAbsenceChange(day: WorkDay, event: Event): void {
    if (!this.schedule) {
      return;
    }

    const select = event.target as HTMLSelectElement;
    const value = select.value;
    const absenceType: AbsenceType | null = value === '' ? null : (value as AbsenceType);
    const previousValue = this.getAbsenceValue(day);

    const { result } = this.planningService.updateDayAbsence(
      this.employee,
      this.schedule,
      day.date,
      absenceType
    );

    if (result.action === 'blocked') {
      select.value = previousValue;
      this.showMessage('Kein bezahlter Urlaub mehr verfügbar. Jahreskontingent erreicht.');
      return;
    }

    if (result.action !== 'unchanged') {
      this.showMessage(this.messageForAbsenceResult(result));
    }
  }

  onHoursChange(day: WorkDay, event: Event): void {
    if (!this.schedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      input.value = String(day.plannedHours || '');
      return;
    }

    const rounded = this.timeCalculation.roundHours(parsed);
    input.value = rounded.toFixed(2);
    this.planningService.updateDayPlannedHours(this.employee, this.schedule, day.date, rounded);
  }

  onStartTimeChange(day: WorkDay, event: Event): void {
    if (!this.schedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (!value) {
      input.value = day.startTime ?? '';
      return;
    }

    const updated = this.planningService.updateDayStartTime(this.employee, this.schedule, day.date, value);

    if (!updated) {
      input.value = day.startTime ?? '';
      this.showMessage('Ungültige Beginnzeit.');
    }
  }

  onEndTimeChange(day: WorkDay, event: Event): void {
    if (!this.schedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (!value) {
      input.value = day.endTime ?? '';
      return;
    }

    const updated = this.planningService.updateDayEndTime(this.employee, this.schedule, day.date, value);

    if (!updated) {
      input.value = day.endTime ?? '';
      this.showMessage('Ungültige Endzeit. Ende muss nach Beginn liegen.');
    }
  }

  onBreakChange(day: WorkDay, event: Event): void {
    if (!this.schedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    if (Number.isNaN(parsed) || parsed < 0) {
      input.value = String(day.breakMinutes);
      this.showMessage('Ungültige Pausenzeit.');
      return;
    }

    const updated = this.planningService.updateDayBreakMinutes(
      this.employee,
      this.schedule,
      day.date,
      parsed
    );

    if (!updated) {
      input.value = String(day.breakMinutes);
      this.showMessage('Pause konnte nicht gespeichert werden.');
    }
  }

  formatHours(hours: number): string {
    return this.timeCalculation.formatHoursDecimal(hours);
  }

  formatTime(time: string | undefined): string {
    return time ?? '—';
  }

  formatBreak(minutes: number): string {
    return this.timeCalculation.formatBreakMinutes(minutes);
  }

  formatNetDuration(hours: number): string {
    if (hours <= 0) {
      return '—';
    }
    return this.timeCalculation.formatHoursDecimal(hours);
  }

  private messageForAbsenceResult(result: { action: string; type?: AbsenceType }): string {
    switch (result.action) {
      case 'added':
        return result.type === 'paid'
          ? 'Bezahlter Urlaub eingetragen.'
          : result.type === 'sick'
            ? 'Krankheit eingetragen.'
            : 'Arbeitsfrei eingetragen.';
      case 'removed':
        return 'Abwesenheit entfernt.';
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

  private showMessage(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }
}
