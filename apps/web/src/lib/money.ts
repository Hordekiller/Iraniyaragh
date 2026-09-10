import type { Money } from '@iranyaragh/contracts'

/**
 * Contract-aligned money helpers.
 *
 * The contracts package represents money as a string amount in IRR (Rial)
 * `{ amount: string; currency: 'IRR' }`. The storefront UI presents prices in
 * Toman (۱ تومان = ۱۰ ریال), which is the retail convention shown across the
 * existing landing components. Conversion helpers prevent accidental unit
 * errors and keep a single source of truth for the Rial <-> Toman relationship.
 *
 * All functions reject malformed input rather than silently coercing it.
 */

export const RIALS_PER_TOMAN = 10

export function isMoney(value: unknown): value is Money {
  if (!value || typeof value !== 'object') return false
  const m = value as { amount?: unknown; currency?: unknown }
  return (
    typeof m.amount === 'string' &&
    /^\d+$/.test(m.amount) &&
    m.currency === 'IRR'
  )
}

/** Build a contract Money value (amount is Rial). */
export function toMoney(rials: number | string): Money {
  const amount = typeof rials === 'number' ? String(Math.trunc(rials)) : rials
  if (!/^\d+$/.test(amount) || Number(amount) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`toMoney: invalid Rial amount "${amount}".`)
  }
  return { amount, currency: 'IRR' }
}

/** Convert an IRR Rial amount to integer Toman. */
export function rialsToToman(rials: number | string): number {
  const value = typeof rials === 'number' ? rials : Number(rials)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`rialsToToman: invalid Rial amount "${rials}".`)
  }
  return Math.trunc(value / RIALS_PER_TOMAN)
}

/** Parses a contract Money into integer Rial (the stored unit). */
export function moneyToRials(money: Money): number {
  if (!isMoney(money)) {
    throw new Error('moneyToRials: expected a valid IRR Money value.')
  }
  const value = Number(money.amount)
  if (!Number.isSafeInteger(value)) throw new Error('moneyToRials: amount exceeds safe integer range.')
  return value
}

/** Parses a contract Money into integer Toman. */
export function moneyToToman(money: Money): number {
  return rialsToToman(moneyToRials(money))
}

/** Parses a possibly-malformed Money into Toman, returning null instead of throwing. */
export function tryMoneyToToman(money: unknown): number | null {
  if (!isMoney(money)) return null
  return moneyToToman(money)
}
