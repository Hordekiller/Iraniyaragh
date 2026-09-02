const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOCAL_DEVELOPMENT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "postgres",
]);

function parseDatabaseUrl(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required for database seeding.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error("Database seeding requires a PostgreSQL URL.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error("DATABASE_URL must include one explicit database name.");
  }

  return { databaseName, hostname: url.hostname };
}

export function assertSeedEnvironment(environment) {
  if (environment.ALLOW_DATABASE_SEED !== "true") {
    throw new Error("Database seeding requires ALLOW_DATABASE_SEED=true.");
  }

  const nodeEnvironment = environment.NODE_ENV;
  if (nodeEnvironment !== "development" && nodeEnvironment !== "test") {
    throw new Error("Database seeding is allowed only in development or test.");
  }

  const target = parseDatabaseUrl(environment.DATABASE_URL);

  if (nodeEnvironment === "test") {
    if (!target.databaseName.endsWith("_test")) {
      throw new Error("Test seeding requires a database name ending in _test.");
    }
  } else {
    const isDevelopmentDatabase =
      target.databaseName === "iranyaragh" ||
      target.databaseName.endsWith("_dev");
    if (
      !LOCAL_DEVELOPMENT_HOSTS.has(target.hostname) ||
      !isDevelopmentDatabase
    ) {
      throw new Error(
        "Development seeding requires an approved local database target.",
      );
    }
  }

  return { databaseName: target.databaseName, nodeEnvironment };
}
