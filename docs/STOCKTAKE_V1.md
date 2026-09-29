# Stocktake V1 — slice #347

Status: merged in PR (pending) with CI gates green. This document captures the
contract to ensure counting stays blind, the scope is pinned, and applying a
count produces exactly one immutable ledger effect per changed line.

## State machine

The lifecycle is `DRAFT → COUNTING → REVIEW → COMPLETED`, with `CANCELLED`
available from any non-terminal state except `COMPLETED`. No edits to lines
are allowed after completion, and a completed stocktake may not be cancelled.

## Permissions

- `stocktake.read` — list and view stocktakes and the count sheet
- `stocktake.manage` — create and cancel stocktakes
- `stocktake.count` — open the sheet, record counts and submit for review
- `stocktake.approve` — approve the count and post ledger movements

## Creation and scope

- `POST /api/v1/stocktakes` (staff-MFA-only, requires `stocktake.manage`) with
  `Idempotency-Key` creates a `DRAFT`. Required body: `warehouseId`. Optional:
  `scopeType` (`WAREHOUSE` | `LOCATIONS` | `VARIANTS`, default `WAREHOUSE`),
  `locationIds` (max 500, required when `LOCATIONS`), `variantIds` (max 2000,
  required when `VARIANTS`) and `notes` (max 500).
- The scope and its ids are **pinned at creation time** and stored in the
  stocktake record. The count sheet later is materialized from this pinned
  scope; it never widens or narrows after creation.
- Only active warehouse/locations and active product variants (variant and its
  product both `ACTIVE`) may be included.

## Counting is blind by design

- A principal **without `stocktake.approve`** is never serialized `expectedQty`
  or `difference` on any line. The API strips those fields for such callers.
- `difference` remains `null` until the line has been counted. `expectedQty` is
  never returned to counters.
- This is intentional: the physical count must not be anchored on the system
  number. The sheet is prepared by starting counting, but the recorded count is
  the operator's measurement.

## Workflow

1. `POST /api/v1/stocktakes/:id/start` (`stocktake.count`) moves `DRAFT → COUNTING`,
   sets `startedAt`, `countedById`, increments `version` and **materializes the
   count sheet** from live `InventoryBalance` at the moment of starting. Lines are
   inserted for every balance within the pinned scope that has `onHand > 0` or
   `reserved > 0` (to surface reserved stock that must be accounted for). Each
   line captures `expectedQty = onHand` as a snapshot of the ledger seen by the
   counter.
2. `POST /api/v1/stocktakes/:id/counts` (`stocktake.count`) records physical
   counts for one or more lines. For each submitted line the system sets
   `countedQty`, `countedAt`, `countedById`, `notes` and computes
   `difference = countedQty - expectedQty`. Duplicate (location, variant)
   entries in the same request are rejected; lines outside the sheet are
   rejected. Status may remain `COUNTING` or move to `REVIEW` later — the
   action itself does not force status change.
3. `POST /api/v1/stocktakes/:id/submit` (`stocktake.count`) moves
   `COUNTING → REVIEW` after at least some counts exist (all lines are required
   before approval, enforced at approval time). Sets `submittedAt`.
4. `POST /api/v1/stocktakes/:id/approve` (`stocktake.approve`, staff-MFA-only)
   moves `REVIEW → COMPLETED`. Preconditions: all lines have `countedQty` not
   `null`; no line may have `countedQty < reservedQty` (current balance reserved
   for that (warehouse,location,variant)); counted quantities must not exceed
   integer range. For every line whose `countedQty !== beforeOnHand`, exactly
   one `InventoryMovement` of type `STOCKTAKE` is created with
   `quantity = countedQty - beforeOnHand`, `beforeOnHand`, `afterOnHand = countedQty`
   and `referenceType = 'StocktakeItem'`. The balance is written to
   `onHand = countedQty` with `available = countedQty - reserved` and version
   incremented. Each `StocktakeItem` gets `movementId` when a movement was
   created (a zero-difference line produces no movement). Locks are acquired
   for the stocktake session and for each affected balance key; operations run
   with serializable transactions and idempotent command records. Sets
   `completedAt` and `approvedById`.
5. `POST /api/v1/stocktakes/:id/cancel` (`stocktake.manage`) cancels from
   `DRAFT`, `COUNTING` or `REVIEW` (not from `COMPLETED` or `CANCELLED`). Sets
   `cancelledAt`.

## Ledger and invariants

- `STOCKTAKE` is a movement type in the immutable inventory ledger. The
  movement's `referenceId` points to the `StocktakeItem` so reconciliation is
  one movement per physical adjustment effect.
- A line that matches the system number produces **no movement**. This avoids
  noise while still recording the verified count.
- Approving rejects the entire stocktake if `countedQty < reservedQty` for any
  line. Available can never become negative as a result of approval.
- `expectedQty` is a snapshot at `start`; `difference` is an audit figure
  (only exposed to approvers). The applied movement always uses the live balance
  at approval time (with per-balance advisory locks) to avoid TOCTOU.

## Read models

- `GET /api/v1/stocktakes` paginated, filterable by `status`, `warehouseId`.
- `GET /api/v1/stocktakes/:id` returns the stocktake header and full sheet with
  the blind field set stripped for non-approvers.
- `GET /api/v1/stocktakes/:id/history` returns audit events for the stocktake.
- `GET /api/v1/stocktakes/locations` and `/variants` are helper selectors scoped
  to active entities.

## Idempotency and concurrency

Every mutating endpoint requires an `Idempotency-Key`. The `StocktakeCommandRecord`
stores `(actorId, scope, keyHash, payloadHash, response)` and replays the stored
response on exact key+payload reuse. Advisory locks guard the stocktake session
and each balance key. Command execution retries up to 3 times on `P2034`
(serialization failure) with exponential backoff.

## Scope notes (V1)

- Damaged/quarantine quantities are explicitly **out of scope** for this slice.
- The sheet is built from known ledger balances. Discovering physical inventory
  with no balance in the ledger is a follow-up.
- Counting must remain blind for non-approvers. UI must never reveal
  `expectedQty` or `difference` to users lacking `stocktake.approve`.
