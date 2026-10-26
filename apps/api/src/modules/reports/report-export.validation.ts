import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { ReportExportDefinition } from '@iranyaragh/contracts';
import { reportInstant } from './operational-report.validation';

export const reportExportInvalid = (message: string) =>
  new BadRequestException({ code: 'REPORT_EXPORT_INPUT_INVALID', message });

// The export definition is normalized to a fixed key order before hashing, so
// equal semantics produce one definitionHash across every request.
export type NormalizedReportExportDefinition = ReportExportDefinition;

const reportId = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(value))
    throw reportExportInvalid('A bounded filter identity is required.');
  return value;
};

const reportRange = (raw: Record<string, unknown>, grainAllowed: boolean) => {
  const allowed = grainAllowed
    ? ['from', 'toExclusive', 'customerId', 'productId', 'status', 'grain']
    : ['from', 'toExclusive', 'customerId', 'productId', 'status'];
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    throw reportExportInvalid('The export range mirrors the approved filters only.');
  const from = reportInstant(raw.from);
  const toExclusive = reportInstant(raw.toExclusive);
  if (from >= toExclusive || toExclusive.getTime() - from.getTime() > 366 * 86400000) {
    throw reportExportInvalid('Export ranges stay under one calendar year.');
  }
  const customerId = reportId(raw.customerId);
  const productId = reportId(raw.productId);
  const status = raw.status;
  if (
    status !== undefined &&
    (typeof status !== 'string' || !Object.values(OrderStatus).includes(status as OrderStatus))
  ) {
    throw reportExportInvalid('Status filters come from the catalogued order states.');
  }
  const grain = grainAllowed && raw.grain !== undefined ? raw.grain : 'day';
  if (typeof grain !== 'string' || !['day', 'week', 'month'].includes(grain)) {
    throw reportExportInvalid('Summary exports group by day, week or month.');
  }
  return {
    from: from.toISOString(),
    toExclusive: toExclusive.toISOString(),
    ...(grainAllowed ? { grain } : {}),
    ...(customerId !== undefined ? { customerId } : {}),
    ...(productId !== undefined ? { productId } : {}),
    ...(status !== undefined ? { status } : {}),
  } as const;
};

export function validateReportExportDefinition(raw: unknown): NormalizedReportExportDefinition {
  if (typeof raw !== 'object' || raw === null)
    throw reportExportInvalid('An export definition object is required.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['kind', 'filters', 'debtors', 'maxRows'].includes(key))) {
    throw reportExportInvalid('Unknown export fields are rejected.');
  }
  if (typeof body.kind !== 'string' || !['operations-summary', 'orders', 'debtors'].includes(body.kind)) {
    throw reportExportInvalid('Three approved report kinds exist.');
  }
  let filters: NormalizedReportExportDefinition['filters'];
  let debtors: NormalizedReportExportDefinition['debtors'];
  if (body.kind === 'debtors') {
    if (body.filters !== undefined)
      throw reportExportInvalid('Debtor exports use an as-of instant, not a range.');
    if (typeof body.debtors !== 'object' || body.debtors === null)
      throw reportExportInvalid('A bounded as-of instant is required.');
    const debtor = body.debtors as Record<string, unknown>;
    if (Object.keys(debtor).some((key) => !['asOf', 'customerId'].includes(key))) {
      throw reportExportInvalid('Debtor exports use asOf with an optional customer.');
    }
    const asOf = reportInstant(debtor.asOf);
    if (asOf.getTime() > Date.now())
      throw reportExportInvalid('Debtor snapshots only exist up to the present.');
    const customerId = reportId(debtor.customerId);
    debtors = {
      asOf: asOf.toISOString(),
      ...(customerId !== undefined ? { customerId } : {}),
    };
  } else {
    if (body.debtors !== undefined)
      throw reportExportInvalid('Range exports use filters, not an as-of instant.');
    if (typeof body.filters !== 'object' || body.filters === null)
      throw reportExportInvalid('Bounded range filters are required.');
    filters = reportRange(
      body.filters as Record<string, unknown>,
      body.kind === 'operations-summary',
    ) as NormalizedReportExportDefinition['filters'];
  }
  let maxRows = 20_000;
  if (body.maxRows !== undefined) {
    if (
      typeof body.maxRows !== 'number' ||
      !Number.isInteger(body.maxRows) ||
      body.maxRows < 1 ||
      body.maxRows > 20_000
    ) {
      throw reportExportInvalid('Bounded exports cap worker rows under twenty thousand.');
    }
    maxRows = body.maxRows;
  }
  // Deterministic construction: JsonB comparisons and hashing stay stable.
  const definition: NormalizedReportExportDefinition = {
    kind: body.kind as NormalizedReportExportDefinition['kind'],
    ...(filters ? { filters } : {}),
    ...(debtors ? { debtors } : {}),
    maxRows,
  };
  return definition;
}

export function reportExportId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/u.test(value)) {
    throw reportExportInvalid('A bounded export identity is required.');
  }
  return value;
}
