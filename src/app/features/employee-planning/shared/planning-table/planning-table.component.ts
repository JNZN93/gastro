import { Component, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule, ScheduleStats, WorkDay } from '../../models/schedule.model';
import { AbsenceType } from '../../models/vacation.model';
import { PlanningService } from '../../services/planning.service';
import { TimeCalculationService } from '../../services/time-calculation.service';

type EditablePlanningField = 'absence' | 'start' | 'end' | 'break' | 'hours';

/** Tabellarische Monatsübersicht für einen einzelnen Mitarbeiter. */
@Component({
  selector: 'app-planning-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatCardModule, MatSnackBarModule],
  templateUrl: './planning-table.component.html',
  styleUrl: './planning-table.component.scss',
})
export class PlanningTableComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) employee!: Employee;
  @Input() schedule: EmployeeSchedule | null = null;
  @Input() editable = true;
  @Input() viewMode: 'month' | 'week' = 'month';

  displayedColumns = ['date', 'weekday', 'holiday', 'start', 'end', 'break', 'hours'];
  viewSchedule: EmployeeSchedule | null = null;
  displayDays: WorkDay[] = [];
  displayDayRows: { day: WorkDay; dayIndex: number }[] = [];
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

  private scheduleContextKey = '';
  private focusedCellKey: string | null = null;
  private skipBlurKey: string | null = null;
  private readonly cellDrafts = new Map<string, string>();
  private readonly editableFieldOrder: readonly EditablePlanningField[] = [
    'absence',
    'start',
    'end',
    'break',
    'hours',
  ];

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
    const schedule = this.schedule;
    const newContextKey = schedule ? `${schedule.employeeId}-${schedule.year}-${schedule.month}` : '';
    const contextChanged =
      changes['schedule'] && newContextKey !== this.scheduleContextKey;

    if (contextChanged) {
      this.scheduleContextKey = newContextKey;
      this.resetEditingState();
    }

    if (this.focusedCellKey && !contextChanged) {
      if (schedule) {
        this.stats = this.planningService.calculateStats(this.viewSchedule ?? schedule);
      }
      return;
    }

    this.reloadViewSchedule(schedule);
  }

  ngAfterViewInit(): void {
    this.syncAllInputValues();
  }

  trackRow = (_index: number, row: { day: WorkDay; dayIndex: number }): number =>
    row.day.date.getTime();

  cellId(dayIndex: number, field: string): string {
    return `${dayIndex}-${field}`;
  }

  onCellFocus(
    event: FocusEvent,
    dayIndex: number,
    field: EditablePlanningField,
    day: WorkDay
  ): void {
    const key = this.cellId(dayIndex, field);
    this.focusedCellKey = key;
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const persisted = this.getPersistedValue(day, field);
    if (!this.cellDrafts.has(key)) {
      if (field === 'start' || field === 'end') {
        this.cellDrafts.set(key, persisted.replace(/\D/g, ''));
      } else {
        this.cellDrafts.set(key, persisted);
      }
    }
    input.value = this.cellDrafts.get(key)!;
    if (input instanceof HTMLInputElement) {
      input.select();
    }
  }

  onCellInput(dayIndex: number, field: EditablePlanningField, event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (field === 'start' || field === 'end') {
      this.onTimeCellInput(dayIndex, field, input as HTMLInputElement);
      return;
    }
    this.cellDrafts.set(this.cellId(dayIndex, field), input.value);
  }

  private onTimeCellInput(
    dayIndex: number,
    field: EditablePlanningField,
    input: HTMLInputElement
  ): void {
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    const formatted = this.timeCalculation.formatTimeDigitsWhileTyping(digits);
    input.value = formatted;
    this.cellDrafts.set(this.cellId(dayIndex, field), formatted);
  }

  onCellBlur(day: WorkDay, dayIndex: number, field: EditablePlanningField, event: Event): void {
    const key = this.cellId(dayIndex, field);
    if (this.skipBlurKey === key) {
      this.skipBlurKey = null;
      return;
    }

    if (this.focusedCellKey !== key) {
      return;
    }

    const element = event.target as HTMLInputElement | HTMLSelectElement;
    this.commitFieldValue(day, field, element);
    this.focusedCellKey = null;
    this.cellDrafts.delete(key);
    this.refreshScheduleData(true);
  }

  onCellKeydown(
    event: KeyboardEvent,
    day: WorkDay,
    dayIndex: number,
    field: EditablePlanningField
  ): void {
    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = event.target as HTMLInputElement | HTMLSelectElement;
    const key = this.cellId(dayIndex, field);
    const direction: 1 | -1 = event.shiftKey ? -1 : 1;
    const next = this.findNextCell(dayIndex, field, direction);

    this.commitFieldValue(day, field, element);
    this.cellDrafts.delete(key);
    this.focusedCellKey = null;
    this.refreshScheduleData(false);

    if (!next) {
      element.blur();
      return;
    }

    this.skipBlurKey = key;
    requestAnimationFrame(() => this.focusCell(next.dayIndex, next.field));
  }

  private resetEditingState(): void {
    this.focusedCellKey = null;
    this.skipBlurKey = null;
    this.cellDrafts.clear();
  }

  private reloadViewSchedule(schedule: EmployeeSchedule | null): void {
    if (!schedule) {
      this.viewSchedule = null;
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
      this.displayDayRows = [];
      this.weekGroups = [];
      return;
    }

    this.viewSchedule =
      this.planningService.getSchedule(schedule.employeeId, schedule.year, schedule.month) ??
      schedule;
    this.stats = this.planningService.calculateStats(this.viewSchedule);
    this.updateDisplayDays();
    setTimeout(() => this.syncAllInputValues(), 0);
  }

  private refreshScheduleData(syncInputs: boolean): void {
    if (!this.schedule) {
      return;
    }

    const fresh =
      this.planningService.getSchedule(
        this.schedule.employeeId,
        this.schedule.year,
        this.schedule.month
      ) ?? this.schedule;

    this.viewSchedule = fresh;
    this.stats = this.planningService.calculateStats(fresh);
    this.patchDisplayDays(fresh);

    if (syncInputs) {
      setTimeout(() => this.syncAllInputValues(), 0);
    }
  }

  private patchDisplayDays(schedule: EmployeeSchedule): void {
    if (this.viewMode === 'month') {
      this.displayDays = schedule.workDays;
      this.displayDayRows = schedule.workDays.map((day, dayIndex) => ({ day, dayIndex }));
      return;
    }

    this.updateDisplayDays();
  }

  private updateDisplayDays(): void {
    if (!this.viewSchedule) {
      return;
    }

    if (this.viewMode === 'month') {
      this.displayDays = this.viewSchedule.workDays;
      this.displayDayRows = this.viewSchedule.workDays.map((day, dayIndex) => ({ day, dayIndex }));
      this.weekGroups = [];
      return;
    }

    const today = new Date();
    const refDate =
      today.getFullYear() === this.viewSchedule.year &&
      today.getMonth() + 1 === this.viewSchedule.month
        ? today
        : this.viewSchedule.workDays[0]?.date ?? today;

    const startOfWeek = this.getMonday(refDate);
    const weekDays: WorkDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const match = this.viewSchedule.workDays.find(
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
    this.displayDayRows = weekDays.map((day, dayIndex) => ({ day, dayIndex }));
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
    if (!this.viewSchedule) {
      return;
    }

    const select = event.target as HTMLSelectElement;
    const value = select.value;
    const absenceType: AbsenceType | null = value === '' ? null : (value as AbsenceType);
    const previousValue = this.getAbsenceValue(day);

    const { result } = this.planningService.updateDayAbsence(
      this.employee,
      this.viewSchedule,
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
    if (!this.viewSchedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    const rounded = this.timeCalculation.roundHours(parsed);
    this.planningService.updateDayPlannedHours(
      this.employee,
      this.viewSchedule,
      day.date,
      rounded
    );
  }

  onStartTimeChange(day: WorkDay, event: Event): void {
    if (!this.viewSchedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const normalized = this.timeCalculation.normalizeFlexibleTimeInput(input.value);
    if (!normalized) {
      if (input.value.trim()) {
        this.showMessage('Ungültige Beginnzeit. Beispiel: 0900 oder 930');
      }
      return;
    }

    input.value = normalized;
    const updated = this.planningService.updateDayStartTime(
      this.employee,
      this.viewSchedule,
      day.date,
      normalized
    );

    if (!updated) {
      this.showMessage('Beginnzeit konnte nicht gespeichert werden.');
    }
  }

  onEndTimeChange(day: WorkDay, event: Event): void {
    if (!this.viewSchedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const normalized = this.timeCalculation.normalizeFlexibleTimeInput(input.value);
    if (!normalized) {
      if (input.value.trim()) {
        this.showMessage('Ungültige Endzeit. Beispiel: 1700 oder 1730');
      }
      return;
    }

    input.value = normalized;
    const updated = this.planningService.updateDayEndTime(
      this.employee,
      this.viewSchedule,
      day.date,
      normalized
    );

    if (!updated) {
      this.showMessage('Ungültige Endzeit. Ende muss nach Beginn liegen.');
    }
  }

  onBreakChange(day: WorkDay, event: Event): void {
    if (!this.viewSchedule) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    if (Number.isNaN(parsed) || parsed < 0) {
      this.showMessage('Ungültige Pausenzeit.');
      return;
    }

    const updated = this.planningService.updateDayBreakMinutes(
      this.employee,
      this.viewSchedule,
      day.date,
      parsed
    );

    if (!updated) {
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

  private getPersistedValue(day: WorkDay, field: EditablePlanningField): string {
    switch (field) {
      case 'absence':
        return this.getAbsenceValue(day);
      case 'start':
        return this.getStartTimeValue(day);
      case 'end':
        return this.getEndTimeValue(day);
      case 'break':
        return String(day.breakMinutes);
      case 'hours':
        return day.plannedHours ? String(day.plannedHours) : '';
    }
  }

  private isFieldEditable(day: WorkDay, field: EditablePlanningField): boolean {
    switch (field) {
      case 'absence':
        return this.canEditAbsence(day);
      case 'start':
      case 'end':
      case 'break':
        return this.canEditTimes(day);
      case 'hours':
        return this.canEditHours(day);
    }
  }

  private getEditableFieldsForDay(day: WorkDay): EditablePlanningField[] {
    return this.editableFieldOrder.filter((field) => this.isFieldEditable(day, field));
  }

  private findNextCell(
    dayIndex: number,
    field: EditablePlanningField,
    direction: 1 | -1
  ): { dayIndex: number; field: EditablePlanningField } | null {
    const currentFields = this.getEditableFieldsForDay(this.displayDays[dayIndex]);
    const fieldIndex = currentFields.indexOf(field);

    if (direction === 1) {
      if (fieldIndex >= 0 && fieldIndex < currentFields.length - 1) {
        return { dayIndex, field: currentFields[fieldIndex + 1] };
      }

      for (let index = dayIndex + 1; index < this.displayDays.length; index++) {
        const rowFields = this.getEditableFieldsForDay(this.displayDays[index]);
        if (rowFields.length > 0) {
          return { dayIndex: index, field: rowFields[0] };
        }
      }
      return null;
    }

    if (fieldIndex > 0) {
      return { dayIndex, field: currentFields[fieldIndex - 1] };
    }

    for (let index = dayIndex - 1; index >= 0; index--) {
      const rowFields = this.getEditableFieldsForDay(this.displayDays[index]);
      if (rowFields.length > 0) {
        return { dayIndex: index, field: rowFields[rowFields.length - 1] };
      }
    }
    return null;
  }

  private focusCell(dayIndex: number, field: EditablePlanningField): void {
    const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `.planning-table [data-cell-id="${this.cellId(dayIndex, field)}"]`
    );
    if (!element) {
      return;
    }

    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    const row = this.displayDayRows.find((entry) => entry.dayIndex === dayIndex);
    if (row) {
      const key = this.cellId(dayIndex, field);
      this.focusedCellKey = key;
      if (!this.cellDrafts.has(key)) {
        const persisted = this.getPersistedValue(row.day, field);
        if (field === 'start' || field === 'end') {
          this.cellDrafts.set(key, persisted.replace(/\D/g, ''));
        } else {
          this.cellDrafts.set(key, persisted);
        }
      }
      element.value = this.cellDrafts.get(key)!;
      if (element instanceof HTMLInputElement) {
        element.select();
      }
    }
  }

  private syncAllInputValues(): void {
    for (const row of this.displayDayRows) {
      for (const field of ['absence', 'start', 'end', 'break', 'hours'] as const) {
        if (!this.isFieldEditable(row.day, field)) {
          continue;
        }

        const key = this.cellId(row.dayIndex, field);
        if (this.focusedCellKey === key) {
          continue;
        }

        const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
          `.planning-table [data-cell-id="${key}"]`
        );
        if (!element || element === document.activeElement) {
          continue;
        }

        element.value = this.getPersistedValue(row.day, field);
      }
    }
  }

  private commitFieldValue(
    day: WorkDay,
    field: EditablePlanningField,
    element: HTMLInputElement | HTMLSelectElement
  ): void {
    switch (field) {
      case 'absence':
        this.onAbsenceChange(day, { target: element } as unknown as Event);
        break;
      case 'start':
        this.onStartTimeChange(day, { target: element } as unknown as Event);
        break;
      case 'end':
        this.onEndTimeChange(day, { target: element } as unknown as Event);
        break;
      case 'break':
        this.onBreakChange(day, { target: element } as unknown as Event);
        break;
      case 'hours':
        this.onHoursChange(day, { target: element } as unknown as Event);
        break;
    }
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
