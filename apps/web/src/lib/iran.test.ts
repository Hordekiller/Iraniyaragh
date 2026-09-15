import { describe, expect, it } from 'vitest'
import {
  isValidIranMobile,
  isValidIranPostalCode,
  normalizeIranMobile,
  normalizeIranPostalCode,
} from './iran'

describe('Iranian input normalization', () => {
  it('accepts Persian digits and international mobile forms', () => {
    expect(normalizeIranMobile('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('09123456789')
    expect(normalizeIranMobile('+989123456789')).toBe('09123456789')
    expect(normalizeIranMobile('00989123456789')).toBe('09123456789')
    expect(isValidIranMobile('+98 912 345 6789')).toBe(true)
    expect(isValidIranMobile('0912345678')).toBe(false)
  })

  it('accepts Persian postal digits but rejects empty postal codes', () => {
    expect(normalizeIranPostalCode('۱۲۳۴۵ ۶۷۸۹۰')).toBe('1234567890')
    expect(isValidIranPostalCode('۱۲۳۴۵۶۷۸۹۰')).toBe(true)
    expect(isValidIranPostalCode('۰۰۰۰۰۰۰۰۰۰')).toBe(false)
    expect(isValidIranPostalCode('123')).toBe(false)
  })
})
