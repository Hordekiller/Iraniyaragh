# Authentication Runtime Contract

This document is the normative runtime and HTTP contract for Sprint 1 Auth work.
ADR-0007 records the durable decision; this document defines the observable API,
security states and acceptance evidence used by API, web, admin and E2E work.

## 1. Scope and language

The first release supports two first-party browser clients:

- `CUSTOMER_WEB`: mobile OTP authentication;
- `ADMIN_WEB`: staff password plus TOTP authentication.

Native/mobile token delivery, social login, passkeys/WebAuthn, production SMS vendor
selection and implicit `User`/`Customer` linkage are out of scope. They require a
compatible contract extension, not an undocumented switch in transport.

`MUST`, `MUST NOT`, `SHOULD` and `MAY` are normative. Time is UTC and ISO-8601 in
JSON. Durations in responses are integer seconds. IDs are opaque strings.

## 2. Non-negotiable invariants

1. `User` is the only authentication principal. A matching customer mobile does
   not prove commerce-profile/order ownership.
2. Raw passwords, access/refresh tokens, OTP/TOTP values, recovery codes, IP
   addresses and TOTP secrets MUST NOT enter logs or audit metadata.
3. Persistence contains only adaptive password hashes, keyed lookup/token/code
   hashes and encrypted TOTP secrets. Raw refresh/OTP/recovery values are never
   persisted.
4. A valid JWT alone is insufficient. Protected requests MUST verify the current
   session, user state and effective permission state server-side.
5. Staff permissions are effective only for a `STAFF_MFA` session.
   `CUSTOMER_OTP` sessions expose no staff permissions even if the same principal
   later receives a staff role.
6. Authentication endpoints MUST return `Cache-Control: no-store` and
   `Pragma: no-cache`. Secret-bearing values MUST NOT be placed in a URL.
7. Authentication fails closed when required persistence, rate limiting, key
   material or cryptographic verification is unavailable.

## 3. Common HTTP shape

All routes are under `/api/v1/auth`. Successful JSON uses:

```json
{
  "data": {}
}
```

Failures use the existing flat error envelope; they are not wrapped in `error`:

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Authentication could not be completed.",
  "requestId": "opaque-request-id",
  "statusCode": 401
}
```

`message` is a safe fallback, not UI copy. Clients localize by `code`. `details`
MUST NOT reveal identifier existence, lifecycle status, limit dimension or secret
material. Every response echoes `X-Request-ID`.

## 4. Browser credential transport

### 4.1 Access token

- Signed JWT; lifetime: 600 seconds.
- Browser storage: memory only.
- Transport: `Authorization: Bearer <access-token>`.
- No query parameter, Local Storage, Session Storage, service-worker cache,
  analytics or error-report payload.
- Verification clock tolerance: at most 30 seconds; never extend `exp`.

The JOSE header is fixed to `alg=HS256`, `typ=at+jwt`. The verifier supplies the
allowed algorithm; it never trusts a token-selected algorithm. The signing key is
at least 256 random bits, environment-managed and distinct from every hash/encryption
key.

Required claims:

| Claim               | Meaning and validation                          |
| ------------------- | ----------------------------------------------- |
| `iss`               | Exact configured Iraniyaragh issuer             |
| `aud`               | Exact `iranyaragh-browser` audience             |
| `sub`               | Existing opaque `User.id`                       |
| `sid`               | Existing active `Session.id` belonging to `sub` |
| `jti`               | Unique random access-token identifier           |
| `iat`, `nbf`, `exp` | Issued/not-before/expiry seconds                |
| `auth_time`         | Time the primary authentication completed       |
| `aal`               | `CUSTOMER_OTP` or `STAFF_MFA`                   |
| `amr`               | `['sms']` or `['pwd', 'totp']`                  |

The token MUST NOT contain mobile, email, names, raw device/IP data, role names or
permissions. Unknown critical/header/claim input is rejected, not used for lookup.

### 4.2 Refresh and CSRF cookies

Production/staging cookie names and attributes:

```text
__Host-iranyaragh_refresh=<opaque 256-bit value>;
  Secure; HttpOnly; SameSite=Strict; Path=/

__Host-iranyaragh_csrf=<opaque 256-bit value>;
  Secure; SameSite=Strict; Path=/
```

No `Domain` attribute is allowed. `Max-Age` cannot exceed the session's absolute
expiry. Cookie clearing repeats the exact name/path/security attributes.

Cookie-authenticated `refresh` and `logout` calls require:

- the refresh cookie;
- `X-CSRF-Token` exactly matching the CSRF cookie using constant-time comparison;
- an allowed `Origin`; absent/mismatched browser origins are denied;
- credentialed CORS with an exact origin allowlist.

`SameSite` is defense in depth, not the only CSRF control. Development MAY use
explicitly suffixed non-`__Host-` cookies without `Secure` only on localhost under
`NODE_ENV=development`; staging/production MUST fail startup if secure-cookie
requirements cannot be met.

### 4.3 Native implication

The browser refresh cookie MUST NOT be repackaged into a native response body.
Native secure storage, app-instance binding and refresh transport will be defined
before a mobile client is enabled. Until then, `AuthClient` accepts only the two
browser clients above.

## 5. Endpoint matrix

| Method/path                       | Authentication                    | Success                          | Required failure/security behavior                |
| --------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------- |
| `POST /customer/otp/request`      | Public                            | `202` challenge                  | Generic shape, async provider, distributed limits |
| `POST /customer/otp/verify`       | Public challenge                  | `200` access + cookies           | Atomic single-use, five attempts maximum          |
| `POST /staff/password`            | Public                            | `200` MFA challenge              | Dummy-hash non-enumeration, no session yet        |
| `POST /staff/totp/verify`         | Public challenge                  | `200` access + cookies           | One-time challenge and TOTP time-step             |
| `POST /refresh`                   | Refresh cookie + CSRF             | `200` rotated access + cookies   | Transactional rotation/replay-family revocation   |
| `GET /me`                         | Bearer                            | `200` principal                  | Live session/user/permission evaluation           |
| `GET /sessions`                   | Bearer                            | `200` safe device list           | Own sessions only, no hashes/user-agent/IP        |
| `DELETE /sessions/:sessionId`     | Bearer                            | `200 {data:{}}`                  | Own session only; current deletion clears cookies |
| `POST /logout`                    | Refresh cookie + CSRF             | `200 {data:{}}`                  | Idempotent revoke/clear; generic if already gone  |
| `POST /logout-all`                | Bearer + fresh auth               | `200 {data:{}}`                  | Revokes every family for caller atomically        |
| `POST /staff/password/change`     | `STAFF_MFA` + fresh auth          | `200 {data:{}}`                  | Verify current password; revoke other sessions    |
| `POST /staff/totp/enroll`         | Bearer + fresh password/bootstrap | `200` one-time provisioning data | No logs/cache; pending credential only            |
| `POST /staff/totp/confirm`        | Pending enrollment                | `200` one-time recovery codes    | Confirm TOTP before activating credential         |
| `POST /staff/recovery/regenerate` | `STAFF_MFA` + fresh auth          | `200` one-time recovery codes    | Invalidates all previous recovery codes           |

Fresh authentication means `now - auth_time <= 300 seconds`; otherwise return
`AUTH_REAUTHENTICATION_REQUIRED`. Domain endpoints MAY require fresh staff MFA for
role changes, refunds, secret/config changes and similar high-risk commands.

## 6. Public DTOs

Canonical TypeScript types live in `packages/contracts/src/auth.ts`. Prisma records
MUST NOT be returned or shared with clients.

### 6.1 Customer OTP request

```json
{
  "mobile": "+989000000000",
  "client": "CUSTOMER_WEB"
}
```

The boundary accepts documented Iranian input forms only long enough to normalize
them to `+989XXXXXXXXX`; persistence and hashing receive canonical E.164. A valid
request always returns the same `202` shape:

```json
{
  "data": {
    "challengeId": "opaque-id",
    "expiresInSeconds": 300,
    "resendAfterSeconds": 60
  }
}
```

The endpoint fixes purpose to `SIGN_IN` and channel to `SMS`; clients cannot choose
an enum value. Resend invalidates any prior active challenge for the same canonical
destination and purpose in the same transaction before creating a new one.

### 6.2 Customer OTP verify

```json
{
  "challengeId": "opaque-id",
  "code": "123456",
  "deviceName": "Chrome on Linux"
}
```

`code` is exactly six ASCII digits. `deviceName` is optional, untrusted display
text, trimmed, control-character-free and limited to 150 characters. Success
atomically consumes the challenge, verifies/creates the principal, sets canonical
mobile verification state and creates the session. A new security principal becomes
`ACTIVE`; no `Customer` record is created or linked.

### 6.3 Staff password and TOTP

```json
{
  "identifier": "staff@example.invalid",
  "password": "the exact unmodified password",
  "deviceName": "Operations laptop"
}
```

The identifier is normalized before lookup; the password is never trimmed,
case-folded or Unicode-normalized. Successful password verification returns only a
five-minute, one-time, purpose-bound MFA challenge:

```json
{
  "data": {
    "challengeToken": "opaque-value",
    "next": "TOTP",
    "expiresInSeconds": 300
  }
}
```

The challenge is stored only as a keyed hash and is bound to user, request purpose,
attempt count and expiry. TOTP verification accepts:

```json
{
  "challengeToken": "opaque-value",
  "code": "123456"
}
```

No privileged access/session is issued until both factors succeed. Recovery-code
verification uses a distinct endpoint/DTO in implementation and MUST NOT be
accepted in the TOTP `code` field.

### 6.4 Access response and principal

Auth completion and refresh return the access token in JSON and set refresh/CSRF
cookies:

```json
{
  "data": {
    "accessToken": "signed-jwt",
    "tokenType": "Bearer",
    "expiresInSeconds": 600,
    "principal": {
      "userId": "opaque-user-id",
      "sessionId": "opaque-session-id",
      "authenticationLevel": "STAFF_MFA",
      "permissions": ["catalog.read"],
      "authenticatedAt": "2026-08-31T12:00:00.000Z",
      "accessExpiresAt": "2026-08-31T12:10:00.000Z"
    }
  }
}
```

`permissions` is a current presentation snapshot for navigation; the API rechecks
authorization for every protected command. It is always empty for `CUSTOMER_OTP`.

### 6.5 Session list

The caller sees only their sessions:

```json
{
  "data": {
    "sessions": [
      {
        "sessionId": "opaque-session-id",
        "current": true,
        "deviceName": "Operations laptop",
        "authenticationLevel": "STAFF_MFA",
        "createdAt": "2026-08-31T12:00:00.000Z",
        "lastUsedAt": "2026-08-31T12:05:00.000Z",
        "expiresAt": "2026-09-01T00:00:00.000Z"
      }
    ]
  }
}
```

Raw user agent/IP and their hashes are not public DTO fields.

## 7. User and session state semantics

| State/condition         | Customer OTP                         | Staff password/TOTP                                 | Existing protected request                               |
| ----------------------- | ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| `ACTIVE`                | Allowed                              | Allowed if staff role + TOTP                        | Allowed subject to session/permission                    |
| `PENDING`               | Successful mobile proof activates    | No privileged session; finish controlled enrollment | Denied                                                   |
| `SUSPENDED`             | Generic Auth failure                 | Generic Auth failure                                | `AUTH_SESSION_INVALID`                                   |
| `LOCKED`                | Generic Auth failure                 | Generic Auth failure                                | `AUTH_SESSION_INVALID`                                   |
| `DELETED`               | Generic Auth failure; no re-creation | Generic Auth failure                                | `AUTH_SESSION_INVALID`                                   |
| `lockedUntil > now`     | Generic throttle/failure             | Generic throttle/failure                            | Existing sessions remain valid unless separately revoked |
| expired/revoked session | Not applicable                       | Not applicable                                      | `AUTH_SESSION_INVALID`                                   |

Temporary automated throttling sets `lockedUntil` but does not change the durable
status or, by itself, invalidate an already authenticated session; otherwise an
attacker could force-log-out a victim by submitting bad passwords. `LOCKED` is an
explicit manual/security lifecycle state. Changing a user to `SUSPENDED`, `LOCKED`
or `DELETED` revokes all active session families in the same application
transaction/outbox boundary.

## 8. Refresh rotation and concurrency

Refresh tokens are 32 random bytes encoded base64url. Persistence stores a
versioned, domain-separated keyed hash such as:

```text
v1:base64url(HMAC-SHA-256(derived-refresh-key, raw-token))
```

Subkeys for refresh, OTP, identifier, IP and device hashing are derived with HKDF
from an environment/secret-manager root and unique context labels. The key version
is stored with the hash so a bounded current/previous-key rotation is possible.

Within one database transaction, a valid refresh:

1. finds and locks/CAS-updates the active session by refresh hash;
2. verifies user/session state, inactivity and absolute expiry;
3. creates a replacement session in the same family with the original absolute
   expiry and a new refresh hash;
4. revokes the old row as `ROTATED` and links `replacedBySessionId`;
5. commits before returning the new cookie/access token.

If the supplied row is already rotated, the service revokes all still-active rows
with its `tokenFamilyId`, emits `auth.session.replay_detected`, clears cookies and
returns `AUTH_SESSION_REPLAYED`. In two simultaneous refreshes exactly one CAS wins;
the loser follows this replay path, so the resulting family is revoked. UI clients
MUST coordinate a single refresh in flight across tabs and recover at the login
screen without a loop.

Session limits:

| Session      | Access token | Inactivity | Absolute |
| ------------ | -----------: | ---------: | -------: |
| Customer OTP |   10 minutes |     7 days |  30 days |
| Staff MFA    |   10 minutes | 30 minutes | 12 hours |

`lastUsedAt` updates may be write-throttled, but the effective inactivity check must
remain conservative. Rotation never moves the family absolute deadline.

## 9. OTP and authentication abuse controls

All limits are enforced in Redis using versioned keyed identifier/IP hashes and
atomic operations. PostgreSQL attempt/terminal state remains the durable source of
truth for a challenge. `429` includes a bounded `Retry-After` header but never names
which dimension fired.

### Customer SMS request

| Dimension             | Limit                                                      |
| --------------------- | ---------------------------------------------------------- |
| Canonical destination | 1 per 60 seconds; 3 per 15 minutes; 10 per 24 hours        |
| Safe IP hash          | 20 per hour; 100 per 24 hours                              |
| Active challenge      | One per destination + purpose; resend invalidates previous |
| Provider/global       | Circuit breaker and operator-configured capacity ceiling   |

### Customer OTP verification

| Dimension     | Limit                                     |
| ------------- | ----------------------------------------- |
| Challenge     | 5 failed attempts total, then invalidated |
| Safe IP hash  | 50 failed attempts per hour               |
| Code lifetime | 300 seconds                               |

Attempt count increment and consume/invalidate transition are atomic. Two valid
verification requests for one challenge can produce at most one session.

### Staff password/TOTP

| Dimension       | Limit                                                         |
| --------------- | ------------------------------------------------------------- |
| Identifier hash | 5 password failures per 15 minutes, then 15-minute throttle   |
| Safe IP hash    | 30 password failures per 15 minutes                           |
| MFA challenge   | 5 TOTP/recovery failures or 5 minutes, whichever occurs first |
| Refresh IP hash | 30 attempts per minute plus replay detection                  |

Unknown identifiers perform the configured dummy Argon2id verification and consume
the same identifier/IP buckets. Successful full authentication resets applicable
failure counters. Redis/provider unavailability returns `503 UPSTREAM_UNAVAILABLE`;
the service never silently falls back to per-process limits.

## 10. Password, TOTP and bootstrap rules

### Password

- 15–128 Unicode characters; a separate 1,024-byte request limit prevents hashing
  denial of service.
- No trim, case conversion, silent truncation, periodic expiry or character-class
  composition rule.
- Paste and password managers are allowed.
- Reject locally blocklisted common/compromised values without sending the password
  to an external runtime service.
- Store an Argon2id PHC string with a unique library-generated salt. Minimum:
  `m=19456 KiB`, `t=2`, `p=1`; benchmark/tune upward and rehash on successful login
  when parameters become obsolete.

Password change requires the current password and recent `STAFF_MFA`; it revokes
all other session families and rotates the current family. Unauthenticated staff
password reset is not in the first implementation; recovery is operator-assisted,
audited and requires identity verification defined by operations policy.

### TOTP/recovery

- Unique random secret per credential, RFC 6238, 30-second step, six digits,
  `SHA-1` for broad authenticator compatibility, accepted window `-1/0/+1`.
- Persist the last accepted time step and reject its reuse.
- Encrypt the secret with an authenticated-encryption key held outside PostgreSQL;
  key ID/version accompanies ciphertext.
- Enrollment secret/provisioning URI is returned exactly once over a recent
  authenticated `no-store` response and is redacted from all instrumentation.
- Ten recovery codes are generated with at least 80 random bits each, shown once,
  independently hashed and consumed atomically. Regeneration invalidates all old
  codes and revokes other session families.

### First administrator

The bootstrap command:

1. requires an explicit operation flag and a direct TTY;
2. reads password/TOTP confirmation through hidden interactive input, never CLI
   arguments or environment variables;
3. acquires a database advisory lock and refuses to replace an existing active
   `system-admin` assignment;
4. creates a canonical principal, confirms TOTP, activates the user and assigns the
   seeded role in one controlled workflow;
5. displays recovery codes once and writes a safe actor-null bootstrap audit event;
6. leaves no default credential in seed, container, CI artifact or shell history.

## 11. Effective authorization

For permission `P` at time `now`, allow only when all are true:

- token cryptography/claims are valid;
- session belongs to token subject, is unrevoked, unexpired and within inactivity
  limit;
- user status is `ACTIVE`; a login-only `lockedUntil` does not by itself invalidate
  an existing session;
- authentication level is sufficient for the endpoint;
- an assignment exists with no `revokedAt` and `expiresAt` absent or greater than
  `now`;
- role and permission are active;
- role-permission grant has no `revokedAt`;
- requested permission key exactly matches `P`.

Unknown permissions, malformed metadata and lookup failures deny. A missing/invalid
credential returns `401`; an authenticated principal lacking permission returns
`403 FORBIDDEN`. Controllers only declare policy; guards/services enforce it.

## 12. Public error contract

| Code                             | HTTP | Client meaning; prohibited disclosure              |
| -------------------------------- | ---: | -------------------------------------------------- |
| `VALIDATION_ERROR`               |  400 | Invalid public DTO; never echo password/code/token |
| `AUTH_INVALID_CREDENTIALS`       |  401 | Generic password/account/lifecycle failure         |
| `AUTH_CHALLENGE_INVALID`         |  401 | Wrong/consumed/invalidated challenge or code       |
| `AUTH_CHALLENGE_EXPIRED`         |  401 | Validly shaped challenge expired                   |
| `AUTH_SESSION_INVALID`           |  401 | Missing/expired/revoked/user-ineligible session    |
| `AUTH_SESSION_REPLAYED`          |  401 | Refresh family revoked; client must clear state    |
| `AUTH_REAUTHENTICATION_REQUIRED` |  401 | Fresh proof required for sensitive action          |
| `AUTH_CSRF_INVALID`              |  403 | Cookie request failed Origin/header/cookie proof   |
| `FORBIDDEN`                      |  403 | Authenticated but current permission/level denied  |
| `CONFLICT`                       |  409 | Safe non-secret state/concurrency conflict         |
| `RATE_LIMITED`                   |  429 | Retry later; dimension/account existence hidden    |
| `UPSTREAM_UNAVAILABLE`           |  503 | Limiter/provider/security dependency unavailable   |

Password failure for absent, locked, suspended or deleted users uses identical
status/code/message and comparable expensive work. Internal `LoginAttemptOutcome`
retains the more specific reason when a known principal exists.

## 13. Audit, privacy and retention

Required safe events include:

| Event                                         | Minimum safe evidence                                     |
| --------------------------------------------- | --------------------------------------------------------- |
| `auth.otp.requested`                          | purpose/channel, request ID, destination/IP hash versions |
| `auth.otp.verified` / `auth.otp.failed`       | actor when known, challenge ID, outcome                   |
| `auth.staff.password_verified` / `failed`     | actor when known, identifier hash, outcome                |
| `auth.staff.mfa_verified` / `failed`          | actor, method, outcome; never step/code                   |
| `auth.session.created`                        | actor, session/family IDs, authentication level           |
| `auth.session.rotated`                        | actor, old/new session IDs                                |
| `auth.session.replay_detected`                | actor, family/session ID, request ID                      |
| `auth.session.revoked` / `all_revoked`        | actor, target IDs, reason                                 |
| `auth.permission.denied`                      | actor, permission key, endpoint/command, request ID       |
| `auth.password.changed`                       | actor, affected session policy; no hash metadata          |
| `auth.totp.enrolled` / `recovery_regenerated` | actor and credential version only                         |
| `auth.admin.bootstrapped`                     | actor null, created user/role IDs, operator-safe context  |

Retention defaults, pending a stricter legal policy:

- OTP and short-lived MFA challenge rows: purge 30 days after terminal/expiry;
- LoginAttempt: 180 days;
- expired/revoked Session rows: 180 days;
- Auth/privilege AuditLog events: at least two years;
- raw application/security logs: shortest operationally useful period, target 30 days.

Deletion jobs must be bounded, observable and preserve audit records required for
security/business history. Hashes are pseudonymous data, not anonymous data.

## 14. Threat and control matrix

| Threat/abuse                 | Primary controls                                                           | Required evidence                                |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| Account enumeration          | Generic shapes/codes, dummy Argon work, async OTP response                 | Existing/absent/status timing and response tests |
| Credential stuffing          | Argon2id, blocklist, identifier/IP throttles, staff MFA                    | Lock/throttle boundary tests                     |
| OTP brute force/flooding     | CSPRNG, keyed hash, five attempts, resend/destination/IP limits            | Wrong/expired/resend/concurrent tests            |
| SMS interception/phishing    | Short single-use OTP; no staff authorization from customer level           | Auth-level permission-deny tests                 |
| Access-token theft           | Ten-minute TTL, memory-only client, live session lookup                    | Revocation immediately denies token              |
| Refresh-token theft/replay   | HttpOnly cookie, keyed hash, rotation and family revoke                    | Sequential and concurrent replay tests           |
| CSRF                         | Strict/host-only cookies, Origin, double-submit header, CORS allowlist     | Missing/mismatch/cross-origin tests              |
| XSS credential export        | Refresh HttpOnly; access memory-only; CSP/UI hardening                     | Storage/log/network E2E assertions               |
| JWT confusion/forgery        | Fixed alg/type/issuer/audience, strong distinct key, full claim validation | Wrong alg/key/type/audience/time tests           |
| Stale/revoked privilege      | Server-side effective permission query on every command                    | Expired/revoked/inactive allow-deny tests        |
| TOTP/recovery replay         | One accepted time step; atomic one-time recovery hashes                    | Same-step/code concurrent tests                  |
| Secret/PII logging           | Central redaction plus explicit safe audit schemas                         | Logger/audit capture tests                       |
| Limiter/provider outage      | Fail closed with stable 503, circuit/queue observability                   | Failure injection and recovery test              |
| Bootstrap race/default admin | TTY-only command, advisory lock, no seed credential                        | Concurrent rerun and artifact scan               |

## 15. Required client state matrix

Clients implement the state machine below against public codes. They MUST prevent
duplicate submission, announce async status accessibly, preserve only non-secret
form state and never infer account status from timing.

### Customer OTP

| Client state            | Entry                                      | Required behavior                                                             |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `mobile-entry`          | Route opened or flow reset                 | Normalize for preview; server remains canonical authority                     |
| `requesting`            | Submit valid mobile                        | One request in flight; do not navigate or log payload                         |
| `code-entry`            | Generic `202`                              | Start 300-second expiry and 60-second resend clocks from response             |
| `cooldown`              | Before resend deadline                     | Resend disabled with accessible remaining time                                |
| `verifying`             | Six-digit code submitted                   | One verify in flight; code remains masked from telemetry                      |
| `invalid-code`          | `AUTH_CHALLENGE_INVALID`                   | Generic retry, preserve remaining attempts only if server safely exposes none |
| `expired`               | `AUTH_CHALLENGE_EXPIRED` or local deadline | Require a new challenge; never reuse the old code                             |
| `rate-limited`          | `RATE_LIMITED`                             | Honor bounded `Retry-After`; do not reveal rate-limit dimension               |
| `offline/provider-down` | Network failure or `UPSTREAM_UNAVAILABLE`  | Explicit recoverable state; no automatic resend loop                          |
| `authenticated`         | Access response                            | Keep access token in memory; clear OTP/code form state                        |

### Staff login and MFA

| Client state                | Entry                       | Required behavior                                                               |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `password-entry`            | Admin login opened          | Password-manager/paste compatible; identifier may be remembered, password never |
| `password-verifying`        | Submit                      | One request; same visible failure for invalid/unavailable account               |
| `totp-entry`                | MFA challenge response      | Challenge only in memory; show five-minute expiry                               |
| `totp-verifying`            | TOTP submitted              | One request; do not trim/log/retain code after attempt                          |
| `invalid-auth`              | `AUTH_INVALID_CREDENTIALS`  | Generic retry without account-state claim                                       |
| `invalid/expired-challenge` | Auth challenge code         | Clear challenge and return safely to password entry                             |
| `authenticated`             | `STAFF_MFA` access response | Build navigation from snapshot; API remains authorization authority             |

### Authenticated shell/session

| Client state      | Trigger                                   | Required behavior                                                    |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `active`          | Valid access token                        | Use bearer header; never persist the token                           |
| `refreshing`      | Access expiry/one `401`                   | One cross-tab refresh in flight; queue bounded requests              |
| `session-invalid` | Refresh fails with `AUTH_SESSION_INVALID` | Clear memory and return to login once                                |
| `replay-detected` | `AUTH_SESSION_REPLAYED`                   | Clear all local auth state; warn that reauthentication is required   |
| `reauth-required` | Sensitive action needs fresh proof        | Preserve safe intent, reauthenticate, then require explicit resubmit |
| `forbidden`       | `403 FORBIDDEN`                           | Show forbidden state; do not refresh or pretend the route is absent  |
| `rate-limited`    | `429`                                     | Honor `Retry-After`; no background retry storm                       |
| `offline`         | Network unavailable                       | Keep no secret beyond memory; offer deliberate retry/logout          |

A `401` may trigger at most one refresh attempt for a request. A `403` never
triggers refresh. Redirects have a bounded counter so expiry cannot produce a
login/refresh loop. Multi-tab coordination uses a browser primitive such as
`BroadcastChannel`; it transmits state/result signals, never raw tokens.

## 16. Mandatory verification

The implementation issues are incomplete without:

- unit tests for normalization, hashes, JWT claim rejection and state calculation;
- HTTP tests for every success/error code and `no-store`/cookie/CORS/CSRF header;
- real PostgreSQL tests for OTP single-consume, session rotation and family replay;
- concurrent tests for two OTP verifies, two refreshes and two bootstrap attempts;
- Redis/provider failure injection and rate-window boundary tests;
- permission allow/deny tests for every assignment/role/grant/user/session condition;
- logger/audit capture proving all secret/PII fields are absent or redacted;
- Playwright customer/admin expiry, retry, forbidden, revoke and cross-tab refresh
  scenarios with no credential in browser persistent storage;
- OpenAPI regeneration/drift, lint, typecheck, unit/integration, build and full CI.

## 17. Data and rollout impact

ADR-0005 persistence supports customer OTP and rotating sessions. Staff MFA needs a
new reviewed forward migration for pending MFA challenges, encrypted/versioned TOTP
credentials, last accepted step, one-time recovery-code hashes and durable Session
authentication-level/authenticated-at evidence. The migration must add SQL
invariants and rollback-only verification; it must not edit the shared baseline
migration.

Rollout order:

1. merge deterministic RBAC seed and this contract;
2. land the staff-MFA forward contract/migration;
3. implement shared session/permission/audit core;
4. implement OTP and staff flows while clients use accepted mocks;
5. run integrated abuse/revocation E2E before enabling Auth routes in staging.
