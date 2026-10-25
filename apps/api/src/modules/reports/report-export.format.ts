import ExcelJS from 'exceljs';
import type { ReportExportOutputFormat } from '@iranyaragh/contracts';
import type { ReportExportTable } from './report-export.renderer';

/** Export artifact serialization: CSV by hand (RFC 4180 bytes in UTF-8), and
 * Excel workbooks through ExcelJS with one sheet per export.
 */
export function escapeCsvCell(value: string): string {
  // Never expose a leading =, +, - or @ out of the spreadsheet surface.
  const guarded = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
export function csvBytes(table: ReportExportTable): Buffer {
  const lines = [table.headers, ...table.rows]
    .map(row => row.map(escapeCsvCell).join('\r\n'));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

async function xlsxBytes(table: ReportExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('export');
  sheet.columns = table.headers.map((header, index) => ({
    header,
    key: `c${index}`,
    width: Math.min(40, Math.max(10, header.length + 2)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of table.rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function serializeExport(
  outputFormat: ReportExportOutputFormat,
  table: ReportExportTable,
): Promise<Buffer> {
  if (outputFormat === 'xlsx') return xlsxBytes(table);
  return csvBytes(table);
}
