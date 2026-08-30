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

### Partial

- Inventory rules exist in one service but have no public controller, authorization,
  audit actor, retry policy, tests or complete reservation lifecycle.
- Shared contracts only contain basic response/money/inventory types.
- The storefront has responsive interactions but uses in-file static data and
  simulated actions.

### Not implemented

- Authentication, sessions, OTP, 2FA and RBAC enforcement
- Catalog, customer, order, payment, supplier and audit use cases/controllers
- Operational admin modules and mobile application
- Cart, checkout, shipping, payment gateway and notifications
- Workers/queues, object upload flow, search and cache integration
- Tests, seed script, initial migration, observability and deployment pipeline

## Known engineering gaps

1. No committed database migration or deterministic development seed.
2. No automated test suite or coverage thresholds.
3. `apps/web/src/App.tsx` is a large prototype component and must be decomposed
   route-by-route; it must not become the production application structure.
4. CORS currently accepts dynamic origins and must use an environment allowlist.
5. Critical serializable transactions need bounded retry behavior for transaction
   conflicts and concurrency tests.
6. Inventory commands do not yet capture authenticated actor/audit metadata.
7. Reservation consume/expire and transfer flows are not implemented.
8. Money documentation specifies integer-safe persistence while the schema uses
   decimal values; resolve the exact IRR convention with an ADR before commerce work.
9. Order status currently combines concepts that the foundation says must be
   separated. Migrate to distinct order/payment/fulfillment state machines.
10. API response envelopes, stable errors, correlation IDs and OpenAPI are not wired.

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
