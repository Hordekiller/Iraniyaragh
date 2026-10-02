// Explicit staging-only guard for the demo data path.
//
// Demo rows are convenience data for a staging demo, never a system
// requirement. They are therefore fenced to exactly one environment:
//   1. ALLOW_DEMO_STAGING_DATA=true must be set.
//   2. NODE_ENV must be exactly "staging". Production, development and test are
//      all rejected -- notably test, because demo rows would pollute the
//      deterministic CI database.
//   3. The target database must not be a disposable _test/_dev database.
//
// This guard does not use, relax or depend on `seed-policy.mjs`.

import { assertNotDisposableDatabase, parsePostgresTarget } from "./postgres-target.mjs";

const DEMO_ENVIRONMENT = "staging";

export function assertDemoStagingEnvironment(environment) {
  if (environment.ALLOW_DEMO_STAGING_DATA !== "true") {
    throw new Error(
      "Seeding demo staging data requires ALLOW_DEMO_STAGING_DATA=true.",
    );
  }

  const nodeEnvironment = environment.NODE_ENV;
  if (nodeEnvironment !== DEMO_ENVIRONMENT) {
    throw new Error(
      "Demo staging data is allowed only when NODE_ENV=staging. " +
        "This path never runs in production, development or test.",
    );
  }

  const target = parsePostgresTarget(
    environment.DATABASE_URL,
    "The demo staging data path",
  );
  assertNotDisposableDatabase(target.databaseName, "The demo staging data path");

  return {
    databaseName: target.databaseName,
    hostname: target.hostname,
    nodeEnvironment,
  };
}
