# Commerce Expansion Master Plan

Status: authoritative expansion plan; implementation status remains in
`PROJECT_STATUS.md`.

Last reviewed: 2026-09-09

Owners: Developer A — Platform/API/Data/Operations; Developer B —
Product/Web/Admin/E2E. Every critical change requires independent review by the
other contributor.

## 1. Purpose and truth model

This document turns the complete commerce gap analysis into a dependency-ordered
delivery system. It covers the path from the current foundation to a strong,
operable Iranian online store and then to governed growth. It does not claim that
planned work exists.

Use the documents as follows:

- `PROJECT_STATUS.md`: what is actually merged on `main` now;
- this document: complete target scope, sequencing, ownership and acceptance;
- `V1_MASTER_PLAN.md`: V1 release checklist;
- `EXECUTION_STATUS.md`: short-horizon queue and handoff;
- GitHub issues/PRs: current assignment and evidence.

Every capability has one of four states: `planned`, `ready`, `in progress`, or
`delivered`. Only a reviewed commit on `main` with required evidence is delivered.
Schema presence, fixture UI, an open PR, an approval on an older head, or a green
unit test alone never establishes delivery.

## 2. Product outcomes and release horizons

### Horizon A — Sell safely (V1)

A customer can authenticate, discover live products, use a server-priced cart,
submit a validated address and shipping choice, create one idempotent order, pay
through a server-verified gateway, and track fulfillment. Staff can manage catalog,
price, media, stock, orders, payments and shipments through permissioned audited
commands. Operators can deploy, observe, reconcile, restore and roll back.

### Horizon B — Operate efficiently (V1.x)

Purchasing, stocktake, returns, refunds, support tools, bounded exports, alert/task
queues, merchandising and business reporting reduce manual intervention without
bypassing the ledger or state machines.

### Horizon C — Grow intelligently (V2)

Governed promotions, strong Persian search, recommendations, editorial content,
SEO/GEO feeds, experimentation, customer segmentation and grounded AI improve
discovery and conversion. These consume deterministic commerce facts; they never
become the source of price, stock, eligibility, payment or order truth.

Native mobile, marketplace/multi-seller, full accounting/ERP, loyalty and a
dedicated search cluster enter a later horizon only after measured demand and an
accepted ADR.

## 3. Engineering method — mandatory for every gate

### 3.1 Architecture and boundaries

- Preserve the NestJS modular monolith. Split by business domain, not technical
  layer, and introduce no microservice without load/ownership evidence and an ADR.
- Controllers validate transport and map identity; application services orchestrate;
  domain policies decide; repositories/adapters own persistence and external I/O.
- Use ports/adapters for SMS, payment, carrier, storage, search, analytics and AI.
  Vendor DTOs and errors do not cross their adapter.
- Public contracts are explicit DTOs in `packages/contracts` or generated clients;
  Prisma models are never public API types.
- Separate commands from queries conceptually. A command has authorization,
  validation, idempotency/concurrency, audit and transaction semantics. Queries use
  bounded projections and never mutate state.
- Use transactional outbox records for reliable DB-to-worker side effects. Do not
  publish a queue event inside a transaction and assume atomicity with PostgreSQL.

### 3.2 Database and concurrency

- Keep transactions short; never wait for SMS, payment, carrier, object storage or
  AI inside a database transaction.
- Use unique constraints for invariants, version fields/compare-and-swap for stale
  operator writes, and serializable transactions with bounded retry for scarce
  stock or other proven contention points.
- Idempotency is `operation + actor/tenant scope + key + safe payload fingerprint`.
  Same key/same payload replays the stored result; changed payload or operation is a
  conflict. Retention and cleanup are explicit.
- Money remains integer IRR. Quantity is integer unless a later unit-of-measure ADR
  introduces decimal quantities. UTC is stored; Jalali/Tehran are presentation.
- Historical order, payment, address, tax, discount and fulfillment facts are
  snapshots. Mutable catalog/customer rows cannot rewrite history.
- Migrations are forward-only after sharing; expand/migrate/contract is used for
  incompatible rollout. Every data migration has dry-run, counts and recovery plan.

### 3.3 HTTP and contract methods

| Intent                          | Method and behavior                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Read collection/detail          | `GET`; side-effect free; bounded cursor pagination; allowlisted filters/sort; ETag where useful     |
| Create resource/command         | `POST`; require idempotency for retryable business effects; return stable resource/result reference |
| Replace editable configuration  | `PUT`; complete intended representation plus `expectedVersion`                                      |
| Partial ordinary update         | `PATCH`; explicit allowlisted fields; never copy arbitrary input keys                               |
| Delete historical/critical data | normally no hard delete; use archive/cancel/revoke commands                                         |
| Remove ephemeral owned resource | `DELETE`; idempotent result and ownership/permission enforcement                                    |

All routes remain `/api/v1`, use the stable success/error envelope, publish bearer
security and request/response/error schemas in OpenAPI, propagate request IDs, and
distinguish `401`, `403`, validation, conflict, rate limit, upstream failure and
ambiguous external outcomes. Bulk endpoints are bounded and report per-item results.

### 3.4 Frontend and rendering

- Public discovery migrates route by route to the accepted Next.js App Router
  architecture. Pages/layouts are Server Components by default; Client Components
  are small interaction islands for cart, filters, forms and browser APIs.
- Cache behavior is explicit per projection. Catalog/content can use tagged caching
  and event-driven revalidation; price/availability/checkout use freshness rules
  that cannot sell stale facts. Multi-instance cache invalidation must coordinate.
- Admin uses Server Components for stable composition and client components for
  interactive operator workflows. It never performs business calculations locally.
- URL query state is canonical for shareable pagination/filter/sort. Requests are
  cancellable; stale responses cannot overwrite newer state.
- Every surface implements loading, initial empty, filtered empty, partial data,
  validation, forbidden, conflict, offline/upstream, retry-safe and success states.
- Persian RTL, keyboard operation, focus management, semantic HTML, WCAG 2.2 AA,
  local fonts, responsive images and reduced motion are release requirements.

### 3.5 Jobs and external effects

- BullMQ jobs are small, atomic and idempotent. Payloads carry identifiers and
  versions, not secrets or large mutable snapshots.
- Retry only known-safe failures with bounded attempts, exponential backoff and
  jitter. Unknown-result effects are reconciled before retry.
- Every queue defines concurrency, timeout, retention, stalled policy, dead-letter
  handling, replay authorization and alert thresholds.
- Workers use an explicit system actor and correlation/business references. Queue
  completion never substitutes for domain/audit evidence.

### 3.6 Observability and security

- Correlate HTTP, database, queue and provider operations using request/trace and
  business reference IDs. Adopt vendor-neutral OpenTelemetry traces and metrics;
  continue structured redacted logs and add log correlation as its JS support
  matures.
- Define SLIs/SLOs for browse, add-to-cart, checkout, payment verification, worker
  age, inventory reconciliation and restore freshness before production alerts.
- Enforce object-level, function-level and property-level authorization. Lists and
  exports receive the same controls as detail routes.
- Secrets are write-only through an approved secret backend. PII is minimized,
  classified, masked and retained by policy. Logs/traces/analytics never contain
  OTPs, tokens, credentials, full payment data or unrestricted customer data.
- File/URL integrations defend against MIME spoofing, decompression bombs, malware,
  path traversal and SSRF; object storage is private by default.
- Dependency pinning, lockfile review, CodeQL, production audit, secret scanning and
  license review remain protected gates.

## 4. Two-contributor ownership and flow

| Work            | Developer A — Platform                      | Developer B — Product                            | Shared gate                   |
| --------------- | ------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| Policy/contract | domain invariants, API, data, adapters      | journey/state matrix, content and operator needs | written decision and examples |
| Backend         | services, repositories, migrations, workers | fixture contract review                          | API and failure evidence      |
| Clients         | generated/typed client support              | web/admin implementation and accessibility       | contract parity               |
| Integration     | provider/database/concurrency tests         | Playwright journeys and UX recovery              | one real vertical slice       |
| Operations      | deploy, telemetry, backup, reconciliation   | UAT, help and release verification               | two-person sign-off           |

Rules:

1. Limit each contributor to one primary implementation and one review/unblock.
2. Land policy/contract before parallel API/UI work.
3. Coordinate before editing schema, migrations, contracts, OpenAPI, navigation,
   root configuration or lockfile.
4. Author pushes final head; the other contributor reviews that exact SHA; the
   effective reviewer is not the last pusher.
5. A partial PR references its parent issue but does not close it.
6. Handoffs map every acceptance item to file, test and command evidence.

## 5. Dependency-ordered delivery gates

### G0 — Governance and safe delivery

Scope: team agreement, decision ownership, branch/review protocol, environment
inventory, dependency remediation, secret process and release authority.

Developer A:

- configuration schemas for dev/test/staging/production;
- protected CI, supply-chain checks and artifact provenance;
- secret-manager choice and least-privilege environment access;
- ADR/decision register and operational risk register.

Developer B:

- working cadence, review SLA, UAT/release verifier and content ownership;
- standard handoff/checklist adoption.

Exit: #78 or its successor is accepted; no High/Critical dependency finding; owners,
access, rollback authority and secret process are explicit.

### G1 — Production-shaped identity and notification foundation

Scope: finish live customer/staff Auth UX, SMS.ir integration, session recovery,
permission-aware navigation and secure provider settings.

Required behavior:

- at most one provider dispatch invocation per committed OTP challenge, with no
  blind retry when provider acceptance is unknown;
- read-only environment secret and writable production secret backend;
- admin configuration with optimistic versioning, fresh MFA, audit attempt/outcome,
  validation and diagnostics;
- live password/TOTP/recovery, refresh, logout, logout-all and session/device UX;
- abuse, redaction, cookie/origin, replay and revocation evidence.

Exit: no production Auth route uses fixtures; all security states are demonstrated;
SMS outage/configuration behavior fails closed and is operable.

### G2 — Catalog information architecture, pricing and media contract

Decide before implementation:

- category depth, ordering, move/archive and redirect behavior;
- product type, attribute definitions, option values, variant generation and
  required SKU/barcode/weight/dimension fields;
- Persian normalization, slug/alias/collision rules and import columns;
- base/sale/effective price, audit/history, discount/tax/rounding and display rules;
- image/file types, byte/pixel limits, ordering, alt text, transformations,
  presigned expiry, confirmation and orphan cleanup;
- publish readiness, availability summary and public SEO fields.

Developer A: contract, models/migrations, projection/query/index design, storage
port and validation. Developer B: admin wizard/list/preview specification,
storefront templates, fixtures and accessibility matrix.

Exit: accepted contracts and migration plan cover draft → SKU/price/media → publish
without invented client behavior.

### G3 — Integrated catalog administration

Deliver:

- category/brand lifecycle and ordering;
- product draft editor, attributes/variants/SKUs, media and price history;
- publish/unpublish/archive commands and readiness checklist;
- safe bulk import with upload, full-file validation, dry-run, row errors,
  idempotent commit and result report;
- permissioned server-filtered tables and audit timelines.

Critical tests: cycles/depth, slug/SKU/barcode conflicts, BigInt boundaries,
effective-date overlap, malicious/oversized media, abandoned upload, stale edit,
allow/deny and audit redaction.

Exit: an authorized operator publishes a complete sellable SKU without database
access and another operator can trace every change.

### G4 — Public catalog, search and discovery

Deliver:

- server-rendered home, category, brand, product and approved content routes;
- public projections excluding draft, cost and internal warehouse facts;
- product detail, responsive media, availability summary and related products;
- Persian-normalized search, SKU/barcode lookup where public policy allows,
  allowlisted facets, typo/synonym strategy and URL-restorable pagination;
- dynamic robots/sitemap shards, canonical/noindex rules, JSON-LD and merchant feed;
- cache tags/invalidation, last-known-good discovery artifacts and crawl/performance
  workflows.

Start with indexed PostgreSQL search for measured initial scale. Add a dedicated
search engine only when query quality/latency/indexing evidence justifies an ADR.

Exit: no sellable production page uses fixture data; publish/update/archive/slug and
price/availability changes meet defined freshness and parity SLAs.

### G5 — Warehouse and inventory operations

Decide: reservation TTL, FEFO/FIFO/manual allocation, multi-location priority,
backorder, damaged/quarantine representation, reason codes and approval thresholds.

Deliver:

- protected warehouse/location lifecycle;
- bounded balance and immutable movement reads;
- receipt, adjustment, damage/write-off and return movements;
- reservation create/consume/release/expire worker;
- transfer request/approve/dispatch/receive/cancel with in-transit evidence;
- stocktake snapshot/count/review/approve and reconciliation;
- low-stock thresholds, barcode input and operator admin modules.

Exit: parallel receipt/reserve/transfer/expiry cannot oversell or double-apply;
every physical change reconciles to actor, reason and business reference.

### G6 — Customer profile, address, cart and checkout

Decide: guest cart, login merge precedence, cart expiry, quantity limits, Iranian
address/postal requirements, shipping quote authority and reservation visibility.

Developer A:

- owned customer/profile/address APIs with PII controls;
- cart commands storing SKU/quantity only and server repricing every response;
- deterministic discount/tax/shipping quote pipeline;
- checkout orchestration: reprice, availability check, reserve, snapshot and
  idempotent draft order creation;
- conflict/compensation behavior for price, stock, session and timeout changes.

Developer B:

- cart drawer/page, merge and price-change messaging;
- address book and accessible checkout stepper;
- deliberate submit recovery using the same idempotency key;
- mobile/offline/session/conflict UX.

Exit: manipulated totals are ignored; same logical submit yields one order; scarce
stock concurrency is correct; the customer understands every material change.

### G7 — Order and fulfillment operations

Deliver:

- order aggregate/application service over explicit order/payment/fulfillment states;
- controlled confirm/cancel/expire commands and reservation compensation;
- immutable sale-time product, price, discount, tax, customer and address snapshots;
- transactional outbox for downstream effects;
- customer confirmation/history/detail/timeline;
- admin queue/detail/actions, picking, packing and printable document baseline;
- stale-version and multi-operator conflict recovery.

Exit: illegal transitions cannot occur; cancellation/expiry reconcile stock and
payment obligations exactly once; history cannot be rewritten by later edits.

### G8 — Payment, shipping and transactional notifications

Decide: payment provider and sandbox, callback/verify/refund contract, cancellation
window, carriers/geography/rates, tracking ownership and required notification events.

Payment:

- provider-neutral initiate/verify/reconcile/refund port and deterministic fake;
- server-side signature/reference/merchant/order/amount verification;
- duplicate/reordered callback and ambiguous timeout handling;
- full/partial refund limits and accounting reconciliation queue.

Shipping:

- package/line allocation, address snapshot, carrier/service/rate/tracking;
- manual-first and provider-backed operations behind one contract;
- dispatch/delivery/failure/return-to-sender history and webhook verification.

Notifications:

- versioned templates, validated variables, transactional outbox and BullMQ workers;
- retry/DLQ/replay tools, delivery diagnostics and preference/consent separation.

Exit: sandbox purchase → verified payment → pick/pack/ship → tracking passes; forged
or duplicated events cause no financial, stock or notification duplication.

### G9 — Purchasing, returns, support and reporting

Deliver:

- supplier lifecycle, purchase approval and partial receipt;
- return request/authorize/receive/inspect/resolve per line/quantity;
- sellable restock, damaged/quarantine or no-return outcomes;
- refund linkage distinct from inventory outcome;
- customer support context, masked PII and separate internal/customer notes;
- bounded queued exports with expiry/download audit;
- stock, order aging, payment/refund, purchase, return and exception reports.

Exit: purchase, count, return and refund effects reconcile to immutable records;
support/accounting cannot bypass state machines or access unnecessary PII.

### G10 — Merchandising, retention and intelligent growth

Deliver only after the deterministic selling path is stable:

- scheduled price campaigns and coupons with server-side eligibility/stacking,
  usage limits and order snapshots;
- curated collections, cross-sell/up-sell/alternatives and governed ranking;
- search zero-result analytics, synonyms and measured relevance evaluation;
- wishlist, genuine verified reviews and moderation when accepted;
- abandoned-cart and marketing communication with consent/opt-out;
- editorial CMS with revisions, independent approval, provenance and cache/feed
  invalidation;
- privacy-reviewed funnel analytics and experiments;
- grounded AI search/comparison/support/content drafting through provider-neutral
  ports, retrieval citations, Persian evals, cost/latency limits and kill switch.

Exit: growth rules cannot alter core truth, leak PII, fabricate claims/ratings or
publish AI output without the required human gate.

### G11 — Production hardening and operational readiness

Deliver:

- reproducible production images and immutable artifacts;
- staging/production isolation, domain/TLS/reverse proxy/CDN and bounded trust;
- automated deploy, health gate, migration sequencing and rollback/forward-fix;
- OpenTelemetry traces/metrics, redacted log correlation, dashboards and alerts;
- database/Redis/queue/object-storage/provider capacity and failure monitoring;
- rate/request/file limits, CSP, CORS, secret rotation and privacy retention;
- encrypted backups, retention, restore drill and recorded RPO/RTO;
- load/soak tests, query budgets, Core Web Vitals and accessibility/security audits;
- UAT, operator/help docs and payment/inventory/incident reconciliation runbooks.

Exit: both contributors can deploy, diagnose, reconcile, restore and roll back
staging; alerts are triggered deliberately; no unresolved severity 1/2 or known
High/Critical security finding remains.

### G12 — Launch and stabilization

- freeze nonessential scope and reconcile every gate;
- rehearse/import catalog, customer and stock data with signed counts;
- configure production domains, secrets, SMS/payment/carrier and monitoring;
- run full regression and go/no-go with named driver/verifier;
- supervise and reconcile the first real order end to end;
- perform daily payment/order/inventory reconciliation during stabilization;
- confirm backup freshness and post-launch restore evidence;
- separate defects from growth backlog and tag the release.

Exit: signed launch acceptance, proven rollback, support escalation and stable
reconciliation window.

## 6. Complete capability register

The following items must be either delivered in the gates above or explicitly
deferred by a recorded product decision. They may not disappear during issue split.

| Domain        | Required capabilities                                                       | Primary gate |
| ------------- | --------------------------------------------------------------------------- | ------------ |
| Identity      | customer OTP, staff MFA/recovery, sessions/devices, RBAC, privacy lifecycle | G1/G9        |
| Catalog       | hierarchy, brands, attributes, variants/SKUs, lifecycle, import, audit      | G2–G3        |
| Media         | private upload, validation, transform, ordering, alt, cleanup               | G2–G3        |
| Pricing       | effective history, discount/tax/rounding, snapshots, approvals              | G2/G6/G10    |
| Discovery     | live pages, Persian search/facets, related/curated, SEO/schema/feed         | G4/G10       |
| Inventory     | warehouse/location, ledger, reservation, transfer, damage, stocktake        | G5           |
| Customer      | profile, addresses, consent, anonymization/export policy, support           | G6/G9        |
| Cart          | guest/account cart, merge, reprice, limits, expiry and recovery             | G6           |
| Checkout      | address, quote, recheck, reserve, idempotent order, compensation            | G6           |
| Orders        | aggregate, snapshots, transitions, customer/admin timelines                 | G7           |
| Payments      | initiate, verify, callback, reconcile, full/partial refund                  | G8/G9        |
| Fulfillment   | allocate, pick, pack, ship, deliver, cancel/return                          | G7–G9        |
| Shipping      | packages, carrier/rate, labels, tracking, webhook, exceptions               | G8           |
| Notifications | templates, outbox, workers, preferences, delivery/DLQ                       | G8           |
| Purchasing    | suppliers, approval, PO, partial receipt and reconciliation                 | G9           |
| Returns       | line quantities, inspection, stock outcome, refund link                     | G9           |
| Admin         | domain modules, task inbox, audit, settings, jobs, health, exports          | G1–G11       |
| Growth        | coupons, campaigns, wishlist/reviews, retention, recommendations            | G10          |
| Content/AI    | editorial workflow, provenance, GEO/AEO, grounded AI and evals              | G4/G10       |
| Operations    | deploy, observe, alert, back up, restore, secure and support                | G11–G12      |

## 7. Acceptance matrix for every implementation issue

Every issue must declare `N/A` with reasoning or provide evidence for each row:

| Concern       | Required evidence                                                        |
| ------------- | ------------------------------------------------------------------------ |
| Outcome       | user/operator scenario and explicit non-goals                            |
| Contract      | request/response/error examples, OpenAPI and compatibility impact        |
| Authorization | anonymous/wrong-role/missing-permission/allowed tests                    |
| Validation    | boundaries, malformed input, Unicode and payload limits                  |
| Data          | invariant, indexes, migration, lifecycle and historical impact           |
| Concurrency   | stale write, duplicate, parallel mutation and retry behavior             |
| Idempotency   | scope, fingerprint, stored outcome, conflict and retention               |
| Transaction   | atomic boundary, external-I/O separation and compensation                |
| Audit/privacy | actor/action/reference, redaction, retention and PII access              |
| Failure       | timeout, partial failure, unknown result, recovery and alert             |
| Observability | trace/metric/log fields and bounded cardinality                          |
| Performance   | query/request/job/bundle/image budgets and large-data case               |
| UX            | loading/empty/error/conflict/offline/success and responsive behavior     |
| Accessibility | keyboard, labels, focus, live announcements, contrast and zoom           |
| Tests         | unit, contract, integration, E2E and provider fake/sandbox as applicable |
| Operations    | configuration, rollout, rollback, runbook and dashboard/alert            |
| Documentation | domain/status/decision/help updates based on merged truth                |

## 8. Testing and quality strategy

- Unit: policies, calculations, state machines, normalization and UI reducers.
- Contract: OpenAPI drift, shared DTO compatibility, provider fixtures and consumer
  expectations.
- Integration: real PostgreSQL for constraints/transactions/concurrency; Redis for
  rate limits/locks/queues; S3-compatible service for upload lifecycle.
- HTTP: real Nest bootstrap, global validation/guards/filters/cookies/origin and
  exact error envelopes.
- Component/accessibility: user-centric queries, keyboard/focus, axe and RTL states.
- E2E: real API plus deterministic external adapters for every gate's critical path;
  isolate test data and use role-specific actors.
- Sandbox: provider contract verification for SMS/payment/carrier before production.
- Resilience: timeout, disconnect, duplicate, reorder, poison job, DLQ, DB retry,
  cache failure and dependency outage.
- Performance: query counts/plans, p95 API/worker, concurrent scarce stock/checkout,
  Lighthouse budgets and production RUM p75.
- Security: object/function/property authorization, abuse/rate limits, SSRF/upload,
  secret/PII artifact scans and dependency/license checks.
- Operations: deployment smoke, migration forward-fix, rollback and restore drills.

Tests assert business outcomes, not implementation details. Browser tests use
role/label-visible behavior and retain traces/screenshots only on failure with
sanitized artifacts. Flaky retries are bounded and reported; they never conceal a
deterministic regression.

## 9. Issue slicing, estimates and dependency control

Each gate is split into vertical outcomes, not one giant PR:

1. decision/ADR;
2. contract and migration;
3. backend command/query plus focused tests;
4. fixture-backed client states;
5. real integration/E2E;
6. operations, evidence and status reconciliation.

Sizing: `S` ≤ one focused contributor-day, `M` = two to three days, `L` = four to
five days. Split anything larger. Estimates are recalculated after policy closure
and measured team capacity; calendar dates are not invented.

An issue is `ready` only when dependencies, owner, contract/policy, test data and
external sandbox needs are known. It is `blocked` when progress requires a human
decision, external credential/account, accepted parent contract or another merged
capability. Record the single unblock action and owner.

## 10. Decision register that must close before dependent work

| Decision                                       | Blocks                                      |
| ---------------------------------------------- | ------------------------------------------- |
| real team capacity/release authority           | reliable scheduling and production sign-off |
| product attributes/variants/import             | G2–G4                                       |
| effective price/discount/tax/invoice rules     | G2, G6–G10                                  |
| media validation/transformation/retention      | G2–G4                                       |
| guest cart/account merge and privacy lifecycle | G6/G9                                       |
| reservation TTL/allocation/backorder           | G5–G7                                       |
| Iranian address and shipping rate/geography    | G6/G8                                       |
| payment provider/verify/refund/reconciliation  | G8/G9                                       |
| cancellation/return/damage/quarantine policy   | G7/G9                                       |
| staff approval thresholds/four-eyes actions    | G3/G5/G8/G9                                 |
| deployment target, SLO, RPO/RTO and retention  | G11/G12                                     |
| crawler training policy and AI data/consent    | G4/G10                                      |

## 11. Scale path and explicit non-goals

Optimize the modular monolith first with indexes, bounded projections, cache,
workers and horizontal stateless API/web instances. Consider dedicated systems only
after evidence:

- search service: PostgreSQL relevance/latency or indexing SLA fails measured goals;
- read replicas: primary read pressure and consistency requirements justify them;
- partitioning/archive: table/index/vacuum evidence requires lifecycle separation;
- microservice extraction: one domain needs independent scaling/deployment and the
  team can operate its network/data consistency costs;
- event streaming: outbox + queues cannot meet measured throughput/replay needs.

Do not introduce Kubernetes, event sourcing, CQRS frameworks, GraphQL, a new state
platform, a second ORM or multiple payment/search abstractions merely for novelty.

## 12. Current next sequence

As of the review date, the immediate path is:

1. clear the repository-wide dependency security gate;
2. finish the accepted Auth/SMS settings and live UX integration;
3. accept rendering/URL architecture and unblock dynamic discovery;
4. close catalog variant/pricing/media decisions;
5. deliver the first real publish → discover vertical slice;
6. expose inventory operations and reservation policy;
7. proceed through G6–G12 without skipping integrated exit evidence.

`EXECUTION_STATUS.md` must translate only the next one or two gates into active
assignments. This plan remains complete even when short-horizon priorities change.

## 13. Maintained primary references

Implementation issues must date-check the relevant official documentation rather
than copying examples blindly:

- Next.js App Router, Server/Client Components, caching and self-hosting:
  <https://nextjs.org/docs/app>
- NestJS documentation: <https://docs.nestjs.com/>
- Prisma transactions, idempotency and optimistic concurrency:
  <https://www.prisma.io/docs/orm/prisma-client/queries/transactions>
- PostgreSQL concurrency control:
  <https://www.postgresql.org/docs/current/mvcc.html>
- BullMQ idempotent jobs and retry behavior:
  <https://docs.bullmq.io/patterns/idempotent-jobs>
- OpenTelemetry JavaScript and semantic instrumentation:
  <https://opentelemetry.io/docs/languages/js/>
- OWASP API Security Top 10:
  <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- Playwright recommended practices and traces:
  <https://playwright.dev/docs/best-practices>

Official documentation informs implementation technique; repository invariants and
accepted ADRs remain authoritative for product behavior.
