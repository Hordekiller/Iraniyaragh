# Automatic order-expiry eligibility — #450

Implementation candidate; independent review and acceptance remain required.
This extends the payment uncertainty boundaries in ADR-0017/0018 without
activating a scheduler or changing explicit customer/staff cancellation.

## Eligibility and transaction contract

The automatic command may cancel an order only when all three facts hold under
the existing per-order advisory lock and serializable transaction:

1. Current order status is `PENDING_PAYMENT`.
2. Current `reservationExpiresAt` is at or before the captured sweep time.
3. There is no associated Payment record.

Candidate selection applies the same no-attempt restriction before its bounded
page, so older orders awaiting payment reconciliation cannot occupy every page
and starve eligible abandoned checkouts. The locked read rechecks the deadline
and at most one payment ID; it does not load provider secrets or customer PII.
Payment registration and verification already use the same order lock.

This is deliberately conservative: an attempt row can mean an in-flight call,
accepted authorization, unknown response or historical misclassified failure.
Even terminal attempts are left to the existing explicit reconciliation and
cancellation paths; this candidate does not invent an automatic final-failure
policy. Holds for attempted payments are a remaining operational dependency,
not a successful automatic release or an excuse to overwrite financial facts.

For an eligible order, the existing transition, tracked inventory release,
individual stock audit and deduplicated expiry outbox remain atomic. An aborted
transaction commits none of them. `expired` counts committed order transitions,
not the quantity or number of reservations; replay returns zero.

## Compatibility and remaining scope

ADR-0018's late-payment compensation remains required for explicit cancellations
and historical cancelled orders. A newly attempted payment must not be cancelled
by the automatic sweeper merely because its original stock deadline passed.
Expiry is never payment failure, settlement or refund evidence. No provider call,
new payment, inventory SQL repair or synthetic actor is introduced here.

The older integration assumption that automatic expiry cancels an order with an
existing pending payment is superseded by #450's explicit uncertainty requirement.
Coverage must retain the late-settlement/no-double-consume assertions after an
explicit authorized cancellation, and separately prove that automatic expiry
preserves a pending attempt until authoritative verification.

#450 stays OPEN for trusted system identity, bounded durable maintenance wiring,
reconciliation of attempted orders and live stock-release/restart acceptance.
#81/#451 cover inventory batching; #453 covers the Web deadline/recovery guard.
No API/schema, provider configuration or VPS deployment change is part of this
source slice. Green tests alone do not activate it.
