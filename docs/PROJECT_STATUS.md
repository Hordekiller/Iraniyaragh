# Project Status

Last reviewed: 2026-09-05

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
- Admin UI primitives on branch `feat/admin-form-and-table-primitives` (typecheck/lint/
  test/build green): `StatCard`, `PageHeader`, `EmptyState`, `DialogCloseButton`,
  `OpenDialogOnElementClick`, `ConfirmationDialog`, `FormField`, `SelectableCardInput`
  (radio semantics + arrow-key navigation), `FormWizard`, `DataTable`
  (search/sort/pagination/row-selection, loading/empty/error), `FeedbackProvider` +
  `useFeedback`, and an in-house validation layer (`useInHouseForm`). Built with MUI 7
  only — no new runtime dependency — because the npm registry is currently unreachable.
  The full Vitest component suite runs offline (`@testing-library/react` via
  `fireEvent`); `FeedbackProvider`, `useInHouseForm`, `ConfirmationDialog`,
  `FormField`, `SelectableCardInput` and `DataTable` are covered, including a real
  a11y fix (search-box `aria-label` now lands on the input via `inputProps`).
  Standalone showcase routes live under `app/(showcase)/showcase/**` and do not touch
  the shared `AdminShell`/navigation. ADR-0008 records the grid decision (in-house MUI
  `Table` now, explicit upgrade path to MUI X Data Grid Community) and ADR-0009 records
  the form-validation decision (in-house `useInHouseForm` now, react-hook-form + zod
  on registry restore). Not yet wired into shared navigation (requires the
  @Maddyrampant auth/shell checkpoint per ADMIN_PANEL_PLAN §12).
- Typed API startup configuration, explicit CORS allowlist and initial Vitest unit tests
- Auth/RBAC persistence foundation: canonical users, roles, permissions, assignments,
  sessions, hashed OTP records, login attempts and safe audit metadata
- Initial reviewed Prisma migration with PostgreSQL Auth constraints and a rollback-only
  database verification script
- Playwright smoke suite (`e2e/`) covering the storefront and admin shells
  on desktop + mobile viewports, with a strict zero-external-asset network gate;
  the admin smoke spec now covers the auth-gated shell (anonymous `/` and
  `/dashboard` redirect to `/login`, dev-only sign-in notice, no external assets)
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
- Initial Auth cryptographic foundation: fail-fast issuer/key configuration, strict
  ten-minute HS256 access-token signing/verification, 256-bit opaque token generation,
  constant-time CSRF comparison and versioned/domain-separated HKDF-HMAC hashing with a
  bounded current/previous-key rotation window
- Forward Auth MFA persistence contract: Sessions retain mandatory authentication
  level/time evidence; purpose-bound MFA challenges store only keyed hashes; TOTP
  credentials store encrypted/versioned secret envelopes and replay steps; recovery
  codes remain one-way and single-terminal-state, with PostgreSQL constraints and a
  fail-fast preflight for unmanaged legacy Session rows
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
- Transactional Auth Session core: active-principal session creation, absolute and
  inactivity deadlines by authentication level, current/previous refresh-hash lookup,
  single-use rotation with compare-and-swap, bounded serializable retry, token-family
  revocation on sequential/concurrent replay and safe created/rotated/replayed/revoked
  audit evidence; real PostgreSQL tests prove exactly one concurrent refresh winner
- Development-enabled staff sign-in (ADR-0010, dev/test only): a `StaffAuthController`
  at `/api/v1/auth` provides `POST /auth/dev/signin` (a special `AUTH_DEV_CODE`,
  constant-time via `AuthHashService`, issuing a real `STAFF_MFA` session plus
  dev-suffixed non-`__Host-` cookies), `GET /auth/me` (bearer-guarded live principal)
  and `POST /auth/logout` (bearer-guarded `revokeSession`, idempotent). `AUTH_DEV_CODE`
  fails startup in staging/production. A deterministic dev admin
  (`dev-admin@iranyaragh.local`, `system-admin`, no stored credential) is seeded only
  when `AUTH_DEV_CODE` is set. The admin app adds `/login` (MUI), a memory-only token
  store, `AuthProvider`, a dashboard guard and a logout action via a new thin
  `src/lib/api/client`. The dev-admin seed uses a shared `seededNow` timestamp so
  the `User_timestamp_order_check` (`emailVerifiedAt >= createdAt`) constraint always
  holds and the admin is actually created for real API sign-in. A CommonJS build
  interop bug (`import jwt from 'jsonwebtoken'` resolving to an undefined `.default`)
  that returned 500 on `/auth/dev/signin` is fixed by using a namespace import;
  sign-in now issues a real `STAFF_MFA` token and `GET /auth/me` resolves the
  principal live. The Playwright e2e job now boots the API against a Postgres
  service, applies migrations and seeds the dev admin, and drives the real login
  UI into the authenticated shell (desktop drawer sidebar and mobile drawer
  toggle/focus-trap) via `signInDiAsAdmin`.
  All gates (typecheck/lint/test/build/e2e) green on both packages;
  `openapi.json` regenerated with the new auth paths.
- Production dependency audit hardened (`.github/scripts/audit-prod.mjs`):
  the CI production-audit workflow now runs a node script instead of a blanket
  shell retry loop. The script classifies each `pnpm audit` run and fails
  loudly and immediately on real moderate+ vulnerabilities (exit 1); only transient
  network/registry errors are retried (up to 3 attempts). Exhaustion exits 2 and
  the workflow wrapper warns without blocking CI, preventing intermittent registry
  outages from stalling PRs. Docs-only PRs are skipped via `paths-ignore`.
  Decision logic is pure (`classifyResult()`) and was validated against 4 fixture
  scenarios (clean, vulnerability-found, persistent-network-failure,
  transient-recovery) on CI and locally.
- Redis-backed distributed rate limiting (auth branch): a dedicated `@Global`
  Redis module (lazy-connect client, offline-queue disabled, bounded retry, redacted
  error logging) plus a fixed-window atomic Lua limiter keyed by versioned
  identifier/IP hashes. Request and verification limits follow AUTH_CONTRACT §9
  (destination 1/60s, 3/15m, 10/24h; IP 20/h, 100/24h; verify failures 50/h/IP).
  Enforcement is fail-closed: Redis unavailability returns `503 UPSTREAM_UNAVAILABLE`
  and never fails open; over-limit returns `429 RATE_LIMITED` with a bounded
  `Retry-After` header (emitted centrally in the exception filter).
- Customer OTP sign-in (auth branch): `POST /api/v1/auth/customer/otp/request`
  (public, `202` challenge, `Cache-Control: no-store`/`Pragma: no-cache`) and
  `POST /api/v1/auth/customer/otp/verify` (five-attempt single-use challenge,
  serializable single-use consume, resend invalidates the prior challenge). Only
  keyed hashes are persisted; raw codes, mobiles and IPs never touch the database
  or audit trail. Verification activates a `PENDING` user, refreshes an `ACTIVE`
  user, and generically refuses `SUSPENDED`/`LOCKED`/`DELETED`/transiently-throttled
  users without revealing state. On success it issues a real `CUSTOMER_OTP` session
  with env-aware cookies (`__Host-` + Secure in staging/production, suffixed
  non-`__Host-` without Secure in development only, per ADR-0007).
  Mobile normalization is E.164 (`+989XXXXXXXXX`) with strict validation.

### Partial

- Inventory rules live in one service with actor/requestId tracing, audit rows,
  CAS version guards, bounded serializable retry, reservation consume/release/expire
  and read-only snapshot/movement queries (a public controller is withheld until the
  auth runtime provides the `inventory.read` permission). Mutations still have no
  public authenticated endpoint or authorization.
- Shared contracts only contain basic response/money/inventory types.
- The storefront has responsive interactions and its component tree is decomposed
  (see #19), but actions are simulated and all data comes from static prototype
  fixtures isolated in `apps/web/src/data/prototype.ts` (TEMP::G3-07).
- The storefront search box filters the prototype catalog by title, brand and
  category (token match) and opens matches in the product modal; the results band
  is covered by the Playwright suite.
- Hero slider and toast expose explicit pause/play and close controls, honour
  `prefers-reduced-motion` (slider), and the toast's base duration is 5s — all
  covered in the Vitest component suite.
- Storefront accessibility baseline (#82): every click-only product/blog card is a
  native `<button>`, decorative images carry `alt=""`, carousel arrows and the search
  toggle/menu have Persian `aria-label`s, search inputs bind labels, footer placeholder
  links became real fragment targets or toast-backed buttons, a visible-on-focus skip
  link jumps to `#main-content`, and section headings follow an h1 → h2 → h3 hierarchy.
  WCAG AA color contrast is met by darkening brand orange (`#FF4D00` → `#C2410C`)
  where it carries text, slate-500/600 for secondary text and emerald-700/red-600/
  amber-700 for small badges; the scrollable brand strip is keyboard-focusable.
  Enforced by a new Playwright `web-a11y` spec (axe-core wcag2a/aa/21a/21aa with zero
  critical/serious violations on desktop + mobile, skip link, real fragment targets,
  cards-as-buttons) and a `storefront-a11y` Vitest suite; the smoke spec was updated
  for the new card buttons.
- Unit/HTTP tests cover environment/CORS validation, database URL safety and
  liveness/readiness behavior; a Playwright smoke suite covers web/admin shells, while
  database integration covers the hardened inventory ledger (parallel reserve and
  parallel reserve-versus-stock-change races without double-spend or negative stock,
  consume/release/expire, read-only snapshot/movement, audit actor+request-id
  verification) plus Auth persistence constraints and Session rotation/replay concurrency.
- Auth storage and lifecycle constraints now include the runtime Session/MFA evidence,
  and the Session core rotates/revokes refresh families transactionally. Staff sign-in
  through the development-enabled controller (`/auth/dev/signin`, `/auth/me`,
  `/auth/logout`) and customer OTP sign-in (`/auth/customer/otp/request`, `/auth/customer/otp/verify`)
  with Redis-backed rate limiting (auth branch) are implemented. Staff password+TOTP,
  OTP delivery (SMS provider), refresh rotation, CSRF logout, credential verification
  and server-side permission enforcement are not implemented yet. ADR-0007, ADR-0010
  and `AUTH_CONTRACT.md` define the remaining runtime, HTTP, threat and client-state contract.

### Not implemented

- Full authentication controllers (staff password+TOTP, OTP delivery, refresh/CSRF
  logout), 2FA and RBAC enforcement across domains
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
5. Critical serializable transactions now have bounded retry for transaction
   conflicts (P2034), and DB integration concurrency coverage (parallel reserve /
   change without double-spend or negative stock) is implemented in `test:integration`.
6. Inventory commands now require and record an actor and request id in the audit
   trail; wiring to the authenticated session principal still awaits the auth runtime.
7. Reservation consume, release and expire are implemented on the balance layer;
   transfer flows and order integration are not implemented.
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
13. Customer OTP and rate limiting (auth branch): the Redis limiter, OTP service,
    controller MVP and rate-limit provider are covered by the unit suite (mock Redis
    client + controller contract tests covering status codes, cookie attributes and
    401 shapes), customer OTP flows by DB integration tests (fresh `_test` Postgres),
    and the real Redis provider, Lua window and `reset` behavior by a live-Redis
    integration spec that self-skips when no Redis is reachable. CI's database job now
    provisions a Redis service so the live suite runs there. The 429-oververify failure
    path is covered by unit tests but does not yet have a dedicated DB/live end-to-end
    case. `request.ip` has no `trust proxy` enabled, so the Safe-IP rate-limit dimension
    resolves the direct socket address; a reverse-proxy deployment must enable a
    bounded `trust proxy` and document the spoofing trade-off before rollout.

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
