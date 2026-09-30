/**
 * Single source of truth for site-wide business constants, policy values and
 * section anchor IDs. Every component references these constants instead of
 * hardcoding values.
 *
 * Fabricated contact data, campaign claims and shop-size figures were removed;
 * the storefront only states what the live API can back (catalog, auth, and —
 * once the cart/checkout milestones land — order data).
 */

export const SITE_NAME = 'ایران یراق'
export const SITE_TAGLINE = 'فروشگاه تخصصی ابزار و یراق‌آلات'

// ── Supplier contact ──────────────────────────────────────────────────────────
//
// Required before the customer enters the contract by Article 33 of Iran's
// Electronic Commerce Law (هویت تأمین‌کننده / نشانی / راه ارتباطی). Supplied by
// the shop owner; never invent or guess these values.

/** Dialable contact number, digits only. */
export const SITE_PHONE = '09202295969'

/** Ten-digit Iranian postal code for the registered shop address. */
export const SITE_POSTAL_CODE = '1497973517'

export const SITE_ADDRESS = {
  // The province value already carries the "استان" prefix, so it must not be
  // prefixed again when composing the one-line address below.
  province: 'استان البرز',
  city: 'کرج',
  street: 'میدان استاندارد، بلوار کامیون‌داران، سایت کابینت‌سازان، بلوک صنعت ۳',
} as const

/** Single-line address for tight layouts and structured data. */
export const SITE_ADDRESS_LINE = `${SITE_ADDRESS.province}، ${SITE_ADDRESS.city}، ${SITE_ADDRESS.street}`

// ── Login dialog ─────────────────────────────────────────────────────────────

/**
 * Mobile-number placeholder shown while logging in.
 *
 * Deliberately a shape hint, never a real number: a plausible-looking
 * placeholder invites customers to sign in against someone else's account.
 */
export const MOBILE_PLACEHOLDER = '۰۹۱۲ ۱۲۳ ۴۵۶۷'

// ── Section anchor IDs ───────────────────────────────────────────────────────

export const SECTION_IDS = {
  home: 'home',
  categories: 'categories',
  newest: 'newest',
  services: 'services',
  mainContent: 'main-content',
} as const