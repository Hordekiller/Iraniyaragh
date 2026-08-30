/**
 * Money (Rial) helpers.
 *
 * ADR-0003 / FOUNDATION: money is an integer-safe representation stored in the
 * database as 64-bit integer (`BigInt` / int8). Rial is a zero-decimal currency,
 * so the stored value IS the Rial amount (scale 0); no multiplier is applied.
 *
 * Prisma returns these columns as JS `bigint`. At the API boundary we surface a
 * plain JSON number (safe up to Number.MAX_SAFE_INTEGER ~ 9e15). Any value beyond
 * the safe-integer range is rejected rather than silently corrupted.
 */
export function toRialNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(n)) {
    throw new Error('Money value exceeds safe-integer range (int > Number.MAX_SAFE_INTEGER).');
  }
  return n;
}

export function toRialBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Money input must be a safe integer (number of Rial).');
  }
  if (value < 0) {
    throw new Error('Money input must be non-negative.');
  }
  return BigInt(value);
}

/** Sum of a list of Rial bigints. */
export function sumRial(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}
