# Admin Inventory M3: guarded manual reservations (#321)

The `/reservations` Admin route reads the existing raw, permissioned reservation
list and filters by exact warehouse/SKU IDs and status. It displays the linked
order when present but does not offer manual lifecycle controls for those rows.
Only `inventory.adjust` can create, release or consume an independent active
reservation; `inventory.read` may view the list. Expired rows offer no action.

Manual creation uses the existing balance version and one random idempotency
key per form, never supplies `orderId`, and does not retry an unknown network
result automatically. Before release/consume, the Admin fetches the exact
balance and submits its current version. A terminal status different from the
requested action is treated as a conflict. The API also rejects operator-supplied
`orderId` and any manual transition of order-linked or expired reservations, so
UI manipulation cannot bypass the order/payment/fulfillment state machines.
Order-scoped internal transitions and the expiry worker remain unchanged.

The read contract exposes exact IDs rather than display names; an Inventory
balance-row link pre-fills warehouse/location/SKU and version for manual create.
No fake reservations or direct balance writes are used. The operation remains a
manual warehouse action, not a customer checkout or paid-order workflow.

Verification target: API negative tests for order linkage and expiry, Admin
adapter/permission/form/lifecycle tests, full affected-package checks, and a
fixture-free browser journey that receipts stock then creates, releases and
consumes independent reservations. Transfer and Stocktake UI remain separate.
