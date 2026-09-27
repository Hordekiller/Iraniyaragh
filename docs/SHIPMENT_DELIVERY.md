# Manual shipment delivery confirmation — #312

This slice is an explicit staff attestation, not automatic verification by a
carrier. The shipping provider is still manual-first. A staff user must check
a carrier receipt or equivalent external proof before entering its reference.

`POST /api/v1/orders/admin/:id/shipment/deliver` requires staff MFA,
`shipments.manage`, an `Idempotency-Key`, and a restricted ASCII
`proofReference` of 4–100 characters. The command accepts only an order with
an existing dispatched shipment and `SHIPPED` Fulfillment. Under the same
order-level advisory lock used by dispatch, one serializable transaction
appends the `SHIPPED → DELIVERED` Fulfillment transition with the reference,
records the actor/request/audit event, and stores a replayable response. A
second confirmation with a different key is rejected; concurrent retries with
the same key return the original response. There is no client-provided time:
`confirmedAt` is the database transition timestamp, not necessarily the time
the carrier physically handed over the package.

Customer-owned order detail exposes the updated delivery state and event time;
Admin shows the same state and offers a proof-reference form. Existing
FulfillmentTransition history provides the append-only event, so this slice
does not introduce a redundant table or migration.

Still open: carrier webhook/provider verification, external customer
notification delivery, and a fixture-free staging purchase through tracking.
No live-sale readiness follows from this command alone.
