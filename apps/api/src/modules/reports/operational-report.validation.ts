import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import type {
  OperationalReportQuery,
  ReportGrain,
} from '@iranyaragh/contracts';
export const invalidReport = () =>
  new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'A bounded report range and approved filters are required.',
  });
export function reportOptions(raw: Record<string, unknown>) {
  if (
    Object.keys(raw).some((key) => !['kind', 'search'].includes(key)) ||
    !['customer', 'product'].includes(raw.kind as string)
  )
    throw invalidReport();
  const search = raw.search ?? '';
  if (
    typeof search !== 'string' ||
    search.length > 64 ||
    [...search].some((character) => character.codePointAt(0)! < 32)
  )
    throw invalidReport();
  return {
    kind: raw.kind as 'customer' | 'product',
    search: search.trim().normalize('NFC'),
  };
}
export function reportInstant(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    !isISO8601(value, { strict: true })
  )
    throw invalidReport();
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw invalidReport();
  return result;
}
export function reportId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(value))
    throw invalidReport();
  return value;
}
export function reportPage(raw: Record<string, unknown>) {
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,6})$/u.test(value))
      throw invalidReport();
    return Number(value);
  };
  const offset = parse(raw.offset, 0),
    limit = parse(raw.limit, 25);
  if (offset > 1000000 || limit < 1 || limit > 100) throw invalidReport();
  return { offset, limit };
}
export function reportRange(raw: Record<string, unknown>, paged = false) {
  const allowed = [
    'from',
    'toExclusive',
    'customerId',
    'productId',
    'status',
    ...(paged ? ['offset', 'limit'] : ['grain']),
  ];
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    throw invalidReport();
  const from = reportInstant(raw.from),
    toExclusive = reportInstant(raw.toExclusive);
  if (
    from >= toExclusive ||
    toExclusive.getTime() - from.getTime() > 366 * 86400000
  )
    throw invalidReport();
  const grain = (raw.grain ?? 'day') as ReportGrain;
  if (!['day', 'week', 'month'].includes(grain)) throw invalidReport();
  const status = raw.status;
  if (
    status !== undefined &&
    (typeof status !== 'string' ||
      !Object.values(OrderStatus).includes(status as OrderStatus))
  )
    throw invalidReport();
  const filters: OperationalReportQuery = {
    from: from.toISOString(),
    toExclusive: toExclusive.toISOString(),
    grain,
    customerId: reportId(raw.customerId),
    productId: reportId(raw.productId),
    status: status as OrderStatus | undefined,
  };
  return { from, toExclusive, filters, ...reportPage(raw) };
}
export function debtorRange(raw: Record<string, unknown>, now = new Date()) {
  if (
    Object.keys(raw).some(
      (key) => !['asOf', 'customerId', 'offset', 'limit'].includes(key),
    )
  )
    throw invalidReport();
  const asOf = reportInstant(raw.asOf);
  if (asOf > now) throw invalidReport();
  return { asOf, customerId: reportId(raw.customerId), ...reportPage(raw) };
}
