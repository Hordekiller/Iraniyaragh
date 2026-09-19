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

/** Stable uppercase codes accepted by the checkout address contract. */
export const IRAN_PROVINCE_CODES: Record<IranProvince, string> = {
  'آذربایجان شرقی': 'EAZ',
  'آذربایجان غربی': 'WAZ',
  اردبیل: 'ARD',
  اصفهان: 'ESF',
  البرز: 'ALB',
  ایلام: 'ILM',
  بوشهر: 'BUS',
  تهران: 'TEH',
  'چهارمحال و بختیاری': 'CHB',
  'خراسان جنوبی': 'SKH',
  'خراسان رضوی': 'RKH',
  'خراسان شمالی': 'NKH',
  خوزستان: 'KHZ',
  زنجان: 'ZAN',
  سمنان: 'SEM',
  'سیستان و بلوچستان': 'SBL',
  فارس: 'FAR',
  قزوین: 'QAZ',
  قم: 'QOM',
  کردستان: 'KUR',
  کرمان: 'KER',
  کرمانشاه: 'KRH',
  'کهگیلویه و بویراحمد': 'KBO',
  گلستان: 'GOL',
  گیلان: 'GIL',
  لرستان: 'LOR',
  مازندران: 'MAZ',
  مرکزی: 'MAR',
  هرمزگان: 'HOR',
  همدان: 'HAM',
  یزد: 'YAZ',
}

export function normalizeIranDigits(input: string): string {
  return toLatinDigits(input).replace(/[٠-٩]/g, (digit) =>
    String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)),
  )
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
