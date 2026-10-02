// Explicit staging/production guard for the canonical RBAC baseline path.
//
// The development/test seed is deliberately not usable here: `seed-policy.mjs`
// rejects any environment other than development or test, and it also seeds demo
// catalog rows. That left a fresh staging/production database with no roles at
// all, so `auth:bootstrap` could never run. This guard authorises exactly one
// narrow thing -- the canonical Role/Permission/RolePermission baseline -- on
// exactly two environments, and nothing else.
//
// Guard rules, all explicit and all fail-closed:
//   1. ALLOW_RBAC_BASELINE=true must be set. No implicit authorisation.
//   2. NODE_ENV must be exactly "staging" or "production". It is an allowlist,
//      so a typo ("stagign", "prod") fails closed instead of falling through.
//   3. NODE_ENV=production additionally requires
//      RBAC_BASELINE_CONFIRM_PRODUCTION to carry an exact phrase, so the
//      highest-stakes target costs a second deliberate act.
//   4. The target database must not be a disposable _test/_dev database, so a
//      misrouted DATABASE_URL cannot overwrite CI or scratch state.
//   5. ALLOW_DATABASE_SEED is irrelevant here and is never consulted: this path
//      does not use the development seed and does not relax it.

import { assertNotDisposableDatabase, parsePostgresTarget } from "./postgres-target.mjs";

const ALLOWED_ENVIRONMENTS = new Set(["staging", "production"]);
const PRODUCTION_CONFIRMATION = "apply-canonical-rbac-baseline";

export function assertRbacBaselineEnvironment(environment) {
  if (environment.ALLOW_RBAC_BASELINE !== "true") {
    throw new Error(
      "Applying the canonical RBAC baseline requires ALLOW_RBAC_BASELINE=true.",
    );
  }

  const nodeEnvironment = environment.NODE_ENV;
  if (!ALLOWED_ENVIRONMENTS.has(nodeEnvironment)) {
    throw new Error(
      "The canonical RBAC baseline path is allowed only in staging or production. " +
        "Use the development seed (prisma:seed) in development and test.",
    );
  }

  if (nodeEnvironment === "production") {
    if (environment.RBAC_BASELINE_CONFIRM_PRODUCTION !== PRODUCTION_CONFIRMATION) {
      throw new Error(
        "Production requires an explicit second confirmation: " +
          `RBAC_BASELINE_CONFIRM_PRODUCTION=${PRODUCTION_CONFIRMATION}`,
      );
    }
  }

  const target = parsePostgresTarget(
    environment.DATABASE_URL,
    "The canonical RBAC baseline path",
  );
  assertNotDisposableDatabase(
    target.databaseName,
    "The canonical RBAC baseline path",
  );

  return {
    databaseName: target.databaseName,
    hostname: target.hostname,
    nodeEnvironment,
    productionConfirmed:
      nodeEnvironment === "production" &&
      environment.RBAC_BASELINE_CONFIRM_PRODUCTION === PRODUCTION_CONFIRMATION,
  };
}
