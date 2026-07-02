import { Injectable } from '@angular/core';
import { HolidayService } from './holiday.service';

/**
 * Berechnet Monats-Sollstunden aus Wochenstunden:
 * weeklyHours × (Arbeitstage im Monat / 5)
 */
@Injectable({ providedIn: 'root' })
export class MonthlyHoursCalculatorService {
  constructor(private readonly holidayService: HolidayService) {}

  countWorkDaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = this.holidayService.createLocalDate(year, month, day);
      const isSunday = date.getDay() === 0;
      const isHoliday = this.holidayService.isHoliday(date);
      if (!isSunday && !isHoliday) {
        count++;
      }
    }

    return count;
  }

  calculateSuggestedMonthlyHours(weeklyHours: number, year: number, month: number): number {
    const workDays = this.countWorkDaysInMonth(year, month);
    if (workDays <= 0 || weeklyHours <= 0) {
      return 0;
    }
    return Math.round(weeklyHours * (workDays / 5) * 100) / 100;
  }
}
