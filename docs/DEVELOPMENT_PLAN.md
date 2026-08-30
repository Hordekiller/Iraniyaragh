# Detailed Development Plan

## 1. Planning assumptions

- Team: two developers, working in parallel on Platform and Product tracks.
- Cadence: two-week sprints. Capacity must be adjusted in sprint planning; dates
  below are sequence estimates, not promises.
- Architecture: NestJS modular monolith, PostgreSQL/Prisma, Redis/BullMQ,
  S3-compatible storage, React clients.
- First launch: responsive customer web + operations admin + one API; no native
  mobile dependency.
- Quality: inventory and financial correctness outrank feature count.

Expected MVP is 10–12 two-week sprints for two consistently available developers.
Part-time availability, external gateway/SMS delays, content/data cleanup and
business-policy uncertainty can extend it.

## 2. MVP definition

A customer can authenticate, browse real products, see trustworthy availability,
add items to a server-priced cart, submit an address/order, pay through a verified
gateway and receive status notifications. Staff can manage catalog, price, stock,
orders and shipments with permissions and audit history. Operators can back up,
restore, monitor and roll back the service.

### Included

- OTP customer login and secure staff login
- Permission-based roles
- Category/brand/product/SKU/media/pricing
- Warehouse/location, receipts, adjustments, reservations and transfers
- Search/filter/pagination sufficient for initial catalog size
- Cart, checkout, address, order and fulfillment lifecycle
- One payment gateway adapter plus manual reconciliation tools
- Admin screens needed for catalog, inventory and orders
- SMS notification jobs for essential events
- Audit, logs, metrics/errors, backups, CI/CD and runbooks

### Explicitly deferred

- Native mobile application
- Reviews, wishlist, blog CMS and loyalty
- Complex promotions/coupon engine and multi-seller marketplace
- Full accounting/ERP, advanced BI and automated supplier feeds
- Microservices, Kubernetes and a dedicated search cluster without measured need

## 3. Work breakdown and sprint sequence

Each sprint has one integrated outcome. `A` is the Platform lead and `B` is the
Product lead; both review and pair on critical transitions.

### Sprint 0 — Reproducible foundation (`0.1`)

Developer A:

- Validate configuration at startup and define dev/test/staging variables.
- Commit initial Prisma migration and deterministic seed.
- Add structured request ID/error envelope, logging and Swagger skeleton.
- Establish unit/integration test harness and test database strategy.

Developer B:

- Decompose storefront prototype into route/layout/feature boundaries without
  visual regression.
- Bootstrap admin application shell, authentication boundary and design tokens.
- Add API client/error/loading conventions and mock-server fixtures.
- Add a smoke E2E test for web and admin shells.

Shared exit criteria:

- Fresh clone instructions verified by the non-author.
- CI installs, generates Prisma client, lints, typechecks and builds.
- Health/live and readiness/database health are distinct.
- No secrets or production credentials are committed.

### Sprint 1 — Authentication and authorization

Developer A:

- User/session/OTP attempt models, hashed tokens, expiry and revocation.
- Customer OTP request/verify with provider interface and dev fake provider.
- Staff password login, refresh rotation, rate limits and permission guards.
- Seed initial admin role; audit login and privilege changes.

Developer B:

- Customer login/profile flows and resilient OTP UX.
- Admin login/session expiry/forbidden states.
- Route protection and permission-aware navigation (never a replacement for API
  enforcement).
- Auth contract E2E scenarios.

Exit: authentication abuse tests pass; unauthorized/forbidden are distinct; no
OTP/token is logged; session revocation is demonstrable.

### Sprint 2 — Catalog domain and admin CRUD (`0.2` part 1)

Developer A:

- Category tree, brand, product and SKU application services and DTOs.
- Pagination/filter/sort standards, unique slug/SKU conflicts and archive policy.
- Price representation ADR and implementation.
- Media metadata + presigned upload boundary.

Developer B:

- Admin category/brand/product/SKU list and form screens.
- Validated forms, media upload flow, draft/publish state and accessible tables.
- Reusable admin data-table/form primitives only where repeated.

Exit: authorized staff can create a draft product with SKU and price, upload media,
publish it and see an audit entry.

### Sprint 3 — Public catalog and storefront integration (`0.2`)

Developer A:

- Public product/category endpoints with only published active records.
- Search/filter contract and indexed query review.
- Availability summary contract without leaking internal locations.
- Cache policy and invalidation for catalog reads if measurement justifies it.

Developer B:

- Replace static homepage/category/product data with API data.
- Product listing/detail, search, filtering, pagination and empty/error states.
- SEO metadata, structured product basics and image performance.
- Responsive and accessibility pass on purchase discovery flows.

Exit: no hardcoded sellable product/pricing data remains in production paths;
published changes appear within the defined cache SLA.

### Sprint 4 — Warehouse and inventory ledger (`0.3` part 1)

Developer A:

- Warehouse/location CRUD and permission policy.
- Receipt and reasoned adjustment commands with idempotency payload matching.
- Movement ledger queries, actor/reference fields and audit events.
- Serializable retry policy and concurrent mutation integration tests.

Developer B:

- Admin warehouse/location, balance and movement ledger screens.
- Receipt/adjustment forms with confirmation and reason requirements.
- Filters/export boundary for operators; no client-side balance calculation.

Exit: every physical change yields one immutable movement and consistent balance;
duplicate commands cannot double-apply; negative available stock is rejected.

### Sprint 5 — Reservations and transfers (`0.3`)

Developer A:

- Reservation create/consume/release/expire lifecycle and expiry worker.
- Transfer request/approve/dispatch/receive/cancel state machine.
- Dual-ledger transfer semantics and concurrency/idempotency tests.
- Availability allocation policy documented.

Developer B:

- Transfer workflow and reservation visibility in admin.
- Conflict/error recovery UX and operator activity trail.
- E2E coverage for partial failure and prohibited transitions.

Exit: reservation expiry restores availability exactly once; a received transfer
reconciles source/in-transit/destination quantities with traceable references.

### Sprint 6 — Cart and checkout (`0.4` part 1)

Developer A:

- Persistent/guest cart policy, cart item commands and server-side repricing.
- Address model and Iran-specific validation policy.
- Checkout orchestration, availability recheck and reservation creation.
- Pricing snapshot and idempotent order draft creation.

Developer B:

- Cart drawer/page, quantity management and price-change messaging.
- Address book and checkout flow with accessible validation.
- Recovery for stock conflict, expired session and duplicate submission.

Exit: manipulated client totals are ignored; double-submit creates at most one
order; stock/price changes are communicated before confirmation.

### Sprint 7 — Order and admin operations (`0.4`)

Developer A:

- Separate order, payment and fulfillment state machines.
- Controlled cancellation/confirmation transitions and reservation effects.
- Order list/detail commands with permission and audit checks.
- Transactional outbox foundation for reliable side effects.

Developer B:

- Customer order confirmation/history/detail.
- Admin order queue/detail/action timeline with permission-aware actions.
- Picking/packing-ready UI boundary and printable document baseline.

Exit: illegal transitions return stable conflicts; cancellation reconciles stock;
historical product/price/customer snapshots remain stable.

### Sprint 8 — Payment, shipping and notifications (`0.5`)

Developer A:

- Payment provider interface and one production adapter.
- Initiation, callback signature verification, server verification, idempotency,
  reconciliation command and refund boundary.
- Shipment/tracking model and BullMQ notification/outbox workers.

Developer B:

- Payment redirect/result/retry experience.
- Admin payment evidence/reconciliation and shipment management UI.
- Customer tracking and essential notification preference/status views.

Exit: duplicate/forged callbacks create no financial effect; amount is verified
server-side; failed jobs are observable and safely retryable.

### Sprint 9 — Purchasing, stocktake and returns (`0.6`)

Developer A:

- Supplier and purchase order commands with partial receipt.
- Stocktake snapshot/count/review/approval adjustments.
- Customer return/refund/restock-or-damaged decision flow.

Developer B:

- Purchase/receipt, stocktake/count and return admin workflows.
- Operator-friendly barcode input boundary where hardware is available.
- Low-stock dashboard/report based on backend queries.

Exit: partial receipts, approved counts and returns reconcile to ledger references;
historical records cannot be destructively deleted.

### Sprint 10 — Hardening and staging

Developer A:

- Staging/prod Docker images and automated deployment/rollback.
- CORS allowlist, rate/request limits, headers and dependency/security scan.
- Metrics, error tracking, queue/database alerts and backup automation.
- Restore drill and sanitized production data/import strategy.

Developer B:

- Cross-browser/responsive/accessibility audit and critical fixes.
- Web performance budgets and catalog/checkout optimization.
- UAT scripts, admin help text and operational training material.
- Production content/SEO checklist.

Exit: restore and rollback demonstrated; alerts tested; critical UAT paths pass;
no severity-1/2 bugs or unresolved high-risk security findings.

### Sprint 11 — Launch (`1.0`)

- Freeze nonessential scope and run full regression/reconciliation.
- Import validated catalog/stock with a signed count checkpoint.
- Configure domains, TLS, secrets, gateway/SMS and monitoring.
- Run launch checklist, smoke tests and first-order supervised validation.
- Maintain daily reconciliation and incident review during stabilization.

Exit: launch owner and verifier sign off; support and rollback contacts are known;
post-launch backlog is triaged separately from defects.

## 4. Cross-cutting acceptance matrix

Every epic must answer these before completion:

| Concern | Required evidence |
| --- | --- |
| Behavior | Acceptance scenario/demo linked in issue |
| Authorization | Permission test for allow and deny |
| Validation | Invalid and boundary inputs covered |
| Data | Migration/rollback/data impact reviewed |
| Concurrency | Race/idempotency test for critical mutation |
| Audit | Actor/action/entity/reference recorded safely |
| Contract | DTO/OpenAPI/shared contract and stable errors updated |
| Observability | Useful log/metric/error context without secrets |
| Tests | Unit plus appropriate integration/E2E coverage |
| UX | Loading/empty/error/success and responsive states |
| Accessibility | Keyboard, labels, focus and contrast checked |
| Docs | Runbook/domain/status docs updated where changed |

## 5. Test strategy

- Unit: pure policies, calculations, state transitions and UI logic.
- API integration: real PostgreSQL test database for repositories, transactions,
  constraints, idempotency and authorization.
- Contract: generated OpenAPI checked for accidental changes; representative client
  fixtures validate error/success shapes.
- E2E: Playwright for login, catalog discovery, checkout/payment fake, admin stock
  and order workflows.
- Concurrency: parallel requests for reservation, receipt, callback and state change.
- Production smoke: read-only health/catalog plus controlled synthetic operations in
  staging; never create uncontrolled production financial/stock effects.

Initial coverage is a signal, not the goal. Once harnesses exist, target at least
80% on domain/application services and 100% branch coverage for explicit state
transition tables, pricing totals and payment verification policies.

## 6. Release gates

No production release unless:

- CI is green from a clean install;
- migrations were exercised against a recent staging backup and have a rollback or
  forward-fix plan;
- critical E2E and reconciliation scenarios pass;
- environment configuration/secrets are validated;
- monitoring and on-call notifications work;
- backup freshness and a recent restore test are recorded;
- release notes, deployment command and rollback trigger are written;
- the non-driver independently runs the post-deploy smoke checklist.

## 7. Initial GitHub backlog

Create epics for Foundation, Identity, Catalog, Inventory, Selling, Payment,
Warehouse+ and Launch. Each sprint is planned by pulling small child issues from
the relevant epic. Recommended labels:

- Type: `type:feature`, `type:bug`, `type:chore`, `type:docs`, `type:security`
- Area: `area:api`, `area:web`, `area:admin`, `area:data`, `area:infra`
- Risk: `risk:critical`, `risk:migration`, `risk:contract`
- Workflow: `status:blocked`, `needs:decision`, `good-first-issue`
- Priority: `priority:p0` through `priority:p3`

Priority meanings: P0 production incident/data loss; P1 sprint-critical; P2 normal
planned work; P3 improvement. Only one P1 set should fit current capacity.

## 8. Key decisions required early

Resolve via issue/ADR before dependent implementation:

1. Canonical money unit: IRR integer vs decimal convention and toman presentation.
2. Initial payment and SMS providers and sandbox availability.
3. Shipping methods, pricing owner and supported geography.
4. Reservation duration and allocation across warehouses/locations.
5. Guest checkout and account-merging policy.
6. Product variant/attribute requirements and initial catalog import format.
7. Staff roles, approval thresholds and which actions require four-eyes review.
8. Return/refund and damaged-stock business policy.
9. Deployment provider, RPO/RTO, retention and operational budget.

## 9. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Two people become sequentially blocked | Contract-first issues, fixtures and small PRs |
| Prototype dictates poor production structure | Decompose in Sprint 0; preserve visuals with E2E/screenshots |
| Overselling under concurrency | DB constraints/serializable transactions, bounded retry, race tests |
| Payment duplication/fraud | Verified server callback, idempotency, reconciliation, immutable evidence |
| Scope expansion | Explicit MVP exclusions and sprint goal; new scope requires trade-off |
| Production data loss | External backups, retention, restore drills and migration review |
| Provider outage | Adapter boundaries, safe retries, observable queues and manual recovery |
| Knowledge concentration | Rotating review/release roles, ADRs, runbooks and paired critical changes |

## 10. Measuring progress

Track outcomes, not commit count:

- Sprint goal pass/fail and carry-over reason
- Lead time from issue start to production
- PR review time and escaped defects
- Critical E2E pass rate and flaky test count
- API error rate/latency and queue failure age
- Inventory reconciliation discrepancies
- Payment callback/reconciliation discrepancies
- Backup age and last successful restore date

Update `PROJECT_STATUS.md` after every sprint. Revise this plan when evidence changes
sequence or scope; do not quietly let actual work diverge from the documented plan.
