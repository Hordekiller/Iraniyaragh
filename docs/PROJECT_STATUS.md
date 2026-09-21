# Project Status

Last reviewed: 2026-09-20

This document is the factual entry point for the repository. It distinguishes
merged capability, open pull-request work, local/uncommitted material and planned
scope. A feature is not called complete merely because code exists on a branch.

## Executive summary

Iraniyaragh is in **pre-release commerce integration**, after catalog/media,
public discovery, inventory HTTP and the authenticated server-cart runtime have
merged. The first atomic Checkout-to-Order runtime is merged via #246 (closing
#237). Customer-owned Order reads and the permissioned staff queue/detail are
merged via #247 (closing #238).
The repository has a credible platform baseline and substantial authentication,
security and test infrastructure. The authenticated storefront Cart, Checkout and
customer Order lifecycle now uses real HTTP APIs through #268, while #270 closes
#269 with the Guest Cart API/data/security runtime and #273 binds its Web handoff.
It is not yet a complete
commerce product: Order commands, verified Payment, fulfillment and production
operations remain open. The operational Admin Order queue/detail is now bound to
the masked, permissioned #238 read API through #257.

Open PR #265 is the contract-first backend prerequisite for the factual Admin
operations dashboard: a `reports.read`-guarded, PII-free summary with an explicit
maximum 90-day Order range and a current commerce/inventory snapshot. It is not
counted as delivered until merged. Accessible Admin charts and their textual/table
fallback remain the next stacked #264 slice; neither runtime fixture metrics nor
licensed Vuexy source/assets are part of #265.

Current delivery confidence:

| Area                           | State                                       | Evidence-based assessment                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository/platform foundation | Advanced                                    | Monorepo, CI, migrations, health, structured API foundation and test layers exist                                                                                                                                         |
| Authentication/RBAC runtime    | Merged foundation                           | Privileged lifecycle merged via #109 and its parent #49 is closed                                                                                                                                                         |
| Customer/auth UX               | Merged foundation                           | Real HTTP client and provider-dispatched OTP foundation are merged; live SMS.ir activation and provider-backed happy-path acceptance remain                                                                               |
| Staff/auth admin UX            | Merged foundation                           | Staff login now uses the real `StaffAuthHttpClient` (#191); live MFA/session UX and production acceptance remain                                                                                                          |
| Catalog API                    | Advanced foundation                         | #103/#168/#200/#214 deliver catalog, variants, pricing, import and contract parity                                                                                                                                        |
| Catalog Admin                  | Merged slice                                | #229 delivers product detail, attributes, variants and import management                                                                                                                                                  |
| Product media                  | Merged M1–M5; production acceptance pending | #162/#223/#224 plus #240 deliver the image pipeline, Admin authoring, public projection, storefront gallery and publish-to-discovery E2E; video processing, production S3/CORS and malware-scanner acceptance remain open |
| Public discovery               | Merged slice                                | #228 connects storefront catalog reads to live API data                                                                                                                                                                   |
| Inventory core                 | Merged foundation                           | #222 delivers protected warehouse, balances, movements, adjustments and transfers                                                                                                                                         |
| Public availability            | Merged slice                                | #231 exposes fail-closed variant availability without warehouse internals                                                                                                                                                 |
| Reservation expiry             | Merged optimization                         | #232 processes bounded expiry batches transactionally with race-safe rechecks                                                                                                                                             |
| Cart runtime                   | Authenticated + Guest API runtime merged    | #239/#241–#244/#251 deliver authenticated ownership and correctness; #270/#269 adds opaque Guest ownership, rolling TTL, abuse controls, bounded cleanup and explicit OTP-login merge                                     |
| Checkout runtime               | Merged foundation                           | #246/#237 implements normalized addresses, configured shipping quotes, serializable repricing/allocation/reservation, immutable Order snapshots, scoped replay and transactional outbox persistence                       |
| Order read API                 | Merged read slice                           | #247/#238 delivers ownership-safe customer list/detail and an `orders.read` staff queue/detail with bounded filters and persistence-safe lifecycle/audit projections                                                      |
| Order commands/payment         | Foundation only                             | Cancellation/expiry compensation, payment and fulfillment application workflows remain separate follow-up scope                                                                                                           |
| Production operations          | Early                                       | CI/security controls exist; deploy, monitoring, backup/restore and rollback evidence do not                                                                                                                               |

Using the gate model in `EXECUTION_BACKLOG.md`, G0/G1 are substantially complete,
G2 is at acceptance reconciliation, G3 has an integrated Catalog/Media foundation,
G4 has protected Inventory HTTP and merged Checkout allocation without operator
UX, G5 has merged Cart, Checkout/Order creation and the Order-read API, and
G6–G10 have not reached integrated completion.

## Repository snapshot

- Default branch: `main`.
- Current Guest Cart reconciliation base: `origin/main` commit `ec6b2a3`, the
  protected squash merge of #270 closing #269. No anonymous Web binding,
  Order/payment/fulfillment mutation or simulated Payment success is inferred from
  that server-runtime merge.
- The baseline also contains merged #109, #103, #112,
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
- #49, #79, #50, #91 and #78 are closed; #50/#91 were closed on 2026-09-11
  with 7/7 acceptance evidence. #114 remains the private SMS acceptance blocker;
  #115 is closed as delivered (the SMS admin panel shipped through #151).
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

| Identity layer        | State               | Boundary                                                                                                                                |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime foundation    | Merged              | Customer OTP, Staff password/TOTP/recovery, sessions, refresh rotation/replay revocation, CSRF, permission guards and audit foundations |
| Customer UI           | Merged foundation   | Real HTTP Auth is default with explicit fixture flag; production SMS acceptance remains                                                 |
| Staff UI              | Partial             | Real password/TOTP login and session management exist; complete privileged-user/role administration does not                            |
| SMS provider          | Implemented adapter | Vendor-neutral port, SMS.ir adapter and fail-closed configuration exist                                                                 |
| Production acceptance | Blocked             | #114 needs controlled real account/line/template/credential evidence; no production-ready claim is made                                 |
| Runtime RBAC Admin    | Not implemented     | Seed-owned roles/permissions and guards exist; staff/role assignment/revocation UI/runtime is absent                                    |

### Observability foundation

- Structured JSON diagnostic event contract with service/environment/version and
  request/correlation plus optional trace/span context.
- Recursive bounded redaction for sensitive keys/values, raw HTTP containers and URL
  query/fragment data; hostile getters, cycles and unserializable values fail safe.
- Production stack suppression and non-blocking logger output failure behavior.
- HTTP/dependency/worker instrumentation, telemetry export/storage, retention,
  dashboards/alerts and admin diagnostics remain explicit #136 follow-up slices.

### Production-readiness boundary

- Local Docker Compose provides PostgreSQL, Redis and MinIO; production application
  images and a proven staging/production deployment are absent.
- CI enforces lint/typecheck/tests/build, PostgreSQL migration/drift/integration,
  browser E2E, dependency review, production audit, CodeQL and real Sonar Quality
  Gates on internal PRs. `sonar` is not yet a required branch-protection context.
- Structured redacted logging and request/correlation IDs are merged. Exported
  telemetry, tracing/metrics backends, dashboards and tested alerts are not.
- No repository evidence proves production secrets provisioning, deployment/
  rollback, backups, restore drills, load tests, RPO/RTO, monitoring or UAT.

### Inventory foundation

- Transactional on-hand mutation and reservation create/consume/release/expire.
- Immutable movements, actor/request-ID audit evidence, reason requirements,
  idempotency payload matching and optimistic balance versions.
- Bounded serializable retry and real PostgreSQL concurrency coverage.
- Shared, OpenAPI-documented balance and sanitized movement read projections;
  persistence-only replay keys are not exposed to operator clients.
- Shared mutation request contracts and exact OpenAPI request/response schemas;
  transfer transitions use their own optimistic aggregate version instead of
  incorrectly reusing one balance version across multiple transfer lines.

| Inventory layer        | State             | Evidence/boundary                                                                                                                                                             |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core domain            | Merged            | Ledger, balance invariants, reservations, consume/release/expire, transfers, optimistic versions, idempotency/replay and serializable retry with PostgreSQL concurrency tests |
| HTTP/API               | Merged foundation | Protected warehouse/location, balance/movement/adjustment, reservation and transfer routes, typed mutation contracts and anonymous coarse availability                        |
| Admin UX               | Planned           | Navigation entries are marked `planned`; no live operator Inventory module is present                                                                                         |
| Checkout-integrated    | Merged foundation | #246/#237 atomically allocates active locations and creates Order-linked reservations; compensation and live client integration remain                                        |
| Production-operational | Partial           | Expiry batching exists, but scheduled worker rollout, metrics/DLQ, reconciliation UI and operational acceptance do not                                                        |

### Product clients and accessibility

- Responsive Persian RTL storefront prototype split into typed components.
- Customer OTP UX defaults to the real HTTP client; fixtures are explicitly gated.
- Staff login defaults to the real HTTP password/TOTP client; remaining staff MFA/
  session operational UX and production provider acceptance are separate gaps.
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
- Publish readiness requires exactly one `READY` primary image. Admin/public/
  storefront consumers subsequently merged in M2–M5; advanced video processing
  remains unimplemented.

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

### Product Media M4/M5 (merged via #240)

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

The gallery can present video records and emit truthful `VideoObject` data, but
that is not evidence of a working video-processing pipeline: confirmed videos
currently remain `UPLOADED`. Production S3/CORS/CDN configuration and a real
malware scanner also remain production-acceptance work.

### Rich-text description contract and admin media picker (in review — #279 contract slice)

- ADR-0016 fixes the integration approach for Product description rich text and
  self-hosted media; Jodit and the Admin/Web UI adapters are follow-up slices and
  are not part of this PR.
- A server-side content sanitizer (`modules/content/content-sanitizer.ts`) is the
  security boundary for description writes: it allowlists tags/attributes/styles,
  forbids external URL schemes on `img`, strips script/event/`javascript:` sinks,
  re-checks byte/size accounting after sanitization against a 100,000-UTF-16 limit
  and carries images exclusively as `<img data-media-id>`.
- `PATCH /catalog/admin/products/:id/description` is an idempotent,
  optimistic-versioned save (`expectedVersion` + `version` increment); the server
  validates every referenced media id against READY IMAGE rows owned by the product
  with renditions and rewrites `src`/`width`/`height`/`alt` from authoritative
  media, so a client can never dictate image URLs or dimensions.
- `GET /catalog/admin/products/:productId/media/picker` exposes a ready-image,
  widest-rendition projection for the editor without leaking object keys.
- Create and Excel-import paths sanitize descriptions and drop image markup; empty
  or cleared descriptions persist as `NULL`. Description projections re-sanitize
  stored HTML on every read and drop nodes whose media can no longer be resolved.
- Audit rows for the description command store only a safe summary (`version`,
  UTF-16 length, SHA-256 of the stored HTML, media count) — never raw HTML.
- Verified locally before the contract PR: `git fetch && git log` confirmed the
  branch baselines cleanly on `origin/main` (`b9e2b60`). The full API integration
  job (17 files / 135 tests, isolation `_test` database, dedicated test Redis),
  the unit suite (72 files / 848 tests), the OpenAPI drift check and the
  `CI=true` coverage gates (lines 83.87%) all pass on this slice, as do
  `pnpm lint`, `pnpm typecheck`, `pnpm build` and the unaffected Web (325) and
  Admin (506) test suites. Only the Admin rich-text UI remains, in a later slice.

### Server Cart runtime (authenticated via #239/#241–#244/#251; Guest via #270/#269)

- `Customer.userId` provides explicit authenticated ownership; Cart lookup does
  not infer identity from a mobile number.
- PostgreSQL persists one Cart per Customer, unique Cart items and mutation replay
  records. A database `CHECK` enforces quantity `1..99`.
- `GET /api/v1/cart`, `POST /api/v1/cart/lines`,
  `PUT /api/v1/cart/lines/:variantId` and
  `DELETE /api/v1/cart/lines/:variantId` are protected by Customer OTP auth.
- Prices and line/subtotal values are calculated from active Catalog variants on
  the server. Inventory balances are projected as informational availability;
  Cart mutations do not reserve stock and do not reject a requested quantity
  merely because current availability is lower.
- `GET` is side-effect free: a linked Customer without a persisted Cart receives
  an explicit empty view (`id: null`, `version: 0`) without creating storage.
- Add/set/remove use operation-scoped SHA-256 key identities, payload fingerprints,
  stored responses, a 24-hour replay window and bounded per-Customer cleanup.
  Unexpired legacy records remain replay-compatible during migration.
- Every mutation uses bounded serializable retry/backoff. PostgreSQL concurrency
  coverage proves the `99` quantity and `100` distinct-line limits without lost
  updates; absent remove and same-quantity set do not drift Cart version.
- Shared Cart/Checkout types and explicit success/failure OpenAPI paths are
  committed. Unit/controller, migration, drift and real PostgreSQL integration
  coverage are green.
- #270/#269 adds a random opaque Guest session established by trusted-origin POST,
  stores only its SHA-256 digest, enforces separate double-submit CSRF proof and
  fail-closed distributed abuse limits, and rolls a 24-hour idle expiry.
- Guest mutations retain server pricing, quantity/line limits, scoped replay and
  serializable concurrency behavior. A bounded worker removes expired Guest carts
  only after an in-transaction expiry recheck.
- Explicit `POST /api/v1/cart/merge-guest` remains Customer-OTP protected, merges
  deterministically with stable cap/line-limit warnings, supports response-loss
  replay and records privacy-safe audit evidence.
- The remaining ADR-0015 Cart gap is the anonymous Web adapter and low-friction OTP
  handoff. Checkout itself remains authenticated and cannot create an Order before
  verified mobile OTP.

### Checkout to reserved Order runtime (merged via #246; closes #237)

- `POST /api/v1/checkout/preview` normalizes and validates an inline Iranian
  delivery address, reprices the authenticated Customer Cart and issues 15-minute
  quotes from active database-configured shipping methods. The quote is bound to
  Customer, Cart/version, normalized address hash, subtotal and policy revisions.
- `POST /api/v1/checkout` accepts only address, quote id and a bounded
  `Idempotency-Key`; prices, shipping and totals remain server-authoritative.
- One serializable transaction revalidates the quote and sellable Catalog data,
  allocates only active warehouse/location balances in deterministic order,
  creates 15-minute reservations, persists stable line ordinals and immutable
  product/address/shipping snapshots, records the attributed
  `DRAFT -> PENDING_PAYMENT` transition, consumes the quote, clears the Cart,
  records audit evidence and adds one deduplicated `ORDER_CREATED` outbox row.
- Same-key/same-payload retries return the stored response; payload mismatch is a
  conflict. The raw key is hashed, retained for 24 hours and never returned or
  written to audit/outbox. Public reservation results omit warehouse/location and
  internal idempotency fields.
- A forward PostgreSQL migration enforces Order/line money equations, positive
  reservations and balance consistency. Clean-database migration plus PostgreSQL
  tests prove rollback on insufficient stock, stale/foreign quotes, changed
  Catalog/shipping facts, inactive locations, 128-character request IDs and
  concurrent identical checkout.
- This is not a complete Order journey: shipping-method administration/provisioning,
  global retention cleanup, expiry/cancellation compensation, outbox dispatch,
  Web binding, Payment and Fulfillment remain open.
  ADR-0014 G4–G6 taxation/disclosure is also a hard gate before any real sale.

## Recently merged capability

### Customer and staff Order reads (#247/#238)

- `GET /api/v1/orders` and `GET /api/v1/orders/:id` require Customer OTP and
  derive ownership through `Customer.userId`; absent and foreign IDs return the
  same `NOT_FOUND` response.
- `GET /api/v1/orders/admin` and `GET /api/v1/orders/admin/:id` require Staff MFA
  plus `orders.read`. Lists are bounded to 100 rows and support allowlisted status,
  date, search and sort filters with stable pagination.
- Public contracts keep Order, Payment and Fulfillment states separate, transport
  integer Rial values as strings and return immutable line/address/shipping
  snapshots rather than mutable Catalog or Prisma records.
- Customer timelines omit actor, reason, request and audit data. Staff detail
  exposes typed transition evidence and a bounded audit projection, never raw
  `before`/`after`/`metadata`, payment authority, provider idempotency or warehouse
  internals. Staff customer/contact/address fields are explicitly masked and queue
  search is order-number-only until a narrower PII reveal/search permission is
  accepted. PostgreSQL integration coverage proves these non-disclosure boundaries.
- This slice is intentionally read-only. Cancellation/expiry compensation remains
  a separate critical mutation requiring state, inventory, idempotency and
  concurrency policy/evidence before implementation.

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

Remaining beyond the merged Catalog foundation: an Admin-UI-driven publish
journey, durable parsed-import storage and production operational acceptance. The
API-level real-infrastructure publish-to-discovery journey is merged via #240.

Delivery gate: current-main reconciliation, current-head CI, independent contract/
security/query review, OpenAPI drift confirmation and merge.

## Partial capabilities and exact boundaries

| Capability    | What exists                                                                                                                                                         | What prevents completion                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| RBAC          | Roles, seed and guard machinery                                                                                                                                     | Every domain route still needs explicit allow/deny policy tests                                                                                |
| Customer Auth | API runtime, real HTTP storefront client and provider dispatch merged                                                                                               | Cross-tab restore and OTP failure/rate surfaces are covered; live SMS.ir credentials/template and provider-backed happy-path acceptance remain |
| Staff Auth    | Runtime, privileged lifecycle, double-submit CSRF logout fix (#190) and real HTTP login (#191) merged                                                               | Live MFA/session UX and production acceptance (admin UI with Hordekiller)                                                                      |
| Catalog       | Advanced API, Product Media M1–M5 runtime, live storefront discovery, Admin authoring (#229) and API-level publish-to-discovery E2E (#240)                          | Admin-UI-driven publish acceptance, durable parsed-import storage and production media acceptance                                              |
| Inventory     | Ledger; inventory HTTP (#222), public availability (#231), batched expiry (#232), typed operator read/mutation contracts and merged Checkout allocation (#246/#237) | Admin operator mutation UX, reconciliation UI, compensation and worker rollout                                                                 |
| Cart          | Authenticated runtime (#239/#241–#244/#251) plus Guest token/TTL, abuse controls, cleanup, explicit OTP-login merge (#270/#269) and Web handoff (#273)                 | Production acceptance and long-running cleanup operations                                                                                       |
| Checkout      | Merged preview/create API and live Web binding with configured quotes, server repricing, deterministic reservation, immutable Order snapshot and outbox persistence    | Shipping operations, compensation/cleanup, verified Payment and production acceptance                                                          |
| Orders        | Merged state/transition foundation, `PENDING_PAYMENT` creation, #247/#238 customer/staff read API and live read-only Admin client (#257)                            | Commands, compensation and lifecycle-operation evidence                                                                                        |
| Payments      | Schema/state foundation                                                                                                                                             | Provider/adapter, verification, idempotency, refund and reconciliation                                                                         |
| Web           | Accessible routed storefront with live Catalog/media/availability, authenticated Cart/Checkout/Order lifecycle (#268) and Guest Cart handoff (#273)                    | Verified Payment API/result lifecycle and production acceptance                                                                                |
| Admin         | Shell, Auth/UI primitives, SMS settings, real staff-auth HTTP login (#191), Catalog authoring (#229), Settings and live read-only Orders (#257)                     | Inventory UX, order commands and Admin-driven publish acceptance                                                                               |
| Operations    | CI and local Compose                                                                                                                                                | Deploy/staging, observability, recovery and rollback proof                                                                                     |

## Not implemented

- Live SMS.ir sandbox/production activation evidence, approved account/template
  configuration and controlled provider-backed happy-path acceptance.
- Silent single-flight restore, cross-tab revocation handling and expired-state UX are
  merged via #139 (real HTTP default, fixture only behind `VITE_FIXTURE_AUTH=true`);
  production acceptance still requires live SMS, admin MFA/session UX and permission
  navigation.
- Product Media video processing, production S3/CORS/CDN and malware-scanner
  acceptance remain. The gallery and image publish-to-discovery journey are merged.
- VAT policy and tax math (integer-Rial VAT on the sales basis per the permanent
  VAT Law and the configurable-rate design in ADR-0014); electronic-invoice
  (`سامانه مودیان`) emission; both are planned, not implemented.
- Runtime RBAC administration: roles/permissions are seed-owned only; there is no
  staff directory, role-assignment/revoke flow or user-status management until
  ADR-0014 (`docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`, accepted via #185) and its
  G1–G3 slices land.
- Inventory Admin/operator modules, reconciliation UI, cancellation/expiry
  compensation and production expiry-worker rollout. Core inventory HTTP,
  optimized expiry batching and Checkout allocation are merged.
- Guest Cart and its low-friction OTP handoff are merged end-to-end through
  #270/#269 and #273; production-session acceptance and verified Payment remain.
- Shipping-method administration/provisioning and the global 24-hour Checkout
  idempotency cleanup job.
- Order command lifecycle. The #247/#238 read API is merged, #268 binds its
  customer Web client and #257 binds its masked read-only Admin consumer; all
  mutation workflows remain open.
- Payment gateway, verified callback, refunds and reconciliation.
- Shipment/tracking, outbox dispatcher/workers and notifications. #246/#237
  persists the first transactional `ORDER_CREATED` event but does not publish it.
- Purchasing, stocktake, returns and operational reporting.
- Production deploy/rollback, monitoring/alerts, backup/restore, load budgets, UAT
  and launch data import.
- Native mobile application.
- Dynamic sitemap/robots/IndexNow, server-rendered useful initial HTML and canonical
  metadata, server-rendered commerce structured data/Merchant feed, SEO/GEO
  observability and governed on-site AI. Product/VideoObject JSON-LD currently
  exists only in the client-rendered Product page.

## Recently shipped on main

- `#240` merged at `ce04cce`: Product Media M4 gallery/accessible mixed-media
  presentation and M5 real PostgreSQL/Redis/MinIO/worker publish-to-discovery E2E.
- `#235`/`#239` merged at `85a8ed2`/`97854ec`: accepted Cart/Checkout contracts
  and explicit User↔Customer ownership.
- `#241`–`#244` merged at `9f3ccf7`, `597bde0`, `3c61989` and `c3bb20b`:
  Cart persistence plus authenticated server-owned read/add/remove/set APIs.
- `#251` closes #250 with side-effect-free empty reads, scoped 24-hour replay,
  bounded cleanup and serializable concurrency evidence. Issue #236 is closed.
- `#270` closes #269 at `ec6b2a3` with the opaque Guest session, rolling idle TTL,
  CSRF/origin and Redis/IP abuse controls, bounded cleanup, deterministic
  Customer-OTP merge and response-loss replay; anonymous Web handoff follows.
- `#268` closes #267 with real authenticated Cart, Checkout and customer Order Web
  clients plus an honest unavailable Payment boundary; no simulated success remains.
- `#262`/`#266` publish sanitized Inventory read/command contracts, strict filters,
  bounded transfer batching and optimistic transfer concurrency for Admin clients.

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
  token is available. Current internal PRs, including #244, run and pass the real
  Quality Gate. Sonar is still not a required context on `main`; #213 remains
  open for organization-admin suspension confirmation.
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

## Open work (not yet on main)

The current baseline includes #246/#237, the independently reviewed #247/#238
read-only Order API boundary, #251 authenticated Cart hardening, #268 authenticated
Web commerce, #270/#269 Guest Cart/login merge, #273 Web Guest Cart handoff and
#257 live read-only Admin Order consumption. Order commands, compensation and
verified Payment remain open work.

Issue #267 was delivered by #268. The storefront connects authenticated product
variants, Cart mutations, Checkout preview/create and customer Order reads to the
accepted HTTP contracts; uses server-owned prices, availability, shipping quotes
and immutable Order totals; and removed the former local Cart/Order plus
simulated-payment path. Until a payment provider and verification contract are
accepted, Payment Result reports only server-recorded Order/Payment state and
leaves unpaid Orders honestly at `PENDING_PAYMENT`. Anonymous Cart handoff,
payment initiation/callback verification, refunds and compensation remain open.

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

The review-handoff docs reconciliation (#218) and commerce reconciliation #249 are
merged; #251 advances the authenticated Cart boundary and updates this evidence on
2026-09-18.

PR #265 (issue #264, not yet on `main`) adds the dashboard summary contract and
real PostgreSQL aggregation endpoint. The range is explicit and capped at 90 days;
the current snapshot covers Order, Payment-attempt, Fulfillment, Reservation and
Transfer status counts plus exact zero-availability balances. The request uses one
repeatable-read transaction with a fixed nine-operation aggregate budget and no
row hydration or loop-driven queries. The subsequent Admin UI must consume this
contract directly and provide accessible chart alternatives; it must not invent
low-stock thresholds, SLA policy, revenue semantics or sample operational data.

## Decisions and blockers

1. **Resolved by ADR-0011/#79:** SMS.ir is the initial provider behind the
   vendor-neutral `SmsProvider` boundary; #114/#115 own implementation.
2. Payment provider and verification/refund contract.
3. Shipping geography and production rates remain a business decision. Merged
   #246/#237 establishes database-configured server pricing and quote-policy
   revisioning without inventing a production rate.
4. Reservation TTL and deterministic multi-location allocation are accepted in
   ADR-0015 and implemented by #246/#237; cancellation/expiry compensation and
   production worker rollout remain.
5. Guest Cart/login merge is accepted in ADR-0015 and merged via #270/#269 with
   hashed ownership, rolling TTL, CSRF/origin protection, fail-closed abuse limits,
   bounded cleanup and privacy-safe audit. Anonymous Web handoff remains separate.
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
10. Team capacity, review SLA and release authority are resolved via #78/#172.

## Known engineering risks

- Reverse-proxy trust must be bounded before IP rate limits are production evidence.
- Reservation expiry batching is merged (#232); production worker rollout,
  observability and poison/dead-letter handling remain.
- Fixture Auth UX must not be confused with live production integration.
- Coverage thresholds protect imported-code baselines, not domain completeness.
- Persistence state machines do not prove workflow correctness without services and
  compensation tests.
- Production recovery is unproven until restore and rollback drills are recorded.

## Historical `0.1` acceptance checkpoint

The former foundation checkpoint is retained for traceability. Its repository-owned
items are closed; private SMS provider acceptance remains an external production
acceptance item rather than a reason to misstate later merged delivery.

- **Done on 2026-09-11:** #50 and #91 reconciled and closed with 7/7 DoD evidence
  (screenshot/a11y evidence merged via #160; close-out recorded in both issues).

1. The accepted SMS boundary is implemented; #115 (panel) is closed as delivered
   and merged #154 covers the environment projection. Remaining acceptance is
   private #114 provisioning: provision the production account, line and secret
   through private operations and record controlled provider-backed evidence.
2. #78/#172 records capacity, review SLA and release authority (closed).
3. Clean `main` passes lint, typecheck, tests, integration, build, OpenAPI drift and
   browser smoke.
4. Auth docs and OpenAPI match merged behavior.

Merged PR #103 started `0.2`; subsequent Catalog/Media delivery through #240 is
recorded above and still does not prove production media acceptance.

## Blocked or externally decision-gated

- #114 production SMS acceptance requires the real SMS.ir account, approved line,
  template and controlled destination; repository tests cannot supply that evidence.
- #213 remains open for organization-admin confirmation. Real SonarCloud scans pass
  on current internal PRs, but `sonar` is not a required branch-protection context.
- Payment-provider, production shipping-rate/geography and deployment RPO/RTO
  decisions are required before their production acceptance can close. They do
  not invalidate the configured quote/Checkout runtime implemented by #246/#237.

## Current commerce critical path

```text
Authenticated Cart correctness (#251)
  → guest Cart token/TTL and explicit login merge (merged #270/#269)
  → guest Cart/OTP handoff and live Web commerce (merged #273/#268)
  → live read-only Admin Order binding (merged by #257)
  → unpaid-Order expiry/cancellation compensation + outbox dispatch
  → server-verified Payment and reconciliation/refund boundary
  → Fulfillment/shipping and reservation consumption
  → transactional notifications
  → production deploy/observability/backup/restore/security evidence
  → UAT and supervised launch
```

#246/#237 creates the authoritative reserved Order and outbox row. #247/#238 adds
owned and permissioned reads only; Payment/Fulfillment must not be promoted ahead
of lifecycle commands and compensation guarantees.

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
