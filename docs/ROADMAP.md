# Delivery Roadmap

This is the executive view of delivery. The executable sprint backlog, owners,
acceptance gates and dependencies live in `DEVELOPMENT_PLAN.md`.

## Product objective

Deliver a reliable Iranian hardware/fittings commerce system with one source of
truth for catalog, inventory, orders and payments. The first release targets one
business, a small operations team, one or more warehouses, and a customer web
store. Native mobile and advanced growth features are intentionally later.

## Release sequence

| Release | Target | Outcome |
| --- | --- | --- |
| `0.1` | Foundation | Reproducible local setup, CI, conventions, auth/RBAC skeleton |
| `0.2` | Catalog | Admin product/SKU management and public catalog API |
| `0.3` | Inventory | Warehouses, ledger, receipts, adjustments, reservations, transfers |
| `0.4` | Selling | Cart, checkout, order state machine and admin order operations |
| `0.5` | Payment | Gateway adapter, verification, shipping and notification workflow |
| `0.6` | Warehouse+ | Purchasing, stocktake, returns and operational reporting |
| `1.0` | MVP launch | Hardened, monitored, backed-up production release |

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

Exit gate: all gates in `DEVELOPMENT_PLAN.md` are signed off; no open severity-1
or severity-2 defect; restore and rollback have been demonstrated.

## Post-MVP candidates

Promotions/coupons, wholesale price lists, wishlist/reviews, content/blog tooling,
advanced analytics, marketplace/accounting/logistics integrations, dedicated
search infrastructure, and React Native mobile. These are not allowed to delay
the MVP unless a documented business decision changes scope.
