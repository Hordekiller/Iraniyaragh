# Commerce & Inventory Domain Guide

## Catalog
Recommended conceptual hierarchy:
- Product: merchandising/content identity
- ProductVariant / SKU: sellable unit
- Category
- Brand
- Attribute / option values
- Media
- SEO metadata

Historical orders should preserve snapshots of critical sale-time data rather than relying only on mutable product records.

## Pricing
Foundation should allow expansion toward:
- Base/reference price
- Sale price
- Time-bounded promotions
- Customer/wholesale price lists
- Campaign discounts
- Coupons
- Price history/audit

Pricing decisions belong to backend/domain services.

## Inventory
Core entities:
- Warehouse
- WarehouseLocation (zone/aisle/rack/shelf/bin)
- InventoryBalance
- InventoryMovement
- StockReservation
- StockTransfer
- Stocktake
- Supplier
- PurchaseOrder
- PurchaseReceipt

### Ledger principle
`InventoryMovement` is an immutable record of physical quantity change. Current balances are operational projections maintained transactionally, while the ledger provides traceability.

Typical movement types include:
- Purchase receipt
- Sale fulfillment
- Customer return
- Supplier return
- Transfer out / transfer in
- Positive/negative adjustment
- Damaged/write-off
- Stocktake correction

## Reservations
Checkout/order allocation reserves stock without pretending the goods physically left the warehouse.
Reservations require:
- SKU
- warehouse/location strategy
- quantity
- source/reference
- expiration/status

Expired/cancelled reservations release available stock. Fulfillment consumes the reservation with the corresponding physical movement.

Reservation writes are idempotent via an optional `idempotency-key` header (`StockReservation.idempotencyKey`); replaying the same key with the same payload returns the original reservation, while a conflicting payload is rejected. Expiry runs in a serializable transaction and makes each reservation expire exactly once, restoring `available` stock.

## Checkout runtime

The authenticated Checkout boundary exposes:

- `POST /api/v1/checkout/preview`: normalize/validate an inline delivery address,
  reprice the current Cart and issue 15-minute quotes from active
  database-configured `ShippingMethod` rows.
- `POST /api/v1/checkout`: accept the address, `shippingQuoteId` and a bounded
  `Idempotency-Key`; the client never supplies prices, discounts, shipping amount,
  availability or totals.

A quote is bound to the authenticated Customer, Cart id/version, normalized
address hash, Catalog subtotal, price-policy revision, shipping-method code/title,
policy revision and expiry. Checkout revalidates all of those facts. A stale,
foreign or consumed quote, or any changed shipping method/policy fact, fails closed.

Checkout then runs one PostgreSQL `SERIALIZABLE` transaction with bounded retry:

1. claim the hashed, operation-scoped idempotency key and fingerprint;
2. reload the Customer Cart and reprice active sellable variants;
3. allocate active warehouse/location balances deterministically by warehouse
   code, location code and stable id;
4. create all 15-minute Order-linked reservations or roll the whole transaction
   back;
5. persist immutable product/SKU/title/price/address/shipping-policy snapshots and
   stable line ordinals in a `DRAFT` Order;
6. append the attributed `DRAFT -> PENDING_PAYMENT` transition;
7. consume the quote, clear/version the Cart, write audit evidence and create one
   deduplicated `ORDER_CREATED` outbox row;
8. store the response for safe same-key/same-payload replay.

Public Checkout responses intentionally omit warehouse/location allocation and
internal idempotency fields. PostgreSQL checks enforce positive reservation and
Order-line quantities, balance consistency and exact Order/line money equations.

The outbox row is persistence only: dispatch/retry/DLQ/metrics remain a later
worker slice. Shipping methods also require an operational provisioning/Admin
flow before production; the repository does not guess a production shipping rate.
Order reads/Admin operations, expiry/cancellation compensation, Payment and
Fulfillment are separate downstream workflows.

Tax calculation and customer tax disclosure are not implemented by this slice.
ADR-0014 G4–G6 remain a hard gate before the first real sale; this Checkout runtime
must not be treated as production-sale acceptance until that financial-policy work
lands.

## Transfers
A transfer is a backend-controlled state machine. Implemented lifecycle:

`DRAFT -> REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED`

with explicit cancellation paths from `DRAFT`, `REQUESTED` and `APPROVED`.

### Transfer transition matrix

| Transition  | Allowed from            | Effect                                                                 |
| ----------- | ----------------------- | ---------------------------------------------------------------------- |
| request     | DRAFT                   | Requests approval                                                      |
| approve     | REQUESTED               | Approves the transfer                                                  |
| dispatch    | APPROVED                | Creates `TRANSFER_OUT` movements; requires `sourceLocationId` per item |
| receive     | IN_TRANSIT              | Creates `TRANSFER_IN` movements; requires `targetLocationId` per item  |
| cancel      | DRAFT / REQUESTED / APPROVED | Marks the transfer `CANCELLED`, no stock effect                        |

Invalid transitions and unknown transfer ids are rejected with `TRANSFER_STATE_CONFLICT` / `TRANSFER_NOT_FOUND`. Dispatching or receiving without the corresponding location on every item is rejected with `TRANSFER_ITEM_LOCATION_REQUIRED`. A transfer requires at least one item (`TRANSFER_NO_ITEMS`).

Once dispatched, source stock has physically moved; receiving creates the destination movement. Direct balance reassignment is never used. Dispatch and receive run in serializable transactions and re-check the stock identity at the item location before applying the movement, so concurrent dispatches cannot over-draw stock.

Every transfer exposes a nonnegative aggregate `version`. A transition may send
`expectedVersion`; a stale value fails with `TRANSFER_VERSION_CONFLICT` before any
ledger or balance side effect, and every successful transition increments the
aggregate version. This scalar never represents the versions of multiple inventory
balance rows; those rows remain protected by the serializable transaction and ledger
invariants.

Operator-created transfers are bounded to 100 items. SKU existence is validated
with one batched query at creation time; dispatch and receive remain transactional
and preserve one immutable ledger movement per item.

API surface is exposed through `inventory` endpoints; permission mapping is documented under Contracts & Permissions below.

## Inventory HTTP contracts
Exposed under `/api/v1/inventory` (staff-MFA authenticated routes).

| Endpoint                                            | Permission        | Purpose                                        |
| --------------------------------------------------- | ----------------- | ---------------------------------------------- |
| `GET /inventory/balances`                           | `inventory.read`  | Balance snapshots (SKU/warehouse/location)     |
| `GET /inventory/movements`                          | `inventory.read`  | Ledger movement history                        |
| `POST /inventory/changes`                           | `inventory.adjust`| Direct movement (receipt/adjustment)           |
| `GET/POST /inventory/warehouses`                    | read / adjust     | Warehouse list / create                        |
| `PATCH /inventory/warehouses/:id`                   | `inventory.adjust`| Warehouse update (incl. deactivate)            |
| `GET/POST /inventory/warehouses/:warehouseId/locations` | read / adjust  | Location list / create                         |
| `PATCH /inventory/locations/:id`                    | `inventory.adjust`| Location update (incl. deactivate)             |
| `GET/POST /inventory/reservations`                  | read / adjust     | Reservation list / reserve                     |
| `POST /inventory/reservations/:id/release`          | `inventory.adjust`| Release a reservation                          |
| `POST /inventory/reservations/:id/consume`          | `inventory.adjust`| Consume a reservation (sale movement)          |
| `GET/POST /inventory/transfers`                     | `inventory.transfer` | Transfer list / create                       |
| `GET /inventory/transfers/:id`                      | `inventory.transfer` | Transfer detail                              |
| `POST /inventory/transfers/:id/request`             | `inventory.transfer` | Request approval                              |
| `POST /inventory/transfers/:id/approve`             | `inventory.approve`  | Approve (approval separation)                 |
| `POST /inventory/transfers/:id/dispatch`            | `inventory.transfer` | Dispatch (source `TRANSFER_OUT`)              |
| `POST /inventory/transfers/:id/receive`             | `inventory.transfer` | Receive (target `TRANSFER_IN`)                |
| `POST /inventory/transfers/:id/cancel`              | `inventory.transfer` | Cancel                                        |

Permissions fail closed: a caller needs the exact permission listed; `inventory.read` alone never allows mutations, and acting on a transfer requires `inventory.transfer` while approval additionally requires `inventory.approve`.

Read and mutation contracts (including warehouse/location writes, adjustments,
reservations and transfer lifecycle requests) live in `packages/contracts`. Stable
errors include `WAREHOUSE_CODE_CONFLICT`, `LOCATION_CODE_CONFLICT`,
`TRANSFER_NOT_FOUND`, `TRANSFER_VERSION_CONFLICT`, `TRANSFER_STATE_CONFLICT`,
`TRANSFER_NO_ITEMS` and `TRANSFER_ITEM_LOCATION_REQUIRED`. Balance and movement list
responses include stable warehouse, location and variant identifiers for operator
clients. Movement timestamps are ISO 8601 strings, while persistence-only replay keys
such as `idempotencyKey` are never returned. The committed OpenAPI artifact describes
these projections, bounded filters and exact command bodies. Prisma models are never
exposed as public contracts.

## Stocktake
Stocktake should support:
- Full and cycle counts
- Freeze/snapshot strategy as required
- Count lines per SKU/location
- Difference review
- Approval
- Controlled adjustment movements
- Audit trail

## Purchase flow
Conceptual flow:
`PurchaseOrder -> Receipt -> InventoryMovement -> Supplier balance/accounting integration (future)`

Partial receipt must be supported.

## Order state machines
Do not use one overloaded status for everything.

Suggested conceptual separation:

Order lifecycle:
`DRAFT/PENDING -> CONFIRMED -> PROCESSING -> COMPLETED`
with explicit cancellation paths.

Payment lifecycle:
`UNPAID -> PENDING -> PAID -> PARTIALLY_REFUNDED -> REFUNDED`

Fulfillment lifecycle:
`UNFULFILLED -> ALLOCATED -> PICKING -> PACKED -> SHIPPED -> DELIVERED`

Exact enums can evolve, but state transitions must be explicit and backend-controlled.

## Returns
Design order/item history so future flows can support:
- Full/partial return
- Refund or store-credit policy
- Sellable return to stock
- Damaged/non-sellable return
- Return reason and audit trail
