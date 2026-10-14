import { describe, expect, it } from 'vitest';
import {
  debtorRange,
  reportInstant,
  reportRange,
} from './operational-report.validation';
const base = {
  from: '2026-01-01T00:00:00Z',
  toExclusive: '2026-01-02T00:00:00Z',
};
describe('Operational report strict range and filter contract', () => {
  it('normalizes timezone instants and safe defaults without money/owner overrides', () => {
    const result = reportRange({ ...base, from: '2026-01-01T03:30:00+03:30' });
    expect(result.from.toISOString()).toBe(base.from.replace('Z', '.000Z'));
    expect(result.filters.grain).toBe('day');
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });
  it.each([
    { from: '2026-02-30T00:00:00Z' },
    { from: '2026-01-01' },
    { toExclusive: base.from },
    { toExclusive: '2028-01-01T00:00:00Z' },
    { grain: 'minute' },
    { grain: ['day'] },
    { customerId: ['a'] },
    { customerId: "a' OR true" },
    { productId: '<svg>' },
    { status: 'UNKNOWN' },
    { userId: 'owner' },
    { total: '1' },
    { sql: 'SELECT *' },
  ])('rejects invalid or injected filters %j', (patch) => {
    expect(() => reportRange({ ...base, ...patch })).toThrow();
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { offset: '-1' },
    { offset: '1000001' },
    { offset: ['0'] },
    { limit: '1.1' },
    { grain: 'day' },
  ])('rejects unbounded/irrelevant list inputs %j', (patch) => {
    expect(() => reportRange({ ...base, ...patch }, true)).toThrow();
  });
  it('bounds valid page and exposes no opaque owner override', () => {
    expect(
      reportRange({ ...base, offset: '25', limit: '100' }, true),
    ).toMatchObject({ offset: 25, limit: 100 });
    expect(() =>
      debtorRange({ asOf: '2026-01-01T00:00:00Z', userId: 'other' }),
    ).toThrow();
    expect(() =>
      debtorRange(
        { asOf: '2030-01-01T00:00:00Z' },
        new Date('2026-01-02T00:00:00Z'),
      ),
    ).toThrow();
    expect(reportInstant('2026-01-01T00:00:00Z').toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});
