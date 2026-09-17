# Delivery Roadmap

Last reviewed: 2026-09-17

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

- `0.1`: closed. Auth runtime, privileged lifecycle, sessions and RBAC are on
  `main` (#109/#111/#150/#158); #49 is closed and #50/#91 acceptance reconciled.
  Auth-parity follow-ups #186/#188 were delivered via #190/#195 (2026-09-15/13).
- `0.2`: integrated Catalog/Media foundation. Attributes, variants/SKU identity,
  price history and staged import are merged via #179–#184; Catalog parity and
  typed contracts are merged through #214; Product Media M1–M5 and the
  publish-to-discovery API journey are merged through #240; the storefront uses
  live Catalog/media data. Admin-driven publish acceptance, video processing and
  production storage/scanner acceptance remain.
- `0.3`: protected Inventory HTTP foundation. Warehouse/location, balance,
  immutable movement, adjustment, reservation and transfer APIs are merged through
  #222; public availability and bounded reservation expiry followed in #231/#232.
  Inventory Admin, Checkout allocation and production worker operations remain.
- `0.4`: partial authenticated Cart runtime. #235/#239/#241–#244 deliver accepted
  contracts, explicit User↔Customer ownership, persistence and protected
  read/add/set/remove endpoints with server pricing. Guest/merge, hardening and Web
  binding remain; Checkout/Order creation (#237) and Order API/Admin (#238) do not
  exist yet.
- `0.5`–`1.0`: planned. Payment, fulfillment, notifications and production
  operations have not reached application-workflow delivery; persistence scaffolding
  is not counted as an integrated capability.

The detailed, dependency-ordered checklist is in `V1_MASTER_PLAN.md`. Factual code
status is in `PROJECT_STATUS.md`.

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
