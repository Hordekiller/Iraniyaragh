/**
 * Single source of truth for the storefront's own identity, its section anchor
 * IDs, and the business contact details.
 *
 * Business contact details are deployment configuration, not source constants.
 * Nothing here is a placeholder number or address: a storefront that has not been
 * told its real phone number, postal code, address, email or Instagram handle
 * must render no contact block at all rather than publish a plausible-looking but
 * unverified one. Each value is read from a `VITE_SITE_*` variable and is `null`
 * when the deployment does not set it, so the omission is explicit and testable.
 */

import { toPersianDigits } from './format'

// ── Identity ─────────────────────────────────────────────────────────────────

export const SITE_NAME = 'ایران یراق'
export const SITE_TAGLINE = 'فروشگاه تخصصی ابزار و یراق‌آلات'

// ── Business contact (deployment configuration) ──────────────────────────────

function optionalSetting(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Verified storefront phone number, or `null` when the deployment has none. */
export const SITE_PHONE = optionalSetting(import.meta.env.VITE_SITE_PHONE)
/** Verified storefront postal code, or `null`. */
export const SITE_POSTAL_CODE = optionalSetting(import.meta.env.VITE_SITE_POSTAL_CODE)
/** Verified storefront address, or `null`. */
export const SITE_ADDRESS_LINE = optionalSetting(import.meta.env.VITE_SITE_ADDRESS)
/** Verified storefront email, or `null`. */
export const SITE_EMAIL = optionalSetting(import.meta.env.VITE_SITE_EMAIL)
/** Verified Instagram handle (without `@`), or `null`. */
export const INSTAGRAM_HANDLE = optionalSetting(import.meta.env.VITE_INSTAGRAM_HANDLE)

export const INSTAGRAM_URL = INSTAGRAM_HANDLE
  ? `https://www.instagram.com/${INSTAGRAM_HANDLE.replace(/^@/u, '')}`
  : null

/** The phone number in Persian digits, or `null` when there is no number. */
export const SITE_PHONE_PERSIAN = SITE_PHONE ? toPersianDigits(SITE_PHONE) : null

/**
 * Whether the deployment supplied at least one contact detail. The shell uses
 * this to decide if a contact affordance belongs on the page at all: a "تماس با
 * فروشگاه" button with no number behind it is a dead control, so it is not
 * rendered instead of being rendered broken.
 */
export const HAS_SITE_PHONE = SITE_PHONE !== null

// ── Login dialog ─────────────────────────────────────────────────────────────

/** Mobile-number placeholder shown while logging in. */
export const MOBILE_PLACEHOLDER = '۰۹۱۲ ۳۴۵ ۶۷۸۹'

// ── Section anchor IDs ───────────────────────────────────────────────────────

export const SECTION_IDS = {
  home: 'home',
  categories: 'categories',
  mainContent: 'main-content',
} as const
