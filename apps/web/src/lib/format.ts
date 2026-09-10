import { RIALS_PER_TOMAN } from './money'

/**
 * Persian presentation formatting for the storefront.
 *
 * Pure, dependency-free helpers: Western -> Persian digits, thousand grouping,
 * and Gregorian -> Solar Hijri (Jalali) date conversion. Kept out of components
 * (AGENTS.md) and unit-tested in isolation.
 *
 * The Jalali conversion is a faithful reimplementation of the canonical
 * 33-year-leap-cycle algorithm (with the well-known leap-year "breaks" table)
 * popularized by the MIT-licensed `jalaali-js` package, reimplemented here to
 * avoid a runtime dependency. Output vectors match the reference implementation.
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

const JALALI_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
]

/** Integer division (truncates toward zero, matching JS `~~` semantics). */
function div(a: number, b: number): number {
  return Math.trunc(a / b)
}

/** Modulo with the sign of the dividend (matching `jalaali-js` semantics). */
function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b
}

/** Days in the 33-year leap-cycle "breaks" table (Solar Hijri calendar). */
const JALALI_BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
]

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = JALALI_BREAKS.length
  const gy = jy + 621
  let leapJ = -14
  let jp = JALALI_BREAKS[0]
  let jump = 0

  for (let i = 1; i < bl; i += 1) {
    const jm = JALALI_BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  const leap = mod(mod(n + 1, 33) - 1, 4)
  return { leap: leap === -1 ? 4 : leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return [gy, gm, gd]
}

/** Julian Day Number to Jalaali (Solar Hijri) date. */
function d2j(jdn: number): [number, number, number] {
  const gy = d2g(jdn)[0]
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31)
      const jd = mod(k, 31) + 1
      return [jy, jm, jd]
    }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  const jm = 7 + div(k, 30)
  const jd = mod(k, 30) + 1
  return [jy, jm, jd]
}

export type JalaliDate = { year: number; month: number; day: number }

/**
 * Convert a Gregorian calendar date to a Solar Hijri (Jalali) date.
 * @param year Gregorian year (e.g. 2026)
 * @param month Gregorian month, 1-based (January = 1)
 * @param day Gregorian day, 1-based
 */
export function gregorianToJalali(year: number, month: number, day: number): JalaliDate {
  if (month < 1 || month > 12) throw new Error('gregorianToJalali: invalid month.')
  if (day < 1 || day > 31) throw new Error('gregorianToJalali: invalid day.')
  const [gy, gm, gd] = d2j(g2d(year, month, day))
  return { year: gy, month: gm, day: gd }
}

/** Month index (1-based) for a given Jalali date. */
export function jalaliMonthLength(jy: number, jm: number): number {
  const y = jalCal(jy)
  if (jm < 1 || jm > 12) throw new Error('jalaliMonthLength: invalid month.')
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return y.leap === 0 ? 29 : 30
}

/** Convert Western (0-9) digits to Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, d => PERSIAN_DIGITS[Number(d)])
}

/** Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Western (0-9) digits. */
export function toLatinDigits(input: string | number): string {
  const persian = String(input).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  return persian.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/** Group an integer's digits with the Persian thousands separator (٬). */
export function groupThousands(input: string | number): string {
  const s = String(input)
  const negative = s.startsWith('-')
  const digits = negative ? s.slice(1) : s
  if (!/^\d+$/.test(digits)) return String(input)
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '٬')
  return (negative ? '-' : '') + grouped
}

/** Group a number and render it with Persian digits. */
export function formatPersianNumber(input: string | number): string {
  return toPersianDigits(groupThousands(input))
}

/** Format an unsigned Rial amount with Persian digits (no suffix). */
export function formatRial(input: string | number): string {
  return formatPersianNumber(input)
}

/** Format a Rial amount as Toman with Persian digits and a "تومان" suffix. */
export function formatToman(input: string | number): string {
  const value = Number(input)
  if (!Number.isSafeInteger(value) || value < 0) {
    return toPersianDigits(String(input))
  }
  const toman = Math.trunc(value / RIALS_PER_TOMAN)
  return `${formatPersianNumber(toman)} تومان`
}

/** Current date formatted as Persian text, e.g. «چهارشنبه ۱۸ شهریور ۱۴۰۵». */
export function formatJalaliFull(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return ''
  const j = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
  const weekday = JALALI_WEEKDAYS[(date.getDay() + 1) % 7]
  return `${weekday} ${toPersianDigits(j.day)} ${JALALI_MONTHS[j.month - 1]} ${toPersianDigits(j.year)}`
}

/** Date formatted as Compact Jalali, e.g. «۱۴۰۵/۰۶/۱۸». */
export function formatJalaliSlash(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return ''
  const j = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
  const mm = String(j.month).padStart(2, '0')
  const dd = String(j.day).padStart(2, '0')
  return `${toPersianDigits(j.year)}/${toPersianDigits(mm)}/${toPersianDigits(dd)}`
}

/** Format a timestamp (ISO string or Date) in Compact Jalali form. */
export function formatTimestamp(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return formatJalaliSlash(new Date(Number(value.year), Number(value.month) - 1, Number(value.day)))
}
