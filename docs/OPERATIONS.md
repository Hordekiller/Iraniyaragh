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

`.github/workflows/ci.yml` runs three jobs per pull request:

- `quality` — `pnpm install`, Prisma client generation, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `database` — starts an isolated PostgreSQL 18 service, validates Prisma, applies
  migrations, rejects migration/schema drift through a separate shadow database,
  runs PostgreSQL constraint checks and executes API integration tests.
- `e2e` — same setup, then `playwright install --with-deps chromium` and
  `pnpm e2e` (builds both apps and runs the Playwright smoke suite over the
  storefront and admin shells on desktop + mobile viewports). The Playwright
  HTML report and test artifacts are uploaded on failure.

The public repository also has independent security gates:

- GitHub CodeQL default setup runs the extended query suite for JavaScript/
  TypeScript and GitHub Actions on pull requests, protected-branch pushes and a
  weekly schedule.
- `.github/workflows/dependency-review.yml` rejects newly introduced direct or
  transitive dependencies with moderate-or-higher known vulnerabilities.
- Dependabot alerts and security updates are enabled; `.github/dependabot.yml`
  proposes bounded weekly npm-workspace and GitHub Actions update groups.
- Secret scanning and push protection detect existing supported credentials and
  block new supported secrets before they enter Git history.
- Security researchers use the private reporting path documented in `/SECURITY.md`,
  never a public issue containing exploit or credential details.

All workflow actions are pinned to reviewed full commit SHAs. The adjacent version
comment is documentation only; updating a tag does not update the executed code.
Action upgrades require a reviewed SHA change and must retain the Node 24-compatible
runtime baseline.

Run `pnpm audit --prod --audit-level=moderate` during dependency triage; a green
Dependency Review only evaluates a PR delta and is not proof that the existing tree
has no newly published advisory. The admin runtime is pinned to Next.js `16.3.3`,
which brings patched PostCSS/Sharp versions. Prisma 6.19.3 still pins vulnerable
`deepmerge-ts` 7.x through `@prisma/config`, so `pnpm-workspace.yaml` contains one
narrow override to 8.0.2. Do not broaden or remove it until the production audit,
Prisma generate/validate, clean migration+drift, SQL constraints and integration
tests all pass with the replacement.

The smoke suite enforces a **zero-external-asset gate**: any HTTP(S) request
from `web` or `admin` to an origin other than the app itself fails the run. The
storefront self-hosts its Vazirmatn variable font for this reason.

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
export NODE_ENV=test
export DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test?schema=public'
export PSQL_DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test'
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma migrate deploy
psql "$PSQL_DATABASE_URL" -f apps/api/prisma/tests/auth_constraints.sql
pnpm --filter api run prisma:generate
pnpm test:integration
```

The SQL verification runs inside a transaction and rolls back its fixture data. It
intentionally exercises rejected values and must be run with `ON_ERROR_STOP` enabled.
The test runner refuses to connect unless `NODE_ENV=test` and the database name ends
with `_test`. See `docs/TESTING.md` for creation, drift and cleanup commands.

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

### API health probes

The API exposes two versioned, unauthenticated and non-cacheable probes with distinct
operational meanings:

| Probe                      | Success                | Failure behavior                                                           | Intended consumer                                   |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /api/v1/health/live`  | `200`, `status: ok`    | Fails only when the API process cannot serve HTTP                          | Container/process restart policy                    |
| `GET /api/v1/health/ready` | `200`, `status: ready` | `503`, `DATABASE_UNAVAILABLE` when PostgreSQL fails or exceeds 1.5 seconds | Load balancer traffic gate and deployment readiness |

`GET /api/v1/health` remains a liveness alias for compatibility, but new
infrastructure must use the explicit `/live` path. The liveness probe never queries
PostgreSQL. Prisma connects lazily so the API process can start and expose liveness
while a database outage keeps readiness non-ready.

Dependency exception messages, hosts and credentials are never returned by the
readiness endpoint. Both responses include an ISO-8601 UTC timestamp and
`Cache-Control: no-store`. Configure probe timeouts above two seconds so the API's
bounded database check can finish, and do not use readiness failure alone as a
container restart signal.

Local smoke commands:

```bash
curl --fail http://127.0.0.1:4000/api/v1/health/live
curl --fail http://127.0.0.1:4000/api/v1/health/ready
```

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
