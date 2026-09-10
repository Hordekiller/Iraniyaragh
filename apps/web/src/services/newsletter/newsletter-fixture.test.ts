import { beforeEach, describe, expect, it } from 'vitest'
import {
  NewsletterFixture,
  isValidNewsletterContact,
  loadSubscriptions,
} from './newsletter-fixture'

const STORAGE_KEY = 'iranyaragh.newsletter.subscriptions.v1'

describe('isValidNewsletterContact', () => {
  it('accepts an 11-digit Iranian mobile starting with 09', () => {
    expect(isValidNewsletterContact('09120000001')).toBe(true)
  })

  it('rejects short, malformed and non-09 mobiles', () => {
    expect(isValidNewsletterContact('091200000')).toBe(false)
    expect(isValidNewsletterContact('02188888888')).toBe(false)
    expect(isValidNewsletterContact('19000000000')).toBe(false)
  })

  it('accepts a plain email address', () => {
    expect(isValidNewsletterContact('user@example.com')).toBe(true)
    expect(isValidNewsletterContact('name+suffix@site.co.uk')).toBe(true)
  })

  it('rejects malformed emails and empty input', () => {
    expect(isValidNewsletterContact('user@')).toBe(false)
    expect(isValidNewsletterContact('user@exa mple.com')).toBe(false)
    expect(isValidNewsletterContact('')).toBe(false)
    expect(isValidNewsletterContact('   ')).toBe(false)
  })
})

describe('NewsletterFixture', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists a valid subscription to localStorage', async () => {
    const api = new NewsletterFixture()

    await api.subscribe('09120000001')

    const stored = loadSubscriptions()
    expect(stored).toHaveLength(1)
    expect(stored[0].contact).toBe('09120000001')
    expect(stored[0].subscribedAt).toBeTruthy()
  })

  it('appends multiple subscriptions without clearing previous entries', async () => {
    const api = new NewsletterFixture()
    await api.subscribe('09120000001')
    await api.subscribe('user@example.com')

    expect(loadSubscriptions()).toHaveLength(2)
  })

  it('returns an empty list when the storage key is absent or corrupt', () => {
    expect(loadSubscriptions()).toEqual([])
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadSubscriptions()).toEqual([])
    localStorage.setItem(STORAGE_KEY, '{"nope": true}')
    expect(loadSubscriptions()).toEqual([])
  })
})