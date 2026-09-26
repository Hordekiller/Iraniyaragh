# Delivery Roadmap

Last reviewed: 2026-09-26

This is the executive view of delivery. The executable sprint backlog, owners,
acceptance gates and dependencies live in `DEVELOPMENT_PLAN.md`.
The complete capability register, engineering method and post-MVP growth sequence
live in `COMMERCE_EXPANSION_PLAN.md`; roadmap summaries must not silently drop an
item from that plan.

## Product objective

Deliver a reliable Iranian hardware/fittings commerce system with one source of
truth for catalog, inventory, orders and payments. The first release targets one
business, a small operations team, one or more warehouses, and a customer web
store. Native mobile and advanced growth features are intentionally later.

## Release sequence

| Release | Target     | Outcome                                                            |
| ------- | ---------- | ------------------------------------------------------------------ |
| `0.1`   | Foundation | Reproducible local setup, CI, conventions, auth/RBAC skeleton      |
| `0.2`   | Catalog    | Admin product/SKU management and public catalog API                |
| `0.3`   | Inventory  | Warehouses, ledger, receipts, adjustments, reservations, transfers |
| `0.4`   | Selling    | Cart, checkout, order state machine and admin order operations     |
| `0.5`   | Payment    | Gateway adapter, verification, shipping and notification workflow  |
| `0.6`   | Warehouse+ | Purchasing, stocktake, returns and operational reporting           |
| `1.0`   | MVP launch | Hardened, monitored, backed-up production release                  |

## Current checkpoint

- `0.1` is closed; Auth/RBAC and privileged lifecycle are merged. Production OTP
  and MFA acceptance still need environment evidence.
- `0.2` has an integrated live Catalog/Media foundation, but production object
  storage/scanner acceptance and remaining authoring gaps are open.
- `0.3` has protected Inventory APIs, public availability and reservation expiry.
  The Admin Inventory operator journey (#261) is not yet complete.
- `0.4` has authenticated/guest Cart, Checkout/Order creation, customer/staff Order
  reads and controlled cancellation/expiry compensation. A fixture-free purchase
  from browser through shipment has not passed staging.
- `0.5` Payment foundation is merged through #294–#298: Zarinpal verification,
  Web initiation/result, staff evidence and guarded manual reconciliation. #299
  merged the recoverable outbox relay foundation and #300 the topic-aware worker
  with durable pending effects. Manual refund recording (ADR-0019) merged in
  #303: a fresh-MFA, permissioned, exactly-once staff
  command that records an already-executed gateway refund as append-only
  evidence, with database-enforced money invariants. Gateway-side refund
  verification is unavailable through Zarinpal v4. Compensating corrections,
  external notification delivery and production acceptance remain. #305 merged
  the first guarded Fulfillment operator transitions. #308 adds item-level
  pick proof and blocks ready-to-ship until every line is picked; shipment and
  tracking remain open. None of this is SMS delivery or a release claim.
- `0.6`–`1.0` are not release-ready. No live sale or launch claim is justified by
  green unit/CI alone.

The detailed, dependency-ordered checklist is in `V1_MASTER_PLAN.md`. Factual code
status is in `PROJECT_STATUS.md`.

## One-developer critical path (authoritative execution order)

Use exactly one principal task and at most one open product PR: implement → focused
failure/authorization/idempotency/concurrency tests → full affected-package checks
→ CI → documented solo review → merge → start the next task from `main`. Do not
edit `schema.prisma`, migrations, shared contracts or OpenAPI for the next task
before the previous PR merges. Never rewrite a shared migration; add a forward one.

| Step | Next deliverable | Exit evidence before moving on |
| --- | --- | --- |
| 1 | #300 Outbox worker/effect projection — merged | Final-SHA CI and migration drift green; failed jobs visible and replay tested; pending effects explicitly not counted as delivered notifications. |
| 2 | #303 Payment refund recording — merged | Human-executed refund evidence, staff permission + fresh MFA, audit, exactly-once idempotency and DB-enforced totals. Zarinpal v4 has no refund API; gateway-side automated verification is unavailable, and compensating corrections require separate policy. |
| 3 | Paid Order → Fulfillment — #305/#308 slices; remaining work active | One paid Order creates exactly one fulfillment; #305 adds guarded operator transitions and #308 adds exact item-level pick proof with an all-items gate. Shipment/tracking remain separate slices. |
| 4 | Shipment → Tracking → essential notifications | #310 active: manual one-package dispatch and customer/staff tracking; after merge, delivery confirmation and provider-backed essential notifications. Complete one fixture-free staging purchase through tracking. |
| 5 | Admin Inventory #261 | Warehouse, Location, Balance, Movement, Adjustment, Reservation and Transfer connected to protected APIs; role/action states, conflicts and ledger invariants tested. |
| 6 | SMS.ir acceptance #114 | Real account/key/sender/template in production-like staging; OTP delivery, timeout/error/unknown-result, rate limits, outage and rollback evidence. Do not commit credentials. |
| 7 | Warehouse+ #7, one PR per slice | Supplier/PO → Receiving → Stocktake → Return/Refund → Reports; each mutation traces to ledger, actor and business reference. |
| 8 | Web/Admin completion #252/#258 | Route-by-route inventory removes fixtures, fake KPI, unavailable actions and broken empty/error/permission states; close epics only after verified acceptance. |
| 9 | Content + SEO #125/#126/#129/#127/#123/#130 | Content lifecycle, SSR, canonical, sitemap, structured data, Merchant feed and crawl/performance monitoring after commerce flow is stable. |
| 10 | Production hardening #136 / Gate 0.9 | Deployment, secrets, metrics/tracing, alerts, backups with restore drill, rollback and load test plus owner runbooks. |
| 11 | UAT → fixed V1.0 release candidate | On staging, execute Product → Guest Cart → OTP → Checkout → Zarinpal → Order → Inventory → Fulfillment → Tracking without fixtures; verify failure/retry/refund paths, reconcile money/stock, then launch only with signed-off gates. |

Paused until after V1.0: #141 multi-provider, #128 AI/RAG and major dependency
upgrades under #77. SEO must not displace Payment/Fulfillment on the critical path.
External production-like acceptance requires owner-supplied accounts, credentials
and deployment access; local code/CI cannot substitute for that evidence.

## Phase 0 — Repository and foundation

- Reproducible pnpm install and committed lockfile
- Pull-request CI and branch protection
- Development seed data and migration baseline
- Configuration validation and separate dev/staging/prod environments
- Structured errors, request IDs, logging and OpenAPI
- Test harness for unit, API integration and end-to-end tests

Exit gate: a fresh clone can be running in under 20 minutes and CI is green.

## Phase 1 — Identity, catalog and availability

- Customer OTP authentication; staff authentication and session revocation
- Permission-based RBAC; privileged staff 2FA planned before production
- Category, brand, product, variant/SKU, media and pricing CRUD
- Warehouse/location CRUD and stock availability reads
- Searchable, paginated public catalog
- First usable admin screens and storefront API integration

Exit gate: staff can publish a SKU and a customer can discover its real price and
availability without static UI data.

## Phase 2 — Inventory and selling

- Stock receipt and reasoned adjustment
- Immutable movement ledger and reservation expiry
- Transfer state machine and concurrency/idempotency coverage
- Server-side cart pricing, checkout and address validation
- Explicit order/payment/fulfillment states
- Admin order queue and controlled state transitions

Exit gate: a test order reserves stock exactly once and every resulting stock
change can be traced to actor and business reference.

## Phase 3 — Payment, fulfillment and operations

- Payment provider adapter, verified callback and reconciliation
- Shipment/tracking model and notification jobs
- Purchase orders and partial receipts
- Stocktake/cycle count, returns and damaged stock
- Low-stock alerts and essential warehouse/order reports

Exit gate: complete staging purchase, payment, pick/pack/ship, cancellation and
return scenarios pass with financial and inventory reconciliation.

## Phase 4 — Launch hardening

- Security review, rate limiting and privacy controls
- Performance budgets and load tests for catalog/checkout hot paths
- Automated deployment, monitoring, alerts, backup and restore drill
- UAT, operator runbooks, support procedure and rollback rehearsal
- SEO essentials and production content/data import
- Dynamic sitemap, server-rendered discovery pages, commerce structured data/feed,
  GEO/AEO citation readiness and production discovery monitoring, governed by
  `SEO_GEO_AI_DISCOVERY_PLAN.md`

Exit gate: all gates in `DEVELOPMENT_PLAN.md` are signed off; no open severity-1
or severity-2 defect; restore and rollback have been demonstrated.

## Post-MVP candidates

Promotions/coupons, wholesale price lists, wishlist/reviews, content/blog tooling,
advanced analytics, marketplace/accounting/logistics integrations, dedicated
search infrastructure, and React Native mobile. These are not allowed to delay
the MVP unless a documented business decision changes scope.

Their full dependency order, safety boundaries and promotion-to-active criteria are
defined in `COMMERCE_EXPANSION_PLAN.md` Horizon C and gate G10. A candidate is not
implementation-ready merely because it appears in this executive roadmap.
