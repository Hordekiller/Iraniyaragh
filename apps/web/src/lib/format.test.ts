import { describe, expect, it } from 'vitest'
import {
  formatJalaliFull,
  formatJalaliSlash,
  formatPersianNumber,
  formatRial,
  formatToman,
  formatTimestamp,
  gregorianToJalali,
  groupThousands,
  jalaliMonthLength,
  toLatinDigits,
  toPersianDigits,
} from './format'

describe('toPersianDigits', () => {
  it('converts Western digits to Persian', () => {
    expect(toPersianDigits('2850000')).toBe('۲۸۵۰۰۰۰')
    expect(toPersianDigits(2026)).toBe('۲۰۲۶')
  })

  it('leaves non-digits untouched', () => {
    expect(toPersianDigits('a1b2')).toBe('a۱b۲')
  })
})

describe('toLatinDigits', () => {
  it('converts Persian and Arabic-Indic digits to Western', () => {
    expect(toLatinDigits('۰۲۱-۸۸۸۸۸۸۸۸')).toBe('021-88888888')
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
  })

  it('leaves Western digits and separators untouched', () => {
    expect(toLatinDigits('021-88888888')).toBe('021-88888888')
  })
})

describe('groupThousands / formatPersianNumber', () => {
  it('inserts a Persian thousands separator', () => {
    expect(groupThousands(2850000)).toBe('2٬850٬000')
  })

  it('formats with Persian digits and separators', () => {
    expect(formatPersianNumber(2850000)).toBe('۲٬۸۵۰٬۰۰۰')
  })

  it('handles small and negative integers', () => {
    expect(formatPersianNumber(5)).toBe('۵')
    expect(groupThousands(-1234)).toBe('-1٬234')
  })
})

describe('Rial / Toman presentation', () => {
  it('formats Rial with Persian digits', () => {
    expect(formatRial(2850000)).toBe('۲٬۸۵۰٬۰۰۰')
  })

  it('formats Toman with a suffix and Persian digits', () => {
    expect(formatToman(2850000)).toBe('۲۸۵٬۰۰۰ تومان')
    expect(formatToman(250000)).toBe('۲۵٬۰۰۰ تومان')
    expect(formatToman(10)).toBe('۱ تومان')
    expect(formatToman(5)).toBe('۰ تومان')
  })

  it('degrades gracefully on invalid input', () => {
    expect(formatToman('abc')).toBe('abc')
    expect(formatToman(-10)).toBe('-۱۰')
  })
})

describe('gregorianToJalali (canonical reference vectors)', () => {
  it('matches the well-known reference dates', () => {
    expect(gregorianToJalali(1981, 8, 17)).toEqual({ year: 1360, month: 5, day: 26 })
    expect(gregorianToJalali(1970, 1, 1)).toEqual({ year: 1348, month: 10, day: 11 })
    expect(gregorianToJalali(2000, 1, 1)).toEqual({ year: 1378, month: 10, day: 11 })
  })

  it('handles the Nowruz boundary', () => {
    // Nowruz (new year) falls around 20-21 March.
    expect(gregorianToJalali(2013, 3, 20)).toEqual({ year: 1391, month: 12, day: 30 })
    expect(gregorianToJalali(2013, 3, 21)).toEqual({ year: 1392, month: 1, day: 1 })
  })

  it('converts the 1405 ascent correctly', () => {
    expect(gregorianToJalali(2021, 3, 21)).toEqual({ year: 1400, month: 1, day: 1 })
    expect(gregorianToJalali(2026, 9, 9)).toEqual({ year: 1405, month: 6, day: 18 })
  })

  it('rejects invalid month input', () => {
    expect(() => gregorianToJalali(2026, 13, 1)).toThrow()
  })
})

describe('jalaliMonthLength', () => {
  it('returns 31 for the first six months and 30 for the next five', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31)
    expect(jalaliMonthLength(1405, 6)).toBe(31)
    expect(jalaliMonthLength(1405, 7)).toBe(30)
    expect(jalaliMonthLength(1405, 11)).toBe(30)
  })

  it('returns 29 for non-leap Esfand and 30 for leap Esfand', () => {
    // Nowruz 1400 fell on 21 March 2021 -> Esfand 1399 had 29 days (non-leap).
    expect(jalaliMonthLength(1399, 12)).toBe(29)
    // Nowruz 1403 fell on 20 March 2024 -> Esfand 1402 had 30 days (leap).
    expect(jalaliMonthLength(1402, 12)).toBe(30)
  })
})

describe('Persian date formatting', () => {
  it('formats a date as Compact Jalali', () => {
    expect(formatJalaliSlash(new Date(2026, 8, 9))).toBe('۱۴۰۵/۰۶/۱۸')
  })

  it('formats a full Jalali date with weekday and month name', () => {
    const text = formatJalaliFull(new Date(2026, 8, 9))
    expect(text).toContain('۱۸')
    expect(text).toContain('شهریور')
    expect(text).toContain('۱۴۰۵')
  })

  it('formats a timestamp from an ISO string', () => {
    expect(formatTimestamp('2026-09-09T12:00:00Z')).toBe('۱۴۰۵/۰۶/۱۸')
  })

  it('returns empty string for invalid dates', () => {
    expect(formatJalaliSlash(new Date('invalid'))).toBe('')
    expect(formatTimestamp('not-a-date')).toBe('')
  })
})
