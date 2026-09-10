# Project Status

Last reviewed: 2026-09-10

This document is the factual entry point for the repository. It distinguishes
merged capability, open pull-request work, local/uncommitted material and planned
scope. A feature is not called complete merely because code exists on a branch.

## Executive summary

Iraniyaragh is in **pre-release foundation/auth completion**, before release `0.1`.
The repository has a credible platform baseline and substantial authentication,
security and test infrastructure. It is not yet a usable commerce product: the
storefront still sells from fixtures, the operational admin has no business modules,
and cart, checkout, order-driving services, payment, shipping and production
operations are absent.

Current delivery confidence:

| Area                           | State             | Evidence-based assessment                                                                   |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------- |
| Repository/platform foundation | Advanced          | Monorepo, CI, migrations, health, structured API foundation and test layers exist           |
| Authentication/RBAC runtime    | Merged foundation | Privileged lifecycle merged via #109 and its parent #49 is closed                           |
| Customer/auth UX               | Merged foundation | Real HTTP client defaults in the storefront with Web-Locks-serialized silent restore (#50 delivered via #139); real OTP request + error/rate surface E2E'd; happy-path OTP verify still gated on SMS delivery and a dev code-reveal |
| Catalog API                    | Merged foundation | #103 delivered the first Category/Brand/Product/SKU backend vertical slice                  |
| Inventory core                 | Partial           | Transactional service and concurrency tests exist; HTTP/RBAC/operator flows do not          |
| Selling/payment/fulfillment    | Foundation only   | Persistence/state-machine scaffolding exists; application workflows do not                  |
| Production operations          | Early             | CI/security controls exist; deploy, monitoring, backup/restore and rollback evidence do not |

Using the gate model in `EXECUTION_BACKLOG.md`, G0/G1 are substantially complete,
G2 is at acceptance reconciliation, G3 has a merged API foundation, G4 has a reusable service
foundation, and G5–G10 have not reached integrated completion.

## Repository snapshot

- Default branch: `main`.
- Baseline at review: `main` commit `05c1bd4`, containing merged #109, #103, #112,
  #144, #148, #150 and accepted ADR-0011 via #116.
- #49 and #79 are closed; active coordination includes #66, #91, #50, #78,
  #81, #114 and #115.
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

Still outside the merged Catalog foundation: media upload, price history/effective-price policy, complete
product detail, admin screens and live storefront integration.

Delivery gate: current-main reconciliation, current-head CI, independent contract/
security/query review, OpenAPI drift confirmation and merge.

## Partial capabilities and exact boundaries

| Capability    | What exists                                                | What prevents completion                                                        |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RBAC          | Roles, seed and guard machinery                            | Every domain route still needs explicit allow/deny policy tests                 |
| Customer Auth | API runtime; real HTTP storefront client merged via #139 | Real OTP request + error/rate surface E2E'd and cross-tab refresh Web-Locks-serialized (CI runs Redis); happy-path sign-in needs SMS delivery + dev-reveal |
| Staff Auth    | Runtime and privileged lifecycle merged; fixture UX exists | Live MFA/session UX and production acceptance (admin UI with Hordekiller)                 |
| Catalog       | Contracts and API foundation merged via #103               | Media/pricing, admin UI and storefront integration                              |
| Inventory     | Correct service core                                       | Authenticated HTTP, warehouse/location commands, transfers, worker and admin UI |
| Orders        | Schema and generic state helper                            | Aggregate/services, snapshots, compensation, API and UI                         |
| Payments      | Schema/state foundation                                    | Provider/adapter, verification, idempotency, refund and reconciliation          |
| Web           | Accessible prototype                                       | Static `prototype.ts` data and simulated commerce actions                       |
| Admin         | Shell, Auth and UI primitives                              | No operational domain modules                                                   |
| Operations    | CI and local Compose                                       | Deploy/staging, observability, recovery and rollback proof                      |

## Not implemented

- Production SMS delivery and provider outage behavior.
- Silent single-flight restore, cross-tab revocation handling and expired-state UX are
  merged via #139 (real HTTP default, fixture only behind `VITE_FIXTURE_AUTH=true`);
  production acceptance still requires live SMS, admin MFA/session UX and permission
  navigation.
- Media upload and S3 presigned flow; price history/effective pricing/VAT policy.
- Inventory HTTP CRUD/commands, transfers, expiry worker and operator modules.
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

## Open pull-request work (not yet on main)

Sprint-1 #50 admin acceptance slices and the pending #133 re-review are tracked
here; none of the bullets below is counted as delivered until merged on `main`.
`docs/PROJECT_STATUS.md` is a shared hotspot; contributors touching it must
rebase/merge latest `main` first and preserve the factual distinction between
merged, open and local-only work. `#150` is merged and is no longer in this list.

- `#149` — admin permission-aware navigation (`feat/50-permission-nav`, head
  `44ee4f0`): its permission-aware navigation work is superseded by the corrected
  parent/child implementation in `#138` → `#143`; it must not be merged separately.
- `#138` — admin Vuexy foundation (`feat/admin-vuexy-foundation`, head
  `b45c502`): theme/layout preferences, shell menus, global search and DataTable
  upgrades are open and CI-green. Runtime review is approved; the PR remains open
  until this status reconciliation is reviewed and the exact resulting head is
  independently approved.
- `#143` — admin Vuexy commerce shell (`feat/admin-vuexy-commerce-shell`, head
  `53d8260`, based on `#138`): the child adds shell/customizer access UX and a
  centralized deny-by-default permission filter for both sidebar and global
  search. CI is green; review/merge is strictly sequenced after `#138`.
- `#133` — admin settings/SMS panel (`feat/115-sms-admin-panel`, head
  `3301412`): the original blockers and fixture correctness items are addressed.
  The fixture enforces the API idempotency-key grammar before any lookup/effect
  and fingerprints secrets with Web Crypto SHA-256 without retaining raw values.
  Its verified head is CI-green; final current-main rebase and approval are
  intentionally sequenced after the `#138` → `#143` admin stack.

Remaining for real customer sign-in: SMS delivery is wired to adapters only (no
provider call from the OTP service yet) and the issued code has no dev-gated reveal,
so a happy-path OTP E2E cannot run without a provider bound to a test phone (tracked
on the Sprint 1 plan).

## Decisions and blockers

1. **Resolved by ADR-0011/#79:** SMS.ir is the initial provider behind the
   vendor-neutral `SmsProvider` boundary; #114/#115 own implementation.
2. Payment provider and verification/refund contract.
3. Shipping geography, methods and pricing authority.
4. Reservation TTL and multi-location allocation policy.
5. Guest checkout, identity linkage/merge and anonymization.
6. Product variants/attributes and import format.
7. Staff role matrix, approval thresholds and four-eyes actions.
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

1. Treat merged #109 and closed #49 as the Auth runtime evidence baseline.
2. Reconcile remaining acceptance across #50 and #91.
3. Implement and verify the accepted SMS boundary through #114 and #115;
   provision the production account, line and secret through private operations.
4. #78 records capacity, review SLA and release authority.
5. Clean `main` passes lint, typecheck, tests, integration, build, OpenAPI drift and
   browser smoke.
6. Auth docs and OpenAPI match merged behavior.

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
