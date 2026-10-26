import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { csvBytes, escapeCsvCell, serializeExport } from './report-export.format';
import { decodeReportSnapshot, encodeReportSnapshot } from './report-export.snapshot';
import { validateReportExportDefinition } from './report-export.validation';

const table = {
  headers: ['عنوان', 'IRR'],
  rows: [['a,"b"\nبعد', '900719925474099312345']],
  generatedAt: '2026-01-01T00:00:00.000Z',
  truncated: false,
};

describe('Report snapshot serialization', () => {
  it('writes comma-separated cells with RFC4180 escaping and exact IRR text', () => {
    expect(csvBytes(table).toString('utf8')).toBe(
      '\ufeff"عنوان","IRR"\r\n"a,""b""\nبعد","900719925474099312345"\r\n',
    );
  });
  it.each(['=SUM(A1)', '+1', '-2', '@call', '  =1', '\tcmd', '\rtest', '\ntext', '\u0000=1'])(
    'neutralizes spreadsheet execution: %j',
    (value) => {
      expect(escapeCsvCell(value).startsWith('"\'')).toBe(true);
    },
  );
  it('keeps Excel cells as strings rather than floating-point numbers or formulas', async () => {
    const bytes = await serializeExport('xlsx', {
      headers: ['IRR', 'input'],
      rows: [['900719925474099312345', '=1+1']],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets[0].getCell('A2').value).toBe('900719925474099312345');
    expect(workbook.worksheets[0].getCell('B2').value).toBe('=1+1');
  });
  it('round trips durable data and rejects altered bytes', () => {
    const snapshot = encodeReportSnapshot(table, 1);
    expect(decodeReportSnapshot(snapshot, 1)).toEqual(table);
    expect(() => decodeReportSnapshot({ ...snapshot, bytes: Buffer.from('{}') }, 1)).toThrow();
  });
  it('rejects truncation, malformed cells and bounds instead of publishing incomplete evidence', () => {
    for (const input of [
      { ...table, truncated: true },
      { ...table, rows: [['one column']] },
      { ...table, rows: [['x'.repeat(32769), '0']] },
    ]) {
      expect(() => encodeReportSnapshot(input, 1)).toThrow();
    }
    expect(() => encodeReportSnapshot(table, 0)).toThrow();
  });
  it('normalizes order filters idempotently without injecting summary-only fields', () => {
    const normalized = validateReportExportDefinition({
      kind: 'orders',
      filters: {
        from: '2026-01-01T00:00:00Z',
        toExclusive: '2026-02-01T00:00:00Z',
      },
    });
    expect(validateReportExportDefinition(normalized)).toEqual(normalized);
  });
});
