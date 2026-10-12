# ADR 0023 — Staff-only credit and immutable customer receivables

Status: implementation decision; reviewed through the dedicated credit PR.
Related: #336, #338, #358, #413. Scope authorized by the operator on 2026-10-12.

## Existing behavior and boundary

StaffOrderService already prices catalog lines in integer IRR and reserves stock.
PaymentVerificationService alone records authoritative gateway settlement and
consumes reservations. Neither pending orders nor unpaid invoices are receivables.
There is no credit account/ledger in main 5bb3a52. Public checkout remains gateway-only.

## Decision and ordered implementation

1. Add a separate Credit module with accounts, immutable receivable documents,
   receipts and a signed ledger. No writable balance column. Accounts start
   SUSPENDED with a zero limit; authorized staff explicitly supply limit and terms.
2. Support one evidenced opening-balance document per existing customer. It is
   historical debt, never a fabricated order/payment or stock movement. Corrections
   append signed, evidenced adjustments; they never overwrite the opening document.
3. A receipt records money already received by staff (cash/bank transfer), separately
   from gateway Payment. All receipt money is explicitly allocated to documents
   owned by that same account; partial and multi-document allocation are allowed.
   Unallocated deposits and customer payouts are outside this first contract. Reusing an adjustment evidence
   reference on the same document with a fresh retry key is also rejected.
4. Whole-receipt reversal is an immutable compensating set of entries. Exactly one
   reversal per original allocation; original receipt/evidence are retained.
5. Integrate credit sales as a subsequent reviewed slice: normal staff order pricing,
   atomic account/limit/overdue validation, immutable receivable and inventory
   consumption through InventoryService. Commercial CREDIT_APPROVED must be
   distinct from financial unpaid/partial/paid/overdue. Existing paid-order guards
   are retained until API, state-machine, fulfillment and database proof agree.
6. Store invoices and customer publication separately from commercial orders and
   receivable settlement. The operator selected store invoices/Persian PDF; official
   tax invoices and the tax-authority integration are a separate stage. No tax rate
   or exemption is inferred. Editing invoices never changes inventory or payments.

## Financial invariants

Amounts are canonical base-10 strings at the boundary and BigInt/BIGINT internally.
All documents and the per-account balance must remain within the signed BIGINT
range; aggregate in PostgreSQL numeric/JS BigInt before checking that bound.
For a document: balance = sum(ledger amounts); outstanding cannot be negative.
The original debit plus signed adjustments is its effective principal. Receipts
reduce debt and reversals restore it. A zero balance is financial PAID, positive
balance below principal is PARTIALLY_PAID; a positive past-due balance is OVERDUE.
A receipt is never described as a successful online payment.

A new credit sale requires active customer/account, no positive overdue document,
and total outstanding + new debt <= configured credit limit. No silent override.
Lowering a limit below existing debt is permitted, visibly over-limit, and prevents
new sales; suspension cannot erase debt or prevent recording real repayments.
Evidenced corrections may reveal debt above a limit, but cannot manufacture stock,
sales, provider settlement or a customer refund. Credit notes cannot reduce an
already-settled document below zero: cash refund integration is a separate gate.
Terms/due dates are snapshotted at issuance; account edits do not rewrite history.

## Transactions, concurrency and replay

Every financial command has actor-scoped durable idempotency keyed by command,
canonical payload fingerprint and resource. Replay is checked before stale-version
validation; a changed payload conflicts. No command-record expiry that would permit
posting the same financial mutation again after a restart. Replays re-run current
server authorization and disclose no more than the endpoint contract.

Serializable transactions plus an account lock/version serialize postings and
account policy edits. For future credit approval acquire order lock, then account
lock, then existing inventory locks in stable order. No account command takes an
order lock. Retry only PostgreSQL serialization/deadlock/contention, bounded to
three attempts; external providers are never retried by this mechanism.

Database checks/FKs enforce same-account document and receipt ownership, signs,
receipt allocation equality and nonnegative balances. Financial records reject
UPDATE/DELETE; corrections are inserts. Actor FKs retain evidence. Migration is
forward-only and adds empty tables; existing customer/order/payment/stock rows are
not backfilled, reclassified or financially modified.

## Authorization and privacy

All Admin routes require STAFF_MFA and dedicated credit permissions. Policy,
opening balance, receipt, reversal and adjustment posting require fresh MFA.
Use credit.read/manage/opening/receive/adjust, never UI hiding as authorization.
Customer statements resolve ownership only from CUSTOMER_OTP principal.userId;
no customer-supplied customer/account ID. Customer output excludes staff identities,
notes, source/evidence references, request IDs and audit internals.
Audit stores document/receipt IDs, kinds, safe amounts, counts and versions only;
never raw notes, mobile, names, addresses, bank evidence or idempotency payload.
No SMS paid event or gateway-provider activation is part of this module.

## Release gates

PostgreSQL tests prove simultaneous receipts/adjustments cannot over-allocate,
reversal/restart/duplicate submissions post once, ownership survives forged IDs,
financial rows are immutable, and debit/receipt totals reconcile. HTTP tests exercise
real AuthGuard, permissions, MFA freshness and strict DTOs. OpenAPI stays synchronized.
Complete quality/database/E2E/security gates precede merge; exact-SHA official images
precede staging deployment. Restore a fresh pre-migration backup in isolated storage.
Do not close #336/#338 based on this foundation: sale/fulfillment, full statement UI,
returns/corrections and real operator acceptance remain separate evidence gates.
