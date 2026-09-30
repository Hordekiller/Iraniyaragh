import { toLatinDigits } from './format'

export const IRAN_PROVINCES = [
  'آذربایجان شرقی',
  'آذربایجان غربی',
  'اردبیل',
  'اصفهان',
  'البرز',
  'ایلام',
  'بوشهر',
  'تهران',
  'چهارمحال و بختیاری',
  'خراسان جنوبی',
  'خراسان رضوی',
  'خراسان شمالی',
  'خوزستان',
  'زنجان',
  'سمنان',
  'سیستان و بلوچستان',
  'فارس',
  'قزوین',
  'قم',
  'کردستان',
  'کرمان',
  'کرمانشاه',
  'کهگیلویه و بویراحمد',
  'گلستان',
  'گیلان',
  'لرستان',
  'مازندران',
  'مرکزی',
  'هرمزگان',
  'همدان',
  'یزد',
] as const

export type IranProvince = (typeof IRAN_PROVINCES)[number]

/**
 * Stable machine codes for `CheckoutAddress.provinceCode` (a free-form string
 * on the merchant API, max length 32 — see `apps/api` `checkout.dto.ts`). Codes
 * are aligned with the ISO 3166-2:IR primary-subdivision codes where they are
 * unambiguous; otherwise a local stable abbreviation.
 */
export const IRAN_PROVINCE_CODES: Record<IranProvince, string> = {
  'آذربایجان شرقی': 'AZE',
  'آذربایجان غربی': 'AZW',
  اردبیل: 'ARD',
  اصفهان: 'ISF',
  البرز: 'ALB',
  ایلام: 'ILM',
  بوشهر: 'BSH',
  تهران: 'THR',
  'چهارمحال و بختیاری': 'CHB',
  'خراسان جنوبی': 'KHS',
  'خراسان رضوی': 'KHR',
  'خراسان شمالی': 'KNN',
  خوزستان: 'KHZ',
  زنجان: 'ZNJ',
  سمنان: 'SMN',
  'سیستان و بلوچستان': 'SIS',
  فارس: 'FRS',
  قزوین: 'QZV',
  قم: 'QHM',
  کردستان: 'KRD',
  کرمان: 'KRN',
  کرمانشاه: 'KRS',
  'کهگیلویه و بویراحمد': 'KBI',
  گلستان: 'GLS',
  گیلان: 'GLN',
  لرستان: 'LRS',
  مازندران: 'MZN',
  مرکزی: 'MRK',
  هرمزگان: 'HRM',
  همدان: 'HMD',
  یزد: 'YZD',
}

/** Resolve a validated province name to its machine code; unknown -> null. */
export function provinceCodeFor(province: string): string | null {
  const trimmed = province.trim()
  if (!trimmed) return null
  return (IRAN_PROVINCE_CODES as Record<string, string>)[trimmed] ?? null
}

/** Reverse lookup used when rendering a stored `provinceCode`; unknown -> null. */
export function provinceNameForCode(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  return (
    IRAN_PROVINCES.find(province => IRAN_PROVINCE_CODES[province] === trimmed) ?? null
  )
}

export function normalizeIranDigits(input: string): string {
  return toLatinDigits(input).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
}

/** Returns the canonical domestic form: 09xxxxxxxxx. */
export function normalizeIranMobile(input: string): string {
  const digits = normalizeIranDigits(input).replace(/[\s\-()]/g, '')
  if (digits.startsWith('+98')) return `0${digits.slice(3)}`
  if (digits.startsWith('0098')) return `0${digits.slice(4)}`
  return digits
}

export function isValidIranMobile(input: string): boolean {
  return /^09\d{9}$/.test(normalizeIranMobile(input))
}

export function normalizeIranPostalCode(input: string): string {
  return normalizeIranDigits(input).replace(/\s/g, '')
}

export function isValidIranPostalCode(input: string): boolean {
  const postalCode = normalizeIranPostalCode(input)
  return /^\d{10}$/.test(postalCode) && !/^0{10}$/.test(postalCode)
}
