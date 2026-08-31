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

## Payment safety
- Verify gateway callbacks with the provider.
- Never trust amount/order status from browser/mobile clients.
- Use idempotency and transaction-safe verification.
- Store enough gateway references for reconciliation.

## Backups
- Database backups stored separately from the application server.
- Object storage recovery strategy documented.
- Periodic restore tests are mandatory; an untested backup is not considered reliable.
