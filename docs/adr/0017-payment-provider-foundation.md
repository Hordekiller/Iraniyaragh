# ADR-0017: Payment Provider Foundation — Zarinpal-First, Vendor-Neutral Port

- Status: Accepted (Epic-6 slice, PR pending)
- Date: 2026-09-24
- Scope: V1 payment initiation foundation (`P1`)
- Owners: Platform/API (contract + boundary + adapter) and Web/Admin (client slices)

## Context

Checkout creates one `PENDING_PAYMENT` order with an authoritative `grandTotal`
(integer Rial) and a transactional outbox row, but no payment provider exists.
`FOUNDATION.md` §3 requires payment attempts to be separate from orders, callbacks
to be verified server-side, and verification/refunds to be idempotent. Issue #141
plans multi-provider routing; this decision does **not** implement it.

For V1 exactly one production payment gateway is active. The project owner engaged
Zarinpal as the first gateway. The application boundary must not adopt Zarinpal's
SDK, wire model or redirect semantics as its own, because cashier/finance, billing
and future gateway choices are explicitly open.

## Decision

### Vendor-neutral application boundary (no provider SDK in domain)

- Payments expose a `PaymentProvider` port owned by the payments module. It is
  expressed entirely in project types (order identity, integer-Rial amount,
  correlation/idempotency context) and never imports a gateway SDK or gateway
  response model.
- The port's `authorize` result is a discriminated union: `redirect` (authority +
  redirect URL), `rejected` (deterministic gateway/short-bus rejection with a
  stable reason), `unavailable` (deterministic upstream failure) and
  `unknown_result` (ambiguous outcome, e.g. timeout/abort — the gateway may already
  have accepted the request and must never be blindly retried).
- Zarinpal is the single V1 adapter behind that port, selected by fixed provider
  name `zarinpal`. No multi-provider routing table is introduced (#141 remains open).

### Server-owned money

- The initiation command accepts **no amount**. The money boundary only ever reads
  `Order.grandTotal` on the server (integer Rial) and passes it to the gateway as a
  string. Frontend input is not a member of the payment contract.
- Client-provided authority and payment-state are never trusted; the browser is a
  redirector only, never the payment authority. Follow-up callback verification will
  re-check provider state server-side.

### Safe registration before provider call

- A payment attempt is persisted **before** the provider is contacted:
  1. A short SERIALIZABLE transaction (bounded retry, per-order
     `pg_advisory_xact_lock`) loads the order, enforces ownership and
     `PENDING_PAYMENT`, enforces idempotency (hashed key + payload fingerprint),
     governs "one active `PENDING` payment per order", and inserts the `Payment`
     row with status `PENDING`, provider, server `amount`, `idempotencyKey`
     (hash), `idempotencyFingerprint`, `correlationId` (request/HTTP trace) and
     `gatewayEnvironment` (sandbox or live).
  2. The row is committed. Then, **outside any database transaction**, the
     gateway port is called with a bounded timeout.
  3. Gateway outcomes are persisted as the only post-call step: redirect writes
     the `authority`; every other outcome writes one immutable
     `PaymentTransition` (`PENDING → FAILED`) with the reason and request ID.
     `unknown_result` is persisted as a distinct failure reason (`unconfirmed`)
     so reconciliation can distinguish it and no automatic retry occurs.
- Idempotent replay: the same hashed idempotency key and payload fingerprint
  returns the stored initiation outcome; a different payload under the same key is
  `IDEMPOTENCY_CONFLICT`.

### Sandbox/live separation

- `PAYMENT_PROVIDER_MODE` is explicit and fail-closed: `development`/`test` default
  to `sandbox`; `staging`/`production` require `live`, a real
  `ZARINPAL_MERCHANT_ID` and a bounded `ZARINPAL_TIMEOUT_MS`. The adapter uses
  distinct sandbox vs live base URLs and the persisted `gatewayEnvironment`
  records which one served each attempt. Secrets live in injected environment /
  secret manager only.
- Zarinpal v4 REST endpoints: sandbox request
  `https://sandbox.zarinpal.com/pg/v4/payment/request.json`, live request
  `https://payment.zarinpal.com/pg/v4/payment/request.json`, redirect
  `https://<env host>/pg/StartPay/{authority}`. The sandbox never moves money,
  accepts any UUID merchant id (development default
  `07f088c1-ee9b-4905-9077-b211439d1e33`), and returns `S`-prefixed authorities;
  the live host is only reachable with a provisioned merchant.
- Request payload matches the official v4 schema: `merchant_id` (36 chars),
  `amount` (integer Rial), `currency` (`IRR`), `description`, `callback_url`,
  `metadata.order_id`. A `code: 100` with a non-empty `authority` is the only
  proved redirect; the live/sandbox trust boundary relies on the persisted
  `gatewayEnvironment`, never on the authority prefix.
- Callback (verification implemented in ADR-0018, not this ADR): Zarinpal redirects the buyer
  to `callback_url` with `Authority` and a `Status` query parameter that is exactly
  `OK` (paid) or `NOK` (failed/cancelled). Verify is `POST
  https://payment.zarinpal.com/pg/v4/payment/verify.json` with
  `{ merchant_id, amount, authority }` and returns `code: 100` + `ref_id` on first
  success; every later verify of the same transaction returns `code: 101`, which
  therefore means *already verified successfully* — the verification slice must
  treat verify-phase `101` as success (idempotent verify), never as a credential
  failure.

### API surface

- `POST /api/v1/orders/:id/pay` (Customer OTP, ownership-scoped,
  `Idempotency-Key` header) is the only initiation endpoint in this slice. It
  returns the server-issued redirect (`paymentId`, `status: PENDING`, `amount`,
  `provider`, `authority`, `redirectUrl`) and never fabricates a `PAID` state;
  success/verification is a separate later slice.

## Consequences

- Zarinpal can be introduced without vendor effects on Order/Audit/OpenAPI contracts.
- A 5xx/timeout never leaves the system guessing: attempts are durable and
  label-able as `unconfirmed` for operator reconciliation.
- One active pending payment per order and idempotent replays prevent duplicate
  financial requests.
- Live credentials and callback origin are private operator provisioning, not
  repository data.

## Verification and rollback

Acceptance requires fake-provider, timeout/abort, 4xx/5xx, malformed and
ambiguous-result tests; ownership/state-conflict/idempotency tests; proof that the
provider call happens strictly after the attempt is committed; server-only amount
tests; OpenAPI drift; and the full protected CI suite.

Rollback removes the `pay` route and provider wiring; `Payment` rows remain
append-only evidence and are never deleted.

## References

- `docs/FOUNDATION.md` §3 (Payments), ADR-0006 (separate payment state machine),
  ADR-0011 (vendor-neutral provider port pattern), ADR-0014 (financial policy),
  issue #141 (multi-provider routing — deferred).