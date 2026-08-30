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
- Typed API startup configuration, explicit CORS allowlist and initial Vitest unit tests
- Playwright smoke suite (`e2e/`) covering the storefront and admin shells
  on desktop + mobile viewports, with a strict zero-external-asset network gate
- Self-hosted Vazirmatn variable font in the storefront (no Google Fonts at runtime)

### Partial

- Inventory rules exist in one service but have no public controller, authorization,
  audit actor, retry policy, tests or complete reservation lifecycle.
- Shared contracts only contain basic response/money/inventory types.
- The storefront has responsive interactions and its component tree is decomposed
  (see #19), but actions are simulated and all data comes from static prototype
  fixtures isolated in `apps/web/src/data/prototype.ts` (TEMP::G3-07).
- Unit tests cover environment/CORS validation; a Playwright smoke suite covers the
  web and admin shells, but domain/database integration harnesses are not implemented yet.

### Not implemented

- Authentication, sessions, OTP, 2FA and RBAC enforcement
- Catalog, customer, order, payment, supplier and audit use cases/controllers
- Operational admin modules and mobile application
- Cart, checkout, shipping, payment gateway and notifications
- Workers/queues, object upload flow, search and cache integration
- Integration tests, seed script, initial migration, observability and deployment pipeline

## Known engineering gaps

1. No committed database migration or deterministic development seed.
2. Configuration unit tests and a Playwright shell smoke suite exist; domain,
   database integration, concurrency and coverage thresholds remain.
3. The storefront prototype is decomposed into typed single-purpose components.
   Static fixture data in `apps/web/src/data/prototype.ts` must be replaced by a
   typed API client (TEMP::G3-07), and new work must use explicit route/API boundaries.
4. CORS now uses a validated environment allowlist; deployment configuration must
   supply the correct staging/production origins and retain negative tests.
5. Critical serializable transactions need bounded retry behavior for transaction
   conflicts and concurrency tests.
6. Inventory commands do not yet capture authenticated actor/audit metadata.
7. Reservation consume/expire and transfer flows are not implemented.
8. Money documentation specifies integer-safe persistence while the schema uses
   decimal values; resolve the exact IRR convention with an ADR before commerce work.
9. Order status currently combines concepts that the foundation says must be
   separated. Migrate to distinct order/payment/fulfillment state machines.
10. API response envelopes, stable errors, correlation IDs and OpenAPI are not wired.
11. GitHub branch protection cannot be enabled for the private repository on the
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
