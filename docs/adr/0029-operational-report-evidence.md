# ADR 0029 — Bounded operational reporting from existing evidence

Status: implementation; Issue #358 / invoice epic #413. Base main 9198bf1.

Reports remain read-only. No order/payment/receivable/inventory rules are rewritten.
STAFF_MFA and reports.read guard every route; debtor detail additionally requires
credit.read. Customer/product selectors additionally require customers.read or
catalog.read and return bounded name-only labels. Stock costing is a separate
dependency. No client-supplied money or contact details are returned. Filters are
strict bounded UTC instants, opaque customer/product ids,
current order status and day/week/month grouping in Asia/Tehran. Product filtering
selects orders containing that product; it does not allocate an entire payment to
one product. Every response documents that scope.

A range is at most 366 days, lists at most 100 rows, offset at most one million.
Each response uses one RepeatableRead snapshot, bounded SQL statement/transaction
budgets and a fixed query count. No N+1, unrestricted exports or user SQL.

Created order value includes pending/cancelled orders and is labelled accordingly.
Provider settlement counts only the first immutable PAID transition per Payment;
refund evidence is reported separately, retaining original settlement after a
refund. Gateway environment is explicit (sandbox/live), not inferred as cash.
Credit receipts/reversals are signed immutable ledger entries, separate from
provider settlements. Staff-recorded refund payouts are separate cash evidence.
Invoice totals use original immutable issued snapshots; no document is treated
as payment. Missing correction/cancellation documents, cost attribution and PDF/
export dependencies are explicitly unavailable, not fabricated zero balances.

Top items are gross quantities/value on orders with a PAID/CREDIT_APPROVED transition,
before returns/refunds; do not label them net revenue. Debtors are derived by first
summing immutable ledger entries per document at an explicit as-of instant, then
per account. Unpaid checkout orders never become debt. Aging uses dueAt and signed
entries; no multiplicative join with receipts/returns. Customer refund obligations
are separately derived from return refundDue minus evidenced payouts.

Admin /reports renders backend totals, tables, accessible charts, bounded pages,
filters, loading/empty/retry/error and permission states. Integer IRR stays decimal
string/BigInt; chart geometry may use bounded ratios but never change money values.

Acceptance: real PostgreSQL exact range/Tehran boundaries, duplicated transitions,
multiple attempts/refunds, receipts/reversals and >Number.MAX_SAFE_INTEGER sums;
HTTP auth/current compound permission/filter injection tests, Admin behavior,
OpenAPI/schema drift, full CI/browser/security and exact-SHA release. Live business
acceptance and unavailable dependencies remain separately evidenced.
