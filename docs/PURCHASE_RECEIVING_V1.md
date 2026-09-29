# Purchase Receiving V1 — backend slice #343

Status: backend merged in PR #344 at `3a60f8c` with green final-head CI.
Admin operator integration is in unmerged #345. This document describes its
contract, not a claim of live warehouse or production acceptance.

`POST /api/v1/purchase-orders/:id/receipts` is staff-MFA-only with the dedicated
`purchasing.receive` permission. The payload requires `expectedVersion`, an
external supplier delivery reference and 1–100 `(variantId, locationId, quantity)`
lines. An `Idempotency-Key` is mandatory. A repeated actor/scope/key/payload
returns the original receipt; the same key with a different payload conflicts.
`GET /api/v1/purchase-orders/:id/receipts` requires `purchasing.read` and is
paginated. Read responses include the receipt's actor, UTC timestamp and exact
movement ID for each line. No update/delete receipt endpoint exists.

Only an `APPROVED` or `PARTIALLY_RECEIVED` purchase order may be received.
Each line must match a PO SKU and an active location in that PO's active
warehouse. The sum per SKU cannot exceed its remaining ordered quantity. One
serializable transaction writes the receipt, one `RECEIPT` inventory movement
per line, updated on-hand/available balance, incremented PO received quantity,
new PO state/version and audit evidence. Locks are acquired for the PO and
balance keys; lines are sorted by location/SKU to make lock order stable.
`RECEIVED` means all PO lines have reached ordered quantity, otherwise the
order is `PARTIALLY_RECEIVED`. A failed line rolls back the whole receipt.

This is physical goods receipt, not a supplier invoice, supplier payment,
customer sale, generic inventory adjustment or return. The Admin receipt
operator screen is the separate #345 slice. It uses a PO-scoped active-location
selector under `purchasing.read`, submits with `purchasing.receive`, and displays
persisted receipt number, external reference, actor/time and movement IDs. The
operator must refresh after an uncertain network result; it must not blindly
retry the receipt. No real warehouse acceptance or
fixture-free sale follows from database tests alone.
