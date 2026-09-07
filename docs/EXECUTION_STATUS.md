# Execution Status and Handoff

Last reviewed: 2026-09-06

This is the short-term delivery board for the two-contributor team. The long-term
scope remains in `DEVELOPMENT_PLAN.md`; GitHub issue #66 remains the coordination
record. This document records the implementation order and the evidence required
before an item is considered complete.

## Operating Rules

- One accountable owner and one independent reviewer per implementation slice.
- API contracts and migrations land before parallel UI implementation.
- The backend remains authoritative; navigation and client state are never security evidence.
- A critical mutation is incomplete without authorization, audit, idempotency where applicable, failure-path tests and OpenAPI evidence.
- Shared schema, migrations, contracts, navigation and workflow files require explicit coordination before editing.
- Existing user changes, including untracked files, must not be folded into unrelated PRs.

## Current Owners

| Track | Owner | Reviewer |
| --- | --- | --- |
| Auth, API, database, inventory, CI, release | Hordekiller | Maddyrampant |
| Web, admin, accessibility, E2E, product UX | Maddyrampant | Hordekiller |
| Shared contracts and public behavior | Slice author | Other contributor, mandatory |

## Merge Train

| Order | Item | Owner | State | Exit action |
| ---: | --- | --- | --- | --- |
| 1 | PR #93 refresh serializable backoff | Maddyrampant | Review/CI | Merge after current-head checks |
| 2 | PR #101 session list/revoke | Hordekiller | Approved/CI | Merge after current-main checks |
| 3 | PR #98 storefront accessibility | Maddyrampant | Approved/CI | Merge and close #82 |
| 4 | PR #94 coverage gates | Maddyrampant | Approved/CI | Merge committed changes; workflow hardening is separate |
| 5 | PR #97 catalog contracts | Maddyrampant | Approved/CI | Merge with agreed sort, pagination and media decisions |
| 6 | PR #92 Sprint 1 status | Hordekiller | Approved/CI | Merge after status is reconciled with the preceding items |

## Auth Runtime

### #49 Staff Authentication

Implemented locally on the Auth runtime branch:

- Argon2id password hashing, policy enforcement, dummy verification and rehash.
- Staff password challenge with generic failures, Redis throttles, temporary lockout, LoginAttempt and audit evidence.
- AES-256-GCM encrypted TOTP secret envelope using external `AUTH_TOTP_ENCRYPTION_KEY`.
- TOTP verification with atomic challenge consumption and one-accepted-step replay protection.
- Recovery-code verification and atomic consumption.
- TOTP enrollment/confirmation and recovery-code regeneration.
- TTY-only first-admin bootstrap with hidden password input, TOTP confirmation, advisory lock, existing-admin refusal and actor-null audit.

Evidence currently available:

- API unit tests: 214 passing.
- PostgreSQL integration tests: 49 passing.
- Root typecheck, lint and build passing.
- OpenAPI drift passing.

Remaining before closing #49:

- Password change/reset endpoint and policy.
- Fresh-auth enforcement for enrollment and recovery regeneration.
- Session-family revocation after password/TOTP/recovery changes.
- Bootstrap concurrency and artifact-scan tests in CI.
- Independent review and merged PR evidence.

### #74 Refresh and Session HTTP

The approved PR #101 covers own-session list/revoke. The remaining local Auth slice
covers refresh rotation, CSRF/Origin proof, cookie logout and replay cookie clearing.

Remaining before closing #74:

- Merge the session slice and open the remaining HTTP implementation as a focused PR.
- Add and expose `logout-all` over the accepted HTTP contract.
- Verify production cookie attributes, CSRF/CORS negative paths and client single-flight behavior.
- Regenerate OpenAPI and obtain independent review.

## Product Handoff: #50

Maddyrampant may start the fixture-first admin slice from `feat/50-admin-staff-login`.
The decisions are:

- Use a separate `/login/staff` route; keep development `/login` unchanged.
- Use `NEXT_PUBLIC_FIXTURE_AUTH=true` as the only fixture opt-in; absent/false fails closed.
- Keep access tokens and MFA challenge state in memory only.
- Cover password, TOTP, invalid credentials, challenge expiry/replay, rate limit, forbidden, session invalid and replay states.
- Defer live endpoint wiring until reviewed #49/#74 API changes land.
- Do not change Prisma, migrations, root config or existing development auth.

Required evidence for the admin PR:

- Desktop/mobile keyboard and screen-reader coverage.
- Empty storage assertions for localStorage and sessionStorage.
- Direct-route forbidden behavior; hidden navigation is not authorization.
- Unit, typecheck, lint, build, Playwright and zero-external-asset gates.

## Next Product Vertical Slices

After the Auth merge checkpoint:

1. Catalog contract PR #97 and catalog API child issue.
2. Category/brand/product/SKU services with permission and audit boundaries.
3. Presigned media upload contract as a separate storage slice.
4. Public published-catalog endpoints and storefront integration.
5. Inventory HTTP authorization, transfers, stocktake and reservation expiry worker.
6. Server-priced cart, checkout and order draft idempotency.

No order, payment or storefront production claim is valid while catalog data remains
static or while the API lacks the corresponding server-side command.

## Backlog Reconciliation

- #48 customer OTP is implemented and needs acceptance checkoff/reconciliation.
- #73 live principal/permission guard is implemented through the Auth merge train and needs final acceptance closure.
- #76 must be narrowed to coverage baseline/ratcheting after PR #94.
- #81 is a valid inventory performance follow-up before production workers.
- #77, #78 and #79 remain decision blockers.
- #91 must receive an accountable owner and updated dependencies.
- Epics #2 through #8 remain long-range scope; they are not substitutes for issue-sized implementation slices.

## Release Blockers

The system is not production-commerce ready until all of these have evidence:

- Staff production authentication and secure bootstrap.
- Server-side permission enforcement on every domain command.
- Catalog, inventory, cart, checkout, order and payment APIs.
- Payment callback verification, idempotency, refund and reconciliation.
- Workers, outbox, notifications and reservation expiry.
- Backup freshness, restore drill, deployment, rollback, monitoring and RPO/RTO.
