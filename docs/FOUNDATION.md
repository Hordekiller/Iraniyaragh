# Iraniyaragh Engineering Foundation

This document is the default engineering contract for all future Iraniyaragh development. A feature that violates these rules must be discussed and documented with an Architecture Decision Record (ADR) before implementation.

## 1. Product boundaries

Iraniyaragh is a commerce and warehouse platform with a shared business backend serving:

- Customer Web
- Customer Mobile App
- Admin/Operations Panel
- Future integrations such as accounting, logistics, supplier feeds and marketplaces

The backend is the source of business truth. UI clients must not own business rules.

## 2. Architecture baseline

- Monorepo: pnpm + Turborepo
- Backend: NestJS modular monolith
- Database: PostgreSQL
- ORM: Prisma
- Cache/locks/queues: Redis
- Background jobs: BullMQ
- Object storage: S3-compatible storage
- API: REST, versioned under `/api/v1`
- Web/Admin: TypeScript frontend applications
- Mobile: React Native + Expo after API contracts stabilize
- Deployment: Docker-first

Do not introduce microservices until profiling and operational evidence justify the split.

## 3. Domain rules that must not be bypassed

### Money

- Never use JavaScript floating-point numbers for accounting calculations.
- Persist money as integer minor/base units according to the project's chosen currency convention.
- Currency and display conversion are presentation concerns.
- Price changes must be auditable.

### Time

- Persist timestamps in UTC.
- Convert to Iran/local timezone only at presentation boundaries.
- Jalali dates are a UI/reporting format, not the database time model.

### Inventory

- SKU is the atomic sellable inventory unit.
- Inventory is warehouse/location aware.
- Physical stock changes always create immutable ledger movements.
- Available quantity is derived from on-hand and reservations.
- Critical inventory mutations happen inside database transactions.
- Negative stock is rejected unless a documented backorder policy explicitly enables it.
- Manual corrections require reason, actor and audit trail.

### Orders

- Order state is controlled by a state machine.
- Clients may request commands; they may not freely assign arbitrary states.
- Financial state and fulfillment state must not be collapsed into one field.

### Payments

- Payment attempts are separate from orders.
- External callbacks are verified server-side.
- Payment verification and refunds are idempotent.
- Duplicate callbacks must never create duplicate financial effects.

## 4. Cross-cutting platform capabilities required from the beginning

- Authentication
- Fine-grained RBAC/permissions
- Audit log
- Idempotency
- Structured errors
- Structured logging + correlation/request ID
- Rate limiting
- Security headers
- Secrets via environment/secret manager, never committed
- Database migrations
- Seed strategy for development/staging
- Health/readiness endpoints
- Backup + tested restore procedure
- CI: lint, typecheck, tests, build
- API/OpenAPI documentation
- Feature flags for staged rollout where useful

## 5. Data lifecycle

Important business entities should prefer explicit lifecycle states and/or soft deletion over destructive deletion when historical integrity matters.

Examples:

- Product/SKU: archive instead of deleting historical references.
- Supplier: deactivate if referenced by purchases.
- Customer: privacy-sensitive anonymization must be handled separately from deleting order history.
- Orders/payments/inventory ledger: never hard-delete through normal application flows.

## 6. Shared contracts

`packages/contracts` is the boundary for reusable API/domain contracts where appropriate.

- Avoid duplicating enums/error codes across web/admin/mobile/api.
- Do not expose Prisma/database models directly as public API contracts.
- Public contracts may evolve independently from persistence models.

## 7. Error model

Errors returned to clients should be stable and machine-readable.

Example:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "موجودی کافی نیست",
  "requestId": "...",
  "statusCode": 409
}
```

Representative codes:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `SKU_NOT_FOUND`
- `INSUFFICIENT_STOCK`
- `RESERVATION_EXPIRED`
- `ORDER_STATE_CONFLICT`
- `PAYMENT_ALREADY_VERIFIED`
- `IDEMPOTENCY_CONFLICT`

## 8. Definition of Done for critical features

A business-critical feature is not complete until applicable items are done:

- Business rule implemented in service/domain layer
- Input validation
- Permission check
- Transaction boundary reviewed
- Audit event
- Idempotency where retries/duplicates are possible
- Stable error codes
- Unit/integration tests
- OpenAPI/API contract updated
- Migration reviewed if schema changed
- Observability/logging considered
- Security/privacy impact reviewed

## 9. Change policy

If a future requirement contradicts this foundation, create an ADR under `docs/adr/` explaining:

1. Context
2. Decision
3. Alternatives
4. Consequences
5. Migration plan
