import { Injectable } from '@angular/core';
import { WorkDay } from '../models/schedule.model';

/**
 * Berechnet Arbeitsbeginn, Arbeitsende und Pausen
 * auf Basis der geplanten Netto-Stunden.
 */
@Injectable({ providedIn: 'root' })
export class TimeCalculationService {
  private readonly defaultStartTime = '09:00';

  /** Pausenregel nach deutschem Arbeitsrecht (bezogen auf Nettoarbeitszeit). */
  calculateBreakMinutes(netHours: number): number {
    if (netHours > 9) {
      return 45;
    }
    if (netHours > 6) {
      return 30;
    }
    return 0;
  }

  /** Ergänzt einen Arbeitstag um Start-, Endzeit und Pause. */
  enrichWorkDay(workDay: WorkDay, defaultStartTime?: string): WorkDay {
    return this.recalculateWorkDay(workDay, defaultStartTime);
  }

  /** Berechnet Zeiten neu aus geplanten Netto-Stunden (für Anzeige und Export). */
  recalculateWorkDay(workDay: WorkDay, defaultStartTime?: string): WorkDay {
    if (workDay.isSunday || workDay.isHoliday || workDay.isUnpaidDayOff || workDay.plannedHours <= 0) {
      return {
        ...workDay,
        startTime: undefined,
        endTime: undefined,
        breakMinutes: 0,
      };
    }

    const netHours = this.roundToQuarter(workDay.plannedHours);

    if (workDay.isVacation) {
      return {
        ...workDay,
        plannedHours: netHours,
        startTime: undefined,
        endTime: undefined,
        breakMinutes: 0,
      };
    }
    const startTime = this.normalizeStartTime(defaultStartTime ?? this.defaultStartTime);
    const breakMinutes = this.calculateBreakMinutes(netHours);
    const endTime = this.calculateEndTime(startTime, netHours, breakMinutes);

    return {
      ...workDay,
      plannedHours: netHours,
      startTime,
      endTime,
      breakMinutes,
    };
  }

  /** Berechnet Arbeitsende = Beginn + Nettozeit + Pause. */
  calculateEndTime(startTime: string, netHours: number, breakMinutes: number): string {
    const [startHours, startMinutes] = this.parseTime(startTime);
    const netMinutes = Math.round(netHours * 4) * 15;
    const totalMinutes = startHours * 60 + startMinutes + netMinutes + breakMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;

    return this.formatTime(endHours, endMinutes);
  }

  private normalizeStartTime(time: string): string {
    const [hours, minutes] = this.parseTime(time);
    return this.formatTime(hours, minutes);
  }

  private roundToQuarter(hours: number): number {
    return Math.round(hours * 4) / 4;
  }

  parseTime(time: string): [number, number] {
    const [hours, minutes] = time.split(':').map(Number);
    return [hours, minutes];
  }

  formatTime(hours: number, minutes: number): string {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  formatDurationHours(hours: number): string {
    if (hours <= 0) {
      return '—';
    }
    const totalMinutes = Math.round(hours * 4) * 15;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  formatBreakMinutes(minutes: number): string {
    if (minutes <= 0) {
      return '—';
    }
    return `${minutes} min`;
  }
}
