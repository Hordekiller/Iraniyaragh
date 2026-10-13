# ADR 0028 — Independent invoice customer publication

Status: implementation; acceptance and release pending. Issue #418, after #417.

## Contract and invariants

An issued store document remains immutable. A separate InvoicePublication head
starts logically private at version 0. Fresh STAFF_MFA plus invoices.publish and
invoices.read may publish or revoke with expectedVersion, an explicit private
reason and a scoped Idempotency-Key. Each actual state change advances one version
and appends an immutable publication event and command evidence transactionally.
Same-key replay returns the original committed result without changing current
visibility. A changed payload conflicts; different-key no-op does not create an
audit or version. SQL locks the document, enforces contiguous event/head/command
proof, and preserves all original financial/number/source evidence. No order,
payment, inventory, receivable or notification state is mutated.

Admin GET /invoices/admin/documents/:id/publication returns current version/state
and bounded private history. PUT on that route changes visibility only.
Customer GET /customers/me/invoices and /customers/me/invoices/:id requires real
CUSTOMER_OTP and current session; ownership is joined only through Customer.userId
and ACTIVE customer, plus current publication. Unknown/foreign/revoked documents
return the same not-found. Customer ids/query overrides are rejected. Responses
are no-store; no raw staff note, internal source/policy versions, actor/audit,
command/provider/token identifiers appear in customer projection. Addresses and
buyer information are limited to that customer's immutable invoice snapshot.

Customer /account/invoices and /account/invoices/:id render the safe projection
with session restoration, empty/loading/error/retry/pagination and identity-scoped
request lifetime. Admin explicitly reviews visibility and preserves an ambiguous
command payload/key; a failed reconciliation read never resends. No arbitrary
recipient/link token or fake invoice-delivery success. Authenticated links contain
only the opaque document id. PDF/private artifacts and approved notifications
retain independent acceptance; publication alone never says paid or cancelled.

## Acceptance

Real PostgreSQL: ownership, publication/revocation, current session guard HTTP,
concurrent versions, same/different key replay, restart, rollback, SQL immutability
and unchanged financial evidence. Admin/customer UI state tests and real Admin
publish/revoke browser commands. OpenAPI/drift/full CI/security checks and exact
release gates. Live customer acceptance remains an operator handset test.
