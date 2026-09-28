# Admin Inventory M4: transfer operator flow (#326)

The `/transfers` Admin route uses the existing raw, permissioned Transfer API.
It offers a server-paginated status/source/target list, full detail, and a draft
creation form with 1–100 explicit SKU lines. The form requires distinct warehouse
IDs and source/target location IDs for each line so dispatch/receive can produce
physical movements. The API remains authoritative for active identities,
location ownership, available source stock and concurrency.

`inventory.transfer` is required for list/detail/create/request/dispatch/receive/
cancel. Approval additionally needs the separate `inventory.approve` permission;
the Admin hides approval without it and the API enforces it. The UI exposes only
state-valid commands: `DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED`,
with cancel limited to pre-dispatch states. Before a command it re-reads detail,
checks status/version and confirms physical effects. The command carries the
aggregate `expectedVersion` and a random idempotency key for that action. An
unknown network result is never automatically retried; the operator must inspect
transfer, balance and ledger first. No UI writes balances directly.

Warehouse and SKU links prefill exact IDs. The current public transfer contract
does not include human-readable warehouse/location/SKU names, so the UI shows
copyable IDs rather than invented labels. The first production operator
acceptance should determine whether searchable pickers are necessary.

Verification target: adapter, permission, validation, stale-version and
unknown-result tests; Admin lint/typecheck/coverage/build; desktop/mobile E2E
creates real SKU/two warehouses/locations, receives source stock, moves one unit
through request/approve/dispatch/receive and verifies destination balance and
ledger. Stocktake remains planned; this slice changes no schema/migration/
shared contract/OpenAPI.
