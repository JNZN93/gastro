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
    if (workDay.isSunday || workDay.isHoliday || workDay.isUnpaidDayOff) {
      return {
        ...workDay,
        plannedHours: 0,
        startTime: undefined,
        endTime: undefined,
        breakMinutes: 0,
      };
    }

    const netHours = this.roundToQuarter(workDay.plannedHours);

    if (workDay.isVacation || workDay.isSick) {
      return {
        ...workDay,
        plannedHours: netHours,
        startTime: undefined,
        endTime: undefined,
        breakMinutes: 0,
      };
    }

    if (netHours <= 0) {
      if (workDay.startTime || workDay.endTime) {
        return { ...workDay, plannedHours: 0 };
      }
      return {
        ...workDay,
        plannedHours: 0,
        startTime: undefined,
        endTime: undefined,
        breakMinutes: 0,
      };
    }

    if (workDay.startTime) {
      const startTime = this.normalizeTime(workDay.startTime);
      const breakMinutes = workDay.breakMinutes;
      const endTime = this.calculateEndTime(startTime, netHours, breakMinutes);
      return {
        ...workDay,
        plannedHours: netHours,
        startTime,
        endTime,
        breakMinutes,
      };
    }

    const startTime = this.normalizeTime(defaultStartTime ?? this.defaultStartTime);
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

  /** Prüft ein Uhrzeitformat HH:MM. */
  isValidTime(time: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  }

  normalizeTime(time: string): string {
    const [hours, minutes] = this.parseTime(time);
    return this.formatTime(hours, minutes);
  }

  /** Berechnet Netto-Stunden aus Beginn, Ende und Pause. */
  calculateNetHoursFromTimes(
    startTime: string,
    endTime: string,
    breakMinutes: number
  ): number | null {
    const [startHours, startMinutes] = this.parseTime(startTime);
    const [endHours, endMinutes] = this.parseTime(endTime);
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    const netMinutes = endTotal - startTotal - breakMinutes;

    if (netMinutes < 0) {
      return null;
    }

    return this.roundToQuarter(netMinutes / 60);
  }

  /** Passt den Arbeitsbeginn an und berechnet abhängige Werte neu. */
  applyStartTime(workDay: WorkDay, startTime: string, defaultStartTime?: string): WorkDay | null {
    if (!this.isValidTime(startTime)) {
      return null;
    }

    const normalizedStart = this.normalizeTime(startTime);
    const breakMinutes =
      workDay.startTime !== undefined
        ? workDay.breakMinutes
        : this.calculateBreakMinutes(workDay.plannedHours);

    if (workDay.plannedHours > 0) {
      const endTime = this.calculateEndTime(normalizedStart, workDay.plannedHours, breakMinutes);
      return {
        ...workDay,
        startTime: normalizedStart,
        endTime,
        breakMinutes,
      };
    }

    if (workDay.endTime) {
      const netHours = this.calculateNetHoursFromTimes(
        normalizedStart,
        workDay.endTime,
        breakMinutes
      );
      if (netHours === null) {
        return null;
      }
      return {
        ...workDay,
        startTime: normalizedStart,
        plannedHours: netHours,
        breakMinutes,
      };
    }

    return {
      ...workDay,
      startTime: normalizedStart,
      breakMinutes,
    };
  }

  /** Passt das Arbeitsende an und berechnet die Netto-Stunden neu. */
  applyEndTime(workDay: WorkDay, endTime: string, defaultStartTime?: string): WorkDay | null {
    if (!this.isValidTime(endTime)) {
      return null;
    }

    const startTime = workDay.startTime ?? defaultStartTime;
    if (!startTime || !this.isValidTime(startTime)) {
      return null;
    }

    const normalizedStart = this.normalizeTime(startTime);
    const normalizedEnd = this.normalizeTime(endTime);
    const breakMinutes = workDay.breakMinutes;
    const netHours = this.calculateNetHoursFromTimes(
      normalizedStart,
      normalizedEnd,
      breakMinutes
    );

    if (netHours === null) {
      return null;
    }

    return {
      ...workDay,
      startTime: normalizedStart,
      plannedHours: netHours,
      endTime: normalizedEnd,
      breakMinutes,
    };
  }

  /** Passt die Pause an und berechnet abhängige Werte neu. */
  applyBreakMinutes(
    workDay: WorkDay,
    breakMinutes: number,
    defaultStartTime?: string
  ): WorkDay | null {
    if (breakMinutes < 0) {
      return null;
    }

    const roundedBreak = Math.round(breakMinutes);
    const startTime = workDay.startTime ?? defaultStartTime;
    if (!startTime || !this.isValidTime(startTime)) {
      return null;
    }

    const normalizedStart = this.normalizeTime(startTime);

    if (workDay.plannedHours > 0) {
      const endTime = this.calculateEndTime(normalizedStart, workDay.plannedHours, roundedBreak);
      return {
        ...workDay,
        startTime: normalizedStart,
        breakMinutes: roundedBreak,
        endTime,
      };
    }

    if (workDay.endTime) {
      const netHours = this.calculateNetHoursFromTimes(
        normalizedStart,
        workDay.endTime,
        roundedBreak
      );
      if (netHours === null) {
        return null;
      }
      return {
        ...workDay,
        startTime: normalizedStart,
        breakMinutes: roundedBreak,
        plannedHours: netHours,
      };
    }

    return {
      ...workDay,
      startTime: normalizedStart,
      breakMinutes: roundedBreak,
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

  private roundToQuarter(hours: number): number {
    return Math.round(hours * 4) / 4;
  }
}
