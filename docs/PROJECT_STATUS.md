# Project Status

Last reviewed: 2026-09-17

This document is the factual entry point for the repository. It distinguishes
merged capability, open pull-request work, local/uncommitted material and planned
scope. A feature is not called complete merely because code exists on a branch.

## Executive summary

Iraniyaragh is in **pre-release commerce integration**, after catalog/media,
public discovery and inventory HTTP foundations have merged.
The repository has a credible platform baseline and substantial authentication,
security and test infrastructure. It is not yet a usable commerce product: the
storefront still sells from fixtures, the operational admin has only read-only
Orders/Settings modules (fixture-backed — never presented as live), and cart,
checkout, order-driving services, payment, shipping and production
operations are absent.

Current delivery confidence:

| Area                           | State             | Evidence-based assessment                                                                   |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------- |
| Repository/platform foundation | Advanced          | Monorepo, CI, migrations, health, structured API foundation and test layers exist           |
| Authentication/RBAC runtime    | Merged foundation | Privileged lifecycle merged via #109 and its parent #49 is closed                           |
| Customer/auth UX               | Merged foundation | Real HTTP client and provider-dispatched OTP foundation are merged; live SMS.ir activation and provider-backed happy-path acceptance remain |
| Staff/auth admin UX            | Merged foundation | Staff login now uses the real `StaffAuthHttpClient` (#191); live MFA/session UX and production acceptance remain |
| Catalog API                    | Advanced foundation | #103/#168/#200/#214 deliver catalog, variants, pricing, import and contract parity |
| Catalog Admin                  | Merged slice      | #229 delivers product detail, attributes, variants and import management |
| Product media                  | Merged M1–M3; M4/M5 in open PR | #162/#223 deliver the image pipeline and admin authoring, #224 the public projection; merged #227 was docs-only despite its title, so the storefront gallery and the M5 publish-to-discovery journey are in open `feat/product-media-m5` (see `MEDIA_M5_EVIDENCE.md`) |
| Public discovery               | Merged slice      | #228 connects storefront catalog reads to live API data |
| Inventory core                 | Merged foundation | #222 delivers protected warehouse, balances, movements, adjustments and transfers |
| Public availability            | Merged slice      | #231 exposes fail-closed variant availability without warehouse internals |
| Reservation expiry             | Merged optimization | #232 processes bounded expiry batches transactionally with race-safe rechecks |
| Selling/payment/fulfillment    | Foundation only   | Persistence/state-machine scaffolding exists; application workflows do not                  |
| Production operations          | Early             | CI/security controls exist; deploy, monitoring, backup/restore and rollback evidence do not |

Using the gate model in `EXECUTION_BACKLOG.md`, G0/G1 are substantially complete,
G2 is at acceptance reconciliation, G3 has a merged API foundation, G4 has a reusable service
foundation, and G5–G10 have not reached integrated completion.

## Repository snapshot

- Default branch: `main`.
- Baseline at review: `main` commit `0a7faba`, containing merged catalog admin,
  public discovery, media and inventory work through #229/#232.
  The baseline contains merged #109, #103, #112,
  accepted ADR-0011 via #116, the integrated SMS/Auth/admin-settings foundation
  through #148, #151, #153, #154, the docs reconciliation #155, the #50
  session/device-management panel #158, the screenshot/a11y evidence #160, the
  catalog hardenings #157, the three-lane delivery map #156, the catalog
  idempotency contract #168, the product-media contract #161, the admin
  Orders/Settings reconciliation #169, the catalog P2 config/generation #182 and
  the Excel/import foundation #183 plus the staged import service #184, ADR-0014
  runtime RBAC/financial policy via #185, the admin navigation live-status #192,
  inventory HTTP balance/adjustment via #217, inventory error-code wiring #219,
  Sonar token handling #212, the admin double-submit CSRF fix #190, the real
  staff-auth HTTP client #191, catalog import gap fixes #200, the routed
  fixture storefront #207, the execution-docs reconciliation #194, the media
  M1 plan #211 and catalog variant-contract/attribute-endpoint parity #214.
- #49, #79, #50 and #91 are closed; #50/#91 were closed on 2026-09-11 with 7/7
  acceptance evidence. Active coordination includes #78, #81 and #114. #115 is
  closed as delivered (the SMS admin panel shipped through #151).
- Local-only or untracked material is never counted as delivered product capability.

## Delivered on `main`

### Engineering and delivery foundation

- pnpm/Turborepo workspace with API, web, admin, contracts and Playwright packages.
- NestJS modular-monolith bootstrap, strict validation, URI versioning under
  `/api/v1`, Helmet and explicit environment-aware CORS validation.
- PostgreSQL/Prisma with reviewed forward migrations and deterministic, safety-gated
  development/test RBAC seed.
- Docker Compose baseline for PostgreSQL, Redis and MinIO.
- Database-independent liveness and bounded database readiness endpoints.
- Request IDs, async context, stable error envelopes, redacted structured logging
  and global exception mapping.
- Generated OpenAPI artifact plus drift test.
- CI quality, database and browser E2E jobs; migration/drift and database constraint
  checks; CI-only Vitest coverage gates.
- Dependency/security automation and protected `main` review policy.
- Self-hosted runtime assets and external-asset checks.

### Persistence and shared contracts

- Canonical `User` principal, Customer commerce boundary, roles, permissions,
  assignments, sessions, OTP challenges and safe audit data.
- Integer-Rial `BIGINT` persistence; Toman is display-only.
- Separate order, payment and fulfillment states with append-only transition tables,
  constraints and a compare-and-swap helper.
- Shared API/error/money/Auth/catalog contract types without Prisma exposure.

### Authentication and authorization

- Access/refresh token cryptography, versioned hashing and CSRF comparison.
- Transactional session deadlines, rotation and replay-driven family revocation.
- Live-principal global guard, authentication-level and permission checks.
- Customer OTP request/verify with Iranian normalization, Redis limits, safe
  persistence, eligibility protection and environment-aware cookies.
- Staff password + TOTP/recovery runtime, enrollment/confirmation, encrypted secrets,
  replay protection and one-way recovery codes.
- Refresh with Origin/CSRF proof, logout, own-session list/revoke and safe cookies.
- Development-only staff sign-in and credential-less seeded dev admin.
- TTY-only first-admin bootstrap command with merged concurrency/rerun verification.

### Observability foundation

- Structured JSON diagnostic event contract with service/environment/version and
  request/correlation plus optional trace/span context.
- Recursive bounded redaction for sensitive keys/values, raw HTTP containers and URL
  query/fragment data; hostile getters, cycles and unserializable values fail safe.
- Production stack suppression and non-blocking logger output failure behavior.
- HTTP/dependency/worker instrumentation, telemetry export/storage, retention,
  dashboards/alerts and admin diagnostics remain explicit #136 follow-up slices.

### Inventory foundation

- Transactional on-hand mutation and reservation create/consume/release/expire.
- Immutable movements, actor/request-ID audit evidence, reason requirements,
  idempotency payload matching and optimistic balance versions.
- Bounded serializable retry and real PostgreSQL concurrency coverage.
- Service-level balance snapshot and movement queries.

### Product clients and accessibility

- Responsive Persian RTL storefront prototype split into typed components.
- Fixture-backed customer OTP UX and fixture-only staff password/TOTP journey.
- Storefront accessibility baseline with automated desktop/mobile checks.
- Persian RTL Next.js/MUI admin shell, dashboard guard and real development sign-in.
- Reusable admin table/form/wizard/confirmation/feedback primitives. Showcase routes
  are not production operational modules.

### Product Media M1 (merged via #162)

- Forward-only `ProductMedia`/rendition persistence with database-enforced active
  primary and position uniqueness.
- Protected, idempotent authoring API for list, upload intent, confirmation,
  metadata, ordering and archive operations; private S3-compatible quarantine.
- Image-first BullMQ worker with magic-byte validation, bounded decode/pixels,
  fail-closed malware-scanner boundary, JPEG/WebP renditions and atomic readiness.
- Bounded cleanup for expired uploads, private sources and archived renditions.
- Publish readiness requires exactly one `READY` primary image. Advanced video
  processing and public/admin consumers remain later M2–M5 work.

### Product Media M2 (merged via #223)

- Vuexy-aligned, Persian RTL Admin Media Manager backed by the real M1 client:
  private direct upload with progress, processing states/polling, metadata editing,
  primary selection, pointer/keyboard ordering and guarded archive confirmation.
- Admin access is gated independently by `catalog.media.read/write`; list actions do
  not expose the Media route without read permission.
- M2 adds a version-guarded, idempotent primary-selection command and prevents a
  published product from losing its primary image through archive.

### Product Media M3 (merged via #224)

- Public catalog lists expose only the ready primary image and its `CARD`
  renditions; product detail exposes the ordered ready gallery with intrinsic
  dimensions and immutable JPEG/WebP sources.
- Public URLs are derived only from the validated `PUBLIC_MEDIA_ORIGIN`; staging
  and production require an explicit HTTPS origin without credentials, query, or
  fragment. Private source and presigned upload URLs never enter public contracts.
- Media is part of the existing public response ETag payload, so ready metadata,
  ordering, archive, and rendition changes invalidate conditional responses.
- The committed OpenAPI artifact describes list `primaryMedia` and detail `media`.
- Hardened ready projection: the public list/detail media includes resolve only
  complete ready images — the READY state, an IMAGE kind, non-null `altText`, and
  non-null intrinsic `width`/`height` are all required, and the projection maps
  defensively. An incomplete READY record (for example a rendition posted by a
  concurrent integration run) is filtered out instead of crashing the public
  request.
- Isolated integration cleanup: the media cleanup in the integration spec deletes
  run-scoped product media before its product and user, keyed on the run's actor
  (`createdById`) and `runProductSlugs`, so a mid-test failure cannot leave
  `ProductMedia` rows that would block `afterAll` teardown via the
  `ProductMedia_createdById_fkey` RESTRICT. The database integration job for this
  shared HEAD is green (catalog 19/19 + media 19/19 local; unit 27/27).
- CI note: the `quality` job has only ever failed on this sha with Vitest's
  `Test timed out in 5000ms` — a runner flake on a tmp-backed transform cache, not
  a code/assertion result. The same unit spec passes 27/27 in a disk-backed
  `TMPDIR`, and the job goes green on rerun without any code change.

### Product Media M4/M5 (`feat/product-media-m5`, open PR — not yet on main)

- Storefront gallery/player replaces the single product image on the live product
  page: ordered mixed media, primary-first, intrinsic aspect-ratio reservation,
  `srcset`/`sizes`, `fetchPriority` only on the LCP candidate, keyboard-operable
  thumbnails and on-demand video with native controls, poster and captions track.
- Truthful `Product` + `VideoObject` JSON-LD emitted only from real ready media
  (no invented durations or upload dates).
- M5 real-infra E2E (`e2e/tests/api-media-publish-to-discovery.spec.ts`, 6 tests)
  covers draft → upload → process → publish → public discovery, the publish and
  projection failure paths, oversize/type mismatch, missing-object confirm,
  stale-version conflict and idempotent confirm replay. CI now starts MinIO, the
  media worker and a repeatable bucket-provisioning script.
- Evidence, verified commands and the still-open contract gaps (video pipeline,
  `catalog.publish`, 15 vs 30-minute upload TTL, weaker publish readiness) are in
  `docs/MEDIA_M5_EVIDENCE.md`.
- Also fixes a real runtime defect: `esModuleInterop` was missing from
  `apps/api/tsconfig.json`, so `sharp`/`exceljs` default imports were `undefined`
  at runtime and confirmed image uploads never reached `READY`.

## Recently merged capability

### PR #109 — Auth privileged lifecycle

- password change with current-password verification and policy errors;
- fresh-authentication guard with a 300-second window;
- other-family revocation after credential changes;
- recovery-code regeneration and `logout-all`;
- concurrent first-admin bootstrap verification and credential artifact scan;
- related unit, integration, OpenAPI and coverage evidence.

Delivery evidence: independent security review and all required CI passed; #109 is
merged and #49 is closed.

### PR #103 — Catalog API vertical slice

- Category, Brand, Product and SKU services and admin mutations;
- `catalog.read`/`catalog.write` permission boundaries and audit rows;
- public category tree, brand and product listing;
- draft opacity and publish guard requiring a SKU;
- integer-Rial prices and non-sensitive public projections;
- pagination, search, filter, allowlisted sorting and Prisma error mapping.

Remaining beyond the merged Catalog foundation: final publish-to-discovery E2E,
durable parsed-import storage and operational acceptance.

Delivery gate: current-main reconciliation, current-head CI, independent contract/
security/query review, OpenAPI drift confirmation and merge.

## Partial capabilities and exact boundaries

| Capability    | What exists                                                                                    | What prevents completion                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| RBAC          | Roles, seed and guard machinery                                                                | Every domain route still needs explicit allow/deny policy tests                                                                                |
| Customer Auth | API runtime, real HTTP storefront client and provider dispatch merged                          | Cross-tab restore and OTP failure/rate surfaces are covered; live SMS.ir credentials/template and provider-backed happy-path acceptance remain |
| Staff Auth    | Runtime, privileged lifecycle, double-submit CSRF logout fix (#190) and real HTTP login (#191) merged | Live MFA/session UX and production acceptance (admin UI with Hordekiller)                                                                  |
| Catalog       | Advanced API, Product Media M1–M4 runtime, live storefront discovery and merged Admin authoring (#229) | Publish → public discovery E2E against a running API; durable parsed-import storage |
| Inventory     | Ledger, protected warehouse/balance/movement/adjustment/transfer HTTP (#222), public availability (#231) and batched expiry (#232) | Checkout allocation, reconciliation UI and production worker rollout |
| Orders        | Schema and generic state helper; read-only admin queue/detail in the #207 storefront slice (fixture-backed, behind `AdminOrdersApi` port) | Aggregate/services, snapshots, compensation, live API and live UI                                                                              |
| Payments      | Schema/state foundation                                                                        | Provider/adapter, verification, idempotency, refund and reconciliation                                                                         |
| Web           | Accessible routed storefront with live Catalog discovery/product HTTP adapter; cart/order/payment remain fixture clients when explicitly enabled | Server pricing, inventory availability, cart/checkout/order/payment integration |
| Admin         | Shell, Auth/UI primitives, SMS settings, real staff-auth HTTP login (#191), Catalog authoring (#229) and read-only Orders/Settings modules | Live inventory/order operations and publish E2E |
| Operations    | CI and local Compose                                                                           | Deploy/staging, observability, recovery and rollback proof                                                                                     |

## Not implemented

- Live SMS.ir sandbox/production activation evidence, approved account/template
  configuration and controlled provider-backed happy-path acceptance.
- Silent single-flight restore, cross-tab revocation handling and expired-state UX are
  merged via #139 (real HTTP default, fixture only behind `VITE_FIXTURE_AUTH=true`);
  production acceptance still requires live SMS, admin MFA/session UX and permission
  navigation.
- Product Media storefront gallery and the integrated M5 journey are implemented
  on the open `feat/product-media-m5` branch, not yet on `main`; production
  S3/CORS and malware-scanner acceptance evidence remain.
- VAT policy and tax math (integer-Rial VAT on the sales basis per the permanent
  VAT Law and the configurable-rate design in ADR-0014); electronic-invoice
  (`سامانه مودیان`) emission; both are planned, not implemented.
- Runtime RBAC administration: roles/permissions are seed-owned only; there is no
  staff directory, role-assignment/revoke flow or user-status management until
  ADR-0014 (`docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`, accepted via #185) and its
  G1–G3 slices land.
- Inventory warehouse/location CRUD, reservation/transfer HTTP, optimized expiry
  worker and operator modules. Balance/movement/adjustment HTTP is merged.
- Server-priced cart, address, checkout and idempotent order creation.
- Order application lifecycle and customer/admin order experiences.
- Payment gateway, verified callback, refunds and reconciliation.
- Shipment/tracking, outbox, workers and notifications.
- Purchasing, stocktake, returns and operational reporting.
- Production deploy/rollback, monitoring/alerts, backup/restore, load budgets, UAT
  and launch data import.
- Native mobile application.
- Dynamic sitemap/robots contract, server-rendered public discovery pages,
  structured commerce data/feed, SEO/GEO observability and governed on-site AI.

## Recently shipped on main

- `#139` merged at `9db6b44` (squash of `b51aa51`, `1551348`, `1ae99f9`, `08ae512`
  and the bounded cross-tab correction from child PR `#145`):
  - `contracts(auth)`: `AUTH_PASSWORD_POLICY` added to the public error codes and the
    admin fixtures (#50 item A).
  - `web(auth)`: the storefront AuthProvider now defaults to the real `AuthHttpClient`
    (fixture only when `VITE_FIXTURE_AUTH=true`), with CSRF cookie reader, silent
    Web-Locks-serialized cross-tab session restore, token-free refresh signals,
    bounded lock acquisition, terminal-failure propagation across tabs, lifecycle
    cleanup, no-retry latch after session/CSRF failures, `session-expired` forced
    re-auth UI and memory-only tokens. Verified: web 159 unit tests + CI coverage
    gates, contracts typecheck, API 366 tests + lint + build, admin 130 tests,
    26 storefront + api-http E2E specs.
  - `e2e(api)`: integrated rotation/replay/revocation evidence against the real API
    (refresh cookie rotation, REPLAYED→family revoked→INVALID, logout/CSRF gating)
    and the real customer-OTP request/verify surface (202 envelope, per-destination
    60s 429 `RATE_LIMITED` + `Retry-After`, wrong/exhausted `AUTH_CHALLENGE_INVALID`,
    DTO `INVALID_REQUEST`); the CI e2e job runs a real Redis service.
  - `#50 acceptance`: desktop/mobile screenshots (`docs/screenshots/auth/`) and
    accessibility notes (`docs/accessibility/auth-ux.md`).
- Admin split: the admin UI slice stays Hordekiller-owned; `#139` did not change
  admin client behavior beyond item A.
- `#147` merged at `c81f791`: unexpected cross-tab refresh-coordinator failures now
  latch without rejecting the restore path (defensive catch in
  `runCoordinatedRefresh`); the console diagnostic is sanitized and no longer leaks
  the raw error. Verified 160 web unit tests + coverage gates, lint and build.
- `#150` merged at `d4db129`: verified staff login now adopts the principal and
  access token into the app-wide in-memory admin session before navigation and
  fails closed when a usable token is unavailable.
- `#144` merged at `8963c09`: the structured logging foundation adds bounded
  recursive redaction, request/correlation context and safe output-failure behavior.
- `#148` merged at `05c1bd4`: customer OTP delivery now uses the vendor-neutral
  notification boundary and SMS.ir adapter, with focused unit/integration coverage.
- `#138` merged at `18d74cd`: the admin Vuexy foundation adds persisted
  theme/layout preferences, shell menus, global search and DataTable upgrades.
- `#143` merged at `8334558`: the admin commerce shell and customizer now share a
  centralized deny-by-default navigation filter across sidebar and global search.
- `#151` merged at `a824d86` as the protected-review replacement for historical
  PR `#133`: the admin SMS settings panel now includes versioned updates,
  write-only secret lifecycle, idempotent recovery, diagnostics and the
  permission-aware `/settings/sms` route. PR `#133` remains closed as superseded;
  its review history and the exact verified head are preserved.
- `#153` merged at `b4c1cd1`: staging/production bootstrap now rejects missing or
  malformed SMS.ir credentials/template/timeout configuration before serving.
- `#154` merged at `86914a4`: the admin SMS API now exposes a truthful immutable
  environment-backed settings projection, never returns the key, reports health as
  unknown until provider evidence exists and fails closed for unsupported mutation
  and uncontrolled test-send operations.
- `#155` merged at `1de660e`: docs-only reconciliation of the post-#154 facts
  (no runtime change).
- `#158` merged at `5d4a3d0`: the `#50` admin session/device-management panel —
  `/settings/sessions` lists every active staff session through a typed session
  port over the real `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId`,
  `POST /auth/logout-all` endpoints, with a fail-closed
  `NEXT_PUBLIC_SESSION_FIXTURE=true` fixture, single-flight revoke/logout-all
  page model (current-session end + idempotent local sign-out), a permission-less
  «سیستم» nav entry, admin unit tests and an admin desktop/mobile e2e spec.
  API/contracts unchanged. Verified: all 8 CI checks green; e2e against the live
  API (list current session, revoke current → `/login`, logout-all → `/login`).
- `#159` merged at `4e00369`: docs-only reconciliation of the post-#158 facts
  (no runtime change).
- `#160` merged at `aa0dffc`: admin session-management screenshot evidence and
  accessibility notes — six desktop/mobile captures under
  `docs/screenshots/admin-sessions/`, accessibility notes
  (`docs/accessibility/admin-auth-sessions.md`) and the reproducible capture
  script (`e2e/scripts/capture-admin-sessions-screenshots.mjs`).
- `#156` merged at `4a02ecd`: a conflict-safe three-lane (Platform/Admin/User UI)
  execution map from the current foundation through `1.0` and the deferred `1.1.0`,
  with exclusive hotspot ownership, `D/C/P/A/W/I/O` issue splitting and a documented
  merge train (`AGENT_WORKSTREAMS.md`).
 - `#157` merged at `a691896`: first #111 Catalog-hardening slice — conditional public
  caching on every anonymous Catalog read (`Cache-Control: public, no-cache` + strong
  SHA-256 content ETag, `304` on matching `If-None-Match`, all five public routes
   documented in OpenAPI) and barcode removed from the anonymous variant projection
   (admin/private detail retains it). Mutation idempotency remains the separately
   planned second #111 slice.
 - `#181` merged at `5db5135`: catalog attribute/option and variant mutation services,
   optimistic version guards, SKU immutability, status synchronization, append-only
   variant price history, and the publish-ready active-variant guard.
 - `#182` merged at `f9fd1ff`: product attribute configuration and bounded variant
   generation (preview + idempotent generate, `AXIS_IN_USE` guard, server-owned
   SKU, 2000-combination cap). The remaining #178 continuation is Excel import/export.
 - `#183` merged at `56ccd83`: bounded catalog workbook parser/exporter foundation
   (fixed sheet contract, text-only identifier cells, 10 MB/10k-row bounds,
   exact-pinned `exceljs@4.4.0`, `uuid@11.1.1` override).
- `#184` merged at `cb0e222`: bounded staged catalog import service — upload,
    dry-run with zero mutation, idempotent all-or-nothing commit, bounded
    process-local parsed workbook store (32/24 h), raw bytes never persisted, and
    reference validation covering same-workbook definitions, brand/category
    preflight and canonical-SKU collisions. Remaining import wave follow-ups:
    durable parsed-import storage and Excel export wiring to live data.
- `#200` merged at `6c9e546`: closed the #189 import-verification gaps —
  `IMPORT_NOT_AVAILABLE`/`IDEMPOTENCY_CONFLICT` added to `API_ERROR_CODES` and
  documented in OpenAPI; `canonicalizeSku` folds ASCII case only (ADR-0013) and
  a forward migration enforces the ASCII-only `ProductVariant.sku/skuKey`
  invariant; idempotency-retention behavior reconciled with the service and
  pinned by tests. API 48/48 files, 537 tests green with `CI=true`.
- `#217` merged at `5e34936`: protected inventory balance/adjustment HTTP API
  (catalog of stable conflict codes, OpenAPI parity, failure-path coverage).
- `#219` merged at `f7eb9a7`: wire the declared inventory error codes into the
  service API and bind the real request ID to error envelopes.
- `#212` merged at `44d2262`: `SONAR_TOKEN` at job scope in the Sonar workflow
  with the trusted-push missing-secret failure gate; real scan runs where a
  token is available. Sonar is still not a required context on `main`.
- `#190` merged at `a7cfbac`: admin sends the double-submit CSRF proof
  (`X-CSRF-Token` echoed from the cookie) on state-changing requests, so logout
  is not 403'd; regression guard added at the AuthProvider boundary; also fixed
  the `docs/README.md` index and `@iranyaragh/api` prisma scope in
  `docs/OPERATIONS.md`. Closes #186.
- `#191` merged at `3fafceb`: the admin staff login now uses the real
  `StaffAuthHttpClient` against `/api/v1/auth/*` (password → TOTP verify →
  in-memory Bearer store → `me()` → logout with double-submit CSRF), error
  envelopes normalized to the same `StaffAuthError` codes; the fixture remains
  only behind `NEXT_PUBLIC_FIXTURE_AUTH=true`. Closes the login half of #187.
- `#207` merged at `1e11274`: extracted routed fixture storefront
  (discovery/category/search/bestsellers/product/cart/checkout/mock
  payment/account/orders + 404), fixture-gated catalog/cart/order ports behind
  `VITE_FIXTURE_CATALOG`, cart/input/idempotency hardening with CSPRNG-only
  checkout keys, responsive shell and route-level code splitting, plus the
  purchase-flow Playwright spec. Web 214 tests green; not server-priced.
- `#194` merged at `e888b7b`: docs(187) execution reconciliation — gate-symbol
  namespacing, backlog/ROADMAP/master-plan/ADR status alignment, without touching
  `PROJECT_STATUS.md`/`EXECUTION_STATUS.md`.
- `#211` merged at `c8790b6`: product-media M1 execution plan for the accepted
  `PRODUCT_MEDIA_SPEC.md` contract; binds no schema/API/UI change yet.
- `#214` merged at `0091808`: catalog variant-contract typing parity plus the
  documented `GET /catalog/admin/attributes/:id` detail endpoint with OpenAPI
  regeneration.
- `#229` merged at `0a7faba`: Admin Catalog product detail, attributes, variants,
  import management and complete component coverage.
- `#231` merged at `e49444f`: public variant availability summary with fail-closed
  status mapping and live storefront adapter integration.
- `#232` merged at `40399b4`: bounded reservation-expiry batching in one
  serializable transaction with race-safe rechecks and integration evidence.

The durable Catalog mutation-idempotency runtime is merged through #171; remaining
catalog follow-up is durable parsed-import storage and decompression-time size
guarding.

## Open pull-request work (not yet on main)

ADR-0014 is accepted via #185 (`docs/RBAC_AND_FINANCIAL_GOVERNANCE.md` records
the audited RBAC and money/financial-policy state and the G1–G8 slice plan). The
runtime slices it plans are not yet merged.

The staged catalog import flow (`#184`) and its verification fixes (`#200`) are
merged; durable parsed-import storage and live-data export wiring remain.

The #50 admin session-management slice is delivered through `#158` (merged); the
#186 logout CSRF fix landed via `#190`, real staff-auth HTTP login via `#191`.

Customer OTP dispatch is integrated through the vendor-neutral provider boundary.
Remaining for production sign-in is private SMS.ir account/key/template
activation, a controlled provider-bound test destination and sanitized
sandbox/production acceptance evidence.

The review-handoff docs reconciliation (#218) is merged; this file is reconciled
again against `main` `0a7faba` on 2026-09-16.

## Decisions and blockers

1. **Resolved by ADR-0011/#79:** SMS.ir is the initial provider behind the
   vendor-neutral `SmsProvider` boundary; #114/#115 own implementation.
2. Payment provider and verification/refund contract.
3. Shipping geography, methods and pricing authority.
4. Reservation TTL and multi-location allocation policy.
5. Guest checkout, identity linkage/merge and anonymization.
6. Product variants/attributes and import format (policy and core services resolved by
   #177/#179/#180/#181; configuration/generation merged via #182; the Excel
   import/export foundation #183 and staged import service #184 are merged; import
   gap fixes and the ASCII-only SKU invariant landed via #200; durable
   parsed-import storage and live-data export wiring remain a follow-up slice).
7. Staff role matrix, approval thresholds and four-eyes actions (runtime
   admin-configurable RBAC and financial policy accepted via ADR-0014 #185;
   its G1–G3 schema/runtime slices are planned, not yet merged).
8. Return/refund/damaged-stock policy.
9. Deployment target, RPO/RTO, retention, monitoring and budget.
10. Team capacity, review SLA and release authority (#78).

## Known engineering risks

- Reverse-proxy trust must be bounded before IP rate limits are production evidence.
- Reservation expiry needs batching/performance work (#81) before worker rollout.
- Fixture Auth UX must not be confused with live production integration.
- Coverage thresholds protect imported-code baselines, not domain completeness.
- Persistence state machines do not prove workflow correctness without services and
  compensation tests.
- Production recovery is unproven until restore and rollback drills are recorded.

## Immediate next checkpoint

Release `0.1` closes only after:

- **Done on 2026-09-11:** #50 and #91 reconciled and closed with 7/7 DoD evidence
  (screenshot/a11y evidence merged via #160; close-out recorded in both issues).

1. The accepted SMS boundary is implemented; #115 (panel) is closed as delivered
   and merged #154 covers the environment projection. Remaining acceptance is
   private #114 provisioning: provision the production account, line and secret
   through private operations and record controlled provider-backed evidence.
2. #78 records capacity, review SLA and release authority.
3. Clean `main` passes lint, typecheck, tests, integration, build, OpenAPI drift and
   browser smoke.
4. Auth docs and OpenAPI match merged behavior.

Merged PR #103 starts `0.2`; it does not alone close catalog delivery.

## Status update protocol

```text
Date / main SHA / sprint or release gate:
Merged outcomes:
Open PR outcomes (not counted as delivered):
Deferred work and reason:
New security/data/contract risks:
Verification commands and results:
Decision blockers and owner:
Next integrated outcome:
Confidence: green | amber | red
```
