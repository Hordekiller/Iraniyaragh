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

#356 adds a shipment-scoped staff read surface so an operator can answer
"what went out, to where, under which tracking code" without reading every
order. `GET /api/v1/shipments/admin` and `GET /api/v1/shipments/admin/:id`
require an MFA-authenticated staff user with `shipments.read` — a different
grant from `shipments.manage`, so read-only staff can observe logistics without
being able to dispatch. The list is filterable by status, carrier, tracking
code, dispatch date range and allowlisted sort, with page/perPage pagination.

Every list and detail field is derived from persisted shipment, order, address
and actor rows; the API never invents or backfills shipment facts. Customer
identity, destination address and the dispatching staff member are masked with
the same helpers as the order read model, so a shipment read never widens PII
exposure beyond what `orders.read` staff already see. Dispatch and delivery
remain the only shipment mutations in this slice, and both still require
`shipments.manage`; the read endpoints are append-only projections.

The Admin `/shipments` page is a live read-only consumer of that contract: it
reuses the shared server-mode table with permission-gated navigation, so a user
without `shipments.read` sees an explicit forbidden state and issues no request.
It deliberately offers no dispatch, delivery, editing or bulk action, and
directs the operator to the order page for those commands.

#312 separately adds staff-attested delivery confirmation with a proof
reference. Direct carrier verification and essential notification delivery
remain open. Neither is implied by SHIPPED or by a persisted outbox effect.
Staging acceptance still requires a real, fixture-free purchase, a real
carrier tracking code, and observed customer tracking.
