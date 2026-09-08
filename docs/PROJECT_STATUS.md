# Project Status

Last reviewed: 2026-09-07

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
| Customer/auth UX               | Partial           | Fixture-backed customer and staff journeys exist; live production wiring is incomplete      |
| Catalog API                    | Merged foundation | #103 delivered the first Category/Brand/Product/SKU backend vertical slice                  |
| Inventory core                 | Partial           | Transactional service and concurrency tests exist; HTTP/RBAC/operator flows do not          |
| Selling/payment/fulfillment    | Foundation only   | Persistence/state-machine scaffolding exists; application workflows do not                  |
| Production operations          | Early             | CI/security controls exist; deploy, monitoring, backup/restore and rollback evidence do not |

Using the gate model in `EXECUTION_BACKLOG.md`, G0/G1 are substantially complete,
G2 is at acceptance reconciliation, G3 has a merged API foundation, G4 has a reusable service
foundation, and G5–G10 have not reached integrated completion.

## Repository snapshot

- Default branch: `main`.
- Baseline at review: `main` commit `65ade33`, containing merged #109 and #103.
- #49 is closed; active coordination includes #66, #91, #50, #78, #79 and #81.
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
| Customer Auth | API runtime and fixture UX                                 | Production SMS adapter/outage policy and live client integration                |
| Staff Auth    | Runtime and privileged lifecycle merged; fixture UX exists | Live MFA/session UX and production acceptance                                   |
| Catalog       | Contracts and API foundation merged via #103               | Media/pricing, admin UI and storefront integration                              |
| Inventory     | Correct service core                                       | Authenticated HTTP, warehouse/location commands, transfers, worker and admin UI |
| Orders        | Schema and generic state helper                            | Aggregate/services, snapshots, compensation, API and UI                         |
| Payments      | Schema/state foundation                                    | Provider/adapter, verification, idempotency, refund and reconciliation          |
| Web           | Accessible prototype                                       | Static `prototype.ts` data and simulated commerce actions                       |
| Admin         | Shell, Auth and UI primitives                              | No operational domain modules                                                   |
| Operations    | CI and local Compose                                       | Deploy/staging, observability, recovery and rollback proof                      |

## Not implemented

- Production SMS delivery and provider outage behavior.
- Full live client refresh/cross-tab recovery and production permission navigation.
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

## Decisions and blockers

1. Production SMS provider, sandbox and outage policy (#79).
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
3. #79 is decided or recorded as an explicit release-blocking dependency.
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
