# ADR-0015: Deploying the catalog SKU ASCII invariant

- Status: Accepted
- Date: 2026-09-14
- Scope: `ProductVariant.sku` and `ProductVariant.skuKey`

## Context

The catalog import contract requires SKU values and their canonical keys to be
ASCII-only. The forward migration adds database `CHECK` constraints so that the
invariant cannot be bypassed by a writer outside the API. Existing data has
already been checked by the import preflight and must remain unchanged.

Adding a validated constraint to an existing table can scan the table and hold a
strong lock. Treating this as an ordinary zero-downtime metadata change would
create an avoidable deployment risk.

## Decision

Run this migration in the catalog deployment window, with the following guards:

1. Run the preflight query from the migration and stop if any non-ASCII value is
   found. Do not rewrite existing SKUs as part of deployment.
2. Set a bounded `lock_timeout` and `statement_timeout` for the migration
   session. If either timeout is reached, abort and retry in the next window;
   never leave a partially applied invariant.
3. Apply both constraints in one transaction and verify their presence in
   `pg_constraint` before releasing the deployment.
4. Run the catalog import smoke test and the API health check after migration.

We deliberately do not use `NOT VALID` as a permanent state: an unvalidated
constraint would leave the database invariant weaker than the API contract.
If production scale requires a staged rollout later, it must be a separate ADR
with an explicit backfill/validation step before enforcement.

## Consequences

The migration has a bounded operational window and a clear abort path. It may
need a retry when catalog traffic holds the table lock, but it cannot silently
ship a partially enforced SKU invariant.
