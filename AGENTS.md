# Repository Instructions for Coding Agents

These rules apply to all automated coding agents working in this repository.

## Read first

Before business-critical changes, read:

- `docs/FOUNDATION.md`
- `docs/PROJECT_STATUS.md`
- `docs/DEVELOPMENT_PLAN.md`
- the relevant domain/security/API document

Treat documented invariants as requirements. If code and docs disagree, report and
resolve the discrepancy; do not silently choose one.

## Work boundaries

- Work from one scoped issue/goal and preserve unrelated user changes.
- Do not introduce microservices, a new framework, or broad dependency changes
  without an accepted ADR.
- Keep business logic out of controllers and UI components.
- Never expose Prisma models as public API contracts.
- Never bypass inventory ledger, order/payment state machines, permission checks,
  audit requirements or idempotency rules for convenience.
- Do not generate or commit secrets, real personal data or production dumps.

## Coordination for two contributors

- Before editing shared hotspots (`schema.prisma`, root configs, shared contracts,
  navigation), check the active issue/branch ownership and communicate the change.
- Prefer a contract PR before parallel API/UI implementation.
- Do not edit already-shared migrations; add a forward migration.
- Keep changes small enough for the other contributor to review reliably.

## Verification

Run the narrowest relevant checks during development and the full affected package
checks before completion. Critical inventory/order/payment/auth changes require
failure-path, authorization, idempotency and concurrency coverage as applicable.

CI (GitHub Actions) runs the same commands below with `CI=true`, which also enables
Vitest coverage gates (imported-code baselines; thresholds live in each package's
`vitest.config.ts`). Keep local runs fast: run without `CI=true` for plain unit
tests, and use `CI=true` exactly like the pipeline when you need the coverage gate.

```bash
# All packages: lint + typecheck + build (mirrors the CI "quality" job;
# CI also runs `pnpm test` in the same job)
pnpm lint
pnpm typecheck
pnpm build

# Per-package unit tests (run inside the CI "quality" job)
pnpm --filter @iranyaragh/api test
pnpm --filter @iranyaragh/web test
pnpm --filter @iranyaragh/admin test

# API integration tests (mirror the CI "database" job; REQUIRES the test
# Postgres — see below)
pnpm --filter @iranyaragh/api test:integration

# CI-equivalent: enforce coverage thresholds within a single package
CI=true pnpm --filter @iranyaragh/web test

# Agents: run the narrowest package test for the package you touched first,
# then the full affected package checks before finishing.
```

Locally, the API integration tests need the test database and matching env:
`NODE_ENV=test` and a `DATABASE_URL` ending in `_test`. Bring up Postgres with:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
```

Note: `infrastructure/docker/docker-compose.override.yml` is a git-ignored
LOCAL-ONLY override on this machine that remaps Postgres to host `55432` and Redis
to `56379`; on a fresh clone only the base `docker-compose.yml` exists. Point your
`DATABASE_URL`/`REDIS_URL` at whichever host ports your local environment actually
publishes (see `TESTING.md`).

Update docs and `docs/PROJECT_STATUS.md` when actual capabilities or known gaps
change. State clearly what was verified and what could not be verified.
