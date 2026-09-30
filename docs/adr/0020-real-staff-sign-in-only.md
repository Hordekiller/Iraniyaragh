# ADR-0020: Real Staff Sign-In Only (Supersedes ADR-0010)

Status: Accepted — the development staff sign-in is removed; every environment,
including automated tests, authenticates through the real password + TOTP flow.

Date: 2026-09-30

## Context

ADR-0010 added a development-only staff sign-in (`POST /auth/dev/signin`, admin
`/login/dev`) gated on `AUTH_DEV_CODE`. It was explicitly scoped as a stopgap
"until the full password+TOTP flow lands".

That flow has landed: `POST /auth/staff/password` issues a short-lived
password-only challenge, `POST /auth/staff/totp/verify` exchanges the challenge
plus a current TOTP code for a rotating `STAFF_MFA` session, and the admin panel
ships the matching `/login` UI (`apps/admin/src/app/(auth)/login/staff`). The
stopgap's original reason to exist is gone, but it had become load-bearing: the
seed only created the test administrator when `AUTH_DEV_CODE` was set, and the
end-to-end suite signed in exclusively through it.

A second sign-in surface is not a convenience here. It is an authentication path
that exists outside the reviewed challenge, rate-limit, audit and session
contract, it needs its own cookie form, and every future change to sign-in has to
be reasoned about twice. "Only the real login exists" is also the property that
makes the end-to-end suite meaningful: a test that signs in through a side door
never exercises the contract a real operator depends on.

## Decision

Remove the development staff sign-in completely and keep exactly one staff
sign-in path.

- **API**: `POST /auth/dev/signin`, `StaffDevSignInDto`, the
  `devLoginEnabled`/`devCode` runtime configuration, the `AUTH_DEV_CODE`
  environment value, the `iranyaragh_dev_*` cookie form and the
  `cookieSpecForRequest` fallback that existed only to read those cookies are all
  deleted. `POST /auth/staff/password` + `POST /auth/staff/totp/verify` become
  the only way to obtain a staff session. The auth runtime configuration is now
  asserted to expose no sign-in-related development switch.
- **Admin**: `/login/dev` and its form are deleted. `/login` (and its
  `/login/staff` alias) is the single entry point.
- **Seed**: the seed no longer creates any user. It provisions the RBAC baseline
  and the demo catalog only, which restores ADR-0007's "no privileged user"
  invariant for every environment including development.
- **Identity provisioning**: provisioning a first administrator is an explicit
  operator action, never a seed side effect.
  - `apps/api auth:bootstrap` is the operator path: interactive TTY, an
    out-of-band TOTP confirmation and recovery codes handed to a human.
  - `apps/api auth:e2e-staff` is the automated-test path: non-interactive, and
    hard-guarded to `NODE_ENV=test` plus a `_test` database through the existing
    seed policy. It provisions the same records through the same
    `createFirstAdministrator` transaction, and it takes every credential from the
    environment so nothing secret is committed.
- **End-to-end suite**: the browser suite signs in through the real `/login` UI,
  and API-level specs walk `staff/password` then `staff/totp/verify`. The TOTP
  code is produced with the same `otplib` release the API verifies with, so the
  suite cannot drift from the server's algorithm, period or digit count.

## Consequences

- **Positive**: one authentication path to review, harden and document. The
  end-to-end suite now covers the real challenge, TOTP verification, session
  cookie and rate limiting instead of a bypass. The seed cannot silently create a
  privileged identity, and the dev-only cookies are gone from the codebase.
- **Trade-off**: automated runs need one extra provisioning step and three
  environment values (`E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`,
  `E2E_STAFF_TOTP_SECRET`, plus `AUTH_TOTP_ENCRYPTION_KEY` for the server). This
  is deliberate friction: the identity is data, and the flow that uses it is the
  real one.
- **Note**: this ADR supersedes ADR-0010. ADR-0007's "no privileged user in the
  seed" is retained and now holds unconditionally.
