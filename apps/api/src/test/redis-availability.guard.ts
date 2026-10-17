/** Optional local probes must not silently skip explicitly configured/CI gates. */
export function assertIntegrationRedisAvailable(available: boolean): void {
  if (!available && (process.env.CI === 'true' || Boolean(process.env.REDIS_URL))) {
    // Never include connection URLs, credentials or upstream error bodies.
    throw new Error('Required integration Redis is unavailable; refusing to skip security tests.');
  }
}
