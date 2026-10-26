import { createHash } from 'node:crypto';
import type { ReportExportRender } from './report-export.renderer';

export const REPORT_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;

/** Own and validate the exact table used by every serialization/retry. */
export function encodeReportSnapshot(table: ReportExportRender, maxRows: number) {
  if (
    !table ||
    table.truncated !== false ||
    !Array.isArray(table.headers) ||
    table.headers.length < 1 ||
    table.headers.length > 64 ||
    !Array.isArray(table.rows) ||
    table.rows.length > Math.min(maxRows, 20_000) ||
    !Number.isFinite(Date.parse(table.generatedAt))
  )
    throw new Error('Report snapshot exceeds approved bounds.');
  for (const row of [table.headers, ...table.rows]) {
    if (
      !Array.isArray(row) ||
      row.length !== table.headers.length ||
      row.some((cell) => typeof cell !== 'string' || cell.length > 32_768)
    ) {
      throw new Error('Report snapshot cells exceed approved bounds.');
    }
  }
  const bytes = Buffer.from(
    JSON.stringify({
      headers: table.headers,
      rows: table.rows,
      generatedAt: table.generatedAt,
      truncated: false,
    }),
  );
  if (bytes.length > REPORT_SNAPSHOT_MAX_BYTES) throw new Error('Report snapshot exceeds approved bytes.');
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteCount: bytes.length,
    rowCount: table.rows.length,
    generatedAt: new Date(table.generatedAt),
  };
}

export function decodeReportSnapshot(
  snapshot: { bytes: Uint8Array; sha256: string },
  maxRows: number,
): ReportExportRender {
  const bytes = Buffer.from(snapshot.bytes);
  if (
    bytes.length > REPORT_SNAPSHOT_MAX_BYTES ||
    createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256
  )
    throw new Error('Report snapshot integrity failed.');
  const table = JSON.parse(bytes.toString('utf8')) as ReportExportRender;
  encodeReportSnapshot(table, maxRows);
  return table;
}
