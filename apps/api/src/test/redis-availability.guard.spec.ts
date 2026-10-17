import { afterEach, expect, it, vi } from 'vitest';
import { assertIntegrationRedisAvailable } from './redis-availability.guard';

afterEach(() => { vi.unstubAllEnvs(); });

it('fails a CI security gate when Redis is absent even without an explicit URL', () => {
  vi.stubEnv('CI', 'true');
  vi.stubEnv('REDIS_URL', undefined);
  expect(() => assertIntegrationRedisAvailable(false)).toThrow('refusing to skip security tests');
  expect(() => assertIntegrationRedisAvailable(true)).not.toThrow();
});

it('fails an explicitly configured local gate with a fixed connection-free diagnostic', () => {
  vi.stubEnv('CI', undefined);
  vi.stubEnv('REDIS_URL', 'connection-details-must-not-appear-in-errors');
  expect(() => assertIntegrationRedisAvailable(false)).toThrow(
    new Error('Required integration Redis is unavailable; refusing to skip security tests.'),
  );
});

it('retains an optional unconfigured local probe without counting it as acceptance', () => {
  vi.stubEnv('CI', undefined);
  vi.stubEnv('REDIS_URL', undefined);
  expect(() => assertIntegrationRedisAvailable(false)).not.toThrow();
});
