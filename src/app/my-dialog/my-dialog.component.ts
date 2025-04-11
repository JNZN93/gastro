import { Component, Inject } from '@angular/core';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-my-dialog',
  imports: [MatDialogModule, MatButtonModule, CommonModule],
  templateUrl: './my-dialog.component.html',
  styleUrl: './my-dialog.component.scss'
})
export class MyDialogComponent {

  constructor(public dialogRef: MatDialogRef<MyDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; message: string; buttonLabel?: string }
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
