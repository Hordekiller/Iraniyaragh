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

## Transfers
A transfer is a state machine. Suggested lifecycle:
`DRAFT -> APPROVED -> DISPATCHED -> RECEIVED`
with cancellation rules depending on state.

Once dispatched, source stock has physically moved; receiving should create destination movement. Avoid direct balance reassignment.

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
