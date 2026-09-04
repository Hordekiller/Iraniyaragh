# Testing Strategy

## Layers

- Unit tests run without infrastructure through `pnpm test` and participate in the
  root Turbo graph.
- Database integration tests run through `pnpm test:integration`. They use real
  PostgreSQL/Prisma transactions and are deliberately separate from fast unit tests.
- Browser smoke tests run through `pnpm e2e` and cover the web/admin shells plus the
  zero-external-asset network policy. The admin smoke drives the real dev sign-in UI
  against a live API (migrated and seeded in CI) into the authenticated shell on both
  desktop and mobile viewports.

Integration tests do not reuse development, staging or production databases. Before
Prisma connects, `assertIsolatedTestDatabase` requires both:

- `NODE_ENV=test`;
- a PostgreSQL database name ending in `_test`.

This naming rule is a safety boundary, not a substitute for separate credentials and
infrastructure. Never point the integration runner at a database containing valuable
data, even if its name happens to end in `_test`.

## Local PostgreSQL setup

Start the repository PostgreSQL service, then create dedicated test and shadow
databases once:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
  psql -U app -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE iraniyaragh_test'
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
  psql -U app -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE ci_shadow_test'
```

Export only test endpoints in the shell running database checks:

```bash
export NODE_ENV=test
export ALLOW_DATABASE_SEED=true
export DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test?schema=public'
export PSQL_DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test'
export SHADOW_DATABASE_URL='postgresql://app:app@127.0.0.1:5432/ci_shadow_test?schema=public'
```

Apply and verify the database from repository root:

```bash
pnpm --filter @iranyaragh/api prisma:generate
pnpm --filter @iranyaragh/api exec prisma validate
pnpm --filter @iranyaragh/api exec prisma migrate deploy
pnpm --filter @iranyaragh/api exec prisma migrate status
pnpm --dir apps/api exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/tests/auth_constraints.sql
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/tests/state_transitions.sql
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/tests/money_migration.sql
pnpm --filter @iranyaragh/api prisma:seed
pnpm --filter @iranyaragh/api prisma:seed
psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/tests/seed_baseline.sql
pnpm test:integration
```

The SQL constraint suites wrap fixtures in transactions and roll them back. Their
fixture namespaces do not collide with the deterministic seed, so the suites remain
repeatable before or after seeding. Vitest integration fixtures use a unique run
suffix and delete their own records. For a fully fresh local run, drop and recreate
only the explicitly named `_test` databases; never automate a recursive or wildcard
database deletion.

## CI database gate

The `database` GitHub Actions job uses an ephemeral PostgreSQL 18 service and two
databases: `iraniyaragh_ci_test` and `ci_shadow_test`. It fails when:

- Prisma schema validation or client generation fails;
- a migration cannot deploy from an empty database;
- committed migrations and `schema.prisma` drift;
- a PostgreSQL Auth, lifecycle-state or money-migration invariant accepts invalid
  data;
- either of two consecutive deterministic seed runs fails or their RBAC baseline
  does not match the verified permission/role/grant contract;
- an integration test violates transaction or idempotency expectations.

The initial service-level database coverage proves sequential replay of an inventory
idempotency key creates one movement and proves a failed serializable transaction
rolls back its balance mutation. Concurrent retry behavior remains a separate known
gap and must be covered when bounded serializable retries are implemented.

## Production dependency audit

`.github/workflows/production-audit.yml` runs `node .github/scripts/audit-prod.mjs`
on every PR, protected-branch push and weekly schedule. The script runs
`pnpm audit --prod --audit-level=moderate --json`, classifies the result and:

- **Clean (moderate+ = 0):** passes immediately.
- **Real vulnerabilities (moderate+ ≥ 1):** fails on the first attempt with a
  clear list of affected levels; no retry.
- **Transient network/registry error (non-JSON or operational error code):**
  retries up to 3 times with a 15-second backoff between attempts.
- **Exhaustion (registry still unreachable after 3 attempts):** fails closed
  with an explicit "manual review required" message — never passes silently.

The decision logic is a pure function (`classifyResult(stdout, stderr, exitCode)`)
and was validated against fixture payloads (clean, vulnerability-found,
persistent-network-failure, transient-recovery).

## Adding tests

- Unit test: `*.spec.ts` under `apps/api/src`.
- Database test: `*.integration-spec.ts` under `apps/api/src`; use the isolated
  database guard and unique fixture identifiers.
- Browser test: `*.spec.ts` under `e2e/tests` and assign it to explicit projects.

Tests must assert failure paths and durable state, not only returned values. Critical
Auth, inventory, order and payment changes also need authorization, idempotency and
concurrency coverage when those behaviors are in scope.
