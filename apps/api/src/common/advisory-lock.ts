import { createHash } from 'node:crypto';

const LOCK_NAMESPACE = 'iranyaragh';

/**
 * Maps a logical resource id (for example `idempotency:${actorId}:${scope}:${keyHash}`
 * or `balance:${warehouseId}:${locationId}:${variantId}`) to a pair of signed 32-bit
 * integers accepted by PostgreSQL's two-argument advisory-lock functions:
 *   pg_advisory_xact_lock(int4, int4)
 *
 * The mapping is stable across processes as long as the namespace prefix stays
 * unchanged. Collisions only make unrelated keys share a lock (extra serialization,
 * never a deadlock because every caller uses exactly one advisory lock per
 * transaction), which is safe for the idempotency and inventory use cases.
 */
export function advisoryLockIdKey(...parts: string[]): [number, number] {
  const digest = createHash('sha256').update(`${LOCK_NAMESPACE}:${parts.join(':')}`, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}