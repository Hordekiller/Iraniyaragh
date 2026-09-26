# Shipment dispatch — #310

This is the manual-first, one-package-per-order V1 shipping slice. It does not
connect a carrier API, confirm delivery, or send an external notification.

An MFA-authenticated staff user with `shipments.manage` sends
`POST /api/v1/orders/admin/:id/shipment/dispatch` with an `Idempotency-Key`
and `{ "carrier": "post", "trackingCode": "PKG-1234" }`. Carrier and tracking
code are restricted to short printable ASCII identifiers; no arbitrary URL is
accepted. The order must be PAID with a settled payment, every reservation
consumed, fulfillment READY_TO_SHIP, every line exactly picked, a delivery
address snapshot, and no existing shipment. The command locks the order and
atomically writes a single shipment, all exact-quantity shipment lines, a
READY_TO_SHIP → SHIPPED transition, audit evidence and a durable replay result.
Duplicate carrier/tracking pairs and a second shipment are rejected. The
database also rejects cross-order or incorrect-quantity shipment lines.

The customer-owned order detail and permissioned Admin order detail expose the
carrier, tracking code and dispatch timestamp. Customer access is still scoped
by the order owner, so one customer cannot retrieve another customer's
tracking. Staff with `shipments.manage` can dispatch from Admin; read access
uses the existing `orders.read`-guarded order detail. In this MVP policy the
shipment covers the whole order; partial packages and carrier-provided events
are not represented.

Next separate slices: verified/idempotent delivery confirmation and essential
notification delivery. Neither is implied by SHIPPED or by a persisted outbox
effect. Staging acceptance still requires a real, fixture-free purchase, a
real carrier tracking code, and observed customer tracking.
