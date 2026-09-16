# ADR-0015: Server Cart and Checkout Contract

- Status: Accepted
- Date: 2026-09-16
- Scope: V1 commerce slice (`C1`, `C2`, `O1`)
- Owners: Platform/API and Web/Admin
- Supersedes: open decisions in `docs/CONTRACT_PROPOSALS/cart-checkout-order.md`

## Context

The catalog and inventory HTTP foundations are merged, while storefront cart,
checkout and order flows remain fixture-backed. Implementation must not promote
browser state or client totals to business truth. The existing schema and
`docs/COMMERCE_WAVE_DESIGN.md` already require server pricing, atomic allocation,
immutable order snapshots and idempotent commands.

## Decisions

### Cart ownership and limits

- Authenticated carts are server-owned and keyed by customer ID.
- Guests receive an opaque, random cart token with a 24-hour idle TTL. The token
  carries no customer identity and is never accepted as an authorization proof.
- A cart contains only `variantId` and requested integer `quantity`; prices,
  discounts, stock and totals from clients are ignored.
- Maximum quantity per line is 99 and maximum distinct lines is 100. The service
  enforces these limits independently of DTO validation.
- Login merge is explicit: equal variants are merged, capped at 99; conflicts
  and capped lines are returned as structured warnings. Neither cart is silently
  discarded.
- Cart mutations use `Idempotency-Key` and a canonical payload fingerprint.

### Pricing, availability and reservation

- Every cart read returns a server-calculated quote with a monotonic cart version
  and price-policy revision. A quote is informational and is not payment proof.
- Checkout accepts variant IDs, quantities, an inline delivery address or a
  customer-owned address ID, and a requested shipping method. It never accepts
  client subtotal, total, stock, discount or shipping amount.
- Prices are integer IRR values using the existing `Money` contract. The server
  recalculates every line and total on checkout.
- Reservation starts only inside checkout after repricing and allocation; adding
  to a cart never reserves stock. Reservation TTL is 15 minutes, bounded by
  server configuration and persisted as `expiresAt`.
- Allocation considers active locations in deterministic priority order, then
  available quantity and stable location ID. Partial allocation is rejected;
  checkout commits no reservation when any line cannot be fully allocated.

### Address and shipping

- V1 checkout accepts an immutable inline address snapshot. Saved addresses may
  be added later, but an `addressId` must belong to the authenticated customer.
- Required fields are province code, city, address text, 10-digit normalized
  postal code, recipient name and Iranian mobile. Persian/Arabic-Indic digits
  are normalized server-side; all-zero postal codes are rejected.
- Shipping is exposed through a server-owned quote port. V1 uses configured
  methods and rates (no provider-specific contract); each quote has a random
  `quoteId`, policy revision and 15-minute expiry. Expired or changed quotes
  return `SHIPPING_QUOTE_CHANGED` and require repricing.

### Checkout and order

Checkout executes in one serializable workflow:

1. authenticate customer or validate the guest-checkout policy;
2. load and validate the cart;
3. validate address and shipping quote;
4. reprice and allocate every line;
5. create reservations;
6. create one order in `PENDING_PAYMENT` with immutable product, SKU, price,
   address, shipping and tax snapshots;
7. persist an outbox record and mark/clear the cart only after commit.

The order, payment and fulfillment state machines remain separate. A failed
checkout transaction leaves no committed reservation or partial order.

### Idempotency and errors

- Header name is exactly `Idempotency-Key`; it is never accepted as a business
  field in JSON and is never returned in public responses.
- Keys are scoped by actor (or guest token), command and route. The server stores
  a SHA-256 fingerprint of canonical JSON plus normalized route/query values for
  24 hours. Same key and same fingerprint replay the original response; a
  different fingerprint returns `IDEMPOTENCY_CONFLICT` without side effects.
- Draft/checkout creation has a separate scope from cart mutations and payment.
  A repeated checkout key returns the original order and reservation result.
- Stable checkout conflict codes include `SKU_NOT_FOUND`, `INVALID_REQUEST`,
  `INSUFFICIENT_STOCK`, `QUOTE_CHANGED`, `SHIPPING_QUOTE_CHANGED`,
  `RESERVATION_EXPIRED`, `ORDER_STATE_CONFLICT` and `IDEMPOTENCY_CONFLICT`.
  Responses use the repository error envelope with `requestId`.

## Consequences

- Web/Admin can implement against a stable contract without inventing totals or
  stock behavior.
- Guest persistence is bounded and unlinkable until an explicit login merge.
- Reservation pressure is limited to checkout and expiry worker capacity.
- Shipping rates remain configurable without coupling V1 to a provider.
- Saved-address management and advanced promotions are intentionally deferred.

## Required verification before runtime merge

- Authorization and ownership denial for customer/cart/address operations.
- Tampered-money, invalid quantity/address and stale-quote failure tests.
- Duplicate and conflicting idempotency tests, including concurrent checkout.
- Atomic rollback proving no partial reservation/order remains on failure.
- PostgreSQL migration/constraint review, OpenAPI and shared-contract parity.
- Audit entries for cart merge, checkout, reservation and order creation without
  logging token, address, mobile or payment-sensitive data.
