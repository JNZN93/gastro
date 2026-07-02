import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule } from '../../models/schedule.model';

export interface OvertimeEmployeeSummary {
  employee: Employee;
  schedule: EmployeeSchedule;
  excessHours: number;
}

export interface OvertimeBalanceDialogData {
  employees: OvertimeEmployeeSummary[];
}

export interface OvertimeBalanceDialogResult {
  confirmed: boolean;
}

/** Dialog vor dem Export: Überstunden automatisch ausgleichen. */
@Component({
  selector: 'app-overtime-balance-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './overtime-balance-dialog.component.html',
  styleUrl: './overtime-balance-dialog.component.scss',
})
export class OvertimeBalanceDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<OvertimeBalanceDialogComponent, OvertimeBalanceDialogResult>,
    @Inject(MAT_DIALOG_DATA) public readonly data: OvertimeBalanceDialogData
  ) {}

  cancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  confirm(): void {
    this.dialogRef.close({ confirmed: true });
  }
}
