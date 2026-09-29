# V1 Critical Path

> **Superseded 2026-09-29 for scheduling.** V1 now runs as **two parallel
> lanes**. The authoritative tracker is **issue #363** (V1 FINAL EXECUTION).
> `AGENT_WORKSTREAMS.md` holds the ownership split. This document keeps the
> domain invariants, release gates and acceptance requirements. Read
> `PROJECT_STATUS.md` for what is actually merged, and #363 for what is next.

Effective: 2026-09-29. This document supersedes parallel-lane schedules in
`DEVELOPMENT_PLAN.md`, `EXECUTION_STATUS.md`, `V1_MASTER_PLAN.md` and
`AGENT_WORKSTREAMS.md`. Those documents retain domain and release acceptance
requirements. `PROJECT_STATUS.md` remains the factual capability record.

Current main checkpoint is `29f43b1`. Merged since the previous revision of
this file: Admin Receiving #345 (PR #346, `e4398bd`) — the "Admin Receiving is
unmerged" claim in the previous revision was stale and is now removed. Admin
Audit viewer #354 (PR #361, `fcd2dfd`) and Shipments read API + Admin
`/shipments` #356 (PR #362, `29f43b1`) are merged. Supplier backend PR #335 and
Admin UI PR #337, Purchase Order API #340 / Admin #342, and Receiving API #344
were already merged. Payment through manual refund, Fulfillment pick/ready,
manual dispatch/tracking, staff-attested delivery, durable essential SMS attempts
and Admin Warehouse/Location/Ledger/Reservation/Transfer operations are
implemented. These are **not** real provider/handset acceptance or a
fixture-free staging purchase. #261 and its #326 Transfer slice are closed.

## Delivery rule

At most one product PR open per owner at a time. For each slice: implement on
current `main`, run the narrow checks and then full affected-package checks,
review the diff and CI, merge, and only then begin the next slice in the same
lane. Do not edit `schema.prisma`, an existing migration, shared contracts or
OpenAPI while a preceding product PR in the same lane is awaiting merge. Use a
forward migration for schema changes. Preserve unrelated worktrees and
uncommitted files. Parallel work across lanes is allowed only where ownership
is isolated — see #363.

## Agent handoff and ownership (2026-09-29, two lanes)

- **Hordeiller** owns `apps/api`, `apps/admin`, `schema.prisma` + forward
  migrations, `packages/contracts`, OpenAPI, RBAC/Audit, infra/deployment,
  production secrets and provider acceptance, and the authoritative
  project/status docs. Hordekiller does not edit `apps/web` except as an agreed
  emergency integration fix.
- **Maddyrampant** owns `apps/web` and all customer-facing journeys. Web does
  not touch `schema.prisma`, migrations, API domain logic, state machines,
  OpenAPI or shared contracts unless Hordekiller hands off that exact surface.
- When Web needs a missing contract, Hordekiller opens a backend dependency
  issue, lands the contract/API first, and Web rebases on merged `main`.
- The previous revision of this section reserved shared surfaces for Admin
  Receiving #345 and asked other agents not to start Stocktake/Returns/credit
  while it was active. #345 is merged, so that hold is lifted.
- No product PR should duplicate an already-merged capability. Issue labels or
  branch presence are not evidence of completion; `PROJECT_STATUS.md` and
  `origin/main` are.

## Ordered queue

1. **Payment foundation — PR #294:** merged 2026-09-24 with green quality,
   database, E2E, security and Sonar checks. The `idempotencyFingerprint`
   migration drift is resolved on `main`.
2. **Payment completion:** Web initiation/result (#295/#296), Admin evidence
   (#297), reconciliation (#298), recoverable outbox relay/effect projection
   (#299/#300), Zarinpal response and authority-race fixes (#301/#302), and
   audited manual refund recording (#303, ADR-0019) are merged with green CI.
   Zarinpal v4 has no refund API: #303 records a refund already executed by a
   human in the merchant panel; it does not transfer money. Production gateway
   acceptance remains open.
3. **Fulfillment, shipping, notifications:** #305 merged the guarded operator
   `start`/`ready` transition slice for paid orders with consumed inventory.
   #304 closed the initial Fulfillment history discrepancy. #308 supplies
   item-level pick proof and requires complete proof before ready-to-ship;
   manual dispatch/tracking are in #310; #312 records staff-attested delivery;
   #314 sends essential SMS attempts through durable outbox effects. These slices
   are merged, but exit still needs a real, fixture-free purchase-to-tracking
   test, provider acceptance and no unexplained inventory/payment discrepancy.
   #310 implements manual one-package dispatch and customer tracking.
   Direct carrier verification is not implemented and must not be claimed.
4. **Admin Inventory — #261: complete.** #317 Warehouse/Location merged via
   #318, #319 Balance/Movement/Adjustment via #320, #321 guarded manual
   Reservations via #322, and #326 guarded Transfers via #327. The final PR's
   desktop/mobile E2E exercised a real two-warehouse transfer and verified
   destination balance and inbound ledger. #261 closed 2026-09-28. This does
   not constitute production-like operator acceptance.
5. **Warehouse+ — #7:** Supplier API #335 and Admin UI #337 are merged;
   #329 is closed; PO API #339/#340 and Admin PO #341/#342 merged. Finish
   Receiving API #343/#344 is merged with green final-head CI. Deliver
   Receiving Admin UI #345, Stocktake and Returns, one reviewable PR at a time,
   with ledger and financial reconciliation. Do not begin the next product
   slice until the previous PR is merged.
6. **Customer credit ADR — #338:** after Returns, accept the commercial versus
   financial order-state model, staff-only credit-sale authorization, overdue
   policy, opening-balance controls, cancellation/return effects and inventory
   reconciliation before touching credit schema or checkout/fulfillment logic.
7. **Customer credit / accounts receivable — #336 (V1.0.0 scope):**
   approved 2026-09-28 as a required V1.0.0 capability and placed after
   purchasing/returns and before Reports, because financial reporting without a
   receivables view is incomplete for a store that sells on account. Scope is
   deliberately narrow and staff-driven: credit is **not** offered in public
   storefront checkout. Staff record a credit sale for known walk-in/trade
   customers from Admin only, under a dedicated permission and audit. The
   receivable balance is derived from an immutable ledger (invoice / payment /
   credit note / adjustment), never a freely editable field on the customer.
   A credit order is commercially fulfillable while financially
   `UNPAID`/`PARTIALLY_PAID`/`OVERDUE`, which changes the current
   payment-gated fulfillment transition and therefore requires accepted #338
   before implementation. Do not start while a Warehouse+ slice is unmerged.
   Prerequisites confirmed 2026-09-28: Admin Customer
   create/search/update for known walk-in customers, staff-created Order,
   audited one-time opening balances with legacy-ledger references, immutable
   invoice/receipt/allocation entries and exact SKU/inventory reconciliation.
   Public Checkout remains Zarinpal-only. Hard-block on overdue debt is the
   conservative proposed policy for ADR #338, not an implemented rule.
8. **Operational and financial Reports — #7:** reconcile low stock, PO aging,
   inventory movements and customer receivables after their source ledgers exist.
9. **Web/Admin completion — #252/#258:** inspect every route for fixtures, fake
   KPIs, unavailable actions and incomplete UI; close each epic only against
   actual integrated behavior.
10. **Content and SEO — #125/#126/#129/#127/#123/#130:** content lifecycle,
   server rendering, canonical, sitemap, structured data, Merchant feed and
   performance/crawl monitoring, after the selling path works.
11. **Production deployment and hardening — #136/Gate 0.9:** deploy to a
    production-like environment with secrets, metrics, tracing, alerts,
    backup/restore, rollback, load/security tests and runbooks. Deploying is
    not permission to accept customer money.
12. **SMS.ir and Zarinpal acceptance — #114 and payment gate:** with real
    operator-owned credentials outside the repo, prove OTP and paid/dispatch/
    delivery SMS plus timeout/rejection/unknown-result handling on a controlled
    handset; execute one controlled real Zarinpal transaction and reconcile
    callback, order, payment and inventory. Do not expose credentials, OTPs,
    personal data or merchant details in evidence. These remain pre-sale gates.
13. **Full staging UAT and v1.0.0:** freeze a release candidate and prove a
     fixture-free
     Product → Guest Cart → OTP → Checkout → Zarinpal → Order → Inventory →
     Fulfillment → Tracking on staging, including operational credit and returns
     acceptance, before launch approval and the `v1.0.0` tag.

## Saleable pilot versus formal V1

Do not accept live customer money yet. A supervised, limited-sales pilot may be
considered only after #261 operator stock flows, #114 real SMS, live Zarinpal
acceptance, production-like media/storage, monitored deploy/rollback and tested
backup/restore, plus a fixture-free staging purchase and reconciliation all pass.
This is a *go/no-go gate*, not an automatic launch authorization. The formal V1.0
tag additionally requires the agreed #7, #252/#258, content/discovery and #136
scope or an explicit product decision to move a non-selling item to V1.x.

## Open-issue disposition (2026-09-28)

| Issues | Disposition and closure evidence |
| --- | --- |
| #261 | **Closed 2026-09-28.** Four independently merged slices through #327, including permission/state guards and real desktop/mobile transfer ledger E2E. Production-like acceptance remains a separate launch gate. |
| #114 | External V1 acceptance blocker; real OTP plus three transactional SMS templates/handset evidence. |
| #2, #4, #5, #6 | Keep milestone epics open: respectively private Auth acceptance, production-like Inventory reconciliation, fixture-free selling, and real payment/shipping/notification acceptance are not closed. |
| #7, #8 | Keep open for Warehouse+ and V1 launch/UAT exit evidence. |
| #329/#335/#337 | Supplier backend and Admin UI merged with green final-head CI and desktop/mobile E2E; #329 is closed. #7 remains open for PO, Receiving, Stocktake, Return/Refund, credit and Reports. |
| #336 | Approved 2026-09-28 as required V1.0.0 scope: staff-recorded customer credit with an immutable receivables ledger. Sequence after Warehouse+, before Reports; needs its own ADR for the payment-gated fulfillment transition. |
| #332/#333 | Closed/merged safety correction: Newsletter fake success and local contact fixture removed; real consented subscription remains future scope under #258. |
| #252, #258, #140 | Route-by-route Admin/Web and dynamic-page completion after the selling core; no fixture or fake KPI in production. #140 is an umbrella, not a parallel implementation lane. |
| #125, #126, #129, #127, #123, #130, #122 | Content/SSR → sitemap/canonical → structured data/feed → discovery audit/crawler governance. #122 is the umbrella. Do not advance ahead of the purchase path. |
| #136 | Production hardening/telemetry plus deploy, restore, rollback and runbooks before a sales go/no-go. |
| #213 | External SonarCloud organization-admin confirmation; scans pass, but the suspension status is not independently cleared. |
| #141, #128, #77 | Deferred: multi-provider, on-site AI and major dependency train. #77 was removed from the V1 milestone. |

Closed in triage: #279 is delivered by merged #284/#290; #166 is superseded by
#252/#258. Do not close an epic merely because its backend or one UI route exists.

Deferred from this path: #141 multi-provider payments, #128 AI/RAG and major
dependency upgrades under #77. A later release decision may reschedule them.
