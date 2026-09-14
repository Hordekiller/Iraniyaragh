# Commerce Wave Design: Inventory → Cart/Checkout → Orders → Payments

Status: proposed implementation baseline  
Owner: Platform/API + Product/Web/Admin  
Reviewed: 2026-09-14

This document turns the foundation rules and the V1 master plan into an
implementation-ready design for the next commerce waves. It is the contract for
breaking work into issues and PRs; it does not claim that any item below is
already delivered.

## 1. Current reality and boundary

The repository is a NestJS modular monolith with PostgreSQL/Prisma, Redis/BullMQ
available for coordination and jobs, and typed contracts in
`packages/contracts`. The catalog API is the prerequisite source of sellable
SKUs. The inventory service already has transactional on-hand changes,
reservations, serializable retries, audit calls and PostgreSQL integration tests,
but it has no protected HTTP controller, operator workflows or transfer service.

The persistence schema already contains `Warehouse`, `WarehouseLocation`,
`InventoryBalance`, immutable `InventoryMovement`, `StockReservation`,
`StockTransfer`, `Order`, `OrderItem`, `Payment`, and separate transition tables.
`OrdersModule` and `PaymentsModule` are currently empty modules. Web/admin order
screens are fixtures/read-only and are not backend capability. Cart and payment
flows in the storefront are also fixture-only. No production claim may be made
until a live API journey proves the behavior below.

The delivery order is intentionally dependency-driven:

```text
catalog publish + price/media
        ↓
inventory HTTP + allocation/reservation
        ↓
server-priced cart + checkout/order draft
        ↓
verified payment + fulfillment reservation consumption
        ↓
outbox/notifications/reconciliation
```

Do not introduce a microservice or a second source of truth. Domain rules remain
in application services; controllers and clients only validate/route/represent.

## 2. Non-negotiable invariants

### Money, time and identity

- Persist all amounts as integer Rial `BIGINT`; never calculate accounting values
  with JavaScript floating point. Every amount has an explicit currency/unit in
  the public contract.
- Store timestamps in UTC. Jalali formatting is presentation only.
- IDs are opaque. Public DTOs never expose Prisma records or internal cost data.
- Order item title, SKU, unit price, discount allocation and tax/shipping inputs
  are immutable sale-time snapshots.

### Inventory

- SKU is the atomic stock unit and every physical mutation creates exactly one
  immutable `InventoryMovement` with before/after evidence, actor, request and
  business reference.
- `available = onHand - reserved`; neither may become negative. The client never
  computes authoritative balances.
- All balance/reservation/consumption/release/expiry operations run in a database
  transaction at serializable isolation (or an explicitly reviewed equivalent).
- Manual adjustments require a reason, permission and audit event. No destructive
  ledger edits or direct balance writes are exposed.
- Reservation is not a physical sale. Consumption creates the sale movement;
  release/expiry restores availability exactly once.

### Orders and payments

- Order, payment and fulfillment are independent state machines. A field from one
  lifecycle cannot be used to infer or mutate another.
- Clients submit commands, never arbitrary state values. Every transition is
  checked against an allowlist and recorded in the append-only transition table.
- Checkout and all external callbacks are idempotent. Same key + same payload
  replays the original result; same key + different payload returns a stable
  conflict without a second effect.
- Gateway/browser claims are untrusted. The server calculates the payable amount,
  verifies provider evidence and only then marks payment/order state.

## 3. Capability map and exit evidence

| Wave | Backend capability | Client capability | Exit evidence |
| --- | --- | --- | --- |
| Inventory I1 | warehouses/locations, balance/movement reads, receipt/adjustment commands | permission-aware admin screens | one authorized receipt and adjustment, exact ledger + audit |
| Inventory I2 | reservations, expiry worker, transfers and allocation policy | reservation/transfer/operator exception UI | concurrent reserve/expire/transfer tests; no negative/duplicate effects |
| Selling C1 | persistent/guest cart, server repricing, address ownership | live cart and address book | tampered totals ignored; cart conflict UX |
| Selling C2 | checkout orchestration and idempotent order draft | accessible checkout/confirmation | double submit creates ≤1 order/reservation; snapshots stable |
| Orders O1 | customer/admin reads and guarded commands | history/detail/admin queue | illegal transition rejected; permission/audit evidence |
| Orders O2 | cancellation timeout compensation and outbox | timeline/action recovery | cancellation reconciles reservation and all side effects |
| Payments P1 | provider port, initiation, callback verification | redirect/result/retry | forged/wrong-amount/duplicate callback has zero extra financial effect |
| Payments P2 | refund and reconciliation commands, shipment boundary | admin evidence and customer status | duplicate/refund-limit/reconciliation tests and operator runbook |

An exit is not satisfied by schema presence, fixture tests or a green UI build.
It requires the API, database, contract, authorization, failure-path and
integration evidence listed for the slice.

## 4. Inventory design

### Commands and reads

Protected endpoints should be versioned under `/api/v1` and use permissions,
not role-name checks:

- `POST /admin/warehouses`, `PATCH /admin/warehouses/:id`, and location CRUD:
  idempotent where retried, archive/deactivate instead of destructive delete.
- `GET /admin/inventory/balances` and `/movements`: bounded filters, stable
  pagination, safe projections, no unbounded export.
- `POST /admin/inventory/receipts` and `/adjustments`: command DTO includes SKU,
  warehouse/location, integer delta, reason/reference and `Idempotency-Key`.
- `POST /admin/reservations/:id/release|consume` and operator read endpoints;
  expiry is worker-owned, not a browser action.
- Transfer commands: create/request/approve/dispatch/receive/cancel, each with
  an allowed predecessor state and idempotency key.

The service must resolve and verify active warehouse/location/SKU ownership in
the transaction. A stale `version` returns `INVENTORY_VERSION_CONFLICT`; missing
references return `NOT_FOUND`; insufficient availability returns
`INSUFFICIENT_STOCK` (409). Error envelopes include request ID and never expose
SQL or internal identifiers beyond the public resource ID.

### Allocation, reservations and transfers

The initial policy is explicit and deterministic: allocate from active locations
in configured priority order, then by available quantity and stable location ID.
If no allocation satisfies the complete order, checkout fails atomically; no
partial reservation is left. Backorders are out of scope until a separate ADR.

Reservation TTL is configuration, bounded and recorded as `expiresAt`; the server
clock is authoritative. A batch worker claims due active rows, then each row is
re-read and released in its own serializable transaction. Re-running a job is
safe because terminal status is checked inside the transaction.

Transfers use source → in-transit → destination movements:

```text
DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
                    ↘ CANCELLED (only before dispatch)
```

Dispatch decrements source on-hand and records `TRANSFER_OUT`; receive records
`TRANSFER_IN` at the destination. There is no direct balance reassignment.
Partial receive, damaged quantity and cancellation after dispatch require an
explicit policy before implementation.

### Inventory security and audit

`inventory.read`, `inventory.adjust`, `inventory.transfer` and a separately
reviewed approval permission are enforced in the API. Every command records
actor, request ID, reason, reference, before/after balance and safe metadata.
Audit payloads cannot contain secrets or raw customer data. Rate-limit mutation
endpoints and protect exports with permission, maximum rows and expiry.

## 5. Cart and checkout design

### Cart ownership and representation

Use a server cart for authenticated customers and a signed/opaque guest cart
identifier with a bounded TTL. A login merge is an explicit command with a
deterministic policy (same SKU lines merge, quantity is capped, conflicts are
reported); it must not overwrite a customer's cart silently. Cart rows contain
SKU and requested quantity only. Client-submitted prices, discounts, stock and
totals are advisory and discarded.

Cart commands: add, set quantity, remove, clear and merge. Each mutation is
validated against active sellability and maximum quantity. Reads return a
server-calculated quote with a quote/version token, but the quote is never a
payment authorization.

### Repricing and checkout transaction

The checkout command performs, in order:

1. authenticate customer (or validate guest checkout policy) and load cart;
2. validate a customer-owned address and shipping option;
3. calculate price, discount, shipping and grand total using current server
   policy and integer arithmetic;
4. allocate and reserve every line at the selected warehouse/location;
5. create one order with immutable snapshots and `PENDING_PAYMENT` state;
6. create fulfillment placeholder and an idempotency/outbox record in the same
   transaction; clear or mark the cart only after commit.

Price/stock drift returns a structured `QUOTE_CHANGED` or `INSUFFICIENT_STOCK`
response containing a fresh quote. A retry with the same checkout key replays
the order; a changed payload conflicts. A failed transaction releases nothing
because no reservation is committed.

Addresses are customer-owned, normalized and validated for Iranian mobile/postal
formats, province/city consistency and length limits. Never log full address or
phone; admin visibility is permission-scoped and redacted in analytics.

## 6. Order service and state machines

The current schema has compact enums (`DRAFT`, `PENDING_PAYMENT`, `PAID`,
`CANCELLED`, `RETURNED`; payment and fulfillment enums are separate). Before
adding states, publish a contract/ADR that maps business policy to persistence;
do not silently rename existing values or edit shared migrations.

Initial guarded transitions:

```text
Order:       DRAFT → PENDING_PAYMENT → PAID → PROCESSING → COMPLETED
             PENDING_PAYMENT → CANCELLED
             PAID/PROCESSING → CANCELLED only by policy + compensation

Payment:     PENDING → PAID | FAILED | CANCELLED
             PAID → PARTIALLY_REFUNDED → REFUNDED

Fulfillment: PENDING → PROCESSING → READY_TO_SHIP → SHIPPED → DELIVERED
             PROCESSING/READY_TO_SHIP → CANCELLED (policy)
```

Each transition command checks current state using compare-and-swap, writes one
transition row with actor/reason/request ID and emits an outbox event after the
transaction commits. Customer reads are limited to their own orders; admin
reads/actions require `orders.read` / `orders.manage`. Order history is never
hard-deleted. Cancellation must release active reservations or consume/refund
according to the exact current state, exactly once.

## 7. Payment and fulfillment design

### Provider boundary

Define a vendor-neutral `PaymentProvider` port with `initiate`, `verify`,
`parseCallback`, `refund` and `reconcile`. Store provider, authority/reference,
amount and safe raw-response metadata with retention limits. Secrets come only
from environment/secret manager.

The browser return endpoint is informational. The server callback verifies
signature/authenticity, provider authority, order ID, currency and exact amount;
then performs a serializable/idempotent state transition. Unknown/time-out
results remain `PENDING` and enter reconciliation, never auto-success.

Refund commands enforce paid/remaining amount, provider reference and
`payments.refund` permission. A duplicate refund key replays; a conflicting key
or amount returns `PAYMENT_STATE_CONFLICT`. Manual reconciliation is an audited
operator command and cannot forge provider verification.

### Fulfillment, shipping and notifications

Shipment/package/tracking is a separate resource linked to fulfillment. Consuming
reservations and writing `SALE` movements happens at the agreed fulfillment
milestone, not when a browser sees “paid”. Shipping provider failures do not
rewrite payment state. Notifications use a transactional outbox and BullMQ:
bounded retries, exponential delay, dedupe key, dead-letter queue and a redacted
replay tool. SMS consent and provider outage behavior follow the SMS operations
ADR.

## 8. Cross-cutting security, reliability and observability

- Every write has authentication, fine-grained permission, request ID, validation,
  rate limit and audit evidence. Browser UI guards are supplementary only.
- Idempotency records bind actor/scope, route, normalized payload hash and result;
  raw keys are not logged. Retention/expiry must never permit a second effect for
  an already committed business command.
- Serializable conflicts retry only a bounded number of times, then return a
  stable retryable conflict. Deadlocks, queue retries and provider callbacks are
  tested as failure paths.
- Logs are structured and redact tokens, OTPs, payment secrets, full addresses,
  phone/email and gateway payloads. Metrics include reservation conflicts,
  checkout conversion/failures, payment unknowns, callback duplicates, queue
  depth/DLQ, ledger imbalance and reconciliation age.
- Readiness must include required dependencies; liveness must remain independent
  of the database. Alerts have owners, thresholds and runbooks.
- Feature flags gate live checkout/payment separately from fixture mode. A flag
  cannot bypass authorization or invariants.

## 9. Required contract/error set

Before implementation, add shared stable codes (names may be adjusted only by
contract review):

`SKU_NOT_FOUND`, `WAREHOUSE_NOT_FOUND`, `LOCATION_NOT_FOUND`,
`INSUFFICIENT_STOCK`, `INVENTORY_VERSION_CONFLICT`, `RESERVATION_NOT_FOUND`,
`RESERVATION_EXPIRED`, `RESERVATION_STATE_CONFLICT`, `QUOTE_CHANGED`,
`CART_NOT_FOUND`, `CART_ITEM_LIMIT`, `ORDER_STATE_CONFLICT`,
`PAYMENT_STATE_CONFLICT`, `PAYMENT_VERIFICATION_FAILED`,
`PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_UPSTREAM_UNAVAILABLE`,
`FULFILLMENT_STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT` and `FORBIDDEN`.

Every code gets HTTP status, safe message, retryability, OpenAPI schema and
client mapping. Do not duplicate enums in web/admin/api.

## 10. Verification matrix

### Unit and contract

- transition allow/deny matrix for all three lifecycles;
- integer money boundaries, rounding, shipping and quote drift;
- cart ownership/merge/quantity limits and DTO validation;
- idempotency same/conflicting payload, actor isolation and redaction;
- payment signature, wrong amount/order, duplicate/reordered callback;
- OpenAPI artifact drift and generated contracts.

### PostgreSQL integration/concurrency

- receipt/adjustment/reservation/expiry/consume races;
- scarce-stock parallel checkout: one succeeds, others get conflict;
- transfer dispatch/receive rollback and exactly-once movements;
- checkout rollback leaves no order, reservation or outbox record;
- duplicate callback/refund and concurrent transition CAS;
- migration deploy, constraints, drift and restore rehearsal.

### E2E and operations

Anonymous browse → live cart → address → repriced checkout → payment sandbox →
admin processing → shipment/tracking, plus expired reservation, price change,
stock conflict, forged callback, retry, cancellation and permission-denied paths.
Run desktop/mobile RTL accessibility, load/query-count checks, queue DLQ replay,
backup restore and rollback drills before enabling production flags.

## 11. Decisions required before coding

1. Guest checkout and cart merge policy; cart TTL and maximum quantities.
2. Warehouse allocation priority, reservation TTL and payment-to-consumption
   milestone; backorder policy is explicitly off unless approved.
3. Shipping methods, geography, quote ownership and failure behavior.
4. Exact order/payment/fulfillment transition policy, cancellation windows and
   compensation/refund rules.
5. Payment gateway sandbox, callback verification, settlement and refund policy.
6. Notification consent/templates and SMS outage/retry policy.
7. Return/partial fulfillment behavior and whether partial shipments are V1.

Each decision that changes a foundation invariant requires an ADR before schema
or public-contract implementation.

## 12. Issue/PR execution sequence

1. **Contract PR:** shared errors, DTOs, state transition matrices, permission
   map and OpenAPI; no UI implementation against an unaccepted contract.
2. **Inventory HTTP PR:** controllers, warehouse/location reads, receipt/
   adjustment commands, auth/audit/idempotency and tests.
3. **Inventory allocation PR:** reservation worker, transfer service, migration
   if needed, race/rollback tests and operator UI.
4. **Cart/checkout PR:** cart/address persistence, repricing, reservation
   orchestration, order snapshots and idempotent checkout integration.
5. **Orders PR:** guarded customer/admin reads and commands, compensation,
   outbox and state-machine integration.
6. **Payments PR:** fake provider first, sandbox adapter, callback verification,
   reconciliation/refund and security tests.
7. **Fulfillment/notification PR:** shipment lifecycle, reservation consumption,
   outbox workers, DLQ/replay and customer/admin journeys.
8. **Integrated beta PR:** remove production fixture paths, run full E2E/UAT,
   update `PROJECT_STATUS.md`, runbooks and release gates.

Every PR must state affected invariants, migration/rollback plan, permission and
audit evidence, idempotency/concurrency evidence, and exact commands run.
