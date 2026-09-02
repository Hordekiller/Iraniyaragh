# Project Status

Last reviewed: 2026-08-31

This file is the factual starting point. Update it at the end of every sprint and
whenever a major capability changes state.

## Current stage

The repository is in **foundation/prototype**, before release `0.1`.

### Implemented

- pnpm/Turborepo monorepo boundaries
- React/Vite Persian storefront visual prototype
- NestJS application bootstrap, validation, URI versioning and security headers
- PostgreSQL/Prisma schema covering core commerce and warehouse concepts
- Database service plus distinct database-independent liveness and bounded PostgreSQL
  readiness endpoints with safe failure responses
- Initial inventory service for on-hand mutation, reservation and release
- Docker Compose services for PostgreSQL, Redis and MinIO
- Architecture, API, security, operations and domain principles
- Initial custom Next.js/MUI Persian RTL admin shell with self-hosted font policy
- Typed API startup configuration, explicit CORS allowlist and initial Vitest unit tests
- Auth/RBAC persistence foundation: canonical users, roles, permissions, assignments,
  sessions, hashed OTP records, login attempts and safe audit metadata
- Initial reviewed Prisma migration with PostgreSQL Auth constraints and a rollback-only
  database verification script
- Playwright smoke suite (`e2e/`) covering the storefront and admin shells
  on desktop + mobile viewports, with a strict zero-external-asset network gate
- Self-hosted Vazirmatn variable font in the storefront (no Google Fonts at runtime)
- Isolated PostgreSQL integration runner and CI database gate covering migration
  deployment/drift, Auth constraints and initial inventory transaction/idempotency behavior
- Decision #14 accepted: `User` is the sole security principal and `Customer` remains a
  commerce profile; separate Order, Payment and Fulfillment state machines with
  append-only transition tables and an approved contract PR (#38): lean `OrderStatus`,
  `ON DELETE RESTRICT` on append-only audit transitions, `(parentId, requestId)` idempotency
  unique indexes, a compare-and-swap `recordTransition` (409 on lost updates) plus database
  CHECK constraints, guarded by ADR-0005/ADR-0006 and verified in CI
  (`migrate deploy`, `migrate diff --exit-code`, `auth_constraints.sql`, `state_transitions.sql`)
- Forward BIGINT money migration: all ten money columns now store canonical integer Rial
  (ADR-0003 extension #13), guarded by a fractional-preflight check and a rollback-only
  money verification script
- Deterministic, transactional development/test RBAC seed with 20 canonical
  permissions, a non-user `system-admin` role, explicit target safety policy, two-run
  CI verification and a separate `prisma:deploy` release command
- API foundation (#21): per-request IDs via middleware + AsyncLocalStorage, stable error
  response envelopes with machine-readable codes, redacted structured JSON logging
  (secrets/OTP/PII scrubbed), a global exception filter (validation/prisma/internal mapping),
  and OpenAPI/Swagger generation committed at `apps/api/openapi.json` with a CI drift check
- Public-repository security baseline: enforced `main` protection (required CI,
  non-author CODEOWNERS review, last-push separation, linear history and no force-push),
  CodeQL extended analysis for TypeScript/JavaScript and Actions, secret scanning with
  push protection, Dependabot security updates, dependency review and private
  vulnerability reporting
- Production dependency remediation (#54): admin runtime upgraded from vulnerable
  Next.js 16.1.1 to 16.3.3 with patched PostCSS/Sharp, plus a narrowly scoped
  `@prisma/config` deepmerge-ts 8.0.2 override verified against clean migrations,
  drift, SQL constraints and integration tests; an independent production-lockfile
  audit now runs on every PR/main push, weekly and on demand, and reports no known
  vulnerabilities at the recorded review point

### Partial

- Inventory rules exist in one service but have no public controller, authorization,
  audit actor, retry policy, tests or complete reservation lifecycle.
- Shared contracts only contain basic response/money/inventory types.
- The storefront has responsive interactions and its component tree is decomposed
  (see #19), but actions are simulated and all data comes from static prototype
  fixtures isolated in `apps/web/src/data/prototype.ts` (TEMP::G3-07).
- The storefront search box filters the prototype catalog by title, brand and
  category (token match) and opens matches in the product modal; the results band
  is covered by the Playwright suite.
- Unit/HTTP tests cover environment/CORS validation, database URL safety and
  liveness/readiness behavior; a Playwright smoke suite covers web/admin shells, while
  database integration currently covers only initial inventory transaction/idempotency
  behavior and Auth persistence constraints.
- Auth storage and lifecycle constraints exist, but credential verification, token
  issuance/rotation services, OTP delivery, rate limiting, TOTP and server-side
  permission enforcement are not implemented yet. ADR-0007 and `AUTH_CONTRACT.md`
  define their accepted runtime, HTTP, threat and client-state contract.

### Not implemented

- Authentication controllers/services, OTP delivery, 2FA and RBAC enforcement
- Catalog, customer, order, payment, supplier and audit use cases/controllers
- Operational admin modules and mobile application
- Cart, checkout, shipping, payment gateway and notifications
- Workers/queues, object upload flow, search and cache integration
- Broader domain integration and API E2E tests, observability and deployment pipeline

## Known engineering gaps

1. Reviewed forward migrations, automated CI migration/constraint checks, an explicit
   deploy command and a deterministic development/test RBAC seed exist. Production
   release orchestration, backup/restore evidence and a secure first-admin bootstrap
   command remain.
2. Configuration/guard unit tests, a Playwright shell suite and initial database
   integration coverage exist; broader domain, concurrency and coverage thresholds remain.
3. The storefront prototype is decomposed into typed single-purpose components.
   Static fixture data in `apps/web/src/data/prototype.ts` must be replaced by a
   typed API client (TEMP::G3-07), and new work must use explicit route/API boundaries.
4. CORS now uses a validated environment allowlist; deployment configuration must
   supply the correct staging/production origins and retain negative tests.
5. Critical serializable transactions need bounded retry behavior for transaction
   conflicts and concurrency tests.
6. Inventory commands do not yet capture authenticated actor/audit metadata.
7. Reservation consume/expire and transfer flows are not implemented.
8. Money convention is decided and landed: the ADR-0003 extension (#13) specifies
   canonical integer-Rial `BIGINT` storage with Toman presentation-only, and the forward
   migration converts all ten `Decimal(18,2)` money columns with a fractional-preflight
   guard. Percentage rounding, invoice and VAT policies still await service-layer work.
9. Order, payment and fulfillment now use separate state machines with append-only
   transition tables (ADR-0006, G5-07 foundation); the contract and shared
   compare-and-swap helper are approved in #38 and CI-verified. Services that drive those
   machines, reconciliation and the customer-facing status/timeline language remain to be
   built. Draft #28 was closed as superseded because its alternative baseline migration
   and cross-cutting foundations conflicted with the approved #30/#38/#40/#43 contracts.
   Its cart/checkout/order/payment/notification ideas remain backlog input and must be
   rebuilt as small contract-first changes on current `main`.
10. API response envelopes, stable error codes, correlation/request IDs and OpenAPI are now
    wired for the HTTP layer (see Implemented). Authentication controllers and the domain
    controllers that will exercise the codes per use case are not implemented yet.
11. GitHub now enforces the two-person PR/CI policy on `main`. Maintainers must keep
    required check names synchronized when workflows are renamed and must review
    CodeQL/Dependabot/secret-scanning alerts rather than treating green CI as a
    substitute for security triage.
12. The `User`/`Customer` identity boundary is decided (ADR-0005 + ADR-0006): `User` is
    the sole security principal and `Customer` stays a commerce profile; code must not
    join them implicitly by mobile number. Explicit linkage/merge/anonymization rules
    still require a forward migration when the product needs them.

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
