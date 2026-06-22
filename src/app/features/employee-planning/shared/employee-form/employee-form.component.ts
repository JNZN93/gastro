import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CommonModule } from '@angular/common';
import { Employee, EmployeeFormData } from '../../models/employee.model';

export interface EmployeeFormDialogData {
  employee: Employee | null;
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
export class EmployeeFormComponent implements OnInit {
  form!: FormGroup;
  readonly isEditMode: boolean;

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<EmployeeFormComponent, EmployeeFormDialogResult>,
    @Inject(MAT_DIALOG_DATA) public readonly data: EmployeeFormDialogData
  ) {
    this.isEditMode = data.employee !== null;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      firstName: [this.data.employee?.firstName ?? '', [Validators.required, Validators.maxLength(100)]],
      lastName: [this.data.employee?.lastName ?? '', [Validators.required, Validators.maxLength(100)]],
      monthlyHours: [
        this.data.employee?.monthlyHours ?? 160,
        [Validators.required, Validators.min(0), Validators.max(999)],
      ],
      annualVacationDays: [
        this.data.employee?.annualVacationDays ?? 30,
        [Validators.required, Validators.min(0), Validators.max(365)],
      ],
      defaultStartTime: [
        this.data.employee?.defaultStartTime ?? '09:00',
        [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
      ],
      active: [this.data.employee?.active ?? true],
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
        monthlyHours: Number(value.monthlyHours),
        annualVacationDays: Number(value.annualVacationDays),
        defaultStartTime: String(value.defaultStartTime),
        active: Boolean(value.active),
      },
    });
  }
}
