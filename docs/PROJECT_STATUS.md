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
- Baseline at review: `main` commit `9b4ba32`, containing merged #109, #103, #112
  and accepted ADR-0011 via #116.
- #49 and #79 are closed; active coordination includes #66, #91, #50, #78,
  #81, #114 and #115.
- Local-only or untracked material is never counted as delivered product capability.

### Local storefront routing work (committed locally on `feat/admin-catalog-slice`)

- Single-page routed customer purchase flow inside `apps/web`: home, category,
  search, bestsellers, product, cart, checkout, mock payment, account, orders,
  order detail and 404 pages, wired through `react-router` with a shared shell
  (`AppLayout`, header, footer, mobile bottom nav).
- Swappable, fail-closed data layer (`services/`): catalog, cart and order ports
  with fixture implementations gated behind `VITE_FIXTURE_CATALOG=true`, matching
  `@iranyaragh/contracts` (Money/IRR). Cart is in-memory + localStorage; orders are
  persisted to localStorage. Auth reuses the existing fixture OTP flow.
- All `apps/web` checks pass: typecheck, lint (incl. runtime-asset policy), build,
  unit tests (172 in 16 files) and the `CI=true` coverage gate (lines 88.5 /
  statements 84.4 / functions 79.6 / branches 82 vs 80/78/72/75).
- Hardcoded business values centralised: contact info, working hours, shipping
  costs/threshold, section anchor IDs, founding copyright year (computed from the
  live Jalali year), newsletter/brand counts, home-promo data, the catalogue
  size advertised in the header search placeholder, the same-day delivery promo
  copy, the special-collection copy and the login placeholder now live in
  `apps/web/src/lib/site-config.ts`; category filter pills derive from category
  data; product counts render from array lengths. The duplicate Toman-only
  formatter was renamed `formatTomanDisplay`, a `toLatinDigits` helper powers
  real `tel:` links from the Persian phone constants, and `react-router-dom` is
  declared in `apps/web/package.json`.
- Remaining prototype-only styling fixed since the prior review: hero slide counter
  derives from `heroSlides.length` and CTA buttons deep-link to real category routes
  via a per-slide `ctaSlug`; best-seller and (previously) product-modal prices use
  `formatTomanDisplay`; search-result counts used `formatPersianNumber`.
- Fake/dangling CTAs removed: the hero secondary CTA (`cta2` field dropped from the
  `HeroSlide` type and prototype data), the redundant category-grid "همه دستهها"
  button, the blog "همه مقالات" button and clickable blog cards (blog CMS is
  deferred; cards are now non-interactive articles), and footer/social/help/privacy
  buttons that only showed "بهزودی" toasts.
- CTAs wired to real destinations: bestsellers "مشاهده همه پرفروشها" navigates to a
  new catalog-backed `/bestsellers` page (products sorted by popularity, registered
  in `App.tsx`), the special-collection "نمایش کلکسیون" CTA deep-links to a
  `Ronix` brand search, popular-tools "جزئیات" opens an inline delivery disclosure
  derived from `site-config`, and contact controls became working `mailto:`/`tel:`
  links (header consult, footer contact, mobile nav support).
- Dead code removed: `SearchResults.tsx` (its home usage always rendered null) and
  `ProductModal.tsx` + its test were deleted; the a11y test suite was updated for
  the router-dependent CTA components and now also covers the new navigation
  destinations and the inline delivery disclosure.
- Functional gaps fixed: order ids no longer restart after a reload (the fixture
  seeds its counter from persisted orders, covered by a new unit test), the header
  search input stays in sync with the `?q=` URL param, and the authenticated
  account menu now links to `/account` and `/orders`.
- Not yet a server-priced or live backend flow: order/payment are fixture placeholders
  that a future order/payment client must replace (see `services/cart/types.ts`).
- Local commit `b2d024c` contains the storefront slice; it is not pushed or merged and
  therefore remains local-only capability per the rule above.

### Local admin Orders read slice (committed locally on `feat/admin-catalog-slice`)

Local commit `1b943bb` contains this Orders/Settings read slice; it is not pushed or
merged. Catalog files remain untracked and owned by the parallel catalog lane.

- `/orders` read queue and `/orders/[orderId]` detail routes in `apps/admin`, built on
  the catalog admin conventions: `lib/orders/` (types, permissions, labels,
  fixture) and `components/orders/` (hook, list view, detail view) with URL-canonical
  query state, per-column sort, pagination, search and three independent filters.
- Domain shape follows `docs/COMMERCE_AND_INVENTORY.md`: order, payment and
  fulfillment lifecycles stay separate and are rendered as three badges; they are
  never flattened into a single status column.
- Permission-gated (`orders.read` to view, `orders.write` gates the read-only notice);
  without `orders.read` the page fails closed with the shared forbidden state.
- Honest data layer: the backend orders module does not exist yet, so the UI depends
  only on the `AdminOrdersApi` port, implemented by a deterministic
  `OrdersFixtureApi` (clear synthetic demo identities, no real PII). No mutation
  commands are faked — transitions are backend-owned per the accepted plan, so this
  slice is intentionally read-only until the order/payment/fulfillment API lands.
- Detail view is responsive: the lines table scrolls horizontally on narrow screens
  (`minWidth` + `stickyHeader`) and a bounded viewport avoids page-level blowout.
- Roles/support nav: the "سفارشها" navigation entry is now live (was `planned`); the
  GlobalSearch planned-item test was updated to target "پرداختها" instead.

### Local UI completion sweep (committed locally on `feat/admin-catalog-slice`)

- Storefront (`apps/web`): category/blog/hero/bestseller sections wrapped in dark
  panels and given real marquee backgrounds, alt text and dynamic rating stars;
  "دستهبندیها" in the mobile bottom nav scrolls to the section (or navigates home to
  it); newsletter subscribe becomes a real validated, persistent form
  (`services/newsletter/newsletter-fixture.ts`); site header search gains a close
  button; checkout surfaces form-level submit errors; product trust strip shows the
  honest free-shipping condition; search reuses `ProductGrid`; socials (Instagram)
  are real links and the runtime-asset lint allows navigation-only external domains.
- Cart/checkout hardening in the same local sweep: cart lines are sanitized and
  quantity-capped, persisted cart/order data is scoped to the authenticated
  customer (with a separate guest scope), Iranian mobile/postal input accepts
  Persian and international forms, provinces are selected from the Iranian list,
  order notes are persisted, checkout retries carry an idempotency key, and the
  cart is retained until mock payment succeeds. These protections improve the
  fixture path only; server repricing, reservations and real payment verification
  remain backend work and are not claimed as delivered.
- Admin (`apps/admin`): dashboard `page.module.css` now ships dark-mode surface
  overrides (mirrors `AdminShell.module.css` tokens) and aligns to the 1400px boxed
  width; a live `/settings` page (mode/skin/layout/content width + reset) is wired
  through `navigation.ts`, gated by `settings.manage` (`lib/settings/`); planned nav
  items carry `role="button"` + `aria-disabled`; FormWizard switches to a vertical
  stepper below `sm`; the login form no longer duplicates its error; the dead `isRtl`
  prop was removed from `DialogCloseButton`.
- `apps/admin` checks pass: typecheck, lint (incl. runtime-asset policy), 252 unit
  tests in 37 files, the `CI=true` coverage gate (lines 89.9 / statements 86.4 /
  functions 84.4 / branches 77.2 vs 80/75/72/60) and the Next.js build (routes list
  includes `/orders`, `/orders/[orderId]` and `/settings`).
- `apps/web` checks pass on the sweep: typecheck, lint (incl. runtime-asset policy),
  187 unit tests in 19 files, the `CI=true` coverage gate (lines 87.09 / statements
  82.66 / functions 78.11 / branches 80.48 vs 80/78/72/75), and the Vite build
  with route-level code splitting; the previous >500 kB warning is resolved (largest
  entry chunk is 472.77 kB minified).
- `e2e/tests/web-purchase.spec.ts` was added in local commit `80c42da`; its package
  lint/typecheck pass. Full Playwright execution was not accepted locally: Chromium
  returned `Object with guid ... was not bound in the connection` for web tests, while
  admin tests additionally require CI's `AUTH_DEV_CODE`; no E2E result is claimed green.
- Coordination: `docs/HANDOFF_2026-09-10.md` records the Developer B handoff (base SHA,
  owned/shared files, commands/results, manual scenarios, excluded backend claims) and the
  six backend decisions/contracts required before the `0.4` cart/checkout slice; the same
  inputs are tracked in `docs/EXECUTION_STATUS.md`.
- Coordination docs are local commits `d998220` and `ef7fc2e`; no push or PR was created.


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
- Admin Phase A foundation (PR #138): light/dark/system theme mode, default/bordered
  skin, vertical/horizontal layouts, boxed/fluid width, quick search, notifications
  and profile menus, and column-visibility/actions support in the data table.

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
| Orders        | Schema and generic state helper; uncommitted admin read queue + detail behind an `AdminOrdersApi` port (fixture-backed) | Aggregate/services, snapshots, compensation, API, payment/fulfillment commands and storefront integration |
| Payments      | Schema/state foundation                                    | Provider/adapter, verification, idempotency, refund and reconciliation          |
| Web           | Accessible prototype + routed storefront; local UI-completion sweep (dark section panels, real newsletter form, social links, mobile search/close, honest checkout/product copy, product-grid reuse) | Static `prototype.ts` data; routed pages are local/uncommitted, still fixture-driven (server-side cart/order/payment not integrated); site-wide business values centralised in `lib/site-config.ts` |
| Admin         | Shell, Auth, UI primitives, Phase A foundation (themes, layout modes, search, notifications, data-table upgrades) via #138, plus a local read-only Orders slip (queue + detail, fixture-backed) and a live `/settings` page with dark-mode dashboard surfaces | Live order API wiring, mutations, and remaining operational modules |
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
- Dynamic sitemap/robots contract, server-rendered public discovery pages,
  structured commerce data/feed, SEO/GEO observability and governed on-site AI.

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
