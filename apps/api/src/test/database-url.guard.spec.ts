import { describe, expect, it } from 'vitest';
import { assertIsolatedTestDatabase } from './database-url.guard';

describe('assertIsolatedTestDatabase', () => {
  it.each([
    'postgresql://app:app@127.0.0.1:5432/iraniyaragh_test?schema=public',
    'postgres://app:app@127.0.0.1:5432/iraniyaragh_ci_test',
  ])('accepts an explicitly named test database: %s', (databaseUrl) => {
    expect(
      assertIsolatedTestDatabase({ databaseUrl, nodeEnvironment: 'test' })
        .databaseName,
    ).toMatch(/_test$/);
  });

  it.each([
    [
      'production environment',
      'postgresql://app:app@localhost/iraniyaragh_test',
      'production',
    ],
    [
      'development database',
      'postgresql://app:app@localhost/iraniyaragh',
      'test',
    ],
    [
      'Postgres maintenance database',
      'postgresql://app:app@localhost/postgres',
      'test',
    ],
    [
      'non-Postgres protocol',
      'mysql://app:app@localhost/iraniyaragh_test',
      'test',
    ],
  ])('rejects %s', (_case, databaseUrl, nodeEnvironment) => {
    expect(() =>
      assertIsolatedTestDatabase({ databaseUrl, nodeEnvironment }),
    ).toThrow();
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      assertIsolatedTestDatabase({ nodeEnvironment: 'test' }),
    ).toThrow('DATABASE_URL');
  });
});
