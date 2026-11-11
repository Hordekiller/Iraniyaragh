import { toLatinDigits } from './format'

/** Idle time after the last keystroke before a valid typed quantity is saved. */
export const QUANTITY_COMMIT_DELAY_MS = 800

/** Longest draft kept while typing; matches the six-digit cart line bound. */
const MAX_DRAFT_DIGITS = 6

/**
 * Normalizes what a shopper typed or pasted into a quantity field.
 *
 * Persian and Arabic-Indic digits become Latin digits; spaces and thousands
 * separators are dropped. Anything else (letters, a minus sign, a decimal
 * point) makes the whole edit invalid, so `-5` or `1.5` is never silently
 * turned into a different number. Returns `null` for an invalid edit.
 */
export function normalizeQuantityDraft(raw: string): string | null {
  const digits = toLatinDigits(raw).replace(/[\s,٬،]/gu, '')
  if (!/^\d*$/u.test(digits)) return null
  return digits.slice(0, MAX_DRAFT_DIGITS)
}

/** Whole-number value of a normalized draft, or `null` while it is empty. */
export function parseQuantityDraft(draft: string): number | null {
  if (!/^\d{1,6}$/u.test(draft)) return null
  return Number(draft)
}
