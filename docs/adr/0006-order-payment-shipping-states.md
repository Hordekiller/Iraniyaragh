# ADR-0006: Identity Boundary and Separate Order, Payment and Fulfillment State Machines

Status: Accepted

Date: 2026-08-31

## Context

Issue #14 asks for two related decisions before the baseline commerce migration:

1. Resolve the overlapping `User(CUSTOMER)` vs `Customer` identity/profile ownership.
2. Specify separate Order, Payment and Fulfillment transition models and their
   explicit transitions and prohibited paths.

`FOUNDATION.md` §3 mandates that order state is controlled by a state machine, that
clients may request commands but not assign arbitrary states, and that financial
state and fulfillment state must not be collapsed into one field. The current
schema only carries a single-column `OrderStatus` and a single-column
`PaymentStatus`; there is no independent fulfillment model and no append-only
history of how each aggregate reached its current state. `ADR-0005` already settles
the identity side of the boundary; this ADR formalizes it and specifies the state
lifecycle model.

## Decision

### 1. Identity boundary (aligns with ADR-0005)

- `User` is the sole security principal for staff and customer authentication and
  authorization. Its primary key is an opaque Prisma CUID stored as `String`.
- `Customer` remains a commerce profile, not a second authentication principal.
- Ownership/linkage between `User` and `Customer` is **not** inferred implicitly:
  - do not join by matching mobile numbers;
  - do not authorize customer orders from a caller-supplied customer or user ID;
  - do not add an implicit one-to-one foreign key in unrelated feature work.
- A forward migration and a dedicated contract PR define user/customer linkage,
  merge and privacy/anonymization rules when the product requires them. Until then,
  mobile/email uniqueness is enforced independently for each model.

### 2. Three independent lifecycle state machines

Order, Payment (financial) and Fulfillment (physical) lifecycles are modeled as
separate aggregates with distinct statuses:

- **Order** continues to use `OrderStatus` (commercial/order lifecycle).
- **Payment** continues to use `PaymentStatus` (financial lifecycle).
- **Fulfillment** is introduced as a new aggregate with `FulfillmentStatus`
  (packing/shipping/delivery lifecycle), linked one-to-one to an order.

The three machines may advance together or independently. For example a paid order
may be in fulfillment `PROCESSING` before a second, partial payment is settled, or
an order may be `CANCELLED` in the order machine while its contactless payment is
still `PENDING` awaiting a callback.

### 3. Append-only transition history with audit actor

Each lifecycle keeps an **append-only, immutable** transition table:

- `OrderTransition` — history for `Order`;
- `PaymentTransition` — history for `Payment`;
- `FulfillmentTransition` — history for `Fulfillment`.

Every transition row records:

- `from` and `to` statuses (the `from` of the first row of an aggregate is `NULL`
  only for the initial creation event);
- `reason` (free-text or stable command code);
- `actorId` referencing `User` with `onDelete: SetNull`, preserving the actor
  reference as `NULL` if the user is deleted (consistent with `AuditLog`);
- `requestId` (correlation ID) when available;
- `createdAt` timestamp.

The single-column status field on each aggregate (`Order.status`,
`Payment.status`, `Fulfillment.status`) is kept as the denormalized **current
state**; the transition tables are the authoritative history and satisfy the
audit-actor requirement.

### 4. Explicit transitions and prohibited paths

Transitions are enforced in the service/domain layer by a shared guarded
transition map (see `apps/api/src/common/state-machine.ts`), not by clients.

Order (`OrderStatus`):

```
DRAFT -> PENDING_PAYMENT (checkout completed)
DRAFT -> CANCELLED (customer/operator abandons cart/order before checkout)
PENDING_PAYMENT -> PAID (order cleared to proceed)
PENDING_PAYMENT -> CANCELLED (customer/operator cancel before payment)
other states -> CANCELLED via a verified return (order machine terminal)
PROHIBITED: PAID -> PENDING_PAYMENT (no backwards money-path move),
            any transition into/out of a terminal state (CANCELLED/RETURNED).
```

Note: the packing/shipping/delivery progression (`PROCESSING ->
READY_TO_SHIP -> SHIPPED -> DELIVERED`) belongs to the **Fulfillment**
machine below, not to `OrderStatus`. The order machine only tracks the
commercial lifecycle; physical progress is the Fulfillment aggregate.

Payment (`PaymentStatus`):

```
PENDING -> PAID | FAILED | CANCELLED
PAID -> REFUNDED | PARTIALLY_REFUNDED
CANCELLED/FAILED -> PENDING (retry via a new payment attempt or explicit reset)
PROHIBITED: PAID -> PENDING, REFUNDED -> PAID, FAILED -> PAID without a new attempt.
```

Fulfillment (`FulfillmentStatus`):

```
PENDING -> PROCESSING -> READY_TO_SHIP -> SHIPPED -> DELIVERED
PENDING/PROCESSING -> CANCELLED (fulfillment not started / operator cancel)
DELIVERED -> RETURNED
PROHIBITED: SHIPPED -> READY_TO_SHIP, DELIVERED -> SHIPPED, CANCELLED -> any.
```

### 5. Payment attempts and callbacks

- Payment attempts remain separate rows from orders (`Payment` already references
  `Order`).
- External callbacks are verified server-side and are idempotent; duplicate
  callbacks never create duplicate financial effects (reuses `idempotencyKey`).
- A payment state change always appends a `PaymentTransition` row and, when it
  crosses a monetary boundary, an `AuditLog` entry.

## Alternatives considered

- **Single aggregated status field per order.** Rejected: it collapses financial
  and physical meaning into one field, violating `FOUNDATION.md` §3 and making
  administrative cancellation/compensation ambiguous.
- **In-memory/event-sourced state without persistence tables.** Rejected: it
  cannot reconstruct history or satisfy the audit-actor requirement.
- **A generic polymorphic transition table.** Rejected: it weakens referential
  integrity and typing for order/payment/fulfillment and is harder to verify.

## Consequences

- Order, payment and fulfillment can progress independently, matching real Iranian
  retail flows where payment may be settled before or after dispatch.
- Every state change is reconstructible and attributable to an actor and request.
- The service layer owns transition legality; the database keeps the toString
  state and constraints but does not enforce the full transition graph client-side
  (transition legality remains application logic).
- The schema gains a new `Fulfillment` model, `FulfillmentStatus` enum and three
  transitions tables, provided as a forward migration (the existing
  `20260830180000_auth_rbac_persistence` migration is not edited).

## Migration plan

1. Land this ADR (docs-only PR).
2. Land the Prisma schema change as a contract-first PR with a forward migration
   and SQL `CHECK` tests against a clean PostgreSQL database.
3. Land the shared `state-machine.ts` helper and its unit tests.
4. Issue #16 (baseline migration + deterministic seed) proceeds once this and
   #13's money ADR are accepted.

## Verification

- `prisma validate`, `prisma generate`, `prisma migrate deploy`, and
  `prisma migrate diff --exit-code` reports no drift.
- `psql` constraint/transition tests against a clean database.
- API lint, typecheck, unit tests and build pass.
