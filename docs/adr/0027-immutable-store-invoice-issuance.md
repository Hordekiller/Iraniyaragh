# ADR 0027 — Immutable store invoice issuance

Status: implementation proposal; runtime and release acceptance required.

## Source and scope

Main `0f072d4b8e54298e77a14654d7ddcec5092de54b` already implements approved
seller/tax policy revisions and independent quotation drafts (#429/#430).
Issue #417 adds final sales documents without rewriting order, payment, stock,
credit or refund logic. This is a store invoice, not a fiscal/Moadian document.

An ORDER draft may issue only when its current version, source order version,
customer ownership, original SKU quantities/prices, shipping, discount and backend
quote reconcile exactly with the authorized source order. An active current
seller/tax policy is mandatory. PENDING_PAYMENT, PAID and CREDIT_APPROVED sales
are eligible; the invoice is never proof of payment. Cancelled/refunded/returned
orders and unsupported financial terms fail closed. CATALOG quotations remain
drafts until an authorized order-conversion command exists; issuance cannot invent
an order, negotiate a new tax/discount amount or consume stock.

## State and data

Draft: DRAFT -> ISSUED, or DRAFT -> CANCELLED. Every transition advances version
and seals an immutable revision. Issued drafts/lines cannot be edited or cancelled
through the quotation command. Publication/revocation and correction documents
are independent later commands; issuance begins private.

InvoiceDocument stores immutable source/draft versions, original order/customer,
policy revision, seller/buyer/address/note/shipping and IRR quote snapshots, issued
actor/time, canonical payload hash, series/year/number. InvoiceDocumentLine stores
original OrderItem identities, quantities/prices and backend discount/net/tax/total.
One original document per order and per draft; all FKs Restrict. Line insertions
close when the immutable issuance event seals the document. Document/event/command
evidence cannot be updated or deleted.

Number format: IRY-YYYY-NNNNNN, series SALE, Gregorian year in Asia/Tehran at issue.
This is an internal store numbering convention, not an official fiscal sequence.
The transactional series/year counter increments once under its unique row lock;
no MAX+1, draft numbers, resets, number reuse or claim of statutory gaplessness.
Counter, document, lines, event, draft revision, audit and durable command commit
together. SQL guards reconcile source ownership/versions/amounts/lines and numbering.

## API and security contracts

- POST /api/v1/invoices/admin/drafts/:id/issue: strict body expectedVersion,
  expectedOrderVersion; Idempotency-Key required; fresh STAFF_MFA + invoices.issue
  and invoices.read. Returns immutable document, committed draft version, replayed.
- GET /api/v1/invoices/admin/documents: bounded offset/limit, safe summary.
- GET /api/v1/invoices/admin/documents/:id: immutable protected snapshot.
- Reads require current STAFF_MFA + invoices.read, no-store. Current permissions
  precede command replay. Actor/resource/key hashes survive restart; changed
  payload conflicts. A replay returns its original immutable issued document.
- Publication/customer-self/PDF endpoints are not invented by this slice.

Admin uses a reviewed server quote, explicit source-version confirmation, locked
ambiguous payload/key, read-before-identical-retry and identity-scoped aborts.
Issued content is rendered as text, never arbitrary HTML. Audit/logs contain only
IDs, versions, number and safe numeric metadata; protected party/address/note
snapshots are not copied to diagnostics. Integer IRR/BigInt calculations only.

## Acceptance

Real PostgreSQL: unique numbering under concurrency, duplicate keys/new keys,
restart replay, stale draft/order/policy, wrong owner/source, edited quotation,
overflow, immutable SQL evidence, audit rollback, and unchanged commerce/credit/
inventory/outbox tables. Strict HTTP RBAC/fresh MFA/body tests, Admin ambiguity/
read-only/reload states and real browser issue/reload evidence. All required CI
and security gates, clean migrations/OpenAPI and official exact-SHA release apply.

PDF, publication, nonfinancial correction and financial credit/return documents
retain their own dependent acceptance; final issuance does not complete Epic #413.
