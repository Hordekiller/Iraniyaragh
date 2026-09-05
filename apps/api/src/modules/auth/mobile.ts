export type NormalizedMobile = Readonly<{ value: string }>;

/**
 * Accepts the full compact Iranian form, which must match one of:
 *   - `09123456789`
 *   - `+989123456789`
 *   - `989123456789`
 * and normalizes to canonical E.164 `+989XXXXXXXXX`. Separators (spaces/dashes)
 * are removed before matching.
 *
 * Returns null when the value is not an accepted Iranian mobile form; the caller
 * must then fail with a generic validation error that does not reveal whether a
 * destination exists.
 */
export function normalizeIranianMobile(raw: string | undefined): NormalizedMobile | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/[\s-]/gu, '');

  if (!/^(?:\+98|98|0)9\d{9}$/u.test(compact)) return null;

  const subscriber = compact.slice(-10); // 9XXXXXXXXX
  return Object.freeze({ value: `+98${subscriber}` });
}
