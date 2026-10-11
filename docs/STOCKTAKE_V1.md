# Stocktake V1 — slice #347

Scope: recovered implementation for #347 and acceptance contract #352. Release
and live operator acceptance are recorded separately; this document does not
claim CI, deployment or physical-count acceptance. It captures the
contract to ensure counting stays blind, the scope is pinned, and applying a
count produces exactly one immutable ledger effect per changed line.

## State machine

The lifecycle is `DRAFT → COUNTING → REVIEW → COMPLETED`, with `CANCELLED`
available from any non-terminal state except `COMPLETED`. No edits to lines
are allowed after completion, and a completed stocktake may not be cancelled.

## Permissions

- `stocktake.read` — list and view stocktakes and the count sheet
- `stocktake.manage` — create, start, submit and cancel stocktakes
- `stocktake.count` — record physical counts while `COUNTING`
- `stocktake.approve` — review variances, approve and post ledger movements;
  approval requires fresh staff MFA

## Creation and scope

- `POST /api/v1/stocktakes` (staff-MFA-only, requires `stocktake.manage`) with
  `Idempotency-Key` creates a `DRAFT`. Required body: `warehouseId`. Optional:
  `scopeType` (`WAREHOUSE` | `LOCATIONS` | `VARIANTS`, default `WAREHOUSE`),
  `locationIds` (max 500, required when `LOCATIONS`), `variantIds` (max 2000,
  required when `VARIANTS`) and `notes` (max 500).
- The scope and its ids are **pinned at creation time** and stored in the
  stocktake record. The count sheet later is materialized from this pinned
  scope; it never widens or narrows after creation.
- Warehouse and explicitly selected locations must be active and locations must
  belong to that warehouse. Existing SKUs may be counted independently of their
  catalog status: unpublished/inactive products can still have physical stock.
- A count sheet is bounded to 500 known (location, SKU) balances. A larger scope
  rejects `start` with `STOCKTAKE_SCOPE_TOO_LARGE` and leaves the draft untouched;
  split it into narrower location/SKU sessions. Selectors support search and
  pagination; they do not silently limit selection to the first 50 entities.

## Counting is blind by design

- A principal **without `stocktake.approve`** is never serialized `expectedQty`
  or `difference` on any line. The API strips those fields for such callers.
- `difference` remains `null` until the line has been counted. `expectedQty` is
  never returned to counters.
- This is intentional: the physical count must not be anchored on the system
  number. The sheet is prepared by starting counting, but the recorded count is
  the operator's measurement.

## Workflow

1. `POST /api/v1/stocktakes/:id/start` (`stocktake.manage`) moves `DRAFT → COUNTING`,
   sets `startedAt`, `countedById`, increments `version` and **materializes the
   count sheet** from live `InventoryBalance` at the moment of starting. Lines are
   inserted for every balance within the pinned scope that has `onHand > 0` or
   `reserved > 0` (to surface reserved stock that must be accounted for). Each
   line captures `expectedQty = onHand`. Non-approving counters do not see this
   snapshot. This does not freeze unrelated receipts/sales/reservations.
2. `POST /api/v1/stocktakes/:id/counts` (`stocktake.count`) records physical
   counts for one or more lines. For each submitted line the system sets
   `countedQty`, `countedAt`, `countedById`, `notes` and computes
   `difference = countedQty - expectedQty`. Duplicate (location, variant)
   entries in the same request are rejected; lines outside the sheet are
   rejected atomically. Counts are integer quantities from 0 through
   2,147,483,647. Partial batches up to 500 lines are allowed only in `COUNTING`.
3. `POST /api/v1/stocktakes/:id/submit` (`stocktake.manage`) moves
   `COUNTING → REVIEW` only after every line is counted. Sets `submittedAt`.
   Review counts are frozen; an erroneous review can be cancelled and recreated
   before approval. Completed sheets cannot be reopened or cancelled.
4. `POST /api/v1/stocktakes/:id/approve` (`stocktake.approve`, staff-MFA-only)
   moves `REVIEW → COMPLETED`. Preconditions: all lines have `countedQty` not
   `null`; no line may have `countedQty < reservedQty` (current balance reserved
   for that (warehouse,location,variant)); counted quantities must not exceed
   integer range. For every line whose `countedQty !== beforeOnHand`, exactly
   one `InventoryMovement` of type `STOCKTAKE` is created with
   `quantity = countedQty - beforeOnHand`, `beforeOnHand`, `afterOnHand = countedQty`
   and `referenceType = 'StocktakeItem'`. The balance is written to
   `onHand = countedQty` with `available = countedQty - reserved` and version
   incremented only when the live quantity changes. Each `StocktakeItem` gets
   `movementId` when a movement was created (zero LIVE delta produces no
   movement, regardless of snapshot variance). Locks are acquired in stable
   location/SKU order using the same balance keys as inventory commands
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
- A line that matches the live balance produces **no movement**. This avoids
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
- `/warehouses`, `/locations` and `/variants` provide bounded search selectors.
  Locations are scoped to the selected warehouse. Catalog publication does not
  filter the SKU selector. List/history/selector `count` is the full filtered
  total, not the length of the current page.

## Idempotency and concurrency

Every mutating endpoint requires an `Idempotency-Key`. The `StocktakeCommandRecord`
stores `(actorId, scope, keyHash, payloadHash, response)` and replays the stored
response on exact key+payload reuse. Every response, including a cached replay
after process restart, is redacted using the caller's CURRENT approve permission.
Keys with changed payloads reject `IDEMPOTENCY_CONFLICT`. Expected versions
prevent stale commands; API state and permission checks are authoritative.
Advisory locks guard the stocktake session
and each balance key. Command execution retries up to 3 times on `P2034`
(serialization failure) with exponential backoff.

Admin freezes the original body/key after an ambiguous network/timeout/5xx
outcome. It blocks new commands and provides explicit status reread followed by
replay of that same command. An uncertain outcome never displays success.
All HTTP requests retain the shared client's bounded timeout/session recovery.

## Operator and deployment checklist

1. Use the ordinary staff password/TOTP login and an explicitly granted role.
2. Open **انبارگردانی**, select the warehouse and pinned scope, and create a draft.
3. Start counting; record actual measurements, including explicit zero for missing
   stock. Save partial batches and reload to confirm persistence.
4. Submit only after every line is saved. The approver reviews snapshot variance
   and any intervening physical movements before approval. Approval sets physical
   stock to the counted quantity against live locked balances; it is not an
   additive snapshot-variance adjustment.
5. If reservations exceed a count, reconcile/release them through their normal
   domain commands. No lines are applied when any line violates the invariant.
6. After fresh-MFA approval, inspect linked immutable ledger movements and lifecycle
   history. Reload/replay must not create duplicate movements.

The forward migration refuses legacy nonempty Stocktake tables instead of
inventing staff attribution. Inspect aggregate legacy row counts before release.
Deploy only reviewed main SHA images through `scripts/deploy/deploy.sh` after
official image publication and a verified database/media backup. Do not run
development seed on VPS; stocktake permissions already belong to the canonical
RBAC baseline. Existing revoked role grants are not reinstated by this migration.

Automated acceptance lives in `stocktake.integration-spec.ts`,
`stocktake.controller.spec.ts`, Admin stocktake tests and
`e2e/tests/admin-stocktake.spec.ts`. Database tests are fenced to isolated test
databases; the browser journey creates its own test product/warehouse, performs
ordinary receipt/count/approval commands and verifies the real ledger.

## Scope notes (V1)

- Damaged/quarantine quantities are explicitly **out of scope** for this slice.
- The sheet is built from known ledger balances. Discovering physical inventory
  with no balance in the ledger requires an explicitly reasoned ordinary receipt
  or adjustment first; this count workflow does not fabricate found stock.
- Counting must remain blind for non-approvers. UI must never reveal
  `expectedQty` or `difference` to users lacking `stocktake.approve`.
- Dedicated damaged/quarantine states, barcode scanning, reorder thresholds,
  returns/refund workflows and reporting are separate acceptance dependencies.
  Existing receipt/adjustment/reservation/transfer/purchasing paths remain their
  own domain commands. A stocktake release is not evidence that every planned
  inventory/reporting feature or real physical count has been accepted.
