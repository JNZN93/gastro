import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import { Employee } from '../models/employee.model';
import { EmployeeSchedule, WorkDay } from '../models/schedule.model';
import { TimeCalculationService } from './time-calculation.service';

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const COMPANY_TITLE = 'Zeiterfassung Mitarbeiter Gastro Depot GmbH & Co. KG';

/** Zeilenhöhen in Punkten – summieren sich auf ca. eine A4-Seite (Hochformat). */
const LAYOUT = {
  titleRowHeight: 30,
  spacerRowHeight: 6,
  infoRowHeight: 20,
  headerRowHeight: 44,
  dataRowHeight: 20,
  summaryRowHeight: 24,
  titleFontSize: 14,
  headerFontSize: 10,
  dataFontSize: 11,
  columns: [1, 6, 12, 12, 10, 16, 11] as const,
};

const COLORS = {
  title: 'FF1B3A5F',
  headerBg: 'FF2E5C8A',
  headerText: 'FFFFFFFF',
  label: 'FF64748B',
  border: 'FFD0D7E2',
  sundayBg: 'FFF1F5F9',
  holidayBg: 'FFFFF7ED',
  vacationBg: 'FFDBEAFE',
  unpaidBg: 'FFF3E8FF',
  sickBg: 'FFFECDD3',
  altRow: 'FFF8FAFC',
  weeklyTotal: 'FFE0ECFF',
};

/**
 * Exportiert Monatsplanungen als formatierte Zeiterfassungs-Excel-Datei
 * mit korrekten Uhrzeit-Formaten und Tabellenlayout.
 */
@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  constructor(private readonly timeCalculation: TimeCalculationService) {}

  async exportMonthlyPlan(
    employees: Employee[],
    schedules: EmployeeSchedule[],
    year: number,
    month: number
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gastro Depot';
    workbook.created = new Date();

    for (const employee of employees) {
      const schedule = schedules.find(
        (s) => s.employeeId === employee.id && s.year === year && s.month === month
      );
      if (!schedule) {
        continue;
      }

      const sheetName = this.sanitizeSheetName(employee.lastName);
      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 8 }],
      });
      this.buildEmployeeSheet(worksheet, employee, schedule, year, month);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `Zeiterfassung_${String(month).padStart(2, '0')}_${year}.xlsx`;
    saveAs(blob, fileName);
  }

  private buildEmployeeSheet(
    worksheet: ExcelJS.Worksheet,
    employee: Employee,
    schedule: EmployeeSchedule,
    year: number,
    month: number
  ): void {
    const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
    const enrichedDays = schedule.workDays.map((day) =>
      this.timeCalculation.recalculateWorkDay(day, employee.defaultStartTime)
    );

    worksheet.columns = LAYOUT.columns.map((width) => ({ width }));

    worksheet.mergeCells('B2:G2');
    const titleCell = worksheet.getCell('B2');
    titleCell.value = COMPANY_TITLE;
    titleCell.font = { bold: true, size: LAYOUT.titleFontSize, color: { argb: COLORS.title } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = LAYOUT.titleRowHeight;
    worksheet.getRow(3).height = LAYOUT.spacerRowHeight;

    this.setInfoRow(worksheet, 4, 'Vorname:', employee.firstName);
    this.setInfoRow(worksheet, 5, 'Nachname:', employee.lastName);
    this.setInfoRow(worksheet, 6, 'Monat / Jahr:', monthLabel);
    worksheet.getRow(4).height = LAYOUT.infoRowHeight;
    worksheet.getRow(5).height = LAYOUT.infoRowHeight;
    worksheet.getRow(6).height = LAYOUT.infoRowHeight;
    worksheet.getRow(7).height = LAYOUT.spacerRowHeight;

    const headerRow = worksheet.getRow(8);
    const headers: { col: number; text: string }[] = [
      { col: 2, text: 'Tag' },
      { col: 3, text: 'Arbeitsbeginn' },
      { col: 4, text: 'Arbeitsende' },
      { col: 5, text: 'Pausen\n(min.)' },
      { col: 6, text: 'Gesamtarbeitszeit\n(abzgl. Pausen)' },
      { col: 7, text: 'Woche' },
    ];
    headers.forEach(({ col, text }) => {
      const cell = headerRow.getCell(col);
      cell.value = text;
      this.applyHeaderStyle(cell);
    });
    headerRow.height = LAYOUT.headerRowHeight;

    let workDayIndex = 0;
    for (let dayNumber = 1; dayNumber <= 31; dayNumber++) {
      const workDay = enrichedDays.find((day) => day.date.getDate() === dayNumber);
      const rowNumber = 8 + dayNumber;
      const row = worksheet.getRow(rowNumber);
      this.fillDayRow(row, dayNumber, workDay, enrichedDays, workDayIndex);
      if (workDay && !workDay.isSunday && !workDay.isHoliday && !workDay.isUnpaidDayOff && workDay.plannedHours > 0) {
        workDayIndex++;
      }
    }

    const totalHours = this.getTotalHours(enrichedDays);
    this.fillTotalRow(worksheet, 40, totalHours);

    this.applyPrintSetup(worksheet);
  }

  /** Druckeinstellungen: natürliche Größe füllt eine DIN-A4-Seite ohne Verkleinerung. */
  private applyPrintSetup(worksheet: ExcelJS.Worksheet): void {
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      scale: 100,
      horizontalCentered: true,
      verticalCentered: false,
      printArea: 'B2:G40',
    };
    worksheet.pageSetup.margins = {
      left: 0.35,
      right: 0.35,
      top: 0.35,
      bottom: 0.35,
      header: 0.1,
      footer: 0.1,
    };
  }

  private setInfoRow(worksheet: ExcelJS.Worksheet, rowNumber: number, label: string, value: string): void {
    const row = worksheet.getRow(rowNumber);
    row.getCell(2).value = label;
    row.getCell(2).font = { bold: true, color: { argb: COLORS.label }, size: LAYOUT.dataFontSize };
    row.getCell(4).value = value;
    row.getCell(4).font = { bold: true, size: LAYOUT.dataFontSize };
    row.getCell(2).alignment = { vertical: 'middle' };
    row.getCell(4).alignment = { vertical: 'middle' };
  }

  private fillDayRow(
    row: ExcelJS.Row,
    dayNumber: number,
    workDay: WorkDay | undefined,
    allDays: WorkDay[],
    workDayIndex: number
  ): void {
    row.getCell(2).value = dayNumber;
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(2).font = { bold: true, size: LAYOUT.dataFontSize };

    if (!workDay) {
      this.applyDataBorders(row);
      return;
    }

    if (workDay.isSunday) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sundayBg } };
      const weeklyTotal = this.getWeeklyTotalBeforeSunday(dayNumber, allDays);
      if (weeklyTotal > 0) {
        this.setDurationCell(row.getCell(7), weeklyTotal);
        row.getCell(7).font = { bold: true };
        row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weeklyTotal } };
      } else {
        this.setDurationCell(row.getCell(7), 0);
      }
      this.applyDataBorders(row);
      return;
    }

    if (workDay.isHoliday) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.holidayBg } };
      row.getCell(3).value = '--';
      row.getCell(4).value = '--';
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(3).font = { color: { argb: 'FF94A3B8' } };
      row.getCell(4).font = { color: { argb: 'FF94A3B8' } };
      this.applyDataBorders(row);
      return;
    }

    if (workDay.isVacation) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.vacationBg } };
      row.getCell(3).value = 'Urlaub';
      row.getCell(4).value = '--';
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(3).font = { color: { argb: 'FF1D4ED8' } };
      row.getCell(4).font = { color: { argb: 'FF94A3B8' } };
      if (workDay.plannedHours > 0) {
        this.setDurationCell(row.getCell(6), workDay.plannedHours);
      }
      this.applyDataBorders(row);
      return;
    }

    if (workDay.isSick) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sickBg } };
      row.getCell(3).value = 'Krank';
      row.getCell(4).value = '--';
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(3).font = { color: { argb: 'FFB91C1C' } };
      row.getCell(4).font = { color: { argb: 'FF94A3B8' } };
      if (workDay.plannedHours > 0) {
        this.setDurationCell(row.getCell(6), workDay.plannedHours);
      }
      this.applyDataBorders(row);
      return;
    }

    if (workDay.isUnpaidDayOff) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.unpaidBg } };
      row.getCell(3).value = 'Arbeitsfrei';
      row.getCell(4).value = '--';
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(3).font = { color: { argb: 'FF7E22CE' } };
      row.getCell(4).font = { color: { argb: 'FF94A3B8' } };
      this.applyDataBorders(row);
      return;
    }

    if (workDay.plannedHours <= 0) {
      this.applyDataBorders(row);
      return;
    }

    if (workDayIndex % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRow } };
    }

    if (workDay.startTime) {
      this.setClockTimeCell(row.getCell(3), workDay.startTime);
    }
    if (workDay.endTime) {
      this.setClockTimeCell(row.getCell(4), workDay.endTime);
    }
    if (workDay.breakMinutes > 0) {
      row.getCell(5).value = workDay.breakMinutes;
      row.getCell(5).numFmt = '0';
      row.getCell(5).alignment = { horizontal: 'center' };
    }
    this.setDurationCell(row.getCell(6), workDay.plannedHours);
    this.applyDataBorders(row);
  }

  /** Uhrzeit (z. B. 09:00) als Excel-Zeitwert mit Format hh:mm. */
  private setClockTimeCell(cell: ExcelJS.Cell, time: string): void {
    const [hours, minutes] = time.split(':').map(Number);
    cell.value = (hours * 60 + minutes) / (24 * 60);
    cell.numFmt = 'hh:mm';
    cell.font = { size: LAYOUT.dataFontSize };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  /** Dauer (z. B. 5:00 h) als Excel-Zeitwert mit Format [h]:mm. */
  private setDurationCell(cell: ExcelJS.Cell, hours: number): void {
    cell.value = hours / 24;
    cell.numFmt = '[h]:mm';
    cell.font = { size: LAYOUT.dataFontSize };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  private applyHeaderStyle(cell: ExcelJS.Cell): void {
    cell.font = { bold: true, color: { argb: COLORS.headerText }, size: LAYOUT.headerFontSize };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = this.fullBorder();
  }

  private applyDataBorders(row: ExcelJS.Row): void {
    for (let col = 2; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
      };
      if (!cell.font) {
        cell.font = { size: LAYOUT.dataFontSize };
      }
      if (!cell.alignment) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { ...cell.alignment, vertical: 'middle' };
      }
    }
    row.height = LAYOUT.dataRowHeight;
  }

  /** Summenzeile mit Gesamtstunden am Tabellenende. */
  private fillTotalRow(worksheet: ExcelJS.Worksheet, rowNumber: number, totalHours: number): void {
    worksheet.mergeCells(`B${rowNumber}:E${rowNumber}`);
    const row = worksheet.getRow(rowNumber);

    const labelCell = row.getCell(2);
    labelCell.value = 'Gesamtstunden';
    labelCell.font = { bold: true, size: LAYOUT.dataFontSize, color: { argb: COLORS.headerText } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const totalCell = row.getCell(6);
    this.setDurationCell(totalCell, totalHours);
    totalCell.font = { bold: true, size: LAYOUT.dataFontSize, color: { argb: COLORS.headerText } };
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };

    for (let col = 2; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'medium', color: { argb: COLORS.headerBg } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
      };
      if (col !== 6) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      }
    }

    row.height = LAYOUT.summaryRowHeight;
  }

  private getTotalHours(workDays: WorkDay[]): number {
    const total = workDays.reduce((sum, day) => sum + day.plannedHours, 0);
    return Math.round(total * 100) / 100;
  }

  private fullBorder(): Partial<ExcelJS.Borders> {
    const side = { style: 'thin' as const, color: { argb: COLORS.border } };
    return { top: side, left: side, bottom: side, right: side };
  }

  private getWeeklyTotalBeforeSunday(dayNumber: number, workDays: WorkDay[]): number {
    const weekStart = Math.max(1, dayNumber - 6);
    let total = 0;

    for (const day of workDays) {
      const currentDay = day.date.getDate();
      if (currentDay >= weekStart && currentDay < dayNumber) {
        total += day.plannedHours;
      }
    }

    return Math.round(total * 100) / 100;
  }

  private sanitizeSheetName(name: string): string {
    return name.replace(/[\\/?*[\]:]/g, '').substring(0, 31);
  }
}
