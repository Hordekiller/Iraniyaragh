# Purchase Order API — first G7-02 slice (#339)

The #339 backend slice provides draft, review, approval and cancellation of
purchase orders. The subsequent #341 slice adds an Admin operator flow and a
permission-scoped selector endpoint. Both slices are merged. Neither receives
goods or increases stock; Receiving is tracked separately in #343 and
`PURCHASE_RECEIVING_V1.md`.

## Contract and lifecycle

- `GET /api/v1/purchase-orders`, `GET /api/v1/purchase-orders/:id` and
  `GET /api/v1/purchase-orders/:id/history` require staff MFA and
  `purchasing.read`.
- `GET /api/v1/purchase-orders/options?kind=supplier|warehouse|variant` also
  requires `purchasing.read`. Search, offset and limit are validated and
  bounded; only currently active references are returned. An operator does not
  need broad catalog or inventory read access just to select PO references.
- `POST /api/v1/purchase-orders` creates a server-numbered `DRAFT` from an
  active supplier, warehouse and 1–100 active SKUs. Supplier/warehouse identity
  is immutable after creation. The SKU snapshot is rechecked on approval.
- `PATCH /api/v1/purchase-orders/:id` replaces draft lines and/or edits the
  expected date and note. It requires `purchasing.manage` and `expectedVersion`.
  Approved lines and costs are immutable. Changes after approval are refused.
- `POST /api/v1/purchase-orders/:id/approve` requires a separate
  `purchasing.approve` permission, fresh staff MFA and `expectedVersion`.
  `DRAFT → APPROVED` is the only approval transition. There is no unstated
  monetary threshold or automatic approval.
- `POST /api/v1/purchase-orders/:id/cancel` requires `purchasing.manage` and
  `expectedVersion`; it allows only an unreceived DRAFT or APPROVED order.
  Already received quantities prevent a false full cancellation. Partially
  received order handling belongs to Receiving.
- Every write requires an `Idempotency-Key`, 8–96 ASCII letters/digits/`_`/`-`.
  A same-actor/scope/key/payload replay returns the committed result; different
  payload under the same key conflicts. Concurrent writes use serializable
  transactions and optimistic versions. Lifecycle events are audited without
  duplicating costs/notes in audit metadata.
- `unitCost`, `lineCost` and `totalCost` are decimal **integer IRR strings** in
  public contracts. Service arithmetic uses `BigInt`; floating-point and
  64-bit overflow are rejected. A PO does not itself create an inventory
  movement or represent payment to a supplier.

Only an existing system-admin role gets new purchasing permission grants from
the forward migration. Other staff roles need deliberate grant/review.

The Admin `/purchase-orders` route lists and filters real records, shows line
and audit details, and supports draft creation/editing, separate approval and
unreceived cancellation according to the three purchasing permissions. It
submits integer IRR strings and stable command keys; after an ambiguous network
failure it asks for refresh/inspection before another write. It does not show
an option to receive stock or claim that an approved PO changed inventory.

## Exit evidence and limit

API tests cover authorization declarations, DTOs, same-key replay, changed-key
conflict, duplicate/overflow lines, inactive supplier/SKU, version races,
approval, received-order cancellation denial, immutable approved lines, audit
history and zero stock movement on PO creation. A fresh `_test` PostgreSQL
database must pass migration and schema-drift checks. The #341 Admin change
also needs option visibility, read-only/mutation separation and desktop/mobile
browser evidence. Partial-receipt inventory reconciliation belongs to #343;
Admin receipt entry remains a subsequent UI slice.
