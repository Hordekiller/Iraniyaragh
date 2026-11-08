import type { CreditAccountSummary, CreditDocument, CreditLedgerItem, CreditLedgerPage, CreditStatement } from '@iranyaragh/contracts';
import { dedupeEntries, ledgerSum } from './statement';

export const STATEMENT_PAGE = 100;
/** Hard ceiling so a runaway ledger cannot make the browser load without end. */
export const MAX_STATEMENT_ENTRIES = 5000;

export type LoadedStatement = {
  account: CreditAccountSummary | null;
  entries: CreditLedgerItem[];
  documents: CreditDocument[];
  /** Server-reported number of ledger entries. */
  total: number;
  /** Every ledger entry was received (no cap hit, no entry missing). Running balances are only valid then. */
  complete: boolean;
  /** The received entries add up to the server's current outstanding balance. */
  reconciled: boolean;
};

type Fetchers = {
  ledger: (offset: number, limit: number, signal?: AbortSignal) => Promise<CreditLedgerPage>;
  statement: (offset: number, limit: number, signal?: AbortSignal) => Promise<CreditStatement>;
};

/**
 * Loads the whole ledger and the documents (for the order links) page by page. Pages are read in
 * separate requests, so a concurrent write could shift them; the result is therefore only called
 * `complete` when the entry count matches the server's total, and `reconciled` only when the sum
 * equals the server's outstanding balance read at the end. Nothing is assumed otherwise.
 */
export async function loadFullStatement(fetchers: Fetchers, signal?: AbortSignal): Promise<LoadedStatement> {
  const first = await fetchers.statement(0, STATEMENT_PAGE, signal);
  if (!first.account) return { account: null, entries: [], documents: first.documents, total: 0, complete: true, reconciled: true };

  const documents: CreditDocument[] = [...first.documents];
  for (let offset = STATEMENT_PAGE; offset < first.total && offset < MAX_STATEMENT_ENTRIES; offset += STATEMENT_PAGE) {
    documents.push(...(await fetchers.statement(offset, STATEMENT_PAGE, signal)).documents);
  }

  const firstPage = await fetchers.ledger(0, STATEMENT_PAGE, signal);
  const raw: CreditLedgerItem[] = [...firstPage.items];
  for (let offset = STATEMENT_PAGE; offset < firstPage.total && offset < MAX_STATEMENT_ENTRIES; offset += STATEMENT_PAGE) {
    raw.push(...(await fetchers.ledger(offset, STATEMENT_PAGE, signal)).items);
  }
  const entries = dedupeEntries(raw);

  // Read the balance last: it is the figure the received entries must add up to.
  const last = await fetchers.statement(0, 1, signal);
  const account = last.account ?? first.account;
  const complete = firstPage.total <= MAX_STATEMENT_ENTRIES && entries.length === firstPage.total;
  const reconciled = complete && ledgerSum(entries).toString() === account.outstanding.amount;
  return { account, entries, documents: dedupeById(documents), total: firstPage.total, complete, reconciled };
}

function dedupeById(documents: CreditDocument[]): CreditDocument[] {
  return [...new Map(documents.map((doc) => [doc.id, doc])).values()];
}
