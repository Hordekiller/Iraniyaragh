import { describe, expect, it } from 'vitest'
import { isMoney, moneyToRials, moneyToToman, rialsToToman, toMoney, tryMoneyToToman } from './money'

describe('isMoney', () => {
  it('accepts a well-formed IRR Money', () => {
    expect(isMoney({ amount: '2850000', currency: 'IRR' })).toBe(true)
  })

  it('rejects non-objects and malformed shapes', () => {
    expect(isMoney(null)).toBe(false)
    expect(isMoney(undefined)).toBe(false)
    expect(isMoney('x')).toBe(false)
    expect(isMoney({ amount: 'x', currency: 'IRR' })).toBe(false)
    expect(isMoney({ amount: '10', currency: 'USD' })).toBe(false)
    expect(isMoney({ amount: 10, currency: 'IRR' })).toBe(false)
  })
})

describe('toMoney', () => {
  it('builds an IRR Money from a number', () => {
    expect(toMoney(123)).toEqual({ amount: '123', currency: 'IRR' })
  })

  it('truncates fractional input from a number', () => {
    expect(toMoney(12.9)).toEqual({ amount: '12', currency: 'IRR' })
  })

  it('builds from a string', () => {
    expect(toMoney('450')).toEqual({ amount: '450', currency: 'IRR' })
  })

  it('throws on malformed input', () => {
    expect(() => toMoney('abc')).toThrow()
    expect(() => toMoney('12.5')).toThrow()
  })
})

describe('Rial <-> Toman conversion', () => {
  it('converts Rial to integer Toman (1 Toman = 10 Rial)', () => {
    expect(rialsToToman(2850000)).toBe(285000)
    expect(rialsToToman(10)).toBe(1)
    expect(rialsToToman(9)).toBe(0)
    expect(rialsToToman('2850000')).toBe(285000)
  })

  it('rejects negative or non-finite Rial amounts', () => {
    expect(() => rialsToToman(-1)).toThrow()
    expect(() => rialsToToman(NaN)).toThrow()
  })
})

describe('moneyToRials / moneyToToman', () => {
  it('parses a Money into Rial and Toman', () => {
    const m = toMoney(2850000)
    expect(moneyToRials(m)).toBe(2850000)
    expect(moneyToToman(m)).toBe(285000)
  })

  it('throws on invalid Money', () => {
    expect(() => moneyToToman({ amount: 'x', currency: 'IRR' })).toThrow()
  })

  it('tryMoneyToToman returns null for invalid input', () => {
    expect(tryMoneyToToman({ amount: 'x', currency: 'IRR' })).toBeNull()
    expect(tryMoneyToToman(null)).toBeNull()
    expect(tryMoneyToToman(toMoney(250000))).toBe(25000)
  })
})
