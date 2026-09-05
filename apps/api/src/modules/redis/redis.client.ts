export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Narrow command surface the Auth runtime depends on. Injecting this interface
 * (backed by `ioredis` in production) keeps rate limiting deterministic and
 * unit-testable without a live Redis, and keeps the limiter's dependency set small.
 */
export interface RedisClient {
  status: string;
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<'OK'>;
}
