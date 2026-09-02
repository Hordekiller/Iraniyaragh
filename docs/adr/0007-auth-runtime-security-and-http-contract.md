# ADR-0007: Authentication Runtime Security and HTTP Contract

Status: Accepted when merged with the required non-author security/client review

Date: 2026-08-31

## Context

ADR-0005 defines the Auth/RBAC persistence boundary but intentionally leaves token
issuance, password hashing, OTP delivery, runtime authorization and browser storage
undefined. The web and admin clients need one stable contract before API and UI work
can proceed in parallel. A weak choice here would create account enumeration,
credential replay, CSRF, stale-permission or secret-logging risks across every later
domain.

The initial clients are first-party browser applications. Native mobile is deferred
until the browser contract is implemented and reviewed. `User` remains the only
security principal; customer commerce ownership is not inferred from a matching
mobile number.

## Decision

### Authentication surfaces

- Customer browser authentication uses a single mobile OTP request/verify journey.
  Successful verification creates or activates the `User` security principal as
  needed, but does not create or link a `Customer` commerce profile.
- Staff authentication uses password followed by TOTP. No privileged browser
  session is issued after password-only verification.
- Every protected endpoint authenticates an access token, then loads the current
  session, user state and effective permissions server-side. Role names and cached
  client navigation are never authorization evidence.

### Browser session transport

- Access tokens are signed JWTs with a ten-minute lifetime. They contain only
  security identifiers/timestamps and authentication-method claims; no PII, roles
  or permissions. The verifier fixes the algorithm and validates issuer, audience,
  type, subject, session, token ID and time claims.
- Browser clients keep the access token in memory and send it in the
  `Authorization: Bearer` header. They never write it to Local Storage, Session
  Storage, URLs, analytics or logs.
- Refresh tokens are opaque 256-bit random values. Only an HMAC-SHA-256 hash using
  a separately managed pepper is persisted. The browser receives the raw value
  only as a host-only `Secure`, `HttpOnly`, `SameSite=Strict` cookie.
- Cookie-authenticated refresh/logout requests require a matching CSRF cookie and
  `X-CSRF-Token` header in addition to the strict credentialed CORS allowlist.
- Every refresh rotates the token transactionally. A second use of a rotated token,
  including a losing concurrent refresh, revokes the whole token family. Browser
  clients must single-flight refresh across tabs.
- Customer sessions have a 30-day absolute and seven-day inactivity limit. Staff
  sessions have a 12-hour absolute and 30-minute inactivity limit. Rotation never
  extends the original absolute expiry.

### Secrets and authenticators

- Staff passwords use Argon2id with at least 19 MiB memory, two iterations and one
  lane, tuned upward per deployment while keeping verification below one second.
  Passwords are at least 15 and at most 128 Unicode characters, are not trimmed or
  normalized, allow paste/password managers, use no composition rules and are
  checked against a locally available compromised/common-password blocklist.
- SMS OTPs are six cryptographically random decimal digits, expire after five
  minutes, allow at most five failed attempts and are invalidated on resend. Their
  hashes are purpose/challenge-bound HMACs; raw codes are never persisted or logged.
- Distributed Redis-backed throttles apply to safe destination/identifier hashes,
  safe IP hashes and global/provider dimensions. Auth writes fail closed when the
  limiter is unavailable.
- Privileged accounts require RFC 6238 TOTP with a 30-second step and a one-step
  clock window. Each successful time step is accepted once. TOTP secrets are
  encrypted with a key outside the database; recovery codes are random, one-time
  and stored only as hashes.

### Non-enumeration, audit and authorization

- OTP request is always an asynchronous `202` with the same public shape. Password,
  OTP and recovery failures use generic public codes/messages and comparable work
  regardless of account existence or lifecycle state.
- `PENDING`, `SUSPENDED`, `LOCKED` and `DELETED` details are retained only in safe
  `LoginAttempt`/audit evidence. Temporary throttling uses `lockedUntil` without
  mutating the durable lifecycle status.
- Audit/LoginAttempt data contains actor IDs where known, method, internal outcome,
  request ID and keyed lookup hashes. It never contains raw credentials, tokens,
  OTP/TOTP values, IP addresses, mobiles, emails or recovery codes.
- Effective permission evaluation requires an active user, active unexpired
  session, active role assignment, active role, active permission grant and active
  permission. A deny is the default for missing/unknown metadata.

### Bootstrap and persistence

- Development/test seed creates permission definitions and the `system-admin` role,
  never a privileged user or credential.
- The first administrator is created by an explicit operator command using hidden
  interactive input, a transaction/advisory lock and TOTP confirmation. Credential
  arguments/environment variables and silent replacement of an existing admin are
  forbidden.
- Existing migrations remain immutable. TOTP credentials, recovery codes, one-time
  staff MFA challenges and durable Session authentication-level/time evidence
  require a separately reviewed forward migration in the implementation issue. No
  schema change is part of this contract decision.

The complete endpoint, state, rate-limit, audit and error matrix is normative in
`docs/AUTH_CONTRACT.md`.

## Consequences

- Stolen access tokens have a short window and are immediately ineffective when
  their backing session/user becomes invalid, at the cost of a database/cache lookup
  on protected requests.
- Strict refresh replay handling can sign out legitimate concurrent tabs. A
  cross-tab single-flight client is required; security wins over a refresh grace
  window that could hide theft.
- Browser cookies avoid script-readable refresh tokens but require explicit CSRF
  handling and credentialed CORS tests.
- SMS OTP is convenient but not phishing-resistant. It is acceptable for the first
  customer release, while privileged staff require MFA. WebAuthn/phishing-resistant
  authentication remains a future compatible enhancement.
- New Auth dependencies (Argon2, JOSE/JWT, Redis limiter and TOTP) must be small,
  actively maintained, pinned through the lockfile and admitted by dependency review.

## Alternatives rejected

- **JWT permissions without server lookup:** rejected because revocation and role
  changes would remain stale until token expiry.
- **Refresh tokens in Local Storage:** rejected because XSS could read and export
  the long-lived credential.
- **Non-rotating refresh tokens or a replay grace window:** rejected because theft
  would be harder to detect reliably.
- **Password-only privileged sessions:** rejected because staff can mutate money,
  inventory, orders and user permissions.
- **Default seeded administrator:** rejected because a shared/default credential is
  unsafe and difficult to prove removed from every environment.
- **In-memory production rate limiting:** rejected because multiple API replicas
  would each enforce only a fraction of the intended limit.

## References

- NIST SP 800-63B-4, Authentication and Authenticator Management:
  <https://pages.nist.gov/800-63-4/sp800-63b.html>
- OWASP Authentication Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- OWASP Session Management Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- OWASP Password Storage Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
- RFC 6238, TOTP:
  <https://www.rfc-editor.org/rfc/rfc6238.html>
- RFC 8725, JWT Best Current Practices:
  <https://www.rfc-editor.org/rfc/rfc8725.html>
