# ADR-0010: Development-Enabled Staff Sign-In (Admin Panel)

Status: Proposed for joint review; implementation gate-matched to the §12
auth/admin-session checkpoint

Date: 2026-09-03

## Context

The admin panel needs a runnable sign-in to unblock operational work and end-to-end
testing. Today the API has no HTTP login surface: `AuthModule` exposes only the
runtime services (session/token/hash/principal/permission) and there is no
`POST /staff/password`, `POST /staff/totp/verify`, `POST /refresh`, `/me` or
`/logout` controller. The seed creates roles/permissions only and — per ADR-0007 —
never a privileged user.

The full password+TOTP + refresh/CSRF flow is the required end state (ADR-0007,
`AUTH_CONTRACT.md`), but the colleague owns the web login review and the shared
auth HTTP surface is a coordinated hotspot. To let the admin run now, the operator
asked for a **developer-enabled sign-in via a special code**, gated to
non-production, "real and fully contract-compliant" — not a fake bypass.

## Decision

Add a **development-only staff sign-in** that reuses the merged real auth runtime
and issues genuine `STAFF_MFA` sessions, while staying inert in staging/production:

- **Config**: a new optional `AUTH_DEV_CODE` environment value. `createAuthRuntimeConfig`
  enables `devLoginEnabled` only when `AUTH_DEV_CODE` is set and `NODE_ENV` is
  `development`/`test`; setting it in `staging`/`production` fails startup.
- **API** (`StaffAuthController`, `/api/v1/auth`):
  - `POST /dev/signin` — 404 when `devLoginEnabled` is false (feature not exposed).
    Verifies the submitted code against `AUTH_DEV_CODE` in constant time via
    `AuthHashService` (`otp` context, `timingSafeEqual`), loads the seeded dev admin,
    then `AuthSessionService.createSession({ authenticationLevel: 'STAFF_MFA', ... })`.
    Returns the access token in JSON and sets dev-suffixed, non-`__Host-`,
    `HttpOnly`/`SameSite=Strict` cookies (`iranyaragh_dev_refresh`,
    `iranyaragh_dev_csrf`) — the development cookie form `AUTH_CONTRACT.md` §4.2
    explicitly allows on localhost.
  - `GET /me` — bearer-guarded (`@RequireAuthentication('STAFF_MFA')`), returns the
    live principal via `AuthPrincipalService`.
  - `POST /logout` — bearer-guarded, `revokeSession` + clears the dev cookies,
    idempotent `{ data: {} }`.
- **Seed**: a deterministic dev admin (`dev-admin@iranyaragh.local`, ACTIVE) with the
  `system-admin` role is upserted **only when `AUTH_DEV_CODE` is present** (ADR-0007
  "no privileged user" retained when the operator does not opt in). It stores no
  password hash; authentication is entirely by the env-gated code.
- **Admin** (`apps/admin`): a `/login` page (MUI) posts the code via a new thin
  `src/lib/api/client` (`NEXT_PUBLIC_API_BASE_URL`), keeps the access token
  **memory-only** (`token-store`), an `AuthProvider` exposes `signIn`/`signOut`/
  `isAuthenticated`, `AdminShell` guards the dashboard and adds a logout button.
  No token is written to Local/Session Storage — matching `AUTH_CONTRACT.md` §7.

Deliberate, explicitly-scoped deviations from ADR-0007, all enforced to development
and to be re-opened when the full MFA flow lands:

1. **Seeded privileged user**: ADR-0007 forbids seeding a privileged user. Here a
   dev admin exists only when `AUTH_DEV_CODE` is set and never carries a stored
   credential; access still requires the env-gated code. This replaces the rejected
   "default seeded administrator" with an opt-in, credential-less-in-DB account.
2. **Password+TOTP bypass in development**: dev sign-in emits a `STAFF_MFA` session
   without an interactive password/TOTP challenge. It is intentionally unavailable
   in staging/production, which keep the full MFA contract.
3. **Logout transport**: contract `/logout` is refresh-cookie + CSRF; the dev slice
   uses a conservative bearer-authenticated `revokeSession`. This is strictly
   invalidating (can only log out, never escalate) and is replaced when `/refresh`
   and CSRF logout land.

## Consequences

- The admin can run a real, session-backed login/logout loop in development where
  `AUTH_DEV_CODE` is configured.
- Staging/production are unaffected: no dev controller, no env code, and startup
  fails if the code is misconfigured there.
- Full password+TOTP, refresh rotation, and CSRF logout remain required and are not
  weakened by this increment; the change must be reviewed at the §12 auth/admin
  session checkpoint before merge.

## References

- ADR-0005 (auth persistence boundary), ADR-0007 (auth runtime/HTTP contract),
  `docs/AUTH_CONTRACT.md`.
- `docs/ADMIN_PANEL_PLAN.md` §12 (auth/admin-session checkpoint).
