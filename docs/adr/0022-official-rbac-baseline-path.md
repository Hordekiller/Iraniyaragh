# ADR-0022: An Official RBAC Baseline Path for Staging and Production

Status: Accepted — the canonical RBAC baseline gains a first-class, guarded
staging/production path; the development seed keeps its existing guard; staging
demo data becomes a separate, explicitly fenced operation.

Date: 2026-10-02

## Context

The first deploy of the staging host exposed a gap that unit tests could not
have found, because no test exercised the operator path end to end.

`auth:bootstrap` creates the first administrator, and
`bootstrap-admin-core.mjs` requires the `system-admin` role to exist. Nothing in
the deploy path creates that role:

- Forward migrations only *grant* new permissions to an existing `system-admin`.
  `20260925121000_payment_reconciliation_permission/migration.sql` and its
  siblings insert a `Permission` and then `INSERT INTO "RolePermission"` for
  `system-admin`, guarded by `WHERE r.key = 'system-admin'`. A grant to a role
  that does not exist is a no-op, not an error.
- The only thing that ever created the role was `prisma/seed.mjs`.
- `seed-policy.mjs` rejects anything other than `NODE_ENV=development` or `test`,
  so the seed refused staging.
- `deploy.sh` never runs the seed, and `docs/OPERATIONS.md` states that
  "Deployment never runs the development seed."

The deployed database confirmed it: 10 permissions (all from migrations), **0
roles**, 0 users. `auth:bootstrap` would have failed with `The system-admin role
is missing. Run the approved seed first.` — and the only "approved seed" was a
command that could never run there. Every remaining option was unacceptable:

- Relax `seed-policy.mjs` for staging. It also seeds demo catalog rows, so this
  would have made demo data reachable in a real environment.
- Set `NODE_ENV=development` on the host to lie to the guard.
- Run hand-written SQL, which bypasses the reviewed permission registry.

The root cause is a design error rather than a missing line: one command was
carrying two unrelated jobs (canonical system data *and* demo fixtures), so the
environment that needs only the first job had no way to get it.

## Decision

Split provisioning into three explicit paths, each fenced to the environments it
belongs to, and extract the canonical registry into one shared module.

**1. `apps/api/prisma/rbac-baseline.mjs`** — the single source of truth for the
canonical `system-admin` role, its 35 permissions and their grants. It contains no
environment, policy or demo concern, so the seed, the staging/production path, the
demo path and the bootstrap prerequisite check all consume the same definition and
the registry cannot drift between environments. It writes only `Role`,
`Permission`, `RolePermission` and `AuditLog`, and is asserted to touch nothing
else.

**2. `apps/api/prisma/apply-rbac-baseline.mjs`** with
`rbac-baseline-policy.mjs` — the official staging/production path. Guarded by:

- `ALLOW_RBAC_BASELINE=true`; no implicit authorization.
- `NODE_ENV` allowlisted to exactly `staging` or `production`, so a typo fails
  closed instead of falling through.
- `NODE_ENV=production` additionally requires
  `RBAC_BASELINE_CONFIRM_PRODUCTION=apply-canonical-rbac-baseline`.
- The target database must not end in `_test` or `_dev`, so a misrouted
  `DATABASE_URL` cannot overwrite CI or scratch state.
- An explicit `--check` or `--apply`; no bare invocation can write, and the two are
  mutually exclusive. `--check` is read-only and exits non-zero on drift, which
  makes it usable as a deploy gate.

Reconcile is **additive and idempotent**: create what is missing, reactivate a
deactivated canonical permission, restore a revoked canonical grant, repair a
drifted name or description. It never deletes a non-canonical grant, because an
extra grant on `system-admin` is a deliberate operator decision and silently
removing it would be a privilege change nobody asked for. `--check` reports such
grants and leaves them in place.

Each run appends one immutable `rbac.baseline.apply` audit row with `actorId`
null, because a fixed-id upsert — what the seed uses for CI determinism — would
overwrite the previous run's audit trail.

**3. `apps/api/prisma/seed-demo-staging.mjs`** with
`demo-staging-policy.mjs` — staging-only demo data. It rejects `production`,
`development` and `test` (notably `test`, so demo rows cannot pollute the
deterministic CI database) and requires `ALLOW_DEMO_STAGING_DATA=true`. It applies
the canonical baseline first, then the demo fixtures.

The demo fixtures stop at catalog, pricing, warehouse, location and opening
inventory. They create **no** order, no payment, no payment confirmation and no SMS
delivery success. This is a deliberate limit: with
`PAYMENT_PROVIDER_MODE=disabled` the platform already refuses every payment call
explicitly, and a fabricated success row would contradict that — it would poison
reconciliation and let a reviewer mistake demo state for a real captured
transaction. An honest refusal is more useful than a convincing fake.

**`auth:bootstrap` becomes a formal consumer.** It performs a read-only
`assertSystemAdminRolePresent` check *before* it prompts for an email, password or
TOTP code, and the error names the exact `--apply` command. Previously it failed at
commit time, which meant an operator could type a password into a run that was
never going to succeed.

## Consequences

- A fresh staging or production database is now reachable: `rbac:baseline
  -- --apply`, verify with `--check`, then `auth:bootstrap`. This is documented in
  `infrastructure/docker/RUNBOOK.md` and `docs/OPERATIONS.md`.
- `seed-policy.mjs` is untouched, and both new guards are proven never to read
  `ALLOW_DATABASE_SEED` or import `seed-policy.mjs`. Neither new path can reach the
  development seed.
- `seed.mjs` keeps its behaviour and its deterministic audit row, so the existing
  two-consecutive-runs CI check is unaffected.
- The role id is no longer a `seed_`-prefixed literal. Nothing depended on it
  (the pgTAP check resolves the role by `key`), and a `seed_`-prefixed id in a
  production database would be misleading during an incident.
- Cost: one more operator step between `migrate` and first sign-in. It is
  unavoidable — an administrator cannot be created automatically — and the
  `--check` gate makes the resulting state checkable rather than assumed.

## Alternatives rejected

- **Relax `seed-policy.mjs` for staging.** Rejected: it would also unblock demo
  catalog rows in an environment that must not have them.
- **A forward migration that creates the role.** Rejected: the permission registry
  is a code-level concern that already has a reviewer-facing definition and a
  dev/test test. Baking 35 permission definitions into an immutable migration would
  fork the registry and make the next permission addition require a migration.
- **Hand-written operator SQL.** Rejected: unreviewed, unaudited, and outside the
  permission registry.
- **Auto-applying the baseline in `deploy.sh`.** Deferred, not rejected. It is
  defensible given the path is additive and idempotent, but it moves a privileged
  write into every deploy and would have made the first deploy of this change fail
  on its own gate. Worth revisiting once the runbook step is proven in practice.