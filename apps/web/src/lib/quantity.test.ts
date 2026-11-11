import { describe, expect, it } from 'vitest'
import { normalizeQuantityDraft, parseQuantityDraft } from './quantity'

describe('normalizeQuantityDraft', () => {
  it.each([
    ['100', '100'],
    ['۱۲۵', '125'],
    ['١٢٥', '125'],
    ['۱2٥', '125'],
    ['1,000', '1000'],
    ['۱٬۰۰۰', '1000'],
    [' 12 ', '12'],
    ['', ''],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(normalizeQuantityDraft(raw)).toBe(expected)
  })

  it.each(['abc', '12a', '-5', '1.5', '۱٫۵', '1e3', '+3'])('rejects %j as a whole', (raw) => {
    expect(normalizeQuantityDraft(raw)).toBeNull()
  })

  it('bounds very long input so it can never become an unsafe number', () => {
    const draft = normalizeQuantityDraft('9'.repeat(400))
    expect(draft).toBe('999999')
    expect(Number.isSafeInteger(parseQuantityDraft(draft as string))).toBe(true)
  })
})

describe('parseQuantityDraft', () => {
  it('treats an empty draft as no value, not zero', () => {
    expect(parseQuantityDraft('')).toBeNull()
  })
  it('reads zero and leading zeros as whole numbers', () => {
    expect(parseQuantityDraft('0')).toBe(0)
    expect(parseQuantityDraft('007')).toBe(7)
  })
})
