# Operations, Reliability & Delivery

## Environments
Maintain independent:
- Development
- Staging
- Production

Production databases/credentials must never be reused for development.

## Configuration validation

The API validates configuration before opening a listening socket. Development may
default to the known local web/admin origins; staging and production must provide an
explicit comma-separated `CORS_ORIGINS` allowlist. Wildcards are forbidden when
credentialed requests are enabled. Staging and production must also provide an
explicit `API_PORT`; their JWT/object-storage secrets must be non-placeholder values
of at least 32 characters, and access/refresh secrets must differ.

Environment values are configuration only; business policy and secrets never use
client-exposed variables. Update `.env.example`, deployment secrets and this matrix
together when a required key changes.

## CI/CD baseline
Every pull request should run:
1. Lint
2. Type check
3. Unit/integration tests as available
4. Build
5. Migration/schema validation where applicable

Production deployments should be reproducible and Docker-based.

## Database migrations
- Schema changes use reviewed migrations.
- Avoid manual production schema edits.
- Destructive migrations require explicit data migration/backout consideration.
- `20260830180000_auth_rbac_persistence` is the initial baseline. Because no prior
  migration history existed, it creates both the pre-existing platform tables and
  the Auth/RBAC tables. New empty environments apply it with `prisma migrate deploy`.
- A local database previously created with `prisma db push` is unmanaged state, not
  proof that this migration ran. Back up any needed data, then recreate disposable
  development databases from migrations. Never mark a production migration as
  applied merely to suppress drift; use a separately reviewed baselining/runbook.
- Never edit an already-shared migration. Preserve custom Auth `CHECK` constraints
  and add a forward migration for every later schema change.

For Auth persistence changes, verify on a clean PostgreSQL database:

```bash
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma migrate deploy
psql "$DATABASE_URL" -f apps/api/prisma/tests/auth_constraints.sql
pnpm --filter api run prisma:generate
```

The SQL verification runs inside a transaction and rolls back its fixture data. It
intentionally exercises rejected values and must be run with `ON_ERROR_STOP` enabled.

## Observability
Plan for:
- Structured application logs
- Request/correlation ID
- Error tracking
- Metrics
- Health/readiness endpoints
- Queue/worker monitoring
- Alerts for business-critical failures

Target stack can evolve toward OpenTelemetry + Prometheus/Grafana/Loki and/or Sentry.

## Background jobs
Use queues for work that should not slow synchronous user requests, such as:
- SMS/email/push
- Image processing
- Search indexing
- Invoice/report generation
- Integration retries

Jobs must be retry-safe and idempotent when side effects are possible.

## Feature flags
Use feature flags for risky or staged product launches where appropriate. Flags must not become a permanent substitute for deleting obsolete code.

## Infrastructure principle
Start cost-efficiently on Iranian VPS/cloud, but keep the application provider-portable:
- Containers
- Externalized configuration
- Independent backups
- S3-compatible storage
- No provider-specific business logic
