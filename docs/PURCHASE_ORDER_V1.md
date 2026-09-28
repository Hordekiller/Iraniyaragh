# Purchase Order API — first G7-02 slice (#339)

This backend slice provides draft, review, approval and cancellation of purchase
orders. It does **not** receive goods, increase stock, add an Admin PO route or
close #7. Receiving and its exact inventory-ledger reconciliation are separate
reviewed slices after the operator PO flow.

## Contract and lifecycle

- `GET /api/v1/purchase-orders`, `GET /api/v1/purchase-orders/:id` and
  `GET /api/v1/purchase-orders/:id/history` require staff MFA and
  `purchasing.read`.
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

## Exit evidence and limit

API tests cover authorization declarations, DTOs, same-key replay, changed-key
conflict, duplicate/overflow lines, inactive supplier/SKU, version races,
approval, received-order cancellation denial, immutable approved lines, audit
history and zero stock movement on PO creation. A fresh `_test` PostgreSQL
database must pass migration and schema-drift checks. Admin PO route and actual
partial-receipt inventory reconciliation remain open.
