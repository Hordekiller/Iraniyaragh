import { describe, expect, it, vi } from 'vitest';
import type { CreditAccountSummary, CreditDocument, CreditEntryKind, CreditLedgerItem } from '@iranyaragh/contracts';
import { loadFullStatement, MAX_STATEMENT_ENTRIES } from './statement-loader';

const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const entry = (i: number, amount: string, kind: CreditEntryKind = 'SALE'): CreditLedgerItem => ({
  id: `e${i}`, documentId: 'd1', receiptId: null, reversalOfId: null, kind, amount: money(amount),
  effectiveAt: `2026-10-${String((i % 27) + 1).padStart(2, '0')}T08:00:00.000Z`, createdAt: `2026-10-01T08:${String(i % 60).padStart(2, '0')}:00.000Z`,
});
const account = (outstanding: string) => ({ id: 'a', customerId: 'c', outstanding: money(outstanding) } as unknown as CreditAccountSummary);
const doc = (id: string) => ({ id, orderId: null } as unknown as CreditDocument);

function fetchers(entries: CreditLedgerItem[], outstanding: string, documents: CreditDocument[] = [doc('d1')]) {
  const newestFirst = [...entries].reverse();
  return {
    ledger: vi.fn(async (offset: number, limit: number) => ({ items: newestFirst.slice(offset, offset + limit), total: entries.length, offset, limit })),
    statement: vi.fn(async (offset: number, limit: number) => ({ account: account(outstanding), documents: documents.slice(offset, offset + limit), total: documents.length, offset, limit })),
  };
}

describe('loadFullStatement', () => {
  it('reads every page, deduplicates and reconciles to the server balance', async () => {
    const entries = Array.from({ length: 230 }, (_, i) => entry(i, '10'));
    const f = fetchers(entries, '2300');
    const result = await loadFullStatement(f);
    expect(result.entries).toHaveLength(230);
    expect(result).toMatchObject({ complete: true, reconciled: true, total: 230 });
    expect(f.ledger).toHaveBeenCalledTimes(3);
    expect(f.ledger).toHaveBeenNthCalledWith(1, 0, 100, undefined);
  });

  it('reports an account that does not exist as an empty, complete statement', async () => {
    const f = { ledger: vi.fn(), statement: vi.fn(async () => ({ account: null, documents: [], total: 0, offset: 0, limit: 100 })) };
    expect(await loadFullStatement(f)).toMatchObject({ account: null, entries: [], complete: true });
    expect(f.ledger).not.toHaveBeenCalled();
  });

  it('flags a ledger that does not add up to the server balance instead of claiming it does', async () => {
    const result = await loadFullStatement(fetchers([entry(1, '10'), entry(2, '10')], '25'));
    expect(result).toMatchObject({ complete: true, reconciled: false });
  });

  it('is not complete when pages missed an entry (a write shifted the pages)', async () => {
    const entries = Array.from({ length: 150 }, (_, i) => entry(i, '1'));
    const f = fetchers(entries, '150');
    // The second page repeats the last row of the first page: one entry is lost to the shift.
    f.ledger.mockImplementation(async (offset: number, limit: number) => {
      const newestFirst = [...entries].reverse();
      const items = offset === 0 ? newestFirst.slice(0, limit) : [newestFirst[99]!, ...newestFirst.slice(offset + 1, offset + limit)];
      return { items, total: entries.length, offset, limit };
    });
    const result = await loadFullStatement(f);
    expect(result.entries).toHaveLength(149);
    expect(result).toMatchObject({ complete: false, reconciled: false });
  });

  it('never claims a statement is complete above the safety ceiling', async () => {
    const f = fetchers([entry(1, '1')], '1');
    f.ledger.mockResolvedValue({ items: [entry(1, '1')], total: MAX_STATEMENT_ENTRIES + 1, offset: 0, limit: 100 });
    const result = await loadFullStatement(f);
    expect(result.complete).toBe(false);
    expect(result.reconciled).toBe(false);
  });

  it('collects documents from every page without duplicates', async () => {
    const documents = Array.from({ length: 130 }, (_, i) => doc(`d${i}`));
    const result = await loadFullStatement(fetchers([entry(1, '1')], '1', documents));
    expect(result.documents).toHaveLength(130);
  });
});
