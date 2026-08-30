# Project Status

Last reviewed: 2026-08-30

This file is the factual starting point. Update it at the end of every sprint and
whenever a major capability changes state.

## Current stage

The repository is in **foundation/prototype**, before release `0.1`.

### Implemented

- pnpm/Turborepo monorepo boundaries
- React/Vite Persian storefront visual prototype
- NestJS application bootstrap, validation, URI versioning and security headers
- PostgreSQL/Prisma schema covering core commerce and warehouse concepts
- Database service and health endpoint
- Initial inventory service for on-hand mutation, reservation and release
- Docker Compose services for PostgreSQL, Redis and MinIO
- Architecture, API, security, operations and domain principles
- Initial custom Next.js/MUI Persian RTL admin shell with self-hosted font policy
- Customer-journey backend (backend-first, admin port deferred to Phase 2):
  - `Sku`/`Price`/`Cart`/`CartItem`/`StockAlertSubscription` models, money as
    `BigInt` (int8) Rial, distinct `OrderStatus`/`FulfillmentStatus`/`PaymentStatus`
  - Inventory, catalog (list/detail), cart, checkout, orders, payments and
    stock-alert modules with controllers under `/api/v1`
  - Checkout: required `Idempotency-Key`, server-side pricing (client amounts
    ignored), min-quantity check, per-SKU reservation allocated after order
    creation (reservations carry `orderId`)
  - Orders: list/detail/cancel with a dedicated state-machine (order, fulfillment,
    payment transition tables)
  - Payments: server-side amount, idempotent verify, gateway interface + fake
    provider, order PENDING_PAYMENT -> PAID on successful verified payment
  - Notifications: `SmsSender` abstraction + dev provider; deduped (guarded
    ACTIVE->NOTIFIED) restock notifications
  - Stock alerts: subscribe/cancel/list with `@@unique` dedupe on re-subscribe
  - Cross-cutting: `AppError`/error codes, `AllExceptionsFilter` envelope,
    request-id middleware, `withSerializableRetry`, `PageQueryDto`/`buildPageMeta`
  - Committed baseline migration `20260831000000_commerce_customer_journey` with
    appended CHECK constraints (auth + commerce); `prisma migrate diff` shows no drift
  - Jest test harness (`jest.config.js`, ts-jest) with unit tests for the state
    machines, checkout DTO/checks (idempotency, min-quantity, server-side pricing),
    payment idempotency + amount mismatch, and stock-alert dedupe/double-notify.
    Verified: `typecheck`, `lint`, `build` and `test` (22 passing) all green.

### Partial

- Inventory rules live in one service with controllers now present, but not yet
  audited for authenticated actor/audit metadata in every command.
- Shared contracts only contain basic response/money/inventory types.
- The storefront has responsive interactions but uses in-file static data and
  simulated actions.

### Not implemented

- Authentication, sessions, OTP, 2FA and RBAC enforcement
- Admin e-commerce views (Phase 2: port Vuexy orders/products/customers/dashboard
  into `apps/admin` against the new API)
- Supplier and audit use case controllers
- Shipping/fulfillment ops, gateway/shipping provider selection, refunds
- Workers/queues, object upload flow, search and cache integration
- Integration/E2E tests against a live database, seed script, observability and
  deployment pipeline

## Known engineering gaps

1. Integration/E2E coverage for checkout/payment against a live Postgres was not run
   in this session (unit tests only); serialization-retry and failure-path coverage
   at the DB level remain to be verified.
2. No deterministic development seed for the full customer journey.
3. `apps/web/src/App.tsx` is a large prototype component and must be decomposed
   route-by-route; it must not become the production application structure.
4. CORS currently accepts dynamic origins and must use an environment allowlist.
5. Inventory commands do not yet capture authenticated actor/audit metadata.
6. Reservation consume/expire and transfer flows are not implemented.
7. Payment refunds, shipping and fulfillment command controllers are not implemented.
8. GitHub branch protection cannot be enabled for the private repository on the
   current account plan. CODEOWNERS and the two-person PR/CI policy are present,
   but enforcement is manual until plan capability changes.

## Status update template

At sprint close, replace the relevant sections and append:

```text
Sprint:
Completed:
Deferred (with reason):
New risks/debt:
Metrics/tests:
Next release confidence: green | amber | red
```
