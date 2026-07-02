import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Employee, EmployeeFormData } from '../../models/employee.model';
import { MonthlyHoursCalculatorService } from '../../services/monthly-hours-calculator.service';

export interface EmployeeFormDialogData {
  employee: Employee | null;
  planningYear?: number;
  planningMonth?: number;
}

export interface EmployeeFormDialogResult {
  data: EmployeeFormData;
}

/** Dialog zum Anlegen und Bearbeiten von Mitarbeitern. */
@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  templateUrl: './employee-form.component.html',
  styleUrl: './employee-form.component.scss',
})
export class EmployeeFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  readonly isEditMode: boolean;
  suggestedMonthlyHours = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly monthlyCalculator: MonthlyHoursCalculatorService,
    private readonly dialogRef: MatDialogRef<EmployeeFormComponent, EmployeeFormDialogResult>,
    @Inject(MAT_DIALOG_DATA) public readonly data: EmployeeFormDialogData
  ) {
    this.isEditMode = data.employee !== null;
  }

  ngOnInit(): void {
    const employee = this.data.employee;
    const year = this.data.planningYear ?? new Date().getFullYear();
    const month = this.data.planningMonth ?? new Date().getMonth() + 1;
    const weeklyHours = employee?.weeklyHours ?? 40;
    this.suggestedMonthlyHours = this.monthlyCalculator.calculateSuggestedMonthlyHours(
      weeklyHours,
      year,
      month
    );

    this.form = this.fb.group({
      firstName: [employee?.firstName ?? '', [Validators.required, Validators.maxLength(100)]],
      lastName: [employee?.lastName ?? '', [Validators.required, Validators.maxLength(100)]],
      weeklyHours: [weeklyHours, [Validators.required, Validators.min(0), Validators.max(168)]],
      monthlyHours: [
        employee?.monthlyHours ?? this.suggestedMonthlyHours,
        [Validators.required, Validators.min(0), Validators.max(999)],
      ],
      monthlyHoursManual: [employee?.monthlyHoursManual ?? false],
      annualVacationDays: [
        employee?.annualVacationDays ?? 30,
        [Validators.required, Validators.min(0), Validators.max(365)],
      ],
      defaultStartTime: [
        employee?.defaultStartTime ?? '09:00',
        [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
      ],
      active: [employee?.active ?? true],
    });

    this.subscriptions.push(
      this.form.get('weeklyHours')!.valueChanges.subscribe((value) => {
        this.updateSuggestedMonthlyHours(Number(value));
      }),
      this.form.get('monthlyHoursManual')!.valueChanges.subscribe((manual) => {
        if (!manual) {
          this.form.patchValue({ monthlyHours: this.suggestedMonthlyHours }, { emitEvent: false });
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  get isManualMonthlyHours(): boolean {
    return Boolean(this.form.get('monthlyHoursManual')?.value);
  }

  applySuggestedMonthlyHours(): void {
    this.form.patchValue({
      monthlyHours: this.suggestedMonthlyHours,
      monthlyHoursManual: false,
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      data: {
        firstName: String(value.firstName).trim(),
        lastName: String(value.lastName).trim(),
        weeklyHours: Number(value.weeklyHours),
        monthlyHours: Number(value.monthlyHours),
        monthlyHoursManual: Boolean(value.monthlyHoursManual),
        annualVacationDays: Number(value.annualVacationDays),
        defaultStartTime: String(value.defaultStartTime),
        active: Boolean(value.active),
      },
    });
  }

  private updateSuggestedMonthlyHours(weeklyHours: number): void {
    const year = this.data.planningYear ?? new Date().getFullYear();
    const month = this.data.planningMonth ?? new Date().getMonth() + 1;
    this.suggestedMonthlyHours = this.monthlyCalculator.calculateSuggestedMonthlyHours(
      weeklyHours,
      year,
      month
    );

    if (!this.isManualMonthlyHours) {
      this.form.patchValue({ monthlyHours: this.suggestedMonthlyHours }, { emitEvent: false });
    }
  }
}
