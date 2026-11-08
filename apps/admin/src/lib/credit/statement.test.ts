import { describe, expect, it } from 'vitest';
import type { CreditEntryKind, CreditLedgerItem } from '@iranyaragh/contracts';
import { buildStatement, dedupeEntries, ledgerSum, statementCsv, statementDay } from './statement';

let n = 0;
const entry = (kind: CreditEntryKind, amount: string, effectiveAt: string, over: Partial<CreditLedgerItem> = {}): CreditLedgerItem => ({
  id: over.id ?? `e${++n}`, documentId: 'd1', receiptId: null, reversalOfId: null, kind,
  amount: { amount, currency: 'IRR' }, effectiveAt, createdAt: over.createdAt ?? effectiveAt, ...over,
});
const docs = [{ id: 'd1', orderId: 'order-1' }];

// 1000 sale, 300 receipt, then the receipt is reversed, 50 credit note, 20 debit adjustment.
const ledger = () => [
  entry('SALE', '1000', '2026-10-01T08:00:00.000Z'),
  entry('RECEIPT', '-300', '2026-10-05T08:00:00.000Z', { receiptId: 'r1' }),
  entry('RECEIPT_REVERSAL', '300', '2026-10-06T08:00:00.000Z', { receiptId: 'r1', reversalOfId: 'x' }),
  entry('CREDIT_NOTE', '-50', '2026-10-07T08:00:00.000Z'),
  entry('DEBIT_ADJUSTMENT', '20', '2026-10-08T08:00:00.000Z'),
];

describe('customer statement', () => {
  it('splits signed amounts into debit and credit and keeps a running balance', () => {
    const statement = buildStatement(ledger(), docs);
    expect(statement.rows.map((row) => [row.debit, row.credit, row.balance])).toEqual([
      [1000n, 0n, 1000n], [0n, 300n, 700n], [300n, 0n, 1000n], [0n, 50n, 950n], [20n, 0n, 970n],
    ]);
    expect(statement.totalDebit).toBe(1320n);
    expect(statement.totalCredit).toBe(350n);
    expect(statement.closing).toBe(970n);
    expect(statement.closing).toBe(ledgerSum(ledger()));
  });

  it('is independent of the order the pages arrived in', () => {
    const entries = ledger();
    expect(buildStatement([...entries].reverse(), docs)).toEqual(buildStatement(entries, docs));
  });

  it('orders equal effective times by record time and then id, deterministically', () => {
    const t = '2026-10-01T08:00:00.000Z';
    const a = entry('SALE', '10', t, { id: 'b', createdAt: '2026-10-01T09:00:00.000Z' });
    const b = entry('RECEIPT', '-10', t, { id: 'a', createdAt: '2026-10-01T09:00:00.000Z' });
    const c = entry('SALE', '5', t, { id: 'c', createdAt: '2026-10-01T08:30:00.000Z' });
    expect(buildStatement([a, b, c], docs).rows.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('carries an opening balance for entries before the period and excludes later ones', () => {
    const statement = buildStatement(ledger(), docs, { from: '2026-10-06', to: '2026-10-07' });
    expect(statement.opening).toBe(700n);
    expect(statement.rows.map((row) => row.kind)).toEqual(['RECEIPT_REVERSAL', 'CREDIT_NOTE']);
    expect(statement.rows.map((row) => row.balance)).toEqual([1000n, 950n]);
    expect(statement.closing).toBe(950n);
    expect(statement.opening + statement.totalDebit - statement.totalCredit).toBe(statement.closing);
  });

  it('cuts days in Tehran time, not UTC', () => {
    // 2026-10-01T21:00Z is 00:30 on 2026-10-02 in Tehran (UTC+3:30).
    expect(statementDay('2026-10-01T21:00:00.000Z')).toBe('2026-10-02');
    expect(statementDay('2026-10-01T20:00:00.000Z')).toBe('2026-10-01');
    const late = entry('SALE', '10', '2026-10-01T21:00:00.000Z');
    expect(buildStatement([late], docs, { from: '2026-10-02' }).rows).toHaveLength(1);
    expect(buildStatement([late], docs, { to: '2026-10-01' }).rows).toHaveLength(0);
  });

  it('links sale rows to their order and leaves unknown documents unlinked', () => {
    const rows = buildStatement([entry('SALE', '5', '2026-10-01T00:00:00.000Z'), entry('SALE', '5', '2026-10-02T00:00:00.000Z', { documentId: 'zz' })], docs).rows;
    expect(rows.map((row) => row.orderId)).toEqual(['order-1', null]);
  });

  it('handles amounts beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const big = entry('SALE', '9007199254740993', '2026-10-01T00:00:00.000Z');
    const pay = entry('RECEIPT', '-1', '2026-10-02T00:00:00.000Z');
    expect(buildStatement([big, pay], docs).closing).toBe(9007199254740992n);
  });

  it('removes an entry that appears on two overlapping pages and never double counts it', () => {
    const e = ledger();
    const merged = dedupeEntries([...e, e[1]!, e[4]!]);
    expect(merged).toHaveLength(5);
    expect(ledgerSum(merged)).toBe(970n);
  });

  it('writes a UTF-8 CSV with a BOM, plain integers and quoted fields', () => {
    const csv = statementCsv(buildStatement(ledger(), docs), (kind) => (kind === 'SALE' ? 'فروش, "نسیه"' : kind));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"فروش, ""نسیه"""');
    expect(csv.split('\r\n')[1]).toBe(',,مانده ابتدای دوره,,,0');
    expect(csv).toContain(',1320,350,970');
  });
});
