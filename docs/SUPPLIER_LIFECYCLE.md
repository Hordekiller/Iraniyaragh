# Supplier lifecycle — API slice (#334)

This slice supplies the backend contract for #329. It does **not** add an Admin
operator route, Purchase Orders, Receiving or production-like acceptance. Keep
#329 and #7 open until their later slices pass.

## API and controls

- `GET /api/v1/suppliers`, `GET /api/v1/suppliers/:id`, and
  `GET /api/v1/suppliers/:id/history` require staff MFA plus `suppliers.read`.
- `POST /api/v1/suppliers` and `PATCH /api/v1/suppliers/:id` require staff MFA
  plus `suppliers.manage` and a unique `Idempotency-Key` (8–96 ASCII letters,
  digits, `_` or `-`). The same actor/scope/key/payload returns the committed
  response; key reuse with different content returns `IDEMPOTENCY_CONFLICT`.
- `POST` canonicalizes a 2–64 character ASCII code to uppercase. Code is
  immutable and unique. `PATCH` requires `expectedVersion`; a stale write
  fails with `VERSION_CONFLICT`. Empty updates fail validation. Supplier removal
  is not exposed: set `isActive=false`, preserving Purchase Order references.
- All reads use explicit public projections, not Prisma models. Lifecycle
  audit history contains action, actor and timestamp but no contact values.
  Supplier contact fields are visible only to staff with `suppliers.read`.
- A forward migration adds the version, durable command replay table and
  permission definitions. Only the existing system-admin role gets new grants
  automatically; other operator grants require an explicit administrator action.

## Verification boundary

API unit and database integration tests cover code normalization, validation,
MFA/permission declarations, retries, duplicate code, stale version, audit
history and deactivation. An isolated `_test` PostgreSQL database is mandatory
for integration tests. The API contract is not a claim that Admin UI or a
fixture-free staging purchasing workflow exists.
