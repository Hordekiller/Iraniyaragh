# Cart, Checkout and Order Contract Proposal

Status: proposal for joint approval, not an accepted public contract
Date: 2026-09-10
Owner: Developer B (Product/Web/Admin)
Required reviewer: Developer A (Platform/API/Data/Operations)
Related handoff: `docs/HANDOFF_2026-09-10.md`

This proposal turns the five backend inputs in the handoff into a reviewable
contract boundary for Sprint 6 (`0.4`), without editing `packages/contracts`,
Prisma schema, migrations or API code. The backend remains the source of truth;
the current web fixture is only a consumer stub.

## Governing rules

- Persist and transport accounting amounts as integer IRR values. The frontend
  may display Toman, but it must not author authoritative totals.
- The server recalculates prices, shipping, discounts and totals from current
  catalog/customer policy. Client totals are hints only.
- SKU is the sellable inventory unit. Availability and reservation decisions are
  server-owned and location-aware.
- Order, payment and fulfillment state machines remain separate and backend-
  controlled.
- Every retriable command has stable machine-readable errors, request tracing,
  authorization, audit evidence and idempotency behavior where applicable.

## Proposed flow

1. The client reads catalog projections and maintains a temporary guest/account
   cart for optimistic UX.
2. The client submits a cart/order-draft request containing SKU IDs, quantities,
   address reference or address input, shipping method and an idempotency key.
3. The server loads authoritative prices and availability, validates the address,
   calculates shipping, creates a price snapshot and creates or reuses a draft.
4. The server creates reservations in the same business workflow according to the
   accepted allocation policy and returns the authoritative draft totals and
   expiration information.
5. The client displays the returned totals and price/availability changes. It does
   not send a trusted subtotal or total.
6. Confirmation moves the order through the backend order state machine. Payment
   remains a separate payment attempt and is not represented by a client-set order
   status.

## Decision 1: cart persistence, guest merge and expiry

### Proposed policy

- Authenticated cart: server-owned and keyed by customer principal.
- Guest cart: client-local until checkout; issue a server guest-cart token only
  when the backend needs cross-device or pre-login persistence.
- On customer login, merge by SKU ID using an explicit policy: keep the greater
  requested quantity only up to the allowed maximum, then reprice and recheck
  availability. Never silently duplicate lines.
- Expire abandoned guest carts and stale drafts after a documented TTL. Expiry
  must not create or retain an inventory reservation.
- A merge conflict must be returned as structured data so the UI can ask the user
  to resolve it instead of silently overwriting either cart.

### Required A decision

- Server cart on login versus client-only guest cart until checkout.
- Guest token lifetime, cart TTL, maximum line/quantity limits and merge rule.
- Whether reservation begins at draft creation or only at confirmation.

## Decision 2: order draft, server pricing and reservation

### Proposed request shape (illustrative, not yet public)

```ts
type CreateOrderDraftRequest = {
  items: Array<{ skuId: string; quantity: number }>;
  addressId?: string;
  address?: AddressInput;
  shippingMethodId?: string;
  clientRevision?: string;
};
```

Transport the idempotency key in the standard request header, not as a trusted
business field in the JSON body. The response should include:

```ts
type OrderDraft = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PENDING';
  items: Array<{
    skuId: string;
    quantity: number;
    unitPrice: Money;
    lineTotal: Money;
    productSnapshot: ProductSnapshot;
  }>;
  subtotal: Money;
  shipping: Money;
  discount: Money;
  total: Money;
  priceRevision: string;
  reservationExpiresAt?: string;
  address: AddressSnapshot;
  warnings: Array<'PRICE_CHANGED' | 'AVAILABILITY_CHANGED' | 'SHIPPING_CHANGED'>;
};
```

The exact DTO names and public location are A-owned. `Money` must use the existing
IRR contract and string amount representation, not JavaScript accounting numbers.

### Required A decision

- Whether draft creation reserves inventory, and the reservation TTL.
- Allocation across locations and partial-availability policy.
- Whether a price revision mismatch rejects or recalculates the draft.
- Which product, price, customer and address snapshots are retained for history.

## Decision 3: Iranian address and contact policy

### Proposed minimum

- Province: canonical server enum/reference, with stable code plus Persian label.
- City: normalized string constrained by server policy.
- Postal code: exactly 10 digits after Persian/Arabic-Indic normalization; reject
  all-zero values.
- Mobile: canonical Iranian format after accepting `09`, `+98` and `0098` input.
- Address text: normalized and length-bounded; preserve the historical snapshot on
  the order rather than reading a mutable customer address later.
- Address owner access must be checked server-side; clients cannot submit another
  customer's address ID.

### Required A decision

- Address entity versus immutable inline checkout address.
- Canonical province/city source and whether city codes are required.
- Required recipient fields, length limits and delivery-area restrictions.
- Whether mobile belongs to the customer, recipient, or both.

## Decision 4: shipping quote authority

### Proposed policy

- Shipping method and quote are server-owned. The client may request a method and
  display the returned quote, but cannot set `shippingRials` authoritatively.
- A quote should carry `quoteId`, method, amount, currency, geography/policy
  revision and expiration. The order draft stores the accepted quote snapshot.
- The server revalidates the quote when the draft is confirmed. Expired or changed
  quotes return a stable conflict requiring the user to review totals again.
- Free-shipping thresholds are policy configuration, not frontend constants.

### Required A decision

- Initial methods and supported geography.
- Shipping calculator owner and quote TTL.
- Whether shipping is calculated by province/city, postal prefix, weight, value,
  warehouse or an external provider.

## Decision 5: idempotency and error contract

### Proposed policy

- Client sends a unique idempotency key per user-intended command in the standard
  idempotency header.
- Server stores the request fingerprint and resulting response for a bounded
  retention period. Same key plus same fingerprint returns the original result;
  same key with a different fingerprint returns `IDEMPOTENCY_CONFLICT`.
- Payment initiation, callback verification, refund and order-draft creation each
  have independent idempotency scopes.
- Response errors retain the repository envelope: stable `code`, Persian-safe
  human message, HTTP status and `requestId`. Expected checkout conflicts include
  price change, insufficient stock, expired reservation, invalid address, expired
  shipping quote and order state conflict.

### Required A decision

- Header name and idempotency retention/fingerprint policy.
- Which commands are idempotent and their scope keys.
- Whether draft retries return an existing draft or a new version.

## Decision 6: payment boundary for the next slice

Payment is intentionally not implemented by this proposal. Before Sprint 8 (`0.5`),
A must select a provider/sandbox and define initiation, signed callback, server
verification, duplicate callback behavior, refund and reconciliation. The web
client will consume a redirect/result contract and must never mark an order paid
from a client callback or URL alone.

## Acceptance matrix for the contract PR

| Concern | Required evidence before approval |
| --- | --- |
| Behavior | Guest/cart merge, draft, reprice, reservation and quote scenarios |
| Authorization | Customer ownership, staff permissions and address access deny tests |
| Validation | Persian digits, invalid postal/mobile, quantity limits and malformed IDs |
| Money | Server totals use integer IRR and reject client manipulation |
| Concurrency | Duplicate draft, reservation race and idempotency fingerprint tests |
| Audit | Draft/confirm/cancel/reserve actions carry actor, request and reference IDs |
| Contract | OpenAPI plus shared DTO/error review; no Prisma model exposure |
| Observability | Structured conflict/idempotency/reservation logs without PII/secrets |
| Migration | Schema impact, forward migration and rollback/forward-fix plan |
| UX | Loading, changed-total, stock conflict, retry and expired-quote states |

## Intentionally deferred

- No changes to shared contracts or backend persistence are authorized by this
  proposal alone.
- No client-side total, localStorage idempotency key or fixture payment can be
  promoted as production behavior.
- Promotions, coupons, multi-seller rules, advanced shipping providers and
  cross-device guest identity remain outside the first `0.4` slice unless the
  team explicitly re-estimates scope.
