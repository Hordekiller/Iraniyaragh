# ADR-0018: Payment Verification and Successful-Purchase Reconciliation

- Status: Accepted (Epic-6 verification slice, PR pending)
- Date: 2026-09-24
- Scope: Server-side payment verification + successful-purchase path (`P1`)
- Owners: Platform/API; supersedes the deferred "future verification slice" note of ADR-0017
- Supersedes note: none — extends ADR-0017

## Context

ADR-0017 built authorized, `PENDING` payment attempts but deliberately deferred the
callback. Zarinpal redirects the buyer's browser back to `callback_url` with
`Authority` and `Status` (`OK`/`NOK`) query parameters. Those parameters are
**not** proof: anyone who can guess an authority string can replay the URL, the
`Status` value is gateway-reported intent, and a request can arrive much later
than the redirect.

Moving money (Payment `PENDING → PAID`, Order `PENDING_PAYMENT → PAID`) requires
server-side proof from the provider, applied in one short, race-safe transaction
together with stock consumption (Reservation `ACTIVE → CONSUMED`,
InventoryMovement `SALE`), Fulfillment creation (`PENDING`), audit rows and
outbox events. Concurrent cancellation/expiry and duplicate callbacks must never
produce a double stock consume, a lost settlement, or a lost refund signal.

## Decision

### Callback parameters are intent, never proof

- The public `GET /api/v1/payments/zarinpal/callback` route accepts only
  `Authority` and optional `Status`. The authority is looked up; an unknown
  authority returns `404 NOT_FOUND` and never calls the provider.
- `Status=NOK` is a fast-path **intent** that deterministically records
  `Payment PENDING → FAILED` with reason `gateway_not_paid` — it never contacts
  the provider and never moves an order by itself. Any status other than `OK`/
  `NOK` (or `Authority` outside the 128-character bound) is `400 INVALID_REQUEST`.
- `Status=OK` (or absent) triggers the provider `verify` call, which is the only
  thing that can prove settlement.

### Provider verification boundaries

- `payment-provider.port.ts` adds `verify({ amountMinorUnits, currency,
  authority, correlationId })` returning a discriminated union: `verified`
  (with the gateway `referenceId`), `failed` (deterministic not-settled, with a
  stable reason), `unavailable` (deterministic upstream failure) and
  `unknown_result` (ambiguous, e.g. timeout/abort).
- The **provider call is strictly outside any database transaction**, matching
  ADR-0017's placement rule and keeping HTTP out of short DB transactions.
- Verify-phase Zarinpal semantics: `code: 100` + `ref_id` = first settlement;
  `code: 101` + `ref_id` = already-verified repeat (idempotent success). A
  settlement-shaped `100/101` *without* `ref_id` claims payment but cannot prove
  it — the port returns `unknown_result`, never `failed`, so it cannot be recorded
  as a definitive FAILED. `5xx`/pre-response transport failures are
  `unavailable`, timeout/abort is `unknown_result`.
- `failed` is only ever a deterministic gateway answer that the transaction was
  not settled. Ambiguous doesn't mean failed; it means "check again before
  concluding".

### The successful-purchase transaction

On `verified` the system runs one short `SERIALIZABLE` transaction under the
**per-order `pg_advisory_xact_lock`** taken as its first statement (the same lock
used by order commands):

1. Re-reads the payment and order. Already `PAID` → idempotent replay, no side
   effects. Not `PENDING` → conflict (closed fail-safe; not resurrected).
2. Re-validates invariants **against the store**: `payment.amount ===
   order.grandTotal` else `409 PAYMENT_STATE_CONFLICT`; `payment.provider` must
   equal the configured provider and `payment.gatewayEnvironment` the configured
   mode, else `400 INVALID_REQUEST`.
3. Applies `Payment PENDING → PAID` (reason `GATEWAY_VERIFIED`, request ID
   recorded, `referenceId` persisted). `Payment PENDING_PAYMENT → PAID` (reason
   `PAYMENT_VERIFIED`) via the guarded state-machine helper.
4. `InventoryService.consumeReservationsForOrder` (idempotent): only `ACTIVE`
   reservations are consumed, each under its per-balance advisory lock; one
   ReservoirMovement `SALE` (negative quantity, before/after on-hand) and a
   `RESERVATION → CONSUMED` status per reservation, with
   `inventory.reservation.consumed` audits. `requestId` is required even though
   the actor is the system.
5. Creates a `Fulfillment` row for the order (unique `orderId`, default
   `PENDING`), reusing an existing one if already present.
6. Emits one deduplicated `PAYMENT_VERIFIED` outbox event
   (`deduplicationKey: payment-verified:<paymentId>`) plus the
   `payment.paid`/`order.paid` audit rows.

Outcome `VERIFIED` returns HTTP 200 with payment/order state, reference id,
consumed-reservation count and fulfillment id, so the gateway stops retrying.

### Replay and duplicate callbacks

- A callback for an already `PAID` payment (entry lookup **or** in-transaction
  re-read after the lock) returns `outcome: REPLAY` with no provider-verified side
  effects. Sequential and concurrent duplicates therefore coalesce into one
  settlement and one stock consume.
- Distinct settlement currently is exactly one event per payment; the
  `deduplicationKey` and the advisory lock together make concurrent duplicates
  atomic (the loser re-reads `PAID` and replays on retry).

### Failure, availability and reconciliation

- `failed` (provider or `NOK` intent) → short serializable transaction records
  `Payment PENDING → FAILED` (`gateway_not_paid`); no order, stock, fulfillment
  or outbox write. Ordered `NOT_PAID`.
- `unavailable` → HTTP 503 `UPSTREAM_UNAVAILABLE`; **nothing is persisted**, the
  payment stays `PENDING` and the gateway may retry the callback.
- `unknown_result` → the payment **stays `PENDING`** and **one** deduplicated
  `PAYMENT_VERIFICATION_UNCONFIRMED` outbox event
  (`payment-verification-unconfirmed:<paymentId>`)
  plus a `payment.verification.unconfirmed` audit row is written. Outcome
  `ACCEPTED_UNCONFIRMED`, HTTP 200. This is the reconciliation hook for an
  operator/dispatcher to re-query the gateway later — it is never a definitive
  FAILED and never a confirmed payment.
- Since an `unavailable` response persists nothing, a subsequent retry of the
  same callback still produces exactly one record of each kind.

### Settlement after a closed order

If the transaction re-reads the order as `CANCELLED` (a concurrent cancellation
or the reservation-expiry worker won the lock first), the financial truth is
still recorded — `Payment PENDING → PAID` with
`PAYMENT_VERIFIED_AFTER_CANCELLED` outbox event and a
`payment.paid.after-order-cancelled` audit — but **no stock is consumed and no
fulfillment is created** (the reservation may already be `RELEASED`). Outcome
`VERIFIED_AFTER_CANCELLED`, an explicit refund/reconciliation signal for
operations. The balance lock serializes against the expiry worker so stock is
never consumed twice.

### Concurrency and safety invariants

- Lock order is always `order` advisory lock first, then per-`balance` locks,
  matching cancellation/expiry, so no deadlock.
- No network call inside the transaction; no blind status overwrite; no double
  consumption; ambiguous provider outcomes never become definitive FAILED.
- Request IDs trace every read/write; audits are appended-only evidence.

## Consequences

- The callback contract now satisfies `FOUNDATION.md` §3 (server-side
  verification, idempotency) and closes the last "payment simulation" gap: no
  code path treats a browser redirect or `Status` query parameter as a paid order.
- Money/order/inventory/fulfillment move atomically or not at all.
- Reconciliation has two explicit event kinds to dispatch on:
  `PAYMENT_VERIFIED_AFTER_CANCELLED` (refund needed) and
  `PAYMENT_VERIFICATION_UNCONFIRMED` (re-query the gateway).

## Verification and rollback

Acceptance requires fake-provider verification tests; forged-authority and
wrong-amount/cross-environment rejection tests; sequential and **concurrent
duplicate callback** tests proving a single settlement and single stock consume;
**PostgreSQL concurrency** tests for verify-versus-cancellation and
verify-versus-expiry (no double consume, `VERIFIED_AFTER_CANCELLED`);
`unavailable`/`unknown_result`/`failed` persistence boundaries; OpenAPI drift
and the full protected local + CI suite. Roll back by removing the callback
route; payments remain append-only evidence.

## References

- `docs/FOUNDATION.md` §3 (Payments), ADR-0017 (provider foundation, verify-phase
  100/101 semantics), ADR-0006 (separate payment state machine), ADR-0014
  (financial policy), Epic-6 issue #141 (multi-provider routing — deferred).
