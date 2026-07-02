import { Component, HostListener, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule, WorkDay } from '../../models/schedule.model';
import { AbsenceType } from '../../models/vacation.model';
import { SCHEDULE_REPOSITORY, ScheduleRepository } from '../../repositories/schedule.repository';

export interface DayEditDialogData {
  employee: Employee;
  schedule: EmployeeSchedule;
  day: WorkDay;
}

export interface DayEditDialogResult {
  saved: boolean;
}

/** Dialog zur Bearbeitung eines einzelnen Planungstags. */
@Component({
  selector: 'app-day-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './day-edit-dialog.component.html',
  styleUrl: './day-edit-dialog.component.scss',
})
export class DayEditDialogComponent {
  form: FormGroup;
  readonly dateLabel: string;

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<DayEditDialogComponent, DayEditDialogResult>,
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: ScheduleRepository,
    @Inject(MAT_DIALOG_DATA) public readonly data: DayEditDialogData
  ) {
    const { day, employee } = data;
    this.dateLabel = day.date.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const absenceValue = day.isVacation
      ? 'paid'
      : day.isSick
        ? 'sick'
        : day.isUnpaidDayOff
          ? 'unpaid'
          : '';

    this.form = this.fb.group({
      absence: [{ value: absenceValue, disabled: day.isSunday || day.isHoliday }],
      plannedHours: [
        { value: day.plannedHours || '', disabled: day.isSunday || day.isHoliday || day.isUnpaidDayOff },
        [Validators.min(0), Validators.max(24)],
      ],
      startTime: [
        { value: day.startTime ?? employee.defaultStartTime, disabled: !this.canEditTimes(day) },
      ],
      endTime: [{ value: day.endTime ?? '', disabled: !this.canEditTimes(day) }],
      breakMinutes: [
        { value: day.breakMinutes ?? 0, disabled: !this.canEditTimes(day) },
        [Validators.min(0), Validators.max(180)],
      ],
    });
  }

  cancel(): void {
    this.dialogRef.close({ saved: false });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const target = event.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') {
        return;
      }
      event.preventDefault();
      this.save();
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const absenceType: AbsenceType | null =
      value.absence === '' ? null : (value.absence as AbsenceType);

    const { result } = this.scheduleRepo.updateDayAbsence(
      this.data.employee,
      this.data.schedule,
      this.data.day.date,
      absenceType
    );

    if (result.action === 'blocked') {
      return;
    }

    let schedule = this.scheduleRepo.getSchedule(
      this.data.employee.id,
      this.data.schedule.year,
      this.data.schedule.month
    )!;

    const workDay =
      schedule.workDays.find(
        (d) =>
          d.date.getFullYear() === this.data.day.date.getFullYear() &&
          d.date.getMonth() === this.data.day.date.getMonth() &&
          d.date.getDate() === this.data.day.date.getDate()
      ) ?? this.data.day;

    if (!workDay.isSunday && !workDay.isHoliday && !workDay.isUnpaidDayOff && value.plannedHours !== '') {
      schedule = this.scheduleRepo.updateDayPlannedHours(
        this.data.employee,
        schedule,
        this.data.day.date,
        Number(value.plannedHours)
      );
    }

    if (this.canEditTimes(workDay) && value.startTime) {
      const updated = this.scheduleRepo.updateDayStartTime(
        this.data.employee,
        schedule,
        this.data.day.date,
        value.startTime
      );
      if (updated) schedule = updated;
    }

    if (this.canEditTimes(workDay) && value.endTime) {
      const updated = this.scheduleRepo.updateDayEndTime(
        this.data.employee,
        schedule,
        this.data.day.date,
        value.endTime
      );
      if (updated) schedule = updated;
    }

    if (this.canEditTimes(workDay)) {
      const updated = this.scheduleRepo.updateDayBreakMinutes(
        this.data.employee,
        schedule,
        this.data.day.date,
        Number(value.breakMinutes)
      );
      if (updated) schedule = updated;
    }

    this.dialogRef.close({ saved: true });
  }

  copyToWeekdays(): void {
    this.scheduleRepo.copyDayToWeekdays(
      this.data.employee,
      this.data.schedule,
      this.data.day.date
    );
    this.dialogRef.close({ saved: true });
  }

  private canEditTimes(day: WorkDay): boolean {
    return (
      !day.isSunday &&
      !day.isHoliday &&
      !day.isUnpaidDayOff &&
      !day.isVacation &&
      !day.isSick
    );
  }
}
