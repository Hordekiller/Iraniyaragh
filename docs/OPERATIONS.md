# Operations, Reliability & Delivery

Current read-only runtime/version/migration/health evidence and unresolved release
gates: [V1 reconciliation](V1_RECONCILIATION.md). This runbook is not proof that
a fresh backup/restore, alert or provider acceptance has been performed.

## Verified release checkpoint — 2026-10-18

Source/selected/running SHA: `e2070948587b438dc5da55d8560ab870e23bf32d`. Official image publication
[39084793958](https://github.com/Hordekiller/Iraniyaragh/actions/runs/39084793958)
and authorized deployment succeeded. API/Admin/Web are healthy; media-worker uses
that API image and is running (no invented worker healthcheck). Nginx configuration,
TLS, homepage, Admin and readiness passed. 61 completed migrations / zero unfinished.
Exact index digests and acceptance limits are in V1_RECONCILIATION.md.

The release backup was restored into an isolated scratch PostgreSQL database
(98 tables, 61 migrations), then that scratch database was removed. Media backup
checksums matched 311 objects / 14,652,179 bytes; checksum validation is not a fresh
bucket restore. This past restore does not waive fresh backup/restore gates for
future releases. Existing backups/history were preserved; no VPS build/source copy.

Private SMS mode is smsir and payment mode live; configuration fingerprint excluding
IMAGE_TAG was unchanged by this source rollout. Do not dump environment, cookies,
provider bodies, credentials or customer rows when collecting diagnostics. This
checkpoint adds no provider sends or financial mutations. Clam process health does
not establish signature freshness (#393). APP_VERSION binding and production test
artifact exclusion remain separate unmerged #440/#446 work. Monitoring/alert and
rollback acceptance must be verified rather than inferred from green readiness.

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
explicit `API_PORT`. Auth requires an exact `AUTH_JWT_ISSUER`, a minimum 32-byte
`JWT_ACCESS_SECRET`, a distinct minimum 32-byte `AUTH_HASH_SECRET` with a positive
`AUTH_HASH_KEY_VERSION`, and a minimum 32-byte `AUTH_TOTP_ENCRYPTION_KEY` in staging
and production. Surrounding whitespace is rejected rather than silently
changing key material. Staging/production reject known placeholder values.

Payment browser returns require `STOREFRONT_ORIGIN` in staging and production.
It must be the HTTPS origin of the customer Web app, without a path, query,
fragment or credentials; development/test default to `http://localhost:5173`.
Configure `ZARINPAL_CALLBACK_URL` to the public API callback route. After the
server verifies the gateway result, browser requests receive a 303 to the
storefront result route; JSON callers retain the verification envelope. The
redirect omits gateway parameters and is sent with `Cache-Control: no-store`
and `Referrer-Policy: no-referrer`.

Hash-key rotation is bounded to two keys: deploy the new current version/secret and
temporarily retain the old pair as `AUTH_HASH_PREVIOUS_KEY_VERSION` and
`AUTH_HASH_PREVIOUS_SECRET`. New hashes use only the current key; lookup/verification
accepts both versions until active records are rotated or expire. Never reuse a key
version with different material, and remove the previous key only after verifying no
live record depends on it. JWT signing and Auth hashing secrets must remain distinct.

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
- `.github/workflows/production-audit.yml` rejects moderate-or-higher known
  vulnerabilities across the complete production lockfile on every pull request,
  protected-branch push, manual run and a weekly schedule. This catches advisories
  published after the dependency originally entered the repository. It runs the
  surgical `audit-prod.mjs` script: real vulnerabilities fail immediately;
  unavailable or incomplete reports are retried up to 3 times. Exhaustion exits
  2 and blocks CI: unavailable evidence is not a clean security result. Every PR,
  including documentation changes, runs this gate. Each process is bounded to
  60 seconds and 8 MiB combined output; raw registry/process output is not logged.
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

Run `pnpm audit --prod --audit-level=moderate` locally during dependency triage too,
or use `node .github/scripts/audit-prod.mjs` for the same classification used in CI;
a green Dependency Review only evaluates a PR delta and is not proof that the existing
tree has no newly published advisory. The scheduled production-audit workflow is the
continuous baseline check, but local evidence is still required before review. The
admin runtime is pinned to Next.js `16.3.8`. It was raised from `16.3.3` to clear
critical advisory GHSA-vcvr-r3jv-pc5j (remote code execution in `next/og`
`ImageResponse`, affecting `>=16.2.0 <16.3.6`); the pin is the patched line, so
re-check it whenever a new advisory is published rather than assuming the tree is
clean. `16.3.8` also brings patched PostCSS/Sharp versions. Prisma 6.19.3 still pins vulnerable
`deepmerge-ts` 7.x through `@prisma/config`, so `pnpm-workspace.yaml` contains one
narrow override to 8.0.2. Do not broaden or remove it until the production audit,
Prisma generate/validate, clean migration+drift, SQL constraints and integration
tests all pass with the replacement.

The smoke suite enforces a **zero-external-asset gate**: any HTTP(S) request
from `web` or `admin` to an origin other than the app itself fails the run. The
storefront self-hosts its Vazirmatn variable font for this reason.

Production deployments should be reproducible and Docker-based.

## Commerce outbox activation gate

`OutboxEvent` is the durable transactional record. When the separately deployed
`worker:media` process is running, it schedules the
relay in bounded batches with PostgreSQL `SKIP LOCKED`, a 60-second claim lease,
ID-only BullMQ jobs and bounded queue retry/dead-letter state. `publishedAt` means
**accepted by the queue**, not delivered to a customer. The topic-aware consumer
records one `OutboxEffect` per known event and `consumedAt` in one transaction.
Effect status `PENDING` explicitly means an operational/customer action still
needs a sender or staff workflow. No SMS, shipment or customer-visible delivery
is implied by outbox consumption.

Queue jobs retry eight times with exponential backoff. Completed and failed job
retention is bounded to 1,000 each; database `deadLetteredAt` and
`processingDeadLetteredAt` remain durable. A failed job stores only a fixed
sanitized reason, so the actionable error class stays in
`lastProcessingErrorCode`. Operators must monitor both counts, stranded events
and pending effect age, and alert on any dead letter or growing backlog:

```sql
SELECT count(*) FROM "OutboxEvent" WHERE "publishedAt" IS NULL AND "deadLetteredAt" IS NULL;
SELECT count(*) FROM "OutboxEvent" WHERE "deadLetteredAt" IS NOT NULL OR "processingDeadLetteredAt" IS NOT NULL;
SELECT count(*) FROM "OutboxEvent" WHERE "publishedAt" IS NOT NULL AND "consumedAt" IS NULL;
SELECT kind, count(*) FROM "OutboxEffect" WHERE status = 'PENDING' GROUP BY kind;
```

A `PAYMENT_VERIFICATION_FAILED` event is emitted whenever an ambiguous payment
deterministically resolves as not paid, so a `PAYMENT_RECONCILIATION` effect can
never stay open for a payment that is no longer pending.

Replay only an investigated event that is either dead-lettered or stranded.
Build the API first, then from a privileged operations shell set
`ALLOW_OUTBOX_REPLAY=true`, `OUTBOX_REPLAY_ACTOR_ID` to an active user holding
`settings.manage`, `OUTBOX_REPLAY_TICKET` to a non-sensitive incident ID, plus
`DATABASE_URL` and `REDIS_URL`, then run
`pnpm --filter @iranyaragh/api outbox:replay <event-id>`. The command refuses a
consumed event, an event that is neither dead-lettered nor stranded, and any
queued or active job; it removes a terminal retained job, resets durable relay
state and writes its acceptance audit in the same transaction. Every refusal is
also audited with its reason and a non-zero exit code. The relay picks up the
reset row. This is a deliberate break-glass database-level tool rather than a
request-scoped one, so it has no session MFA step; never replay a consumed event
or execute against an unverified environment.

Before sales, verify the complete chain on staging: database event → queue →
consumer → effect → sender/provider outcome or staff resolution, including unknown
provider results, dead-letter alerting and replay. The current projection alone
does not satisfy that gate.

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
- `20260901043500_auth_mfa_persistence` is the forward Auth prerequisite for runtime
  sessions and privileged MFA. It adds required authentication evidence to `Session`
  plus hashed one-time challenges/recovery codes and encrypted/versioned TOTP
  credential storage. It deliberately aborts before DDL if `Session` contains rows:
  stop and investigate/revoke that unmanaged pre-runtime data rather than inventing
  an authentication level or timestamp. Exercise deploy, status, drift and
  `auth_constraints.sql` on an isolated copy before release.
- Never edit an already-shared migration. Preserve custom Auth `CHECK` constraints
  and add a forward migration for every later schema change.

Deployment applies committed migrations without generating, resetting or seeding
the database:

```bash
pnpm --filter @iranyaragh/api prisma:deploy
```

Run this command from an automated release phase with environment-managed
credentials; do not copy a production `DATABASE_URL` into a developer shell.

### Development/test seed

The deterministic seed is deliberately separate from deployment. It creates the
35 canonical permission definitions, a `system-admin` role, its active grants and
one safe bootstrap audit marker. It never creates a user, password, session, OTP,
customer or other PII-bearing fixture. A privileged user must later be created by a
separate authenticated bootstrap workflow; default admin credentials are forbidden.

Seeding requires `ALLOW_DATABASE_SEED=true` plus either:

- `NODE_ENV=test` and a database name ending in `_test`; or
- `NODE_ENV=development` and an approved local PostgreSQL host/database.

Staging, production and remote development targets are rejected before Prisma
connects. For an explicitly selected local development database:

```bash
ALLOW_DATABASE_SEED=true NODE_ENV=development \
  pnpm --filter @iranyaragh/api prisma:seed
```

The seed is transactional and convergent: rerunning it updates/reactivates only the
seed-owned RBAC baseline and creates no duplicate permissions, roles or grants. It
does not delete unrelated operator data. CI migrates a fresh PostgreSQL database,
runs the seed twice and verifies the durable result with
`apps/api/prisma/tests/seed_baseline.sql`.

The `payments.reconcile` permission is also registered by forward migration
`20260925121000_payment_reconciliation_permission` in every environment. An
existing system-admin role receives the grant; other staff roles require an
explicit, audited operator grant. Deployment never runs the development seed.

### Three provisioning paths, not one seed

The single development seed cannot reach staging or production by design, and
that left a real gap: **migrations grant permissions to an existing `system-admin`
but never create one, so a fresh staging/production database had zero roles and
`auth:bootstrap` could never succeed.** There are now three explicit paths, and
only the right one applies in a given environment:

| Path | Command | Environment | Creates |
| --- | --- | --- | --- |
| Development/test seed | `prisma:seed` | `NODE_ENV=development` or `test`, guarded by `seed-policy.mjs` | RBAC baseline + demo catalog |
| Canonical RBAC baseline | `rbac:baseline -- --apply` / `--check` | `NODE_ENV=staging` or `production` | RBAC baseline only |
| Staging demo data | `demo:staging -- --confirm` | `NODE_ENV=staging` only | RBAC baseline + demo catalog |

The canonical registry itself now lives in one place, `prisma/rbac-baseline.mjs`,
and all three paths consume it, so the permission set cannot drift between
environments. `seed-policy.mjs` is unchanged.

The RBAC baseline path is guarded by `rbac-baseline-policy.mjs`, which requires
`ALLOW_RBAC_BASELINE=true`, allowlists `NODE_ENV` to `staging`/`production` (a
typo such as `stagign` fails closed rather than falling through), requires a
second `RBAC_BASELINE_CONFIRM_PRODUCTION` acknowledgement for production, and
refuses a `_test` or `_dev` database so a misrouted `DATABASE_URL` cannot touch
CI or scratch state. It requires an explicit `--check` or `--apply` so no bare
invocation can write.

Reconcile semantics are additive and idempotent: create what is missing,
reactivate a deactivated canonical permission, restore a revoked canonical grant,
repair a drifted name or description. It never deletes a non-canonical grant,
because an extra grant is a deliberate operator decision rather than drift. The
staging/production path appends one immutable `rbac.baseline.apply` audit row per
run with `actorId` null; the development seed keeps its deterministic audit row so
the two-consecutive-runs CI check still holds.

Both provisioning paths create no user and no credential. `auth:bootstrap` now
performs a read-only `assertSystemAdminRolePresent` check **before** it prompts
for an email, password or TOTP code, so a missing role fails with the exact
remediation command instead of stranding a half-entered secret in a terminal.

Demo data is fenced separately by `demo-staging-policy.mjs`, which rejects
anything other than `NODE_ENV=staging` (including `test`, so CI stays clean) and
requires `ALLOW_DEMO_STAGING_DATA=true`. Demo fixtures stop at catalog, pricing,
warehouse, location and opening inventory: no order, no payment, no payment
confirmation, no SMS delivery success. A fabricated success row would poison
reconciliation and let a reviewer mistake demo state for a real captured
transaction.

CI runs the development seed twice and verifies it with
`apps/api/prisma/tests/seed_baseline.sql`, separately asserts that the RBAC path
*refuses* a disposable database, and proves reconcile idempotency and drift
repair against a real database via
`apps/api/prisma/rbac-baseline.integration.test.mjs` (`RBAC_BASELINE_INTEGRATION=true`).

For Auth persistence changes, verify on a clean PostgreSQL database:

```bash
export NODE_ENV=test
export DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test?schema=public'
export PSQL_DATABASE_URL='postgresql://app:app@127.0.0.1:5432/iraniyaragh_test'
pnpm --filter @iranyaragh/api exec prisma validate
pnpm --filter @iranyaragh/api exec prisma migrate deploy
psql "$PSQL_DATABASE_URL" -f apps/api/prisma/tests/auth_constraints.sql
pnpm --filter @iranyaragh/api run prisma:generate
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

The SMS provider's security boundary, Sandbox gate, production activation,
diagnostics, failure handling and rollback procedure are defined in
[`SMS_PROVIDER_OPERATIONS.md`](./SMS_PROVIDER_OPERATIONS.md).

## Feature flags

Use feature flags for risky or staged product launches where appropriate. Flags must not become a permanent substitute for deleting obsolete code.

## Search and AI discovery operations

The crawler, dynamic-sitemap, structured-data, commerce-feed and AI-answer operating
contract is defined in [`SEO_GEO_AI_DISCOVERY_PLAN.md`](./SEO_GEO_AI_DISCOVERY_PLAN.md).
After the canonical production domain exists, configure the repository variable
`PRODUCTION_WEB_ORIGIN` as an HTTPS origin without a path. The scheduled
`Discovery Audit` workflow then records a sanitized daily verification artifact.
Until that variable exists, the workflow reports that production auditing is
inactive and does not claim discovery readiness.

## Infrastructure principle

Start cost-efficiently on Iranian VPS/cloud, but keep the application provider-portable:

- Containers
- Externalized configuration
- Independent backups
- S3-compatible storage
- No provider-specific business logic

## Reservation expiry batching — #81 / #450

The 2026-10-16 candidate changes `InventoryService.expireReservations`; it does
**not** activate an expiry worker. Deployment and operational acceptance remain
separate. #450 tracks the order/payment-aware scheduler and expired-payment UX.
Never schedule inventory-only expiry as a substitute for the authoritative order
command: an unresolved gateway attempt must be reconciled before releasing stock.

One invocation selects at most 100 candidates, ordered by expiry and ID. Inside
one serializable transaction it acquires the existing balance advisory locks in
sorted key order, rereads active/due candidates, groups balance changes, performs
one terminal update and inserts one audit fact per reservation in a batch. Each
balance version advances by the number of finalized reservations, preserving the
previous version semantics and per-reservation before/after audit snapshots.
On-hand stock and physical movement history are unchanged by expiry.

Actual Prisma query events against isolated PostgreSQL, including three
transaction-control statements, measured:

| Reservations | Distinct balances | Before | Candidate |
| --- | --- | --- | --- |
| 1 | 1 | 11 | 10 |
| 10 | 1 | 74 | 10 |
| 100 | 1 | 704 | 10 |
| 10 | 10 | 74 | 28 |
| 100 | 100 | 704 | 208 |

For an uncontended full batch, the former count is `4 + 7N`; the candidate is
`8 + 2G`, where `G` is the number of distinct balance keys. Keeping one lock and
one update per balance preserves coordination with existing stock commands.
These are statement counts, not latency promises. Concurrent retries add work.
`inventory-expiry.integration-spec.ts` verifies the query ceiling, quantities,
individual audits, duplicate execution, two workers, a competing consumption
command, page boundaries and transaction rollback after inconsistency/audit failure.

Serialization/deadlock aborts retry the entire transaction at most three times,
using the existing bounded backoff. Genuine inconsistencies and audit failures
propagate; no partial batch is committed or reported as successful. A future
runner must record attempted/finalized counts, duration, retry/exhaustion and
inconsistency failures without customer data. It must alert on a poison batch;
silently skipping it or retrying indefinitely is not an accepted recovery policy.
Do not repair balances with direct SQL or reset order/payment state. Investigate
the request ID and use approved domain commands for reconciliation. On failure,
disable the future scheduler and retain reservations/evidence for investigation.
No scheduler flag or runtime activation is introduced by this candidate.
