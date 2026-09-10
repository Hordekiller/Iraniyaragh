/**
 * Newsletter subscription port for the storefront.
 *
 * The checkout/order layer follows the same pattern: the UI depends on a small
 * port (`NewsletterPort`) and, while no marketing/outbox API exists, the
 * fixture implementation keeps the subscriber evidence honest in localStorage
 * instead of pretending to talk to a real service. Swap in the HTTP client
 * behind this interface when the marketing API lands.
 */

const STORAGE_KEY = 'iranyaragh.newsletter.subscriptions.v1'

export type NewsletterSubscription = {
  contact: string
  subscribedAt: string
}

export type NewsletterPort = {
  subscribe(contact: string): Promise<void>
}

const MOBILE_RE = /^09\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Accepts an 11-digit Iranian mobile (starting 09) or a plain email address. */
export function isValidNewsletterContact(input: string): boolean {
  const value = input.trim()
  return MOBILE_RE.test(value) || EMAIL_RE.test(value)
}

export function loadSubscriptions(): NewsletterSubscription[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is NewsletterSubscription =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as NewsletterSubscription).contact === 'string' &&
        typeof (item as NewsletterSubscription).subscribedAt === 'string',
    )
  } catch {
    return []
  }
}

function saveSubscription(contact: string): void {
  const subscriptions = loadSubscriptions()
  subscriptions.push({ contact, subscribedAt: new Date().toISOString() })
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions))
  }
}

export class NewsletterFixture implements NewsletterPort {
  async subscribe(contact: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 350))
    saveSubscription(contact)
  }
}

export const newsletterFixture: NewsletterPort = new NewsletterFixture()