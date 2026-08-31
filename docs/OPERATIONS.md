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

`.github/workflows/ci.yml` runs two jobs per pull request:
- `quality` — `pnpm install`, Prisma client generation, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `e2e` — same setup, then `playwright install --with-deps chromium` and
  `pnpm e2e` (builds both apps and runs the Playwright smoke suite over the
  storefront and admin shells on desktop + mobile viewports). The Playwright
  HTML report and test artifacts are uploaded on failure.

The smoke suite enforces a **zero-external-asset gate**: any HTTP(S) request
from `web` or `admin` to an origin other than the app itself fails the run. The
storefront self-hosts its Vazirmatn variable font for this reason.

Production deployments should be reproducible and Docker-based.

## Database migrations
- Schema changes use reviewed migrations.
- Avoid manual production schema edits.
- Destructive migrations require explicit data migration/backout consideration.

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
