# Admin Inventory M1: warehouses and locations (#317)

The `/warehouses` Admin route uses the existing `/api/v1/inventory` staff-MFA
endpoints and shared contracts. Inventory success responses are raw contract
bodies (not the `{ data }` envelope used by other Admin APIs). `inventory.read`
can list all warehouses and their locations with bounded server pagination,
including inactive rows.
`inventory.adjust` additionally permits create, edit and activation changes;
the backend remains the permission/audit authority. The Admin never edits
balances directly. Codes are immutable in the edit dialog and are unique per
warehouse/location scope on the server.

Both lists expose loading, empty, error/retry and read-only states. Mutations
disable submit during a request. After an ambiguous network failure the UI
does not retry automatically; the operator is told to inspect the list before
submitting again. Deactivation is explicit and warns that an inactive warehouse
or location cannot be used for new allocation. Before deactivation, operators
must inspect open reservations and stock manually; this slice does not provide
that cross-entity guard or a reconciliation dashboard.

Evidence: Admin adapter/permission/dialog/view tests and package typecheck/lint/
build/coverage pass; PR #318's nine exact-head CI checks passed, including the
browser journey that signs in and creates a real warehouse and location through
the running API on desktop and mobile.
This is **M1 only**. Balance, Movement,
Adjustment, Reservation and Transfer UI remain separate #261 slices; stocktake
belongs to #7. No schema, shared contract or OpenAPI change is made here.
