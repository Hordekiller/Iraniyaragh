# Security Baseline

## Identity

### Customers

- Mobile-number OTP is the primary planned customer authentication flow.
- OTP must expire, be rate-limited and have attempt limits.
- Never log OTP values.

### Admin/Staff

- Strong password policy.
- TOTP/2FA for privileged accounts.
- Device/session management and revocation.
- Sensitive roles should require elevated controls.

### Runtime Auth contract

- ADR-0007 and `AUTH_CONTRACT.md` are authoritative for token transport, cookie/
  CSRF behavior, OTP/password/TOTP policy, rate limits, state semantics and stable
  public errors.
- Browser access JWTs live only in memory for ten minutes and contain no PII, role
  or permission snapshot. Every protected request rechecks the backing session,
  current user state and effective permissions server-side.
- Browser refresh tokens are opaque, rotated and stored raw only in host-only
  Secure/HttpOnly/SameSite cookies; PostgreSQL stores a domain-separated keyed hash.
  Replay, including a losing concurrent refresh, revokes the token family.
- Cookie-authenticated Auth mutations require exact-origin credentialed CORS and a
  matching CSRF cookie/header. `SameSite` alone is not sufficient.
- Customer SMS OTP is short-lived, single-use and distributed-rate-limited. It never
  grants staff permissions. Privileged staff require password plus TOTP.
- Seed never creates a privileged user. First-admin bootstrap is an explicit,
  TTY-only, audited operation with no default or command-line credential.
- Auth startup rejects weak, missing, shared or whitespace-mutated key material.
  Access signing uses a distinct key; HKDF-derived, domain-separated HMAC keys protect
  refresh, OTP, MFA-challenge, identifier, IP and device lookup values. Persisted hashes
  carry their key version and verification accepts at most current/previous versions.

### Auth persistence invariants

- `User` is the security principal. Its ID is an opaque string/CUID; API clients
  must never infer identity from sequential IDs.
- At least one canonical identifier is required. Iranian mobile numbers are stored
  as `+989XXXXXXXXX`; email addresses are trimmed and lowercased before persistence.
  The database rejects non-canonical values and keeps each identifier unique.
- Only `passwordHash`, `refreshTokenHash`, `codeHash` and keyed hashes of sensitive
  lookup metadata are stored. Raw passwords, refresh tokens, OTP codes and IP
  addresses must never be persisted or logged.
- User lifecycle is explicit: `ACTIVE`, `PENDING`, `SUSPENDED`, `LOCKED` or
  `DELETED`. Verification booleans and timestamps must remain consistent.
- Sessions are expiring, revocable and rotation-aware. A rotated session points to
  its replacement and must be revoked with a reason.
- OTP records are purpose- and channel-specific, expire, count failed attempts and
  have exactly one terminal state: consumed or invalidated.
- Authentication attempts and audit events retain only safe metadata. JSON audit
  payloads must be redacted by the application before insertion.
- Prisma cannot represent all of these checks. The reviewed SQL migration contains
  the authoritative PostgreSQL `CHECK` constraints; do not remove them when
  regenerating Prisma artifacts.

## Authorization

Use permissions, not scattered role-name comparisons.

Example permission groups:

- `catalog.read`, `catalog.write`
- `pricing.read`, `pricing.write`
- `inventory.read`, `inventory.adjust`, `inventory.transfer`
- `orders.read`, `orders.manage`
- `shipments.read`, `shipments.manage`
- `payments.read`, `payments.refund`
- `customers.read`, `customers.manage`
- `users.manage`, `roles.manage`
- `reports.read`
- `audit.read`, `settings.manage`

Roles are collections of permissions. Critical backend actions must always enforce permissions server-side.

Role and permission assignments preserve grant/revoke metadata. Revoked rows are
reactivated or updated deliberately rather than duplicated, and every privilege
change must also emit an audit event.

## Audit

Audit security- and business-sensitive actions, including:

- Login/security changes
- User/role/permission changes
- Price changes
- Inventory adjustments/transfers
- Order manual state changes
- Refunds/payment actions
- System configuration changes

Capture actor, action, entity, timestamp, request ID, and safe request metadata. Avoid storing secrets in audit payloads.

## API controls

- Validation at every external boundary
- Global request size limits
- Rate limits, especially OTP/auth/search/public write endpoints
- CORS allowlist per environment
- CSRF proof on cookie-authenticated Auth endpoints
- Security headers
- No stack traces in production responses
- Request correlation IDs

## Secrets

Never commit:

- Database passwords
- JWT secrets/private keys
- SMS credentials
- Payment gateway secrets
- S3 credentials

`.env.example` contains names/placeholders only.

Auth key names and the bounded current/previous rotation procedure are documented in
`OPERATIONS.md`. Raw key material must never appear in a ticket, command argument, log
or CI artifact.

## Payment safety

- Verify gateway callbacks with the provider.
- Never trust amount/order status from browser/mobile clients.
- Use idempotency and transaction-safe verification.
- Store enough gateway references for reconciliation.

## Backups

- Database backups stored separately from the application server.
- Object storage recovery strategy documented.
- Periodic restore tests are mandatory; an untested backup is not considered reliable.
