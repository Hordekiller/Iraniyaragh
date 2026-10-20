# ADR-0033: Internal order-expiry identity and transactional attribution

Status: Proposed — implementation candidate; independent review pending

Date: 2026-10-17

Issue: #450. Depends on #454's locked deadline/payment evidence checks.

## Context

The existing order-expiry command requires a tracked human User. No scheduled
invocation exists in the reviewed source. A background job must not select an
administrator, manufacture a privileged account or accept a principal from queue
data. ADR-0006's User foreign keys remain nullable; ADR-0018 already records
system-originated payment transitions and stock consumption without a human User.
An unqualified null actor, however, does not identify which maintenance command
performed a release.

## Internal command contract

- `OrderCommandService.expireAbandonedOrdersAsSystem(requestId, options)` is an
  internal application-service entry point. It has no HTTP controller, shared
  public API contract, customer input or staff permission bypass.
- The implementation supplies the fixed `systemActor` identifier
  `order-reservation-expiry` and `actorId: null`. The caller can supply only a
  bounded correlation ID and internal batch/clock options, never an actor.
  Correlation IDs contain 1–128 ASCII letters, digits, dots, underscores, colons
  or hyphens, starting with a letter or digit. Errors do not echo invalid input.
- A future scheduler must generate correlation IDs from its own trusted job/run
  identifiers and use the server clock. It must not deserialize identity, an
  order-selection predicate or a caller-provided deadline from queue payloads.
- Existing human cancellation, inventory and expiry methods still require their
  tracked actor. Passing null with a forged system flag through those methods
  fails before database access. Current HTTP authentication, MFA, permissions,
  CSRF and rate limits are unchanged.

## Financial and inventory invariants

Both entry points use the same bounded candidate selection and existing
Serializable per-order lock/transaction. Only a currently overdue
PENDING_PAYMENT order with **zero Payment rows** is eligible. Any attempted
payment, regardless of historical status, remains outside automatic expiry and
requires the existing explicit reconciliation/cancellation process.

The narrow internal inventory entry point is called within that order transaction
and lock. It reuses the existing balance locks, active-reservation rechecks,
balance/version updates and per-reservation audit writes. Physical on-hand stock
and the immutable stock movement history are not changed by releasing a hold.
Manual release retains its existing actor requirement; its API is not widened
to accept optional actors.

## Durable evidence and failure behavior

- The append-only OrderTransition retains reason `RESERVATION_EXPIRED`, null
  User actor and a per-order correlation ID.
- `order.expired` audit metadata records `systemActor` plus the transition ID.
  Each `inventory.reservation.released` audit records that same system identity,
  the order ID and the same per-order correlation ID. No customer details or
  provider data enter this identity envelope.
- The order transition, all releases/audits and the single deduplicated
  ORDER_EXPIRED outbox event remain one atomic transaction. Audit failure aborts
  all changes. Competing callers and replay use the existing domain protections;
  successful queue completion is not financial or delivery evidence.
- No schema migration, synthetic User, permission grant or change to legacy
  audit records is needed. Null historical human actors are not relabelled as
  this system identity.

## Verification and activation boundary

Coverage added: invalid/oversized correlation input; forged flags rejected on
human methods; deadline/payment guards on the system path; real PostgreSQL
multi-reservation attribution and unchanged on-hand; two concurrent callers;
service-instance replay; preservation of a pending payment; rollback at both
inventory and order audit failure points. Results must be recorded separately;
test definitions are not passing evidence.

This slice does **not** register a BullMQ scheduler, change runtime configuration
or enable a production sweeper. #450 stays open for bounded scheduling, safe
retry/dead-letter and poison-order handling, attempted-payment reconciliation,
#81's resource gate, independent review, deployment and real restart/stock-release
acceptance. No provider calls or new customer messages are added here.

Rollback before activation: remove the unused internal entry points. No data
rewrite or migration rollback is required. After future activation, stop the
scheduled job through its reviewed control; committed history must be preserved.
