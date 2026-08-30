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
