# Execution Status and Handoff

Last reviewed: 2026-09-08

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

## Merge Train (completed 2026-09-08)

All previously scheduled train items merged on 2026-09-06. The two auth/catalog
checkpoint PRs merged on 2026-09-08, closing the Auth Runtime line (#49, #74).

| Order | Item | Owner | Merged |
| ---: | --- | --- | --- |
| 1 | PR #93 refresh serializable backoff | Maddyrampant | 2026-09-06 |
| 2 | PR #101 session list/revoke | Hordekiller | 2026-09-06 |
| 3 | PR #98 storefront accessibility | Maddyrampant | 2026-09-06 |
| 4 | PR #94 coverage gates | Maddyrampant | 2026-09-06 |
| 5 | PR #97 catalog contracts | Maddyrampant | 2026-09-06 |
| 6 | PR #92 Sprint 1 status | Hordekiller | 2026-09-06 |
| 7 | PR #109 auth lifecycle: password change, logout-all, fresh guard, family revocation, bootstrap tests | Hordekiller | 2026-09-08 (`9097614`) |
| 8 | PR #103 catalog vertical slice | Hordekiller | 2026-09-08 (`65ade33`) |

The Auth merge checkpoint is complete: #49 and #74 are closed. Remaining auth
follow-ups are production hardening (cookie attributes, CSRF/CORS negatives,
browser single-flight refresh) tracked with the admin shell and release work.

## Auth Runtime

### #49 Staff Authentication

Implemented locally on the Auth runtime branch:

- Argon2id password hashing, policy enforcement, dummy verification and rehash.
- Staff password challenge with generic failures, Redis throttles, temporary lockout, LoginAttempt and audit evidence.
- AES-256-GCM encrypted TOTP secret envelope using external `AUTH_TOTP_ENCRYPTION_KEY`.
- TOTP verification with atomic challenge consumption and one-accepted-step replay protection.
- Recovery-code verification and atomic consumption.
- TOTP enrollment/confirmation and recovery-code regeneration.
- Password change (`POST /staff/password/change`): verifies the live current password,
  hashes the new one, maps `PasswordPolicyError` violations to a 400
  `AUTH_PASSWORD_POLICY`, then atomically revokes every other session family
  (`CREDENTIAL_CHANGED`), rotates the current family in place (CAS guard) and writes
  `auth.password.changed`/`auth.session.rotated` evidence without hash metadata.
- Recovery-code regeneration (`POST /staff/recovery/regenerate`) now invalidates all
  previous codes and atomically revokes every other session family (`CREDENTIAL_CHANGED`)
  while keeping the current family valid and unrotated, with
  `auth.recovery_regenerated` + `auth.session.all_revoked` evidence.
- Fresh-auth enforcement (300 s `AUTH_REAUTHENTICATION_REQUIRED`) via a level-optional
  `RequireFreshAuthentication` guard on `staff/totp/enroll`, `staff/recovery/regenerate`
  and `staff/password/change`; level checks still precede freshness (403 before 401).
- `POST /logout-all`: fresh-auth at any level, atomically revokes every session family
  for the caller and clears the auth cookies.
- TTY-only first-admin bootstrap with hidden password input, TOTP confirmation,
  advisory lock, existing-admin refusal and actor-null audit. The transaction is now a
  testable `createFirstAdministrator` core (`scripts/bootstrap-admin-core.mjs`), with a
  guarded integration test proving exactly one concurrent runner wins and a later
  replacement is refused, plus a committed-artifact scan spec asserting the bootstrap,
  core and seed carry no default credential, resolve connection keys only from required
  environment variables and keep the dev admin credential-less (`passwordHash: null`);
  the scan runs in the regular unit suite so CI enforces it.

Evidence currently available:

- API unit tests: 300 passing (coverage under `CI=true`: statements 87.7 / branches
  78.3 / functions 89.6 / lines 89.3, above the 65/65/70/60 gates).
- PostgreSQL integration tests: 53 passing (incl. password-change family revocation,
  recovery-regeneration family revocation and concurrent bootstrap).
- Root typecheck, lint and build passing (contracts typecheck included).
- OpenAPI drift passing; `openapi.json` includes the new `/logout-all` and
  `/staff/password/change` paths.

Remaining before closing #49 (all resolved 2026-09-08):

- Independent review completed on PR #109, which merged as `9097614`; issue #49 closed.
- The implementation (including the `assertPolicy` code-point fix, bootstrap
  extraction, recovery regeneration and the safe artifact scan) is on `main` with
  unit 327, integration 70 passing and OpenAPI drift green.
- `openapi.json` includes `/logout-all`, `/staff/password/change`, `/auth/refresh`
  and the recovery/TOTP endpoints.

### #74 Refresh and Session HTTP

Own-session list/revoke merged (#101). Refresh rotation, fresh-guard lifecycle,
`logout-all` and password change merged via #109; the browser/CSRF cookie surface
is configured by ADR-0007/ADR-0010. Issue #74 closed 2026-09-08.

Production rollout follow-ups tracked separately (not blocking scope closure):

- Verify production cookie attributes (`__Host-` + Secure) behind the real reverse proxy.
- CSRF/CORS negative-path coverage and bounded `trust proxy` documentation.
- Client single-flight refresh and cross-tab recovery in the admin/web apps.

## Product Handoff: #50 (merged, superseded by real sign-in)

The fixture-first admin handoff (separate `/login/staff`, `NEXT_PUBLIC_FIXTURE_AUTH`)
is superseded by the ADR-0010 development-enabled sign-in (`/auth/dev/signin`), which
the admin app now drives through the real API (PRs #101/#102/#104). Options decided:

- Development TLS/fixture decisions (decision B) remain documented but are no longer
  the integration path; production/staging use the ADR-0010 gate.
- Access tokens and MFA challenge state stay in memory (no storage).
- Password, TOTP, invalid credentials, challenge expiry/replay, rate limit, forbidden,
  session-invalid and replay states are covered by the admin suite and the API specs.

Remaining admin work is tracked as catalog UI (G3-04/G3-05), administrative UX and
deferred `/login/staff` fixture removal once real password+TOTP login ships
(production credential delivery). Required evidence for future admin PRs is unchanged:

- Desktop/mobile keyboard and screen-reader coverage.
- Empty storage assertions for localStorage and sessionStorage.
- Direct-route forbidden behavior; hidden navigation is not authorization.
- Unit, typecheck, lint, build, Playwright and zero-external-asset gates.

## Next Product Vertical Slices

Post #109/#103 checkpoint, in dependency order:

1. Catalog hardening (`#111`): retry-safe mutation idempotency and public
   cache-control/ETag/projection policy (review the #103 follow-up; owner-made).
2. Media/storage slice: presigned upload contract, validation and object-storage service.
3. Storefront API integration (G3-07) against the merged public catalog endpoints.
4. Inventory HTTP authorization, transfers, stocktake and reservation expiry worker (G4).
5. Server-priced cart, checkout and order draft idempotency (G5).

No order, payment or storefront production claim is valid while catalog data remains
static or while the API lacks the corresponding server-side command.

## Backlog Reconciliation

- #48 (customer OTP) closed; implementation lives on `main` with live-Redis rate-limit
  and 429-oververify evidence.
- #73 (live principal/permission guard) closed; the guard is used by sessions, session
  management and the catalog slice.
- #76 closed after #94; coverage thresholds now live in each package's `vitest.config.ts`.
- #81 is a valid inventory performance follow-up before production workers.
- #77, #78 and #79 remain decision blockers (dependency train, capacity/release
  authority and SMS provider policy).
- #91 is the open coordination record; the auth runtime scope it sequenced is merged
  and the issue should be closed or narrowed to Sprint 2.
- #111 (catalog hardening) is the current follow-up slice (owner: Hordekiller,
  reviewer: Maddyrampant).
- `docs/SHOPBUILDER_GAP.md` is referenced by draft shop-builder notes but does not
  exist on any branch; the author should commit it or the reference must be removed.
- Epics #2 through #8 remain long-range scope; they are not substitutes for issue-sized implementation slices.

## Release Blockers

The system is not production-commerce ready until all of these have evidence:

- Staff production authentication and secure bootstrap.
- Server-side permission enforcement on every domain command.
- Catalog, inventory, cart, checkout, order and payment APIs.
- Payment callback verification, idempotency, refund and reconciliation.
- Workers, outbox, notifications and reservation expiry.
- Backup freshness, restore drill, deployment, rollback, monitoring and RPO/RTO.
