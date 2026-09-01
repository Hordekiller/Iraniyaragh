# Project Status

Last reviewed: 2026-09-01

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
- API foundation (#21): per-request IDs via middleware + AsyncLocalStorage, stable error
  response envelopes with machine-readable codes, redacted structured JSON logging
  (secrets/OTP/PII scrubbed), a global exception filter (validation/prisma/internal mapping),
  and OpenAPI/Swagger generation committed at `apps/api/openapi.json` with a CI drift check
- Customer OTP login UX (#50, parallel-work model): typed `AuthApi` contract + `AuthFixtureClient`
  (deterministic, contract-validated; no real delivery/rate-limiting), a React-agnostic
  `CustomerOtpController` state machine (`idle/mobile/code/authenticated/session-expired`) with
  resend/expiry gating and Farsi error mapping, Persian/Arabic-Indic digit transliteration in
  `normalizeIranianMobile`, plus the React shell (`AuthProvider`/`AuthContext`, `LoginDialog`
  two-step mobile→code flow with countdown resend, `AccountMenu` with logout) wired into the
  storefront header and mobile nav. The runtime defaults to the fixture client so the flow can be
  demoed before the auth backend lands on `main` (AUTH_CONTRACT §17)
- Browser Auth transport now represents bodyless commands explicitly: refresh/logout use
  credentialed `POST` requests with mandatory double-submit `X-CSRF-Token` proof and fail closed
  before network access when that proof is unavailable
- Fixture-backed customer OTP auth Playwright E2E (`e2e/tests/web-auth.spec.ts`, desktop + mobile):
  Persian/mobile normalization, valid login/logout, localized invalid-code and Retry-After states,
  resend countdown gating, dialog focus trapping/Escape/restoration and keyboard account-menu
  behavior — all under the strict zero-external-asset network gate
- Public-repository security baseline: enforced `main` protection (required CI,
  non-author CODEOWNERS review, last-push separation, linear history and no force-push),
  CodeQL extended analysis for TypeScript/JavaScript and Actions, secret scanning with
  push protection, Dependabot security updates, dependency review and private
  vulnerability reporting

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
  permission enforcement are not implemented yet. The customer OTP login UI (#50) currently
  runs against the contract `AuthFixtureClient`; it will switch to the real `AuthHttpClient`
  once the backend endpoints land on `main` (AUTH_CONTRACT §17).

### Not implemented

- Authentication controllers/services, OTP delivery, 2FA and RBAC enforcement
- Catalog, customer, order, payment, supplier and audit use cases/controllers
- Operational admin modules and mobile application
- Cart, checkout, shipping, payment gateway and notifications
- Workers/queues, object upload flow, search and cache integration
- Broader domain integration and API E2E tests, seed script, observability and
  deployment pipeline

## Known engineering gaps

1. The initial database migration and automated CI migration/constraint checks are
   committed, but no deterministic development seed exists.
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
   built. The draft #28 commerce-customer-journey rebuild (cart/checkout/orders/payments/
   notifications/stock-alerts) was blocked on the #40 money migration (now merged) and must
   be rebased off the approved #38 contract on `main` before it can land.
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

## Status update

Sprint: #50 customer OTP auth UX + fixture-backed E2E (slice 2, UI + e2e).

Completed:

- Customer OTP login UI (LoginDialog two-step mobile→code with countdown resend, AccountMenu
  logout) wired into the storefront header and mobile nav, on a typed `AuthApi` contract with the
  `AuthFixtureClient` as the runtime default (parallel-work model, AUTH_CONTRACT §17).
- LoginDialog auto-closes on a successful authentication.
- Mobile and OTP inputs transliterate Persian/Arabic-Indic digits to ASCII; all documented mobile
  formats, including spaces and `+98`, use the same canonical validator in UI and controller.
- Local challenge expiry, close/reset generation guards and post-close session cleanup prevent
  expired or stale async results from resurrecting the flow; Retry-After survives close/reopen.
- Dialog focus trap, Escape close, opener-focus restoration, reduced-motion handling and accessible
  account-menu keyboard/ARIA behavior are covered on desktop and mobile.
- `AuthHttpClient` sends refresh/logout as credentialed POST commands with required CSRF proof.
- Web checks green: typecheck, lint (incl. runtime-asset gate), 97 Vitest tests, production build,
  monorepo typecheck; full `e2e/` Playwright suite green (web + admin, desktop + mobile).

Deferred (with reason):

- Real backend auth endpoints / `AuthHttpClient` wiring — blocked on H's auth backend branches
  landing on `main`; UI/E2E build against the fixture per the parallel-work model.

New risks/debt:

- Storefront now has two login entry points on mobile (header AccountMenu + bottom-nav profile);
  acceptable but redundant once auth UX is finalized.

Metrics/tests:

- `apps/web`: 97 tests / 7 files; `e2e`: 24 passed / 4 skipped (viewport-specific).
- `e2e/tests/web-auth.spec.ts`: 10 passing cases across web-desktop/web-mobile.

Next release confidence: green

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
