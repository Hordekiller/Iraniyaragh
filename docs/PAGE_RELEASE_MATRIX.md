# Page, Content and Release Matrix

Status: authoritative page inventory and release boundary; reviewed 2026-09-10.

Implementation truth remains in `PROJECT_STATUS.md`. An entry in this matrix means
required scope, not delivered code. Only reviewed evidence merged to `main` changes a
capability to delivered.

## 1. Current truth checkpoint

| Area         | State on `main`                                                                                               | Open work, not delivered                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Customer web | Accessible responsive Vite prototype with real-HTTP Auth/session recovery merged via #139; product discovery remains fixture-backed and production selling is not live | #126 Next.js rendered pages; #140 full dynamic page/content outcome |
| Admin        | Next.js RTL shell, Auth boundary and reusable primitives; no complete operational commerce modules            | #138 shell/preferences; #133 SMS settings UI stacked on #118                                              |
| API          | Auth/RBAC, catalog foundation and inventory service core are merged                                           | #118 SMS admin contract requires corrections; #114/#115 continue SMS integration                          |
| Discovery    | ADR-0012 and the complete SEO/GEO plan are merged                                                             | #129 sitemap/robots/IndexNow and #126 rendered templates                                                  |
| Commerce     | Persistence foundations exist; real cart, checkout, payment and fulfillment journeys do not                   | G4-G8 in `COMMERCE_EXPANSION_PLAN.md`                                                                     |
| Operations   | CI and local dependencies exist                                                                               | #136 logging/telemetry plus deploy, restore, alerts and production drills                                 |

PR screenshots, fixtures, schemas and green branch tests are evidence of progress,
not proof of an integrated customer journey.

## 2. Customer route inventory

### 2.1 Public discovery and trust

| Route/surface                  | V1 behavior                                                                                      | Dynamic source                                                       | Index policy                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------ |
| `/`                            | campaign-safe home, categories, selected products, benefits and trust links                      | governed home sections/collections; live public catalog facts        | index; sitemap pages                       |
| `/products`                    | product browse with pagination and safe filters                                                  | public catalog/search projection                                     | index base; query variants noindex         |
| `/products/{slug}`             | product facts, media, variants, coarse availability, delivery/return summary and related content | catalog, price, availability, media and approved content projections | eligible published products only           |
| `/categories/{slug}`           | category intro, child categories, product list and FAQ/content relations                         | category + editorial projection                                      | approved non-thin category only            |
| `/brands/{slug}`               | brand information, product list and related guidance                                             | brand + editorial projection                                         | substantive active brand only              |
| `/search`                      | suggestions/results, correction and zero-result recovery                                         | governed search service                                              | noindex, follow; never sitemap             |
| `/collections/{slug}`          | curated campaign/landing collection                                                              | approved collection and eligibility rules                            | index only when owned/substantive          |
| `/tags/{slug}`                 | governed product-tag landing, never arbitrary database tags                                      | approved tag entity and product relation                             | approved tags only; thin/duplicate noindex |
| `/guides` and `/guides/{slug}` | buying, compatibility, installation and safety guidance                                          | revisioned content system                                            | published/approved only                    |
| `/faq` and `/faq/{slug}`       | searchable FAQ hub and durable question pages/categories                                         | revisioned FAQ entries and relations                                 | index only for substantive visible content |
| `/policies/{slug}`             | shipping, returns, privacy, terms, warranty and payment policies                                 | versioned policy content with effective date                         | approved current policy                    |
| `/about`                       | company identity and factual trust information                                                   | controlled page content                                              | index                                      |
| `/contact`                     | safe contact methods, hours and support entry                                                    | controlled settings/content                                          | index when complete                        |
| `/stores` and `/stores/{slug}` | optional physical branch/location facts                                                          | governed location projection                                         | V1 only if real branch data exists         |

Dynamic means editors update governed records without a frontend rebuild. It does not
mean arbitrary HTML, arbitrary JSON-LD, user-controlled canonicals or database rows
becoming public automatically.

### 2.2 Purchase and customer service

| Route/surface                     | Required V1 behavior                                                             | Index policy                                  |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `/cart`                           | server-priced lines, stock/price changes, quantity limits, remove/save feedback  | noindex                                       |
| `/checkout/contact`               | identity/contact confirmation and guest-policy behavior                          | noindex                                       |
| `/checkout/address`               | Iran address/postal/mobile validation and address selection                      | noindex                                       |
| `/checkout/shipping`              | server-provided methods, price, ETA and constraints                              | noindex                                       |
| `/checkout/review`                | final server totals, policy acknowledgment and idempotent submit                 | noindex                                       |
| `/payment/redirect`               | controlled handoff with no sensitive query leakage                               | noindex                                       |
| `/payment/result`                 | pending/success/failure/unknown state from server verification, not query claims | noindex                                       |
| `/account`                        | profile summary and safe navigation                                              | noindex + authentication                      |
| `/account/addresses`              | list/create/edit/archive owned addresses                                         | noindex + authentication                      |
| `/account/sessions`               | device/session visibility and revoke                                             | noindex + authentication                      |
| `/account/orders`                 | paginated history and empty/error states                                         | noindex + authentication                      |
| `/account/orders/{id}`            | immutable line/price/payment/fulfillment timeline                                | noindex + ownership                           |
| `/account/orders/{id}/tracking`   | shipment timeline and carrier reference                                          | noindex + ownership                           |
| `/account/returns` and child flow | eligible lines/quantities, reason/evidence and status                            | noindex + ownership                           |
| `/support`                        | FAQ-first recovery plus authenticated ticket/contact boundary                    | public hub may index; private context noindex |
| `404`, `410`, error, maintenance  | lifecycle-aware, helpful and never misleading                                    | explicit status/directive                     |

Modals/drawers may enhance these journeys but cannot be the only accessible or
deep-linkable representation for cart, authentication, product facts or checkout
recovery.

## 3. Dynamic content model

Content types are `page`, `faq`, `guide`, `policy`, `collection` and governed
`product_tag`. FAQ may relate to product/category/brand/checkout/support contexts, but
one canonical entry owns the answer so copies cannot drift.

Every content record requires:

- stable ID, normalized unique slug, locale and content type;
- title, summary/answer, structured allowlisted blocks and approved media/alt text;
- `draft -> in_review -> approved/scheduled -> published -> archived` lifecycle;
- author, independent reviewer, revision history and audited publish/unpublish;
- creation, significant modification, fact-review and optional effective/expiry dates;
- primary sources/provenance where claims require them;
- bounded SEO title/description, social fields and system-derived canonical;
- bounded robots choice; no arbitrary header or JSON-LD injection;
- relations to products/categories/brands and internal-link orphan checks;
- preview token that is expiring, scoped, server-validated, noindex and cache-isolated.

FAQ answers must be visible to users wherever matching structured data is emitted.
FAQ schema is optional and eligibility-dependent; it is never the reason to duplicate,
hide or inflate content. AI may draft but cannot review or publish.

Publishing and archiving emit versioned outbox events to invalidate rendered page,
navigation, sitemap, feed and retrieval indexes. Scheduled time is stored as UTC and
shown as Tehran/Jalali only at presentation boundaries.

## 4. Responsive purchase-quality contract

Design mobile-first and verify content behavior, not only named breakpoints. Required
evidence covers at least 320, 360/375, 768, 1024 and 1440 CSS-pixel viewports, zoom to
200%, landscape mobile and representative touch/keyboard input.

### Global rules

- no unintended horizontal scrolling; media is responsive with stable dimensions;
- minimum practical touch target 44 by 44 CSS pixels and visible keyboard focus;
- Persian RTL order is semantic, not achieved by visually reversing invalid DOM;
- local fonts, readable base text, sufficient contrast and reduced-motion support;
- header/search/cart CTA remain reachable without covering content or browser UI;
- filter/sort uses a dismissible accessible sheet on small screens and preserves URL
  state; desktop enhancement does not create different results;
- tables become labeled cards or controlled horizontal regions without hiding totals;
- loading reserves layout space; skeletons never impersonate actionable content;
- errors explain whether retry is safe and preserve non-sensitive entered data;
- offline, timeout, conflict and expired-session recovery never duplicates a command.

### Purchase funnel rules

- product cards expose name, image, current server price/status and one clear action;
- product detail keeps variant, quantity, availability and add-to-cart relationship
  understandable; mobile sticky action cannot hide policy/price changes;
- cart and checkout always show line totals, shipping, discount/tax when applicable and
  final IRR total from the server; Toman conversion is display-only;
- use correct `type`, `inputmode` and `autocomplete`; do not disable paste or password
  managers; validation appears at field and summary level;
- checkout is a short explicit sequence with saved progress, Back behavior and a final
  review; submit is single-flight with idempotency and unambiguous pending state;
- payment result is based on server verification/reconciliation. Refresh, back and
  duplicate callbacks cannot show a false success or create another payment;
- no forced registration before policy approval; guest/auth merge behavior must be
  decided before implementation;
- analytics measure funnel stages without storing raw address, mobile, search query or
  payment data.

### Responsive acceptance

Run component tests, automated accessibility, Playwright desktop/mobile, real keyboard
walkthrough, 200% zoom/reflow, slow-network/offline scenarios, Core Web Vitals budgets
and a supervised purchase usability script. Passing one desktop screenshot is not
responsive acceptance.

## 5. Admin page inventory

The admin agent owns presentation; platform APIs remain authoritative.

- dashboard and actionable exception queues;
- catalog: categories, brands, products, SKUs, attributes, media, prices and publish;
- content: pages, FAQ, guides, policies, collections, tags, revisions, review and preview;
- inventory: warehouses, locations, balances, movements, receipts, adjustments,
  reservations, transfers and stocktake;
- sales: carts where policy permits, orders, picking/packing, shipments and returns;
- finance: payment attempts, verification/reconciliation, refunds and exports;
- customers/support with masked PII and separated internal/customer notes;
- notifications: templates, delivery evidence and provider diagnostics;
- administration: users, roles, permissions, sessions, feature flags and safe settings;
- operations: jobs/DLQ, audit viewer, logging/telemetry aggregates from #136, health and
  deployment/backup evidence.

Every list is server-paginated/filterable, URL-stateful and permissioned. Destructive
or financially sensitive commands require confirmation, reason, fresh authentication
and/or four-eyes approval according to policy. Hidden navigation is never authorization.

## 6. Version boundary

### V1 / 1.0.0 -- one reliable selling path

V1 includes the required customer/admin pages above, one active SMS provider (SMS.ir),
one selected payment gateway, live catalog/inventory/cart/order/payment/shipping,
essential notifications, content/FAQ/policies, SEO discovery and production operations.

V1 must prepare but not expose multi-provider complexity:

- vendor-neutral `SmsProvider` and `PaymentProvider` ports;
- immutable provider/account identifier on attempts, callbacks and reconciliation;
- provider-owned secret references, capability descriptors and stable error mapping;
- webhook route/credential identity and replay/idempotency evidence;
- configuration schema capable of later holding multiple records, while validation
  enforces exactly one active production route in V1;
- no vendor DTO in domain/shared client contracts and no provider-specific logic in UI.

This foundation cannot delay the primary selling path. There is no V1 weighted routing,
automatic gateway selection, cost optimization or cross-provider failover.

### V1.1.0 -- multi-provider orchestration (#141)

- configure multiple SMS providers/accounts/lines/templates and payment gateways or
  merchant accounts through versioned, permissioned, audited admin settings;
- explicit priority/weighted/tenant-or-purpose routing policies with feature flags;
- health, quota, balance/cost and circuit-breaker evidence without secret exposure;
- sandbox/live isolation and activation checklist per provider/account;
- per-provider timeout/error normalization, webhook signature verification and replay
  protection;
- safe failover only before dispatch or after a definitive rejection. Unknown external
  outcomes are reconciled before retry/failover to prevent duplicate SMS or charges;
- payment attempt stays bound to its initiating provider; callback cannot select a
  provider from untrusted payload alone;
- reporting/reconciliation by provider and controlled rollback to the primary route;
- admin UX for draft/validate/test/activate/deactivate, conflict recovery and health;
- load, concurrency, idempotency, outage, partial-failure, security and E2E evidence.

Marketing automation, cheapest-route optimization and marketplace payment splitting
remain later scope unless a separate accepted business/architecture decision promotes
them.

## 7. Dependency order

1. Keep current truth/status and three-lane ownership synchronized.
2. Use the merged Auth/SMS contracts (#118/#139) before live UI integration (#133).
3. Land Next.js route foundation and public projections (#126), coordinated with
   sitemap/robots/IndexNow (#129).
4. Deliver content schema/workflow and FAQ/policy admin before claiming pages dynamic.
5. Complete catalog/media/pricing/inventory and replace all sellable fixtures.
6. Deliver server cart -> address -> shipping -> order -> payment -> fulfillment as one
   vertical slice, then returns/support.
7. Run responsive/accessibility/performance/security and production recovery gates.
8. Release 1.0.0 with one SMS and one gateway; stabilize and reconcile.
9. Start #141 only after 1.0 evidence is stable; introduce multi-provider activation in
   1.1.0 behind feature flags and an explicit rollback path.

## 8. Required issue/PR evidence

Every page PR identifies route, owner, contract version, fixture/live status,
indexability, cache policy, permissions, state matrix, responsive/a11y tests and E2E
handoff. Every provider PR identifies operation, payload fingerprint/idempotency scope,
external-effect point, unknown-outcome reconciliation, webhook proof, audit/log fields,
secret boundary, metrics/alerts and rollback.

Primary implementation references are ADR-0012, `SEO_GEO_AI_DISCOVERY_PLAN.md`,
`COMMERCE_EXPANSION_PLAN.md`, `ADMIN_PANEL_PLAN.md`, #136, #140 and #141.
