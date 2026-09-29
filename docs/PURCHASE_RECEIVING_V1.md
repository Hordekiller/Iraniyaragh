# Purchase Receiving V1 — backend slice #343

Status: backend implementation in PR #344. This document describes its contract,
not a claim of live stock or production acceptance; the merge state is tracked
by the PR and `PROJECT_STATUS.md`.

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
operator screen follows in a separate PR. No real warehouse acceptance or
fixture-free sale follows from database tests alone.
