# Single-Developer V1 Critical Path

Effective: 2026-09-28. This document supersedes parallel-lane schedules in
`DEVELOPMENT_PLAN.md`, `EXECUTION_STATUS.md`, `V1_MASTER_PLAN.md` and
`AGENT_WORKSTREAMS.md`. Those documents retain domain and release acceptance
requirements. `PROJECT_STATUS.md` remains the factual capability record.

Current main checkpoint: `2883d25` / PR #327 merged. Payment through manual
refund, Fulfillment pick/ready, manual dispatch/tracking, staff-attested delivery,
durable essential SMS attempts and Admin Warehouse/Location/Ledger/Reservation/Transfer
operations are implemented. These are **not** real provider/handset acceptance or a
fixture-free staging purchase. #261 and its #326 Transfer slice are closed.

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
5. **SMS.ir production acceptance — #114:** configure a real account, key,
   sender and four approved templates outside the repo; prove OTP and paid/
   dispatch/delivery SMS, timeout, rejection and unknown-result handling on a
   controlled handset in a production-like environment. Do not put credentials,
   OTPs or personal data in evidence.
   #114 remains a mandatory pre-sale gate. Its private acceptance is blocked on
   operator-supplied account/key/sender/templates and controlled handset; work
   on the next repository-owned slice may proceed while that gate remains open.
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
| #252, #258, #140 | Route-by-route Admin/Web and dynamic-page completion after the selling core; no fixture or fake KPI in production. #140 is an umbrella, not a parallel implementation lane. |
| #125, #126, #129, #127, #123, #130, #122 | Content/SSR → sitemap/canonical → structured data/feed → discovery audit/crawler governance. #122 is the umbrella. Do not advance ahead of the purchase path. |
| #136 | Production hardening/telemetry plus deploy, restore, rollback and runbooks before a sales go/no-go. |
| #213 | External SonarCloud organization-admin confirmation; scans pass, but the suspension status is not independently cleared. |
| #141, #128, #77 | Deferred: multi-provider, on-site AI and major dependency train. #77 was removed from the V1 milestone. |

Closed in triage: #279 is delivered by merged #284/#290; #166 is superseded by
#252/#258. Do not close an epic merely because its backend or one UI route exists.

Deferred from this path: #141 multi-provider payments, #128 AI/RAG and major
dependency upgrades under #77. A later release decision may reschedule them.
