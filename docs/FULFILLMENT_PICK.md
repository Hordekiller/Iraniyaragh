# Fulfillment item-pick proof

This is the scoped fulfillment slice after #305. Shipment, carrier handoff,
tracking and notification delivery are separate work. A pick proof is an
operator attestation that the complete ordered quantity of one immutable
`OrderItem` was physically gathered; it is **not** an inventory movement.
Payment settlement has already consumed the reservation and recorded the sale
movement. Picking must never debit stock a second time.

## Commands and invariants

- `GET /api/v1/orders/admin/:id/fulfillment/picks` requires staff MFA and
  `orders.read`. It returns every order item (up to the checkout maximum of
  100 lines), exact ordered quantity and any recorded proof.
- `POST /api/v1/orders/admin/:id/fulfillment/items/:itemId/pick` requires
  staff MFA, `orders.manage`, `Idempotency-Key` and body `{ "quantity": n }`.
  The quantity must equal the order-line snapshot exactly; partial picking is
  not accepted in this first operational slice.
- The order must remain `PAID`, have a settled payment, be `PROCESSING`, and
  all of its stock reservations must be `CONSUMED`. The order-scoped advisory
  lock and serializable transaction serialize picking with other order work.
- Exactly one proof exists per item. The proof stores the actor, request ID,
  timestamp and exact quantity. A same-key retry replays the durable response;
  changed payload/actor or a new key for an already-picked item conflicts.
- `READY_TO_SHIP` is rejected until every order item has a proof. The state
  transition, proof, audit and replay record are separate durable records.
- PostgreSQL enforces positive quantity and checks that a proof belongs to the
  same order as its Fulfillment and matches the ordered quantity. A forward
  migration adds these constraints without rewriting existing migrations.

The Admin order-detail page exposes start, per-item pick and ready commands
only to staff with `orders.manage`; other staff retain read-only evidence.
It preserves an idempotency key across an ambiguous retry. This slice does not
claim a shipment, carrier acceptance, customer notification or staging sale.
