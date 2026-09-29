/**
 * Single implementation of the Admin PII masking used by every read projection.
 *
 * Order, shipment and customer reads all mask the same shapes. They previously
 * each carried a private copy of these two functions, which meant a change to
 * masking policy in one projection could silently diverge from the others.
 * Keep every masked projection importing from here.
 */

/** Masks a free-text value down to a recognisable first character. */
export function maskText(value: string): string {
  const characters = [...value.trim()];
  return characters.length ? `${characters[0]}***` : '***';
}

/** Masks an identifier while keeping a short prefix/suffix for operator recognition. */
export function maskIdentifier(value: string, prefix: number, suffix: number): string {
  if (value.length <= prefix + suffix) return '*'.repeat(value.length);
  return `${value.slice(0, prefix)}${'*'.repeat(value.length - prefix - suffix)}${value.slice(-suffix)}`;
}

/** Masks an optional value, passing `null`/`undefined` through unchanged. */
export function maskOptional(value: string | null | undefined): string | null {
  return typeof value === 'string' ? maskText(value) : null;
}
