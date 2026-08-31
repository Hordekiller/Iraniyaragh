type TestDatabaseEnvironment = {
  databaseUrl?: string;
  nodeEnvironment?: string;
};

export function assertIsolatedTestDatabase({
  databaseUrl,
  nodeEnvironment,
}: TestDatabaseEnvironment) {
  if (nodeEnvironment !== 'test') {
    throw new Error('Database integration tests require NODE_ENV=test.');
  }

  if (!databaseUrl) {
    throw new Error('Database integration tests require DATABASE_URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Integration DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      'Integration DATABASE_URL must use postgres:// or postgresql://.',
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || !databaseName.endsWith('_test')) {
    throw new Error(
      'Refusing database integration tests: database name must end with _test.',
    );
  }

  return { databaseName, databaseUrl } as const;
}
