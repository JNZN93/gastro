import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { Employee } from '../../models/employee.model';
import { EmployeeSchedule, ScheduleStats } from '../../models/schedule.model';
import { PlanningService } from '../../services/planning.service';
import { TimeCalculationService } from '../../services/time-calculation.service';

/** Tabellarische Monatsübersicht für einen einzelnen Mitarbeiter. */
@Component({
  selector: 'app-planning-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatCardModule],
  templateUrl: './planning-table.component.html',
  styleUrl: './planning-table.component.scss',
})
export class PlanningTableComponent implements OnChanges {
  @Input({ required: true }) employee!: Employee;
  @Input() schedule: EmployeeSchedule | null = null;

  displayedColumns = ['date', 'weekday', 'holiday', 'start', 'end', 'break', 'hours'];
  stats: ScheduleStats = {
    totalHours: 0,
    workDayCount: 0,
    holidayCount: 0,
    sundayCount: 0,
    vacationCount: 0,
    unpaidDayOffCount: 0,
  };

  private readonly weekdayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
  private readonly dateFormatter = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  constructor(
    private readonly planningService: PlanningService,
    private readonly timeCalculation: TimeCalculationService
  ) {}

  ngOnChanges(): void {
    if (this.schedule) {
      this.stats = this.planningService.calculateStats(this.schedule);
    } else {
      this.stats = {
        totalHours: 0,
        workDayCount: 0,
        holidayCount: 0,
        sundayCount: 0,
        vacationCount: 0,
        unpaidDayOffCount: 0,
      };
    }
  }

  formatDate(date: Date): string {
    return this.dateFormatter.format(date);
  }

  formatWeekday(date: Date): string {
    const name = this.weekdayFormatter.format(date);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  formatHolidayLabel(
    isSunday: boolean,
    isHoliday: boolean,
    isVacation: boolean,
    isUnpaidDayOff: boolean,
    holidayName?: string
  ): string {
    if (isVacation) {
      return 'Bezahlter Urlaub';
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

  formatHours(hours: number): string {
    return hours.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
    return this.timeCalculation.formatDurationHours(hours);
  }
}
