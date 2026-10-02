// Shared PostgreSQL target parsing for the provisioning policy guards.
//
// `seed-policy.mjs` intentionally keeps its own private copy of this logic so
// the development/test seed guard is left byte-for-byte untouched by the
// staging/production provisioning work. Only the newer guards share this module.

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function parsePostgresTarget(value, subject) {
  if (!value) {
    throw new Error(`${subject} requires DATABASE_URL.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${subject} requires a valid PostgreSQL URL in DATABASE_URL.`);
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error(`${subject} requires a PostgreSQL URL in DATABASE_URL.`);
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error("DATABASE_URL must include one explicit database name.");
  }

  return { databaseName, hostname: url.hostname };
}

export function assertNotDisposableDatabase(databaseName, subject) {
  if (databaseName.endsWith("_test") || databaseName.endsWith("_dev")) {
    throw new Error(
      `${subject} must not target a disposable database (${databaseName}).`,
    );
  }
}
