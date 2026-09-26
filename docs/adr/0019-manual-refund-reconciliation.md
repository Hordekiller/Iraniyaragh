# ADR-0019: Manual Refund Recording and Reconciliation

- Status: Accepted (merged in PR #303)
- Date: 2026-09-25
- Scope: V1 refund capability (`G6-03`)
- Owners: Platform/API (contract + boundary) and Admin (staff UX)

## Context

A paid order can need its money returned: a cancelled shipment, a returned
parcel, a goodwill gesture, a duplicated capture. `ADR-0006` already reserves the
money path for it (`Payment PAID -> REFUNDED | PARTIALLY_REFUNDED` and
`PARTIALLY_REFUNDED -> REFUNDED`), `PaymentStatus` already carries both target
states, `OutboxEffectKind.PAYMENT_REFUND_REVIEW` already exists, and
`PAYMENT_VERIFIED_AFTER_CANCELLED` already tells operations that a capture landed
after the order was cancelled and needs a refund decision.

What does not exist is any way to record that the money was actually returned, so
a refund can currently only be handled by editing the database by hand, which
leaves no evidence, no audit trail and no state transition.

The decisive constraint is the gateway: **Zarinpal v4 exposes no refund API.**
Refunds are executed by a human in the Zarinpal merchant panel. Any design that
pretends the application can move the money, or that polls a gateway for a refund
status, is fiction. The application can only do what it is already good at:
record an audited, idempotent, evidence-bearing fact about money that the gateway
has already moved, and project the state machine from that fact.

## Decision

### The record, not the transfer

A `Refund` is an append-only record of a refund that staff performed in the
gateway panel. Creating it never contacts a gateway and never moves money. The
only thing the application does is move `PaymentStatus` forward and emit evidence.

- `RefundStatus` is `RECORDED` only in this slice. A two-phase
  request/confirm flow would let the application claim a refund it has not
  verified, so it is explicitly out of scope.
- `gatewayReferenceId` is **required** and control-character free. A refund
  without the panel's own reference is not evidence, so the API refuses it. It is
  unique, which also prevents the same gateway reference being recorded twice for
  two payments.
- `amount` is positive integer Rial and the **request body carries no order or
  customer identity**: the payment row is the only source, so a client cannot
  refund a different order than the one it names.
- `reason` is a bounded free-text code recorded with the transition; `note` is
  optional operational context, length-bounded and never projected to customers.

### Money invariants, enforced in the database

- `Payment.refundedAmount BigInt NOT NULL DEFAULT 0` with
  `CHECK (refundedAmount >= 0 AND refundedAmount <= amount)`. The total returned
  can never exceed the captured amount, and the constraint holds even for writes
  that bypass the service.
- A refund transition is written through the existing guarded state-machine
  helper: `PAID -> PARTIALLY_REFUNDED` for a partial refund,
  `PARTIALLY_REFUNDED -> REFUNDED` when the remainder is returned, and
  `PAID -> REFUNDED` for a full refund. `REFUNDED` is terminal, so the total is
  final. Every other combination is `409 PAYMENT_STATE_CONFLICT`.
- A further partial refund on an already partially refunded payment moves no
  status, so it writes no transition row: the shared state machine rejects a
  self-transition by design, and the transition tables are the history of
  *status* changes rather than of every money movement. The `Refund` row, the
  `payment.refund.recorded` audit row and the `PAYMENT_REFUNDED` outbox event
  still evidence it, and `refundedAmount` still moves under the order lock.
- Because `refundedAmount` is denormalized, the database also refuses a total
  that no refund row explains: a deferred constraint trigger compares
  `SUM(Refund.amount)` with `Payment.refundedAmount` at commit, so a write that
  records a refund without moving the total (or moves the total without
  recording a refund) is rejected instead of silently corrupting the projected
  `refundedTotal`.
- The service serializes concurrent refunds for the same order with the order
  advisory lock the settlement path uses, in a short `SERIALIZABLE`
  transaction, and re-reads the payment under that lock, so two concurrent
  partial refunds cannot both read the same remaining amount and jointly exceed
  it. The database constraints above are the backstop if that reasoning is ever
  wrong.
- The `Order` machine is untouched: `PAID` is terminal there, and a refund does
  not rewrite history. The refund is a fact about the payment, not about the
  commercial lifecycle.

### Idempotency, evidence and audit

- `POST /api/v1/payments/admin/:id/refund` requires an `Idempotency-Key` header
  (128 chars, control free), exactly like the other money commands. Claims live in
  `OrderCommandIdempotencyRecord`-style rows keyed by a hashed key plus a payload
  fingerprint; a replay returns the stored response, and a different amount,
  reference or reason under the same key is `IDEMPOTENCY_CONFLICT`.
- Authorization is `payments.refund` **plus** `RequireFreshAuthentication('STAFF_MFA')`,
  because this command is irreversible in the current slice. The permission is a
  new, narrow, non-financial-adjacent key; it is seeded with the existing payment
  staff role and is not granted to customers.
- Every accepted command writes a `payment.refund.recorded` audit row with the
  initiating staff actor, the request id, the amount, the gateway reference and
  the totals before and after, and the payment transition carries the same actor
  and request id. A refusal writes nothing, and an idempotent replay returns the
  recorded refund without writing a second audit row.
- One deduplicated `PAYMENT_REFUNDED` outbox event per refund
  (`payment-refunded:<refundId>`) is written in the same transaction as the state
  change, and maps to the existing `PAYMENT_REFUND_REVIEW` effect kind, so the
  operations queue that already exists for refund review receives it.

### Correction is deliberately not automated

A recorded refund cannot be deleted or edited: `Refund` is append-only and
`REFUNDED` is terminal. A mistaken record (wrong amount or wrong reference) is
corrected by a **compensating** record or by a privileged, audited database-level
correction performed under the operations runbook — not by mutating history. The
operational controls that keep this rare are the fresh-MFA requirement, the narrow
permission, the mandatory gateway evidence, the server-computed remaining amount
shown in the Admin UI, and the panel read-back. Adding a reversal state machine is
a separate decision, not an implicit part of this slice.

## Consequences

- Staff get a truthful, auditable refund ledger and the `PAID` payment stops
  looking settled-and-final once money has been returned.
- The application never claims to have moved money it did not move, and the
  gateway remains the source of truth for the actual transfer.
- Reconciliation after a capture that landed after cancellation finally has a
  closing action.
- A refund cannot be self-served by a customer in V1; that is a later slice and
  would need a customer-facing request/confirm state machine.
- The gateway reference is the only link to the external transfer. If the panel
  reference is wrong, the record is wrong, which is why it is required, unique
  and audited.

## Verification and rollback

Acceptance requires: unit tests for eligibility, state transitions, amount caps
and evidence validation; PostgreSQL integration tests for replay, concurrent
partial refunds, the over-refund refusal and the audit/outbox writes; an
HTTP-level authorization matrix (unauthenticated, customer, staff without
permission, staff with permission but stale MFA, full-MFA success); Admin UI tests
for server-driven eligibility and the recorded outcome; OpenAPI drift; and the
full protected CI suite.

Rollback removes the route, the Admin action and the provider registration. The
`Refund` rows and `Payment.refundedAmount` column remain as append-only evidence
and are dropped only by a later forward migration that has been reviewed against
real refunds.
