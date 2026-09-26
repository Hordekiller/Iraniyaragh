# Single-Developer V1 Critical Path

Effective: 2026-09-25. This document supersedes parallel-lane schedules in
`DEVELOPMENT_PLAN.md`, `EXECUTION_STATUS.md`, `V1_MASTER_PLAN.md` and
`AGENT_WORKSTREAMS.md`. Those documents retain domain and release acceptance
requirements. `PROJECT_STATUS.md` remains the factual capability record.

## Delivery rule

Only one product PR may be open. For each slice: implement on current `main`, run
the narrow checks and then full affected-package checks, review the diff and CI,
merge, and only then begin the next slice. Do not edit `schema.prisma`, an
existing migration, shared contracts or OpenAPI while a preceding product PR is
awaiting merge. Use a forward migration for schema changes. Preserve unrelated
worktrees and uncommitted files.

## Ordered queue

1. **Payment foundation — PR #294:** merged 2026-09-24 with green quality,
   database, E2E, security and Sonar checks. The `idempotencyFingerprint`
   migration drift is resolved on `main`.
2. **Payment completion:** Web initiation/result (#295/#296), Admin evidence
   (#297), reconciliation (#298), recoverable outbox relay/effect projection
   (#299/#300), Zarinpal response and authority-race fixes (#301/#302), and
   audited manual refund recording (#303, ADR-0019) are merged with green CI.
   Zarinpal v4 has no refund API: #303 records a refund already executed by a
   human in the merchant panel; it does not transfer money. External notification
   delivery and production gateway acceptance remain open.
3. **Fulfillment, shipping, notifications:** #305 merged the guarded operator
   `start`/`ready` transition slice for paid orders with consumed inventory.
   #304 closed the initial Fulfillment history discrepancy. #308 supplies
   item-level pick proof and requires complete proof before ready-to-ship;
   shipment/tracking and external notification delivery remain. Exit with a
   real, fixture-free purchase-to-tracking test.
   Active slice #310 implements manual one-package dispatch and customer
   tracking; it is not complete or merged until CI/review pass. Delivery
   confirmation and external notifications remain separate.
4. **Admin Inventory — #261:** connect Warehouse, Location, Balance, Movement,
   Adjustment, Reservation and Transfer screens to the existing permissioned
   backend. Verify one real operator flow and ledger/audit consistency.
5. **SMS.ir production acceptance — #114:** configure a real account, key,
   sender/template outside the repo; prove OTP success and timeout/error behavior
   in a production-like environment. Do not put credentials or OTPs in evidence.
6. **Warehouse+ — #7:** Supplier/PO, Receiving, Stocktake, Return/Refund, then
   Reports, one reviewable PR at a time, with ledger and financial reconciliation.
7. **Web/Admin completion — #252/#258:** inspect every route for fixtures, fake
   KPIs, unavailable actions and incomplete UI; close each epic only against
   actual integrated behavior.
8. **Content and SEO — #125/#126/#129/#127/#123/#130:** content lifecycle,
   server rendering, canonical, sitemap, structured data, Merchant feed and
   performance/crawl monitoring, after the selling path works.
9. **Production hardening — #136/Gate 0.9:** deployment, secrets, metrics,
   tracing, alerts, backup/restore, rollback, load test and runbooks with staging
   evidence.
10. **UAT and V1.0:** freeze a release candidate and prove
    Product → Guest Cart → OTP → Checkout → Zarinpal → Order → Inventory →
    Fulfillment → Tracking on staging before launch approval.

Deferred from this path: #141 multi-provider payments, #128 AI/RAG and major
dependency upgrades under #77. A later release decision may reschedule them.
