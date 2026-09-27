# Admin Inventory M2: balance, movement and stock-change operator flow (#319)

The `/inventory` Admin route reads raw, permissioned `/api/v1/inventory/balances`
and `/movements` responses. The two tables are independently server-paginated and
filter by exact warehouse, location and SKU variant IDs; the movement list also
filters by type. Links from warehouse/location and product-variant rows preserve
their exact IDs. There are no fixture balances or invented SKU/warehouse labels.

`inventory.read` is required to render either list. Only `inventory.adjust` can
open the stock-change dialog. The dialog uses the existing `POST /changes` service
for `RECEIPT`, `ADJUSTMENT_IN` and `ADJUSTMENT_OUT` only. It sends a positive or
negative integer delta according to the chosen type, requires a reason for manual
adjustments, sends the balance `expectedVersion` (zero for a new identity), and
keeps one random idempotency key for the lifetime of a form. It never writes
`InventoryBalance` directly. The backend remains authoritative for active
warehouse/location/SKU identity, permissions, version conflicts, negative stock,
transactional ledger/audit and replay. After an unknown network result the form
does not retry automatically; the operator must inspect both tables first.

The initial operator UI displays exact internal IDs because the inventory read
contracts do not project human-readable warehouse/location/SKU labels. Those IDs
are reachable through links from the Admin warehouse and product-detail screens.
This is truthful but less convenient than a searchable SKU/location picker; that
improvement remains a #261 follow-up if required for operational acceptance.

Verification target: adapter, validation, permission and view tests; Admin
lint/typecheck/coverage/build; E2E signs in, creates a real SKU/warehouse/location,
records a receipt and an adjustment, then observes changed balance and ledger
rows. #319 does not cover Reservation, Transfer or Stocktake UI, and does not
change schema, migrations, shared contracts or OpenAPI.
