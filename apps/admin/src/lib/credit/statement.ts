import type { CreditDocument, CreditEntryKind, CreditLedgerItem } from '@iranyaragh/contracts';

/**
 * Customer account statement built only from the credit ledger the server returned.
 *
 * Sign convention (verified against the credit service): ledger amounts are signed.
 * SALE, OPENING_BALANCE, DEBIT_ADJUSTMENT and RECEIPT_REVERSAL are positive (the customer owes
 * more: بدهکار); RECEIPT and CREDIT_NOTE are negative (the customer owes less: بستانکار). The
 * server's `outstanding` is the sum of all entries, so a complete statement must sum to it.
 */
export type StatementRow = {
  id: string; documentId: string; receiptId: string | null; kind: CreditEntryKind;
  effectiveAt: string; createdAt: string; day: string;
  debit: bigint; credit: bigint; balance: bigint;
  orderId: string | null;
};
export type Statement = {
  opening: bigint; rows: StatementRow[]; totalDebit: bigint; totalCredit: bigint; closing: bigint;
};
export type StatementRange = { from?: string; to?: string };

const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Calendar day (YYYY-MM-DD) of an instant in Tehran, the business time zone. */
export const statementDay = (iso: string): string => tehranDay.format(new Date(iso));

const byOrder = (a: CreditLedgerItem, b: CreditLedgerItem) =>
  a.effectiveAt < b.effectiveAt ? -1 : a.effectiveAt > b.effectiveAt ? 1
  : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1
  : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Sum of every entry; equals the server's outstanding when the ledger is complete. */
export function ledgerSum(entries: ReadonlyArray<CreditLedgerItem>): bigint {
  return entries.reduce((sum, entry) => sum + BigInt(entry.amount.amount), 0n);
}

/** Merge pages without double counting an entry that appeared in two overlapping pages. */
export function dedupeEntries(entries: ReadonlyArray<CreditLedgerItem>): CreditLedgerItem[] {
  const seen = new Map<string, CreditLedgerItem>();
  for (const entry of entries) if (!seen.has(entry.id)) seen.set(entry.id, entry);
  return [...seen.values()];
}

export function buildStatement(
  entries: ReadonlyArray<CreditLedgerItem>,
  documents: ReadonlyArray<Pick<CreditDocument, 'id' | 'orderId'>>,
  range: StatementRange = {},
): Statement {
  const orderOf = new Map(documents.map((doc) => [doc.id, doc.orderId]));
  let opening = 0n;
  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows: StatementRow[] = [];
  for (const entry of [...entries].sort(byOrder)) {
    const amount = BigInt(entry.amount.amount);
    const day = statementDay(entry.effectiveAt);
    if (range.from && day < range.from) { opening += amount; continue; }
    if (range.to && day > range.to) continue;
    const debit = amount > 0n ? amount : 0n;
    const credit = amount < 0n ? -amount : 0n;
    totalDebit += debit;
    totalCredit += credit;
    rows.push({
      id: entry.id, documentId: entry.documentId, receiptId: entry.receiptId, kind: entry.kind,
      effectiveAt: entry.effectiveAt, createdAt: entry.createdAt, day, debit, credit,
      balance: opening + totalDebit - totalCredit, orderId: orderOf.get(entry.documentId) ?? null,
    });
  }
  return { opening, rows, totalDebit, totalCredit, closing: opening + totalDebit - totalCredit };
}

const csvCell = (value: string) => (/[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value);

/** UTF-8 CSV with a BOM so Excel reads Persian text; amounts are plain integers in rials. */
export function statementCsv(statement: Statement, label: (kind: CreditEntryKind) => string): string {
  const lines = [['تاریخ سند', 'زمان ثبت', 'شرح', 'بدهکار', 'بستانکار', 'مانده']];
  lines.push(['', '', 'مانده ابتدای دوره', '', '', statement.opening.toString()]);
  for (const row of statement.rows) lines.push([row.effectiveAt, row.createdAt, label(row.kind), row.debit.toString(), row.credit.toString(), row.balance.toString()]);
  lines.push(['', '', 'جمع دوره', statement.totalDebit.toString(), statement.totalCredit.toString(), statement.closing.toString()]);
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
