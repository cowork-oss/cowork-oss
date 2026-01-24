import * as fs from 'fs/promises';
import { Workspace } from '../../../shared/types';

/**
 * SpreadsheetBuilder creates Excel spreadsheets
 * Note: For MVP, we'll create CSV files. In production, use a library like exceljs
 */
export class SpreadsheetBuilder {
  constructor(private workspace: Workspace) {}

  async create(
    outputPath: string,
    sheets: Array<{ name: string; data: any[][] }>
  ): Promise<void> {
    // For MVP: Create a simple CSV file
    // In production, use 'exceljs' library to create proper .xlsx files with multiple sheets

    if (sheets.length === 0) {
      throw new Error('At least one sheet is required');
    }

    // For now, create CSV from first sheet
    const sheet = sheets[0];
    const csv = this.dataToCSV(sheet.data);

    // If .xlsx extension, keep it for future compatibility
    // But write CSV content for now
    await fs.writeFile(outputPath, csv, 'utf-8');
  }

  private dataToCSV(data: any[][]): string {
    return data
      .map(row =>
        row
          .map(cell => {
            const str = String(cell ?? '');
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\n');
  }
}

/**
 * TODO: For production implementation, use exceljs:
 *
 * import ExcelJS from 'exceljs';
 *
 * async create(outputPath: string, sheets: Array<{ name: string; data: any[][] }>) {
 *   const workbook = new ExcelJS.Workbook();
 *
 *   for (const sheetData of sheets) {
 *     const worksheet = workbook.addWorksheet(sheetData.name);
 *     worksheet.addRows(sheetData.data);
 *   }
 *
 *   await workbook.xlsx.writeFile(outputPath);
 * }
 */
