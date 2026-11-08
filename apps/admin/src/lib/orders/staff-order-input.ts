/**
 * Pure input helpers for the staff sales wizard. They mirror the server's own address
 * rules (the server remains authoritative) so an operator sees the problem next to the
 * field instead of a generic "invalid address" after submitting.
 */
export type SalesAddress = { provinceCode: string; city: string; address: string; postalCode: string; recipient: string; mobile: string };
export type AddressErrors = Partial<Record<keyof SalesAddress, string>>;

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII; everything else is untouched. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/gu, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/gu, (d) => String(d.charCodeAt(0) - 0x0660));
}

export const emptyAddress = (): SalesAddress => ({ provinceCode: '', city: '', address: '', postalCode: '', recipient: '', mobile: '' });

export function validateAddress(input: SalesAddress): AddressErrors {
  const errors: AddressErrors = {};
  if (!input.provinceCode) errors.provinceCode = 'استان را انتخاب کنید.';
  if (!input.city.trim()) errors.city = 'نام شهر را وارد کنید.';
  if (!input.address.trim()) errors.address = 'نشانی کامل را وارد کنید.';
  const postal = toAsciiDigits(input.postalCode).replace(/[\s-]/gu, '');
  if (!/^\d{10}$/u.test(postal) || /^0{10}$/u.test(postal)) errors.postalCode = 'کد پستی باید ۱۰ رقم باشد.';
  if (!input.recipient.trim()) errors.recipient = 'نام گیرنده را وارد کنید.';
  const mobile = toAsciiDigits(input.mobile).replace(/[\s-]/gu, '');
  if (!/^(?:\+?98|0)?9\d{9}$/u.test(mobile)) errors.mobile = 'شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹).';
  return errors;
}

/** Quantity text to an integer 1..1000, or null. Accepts Persian digits. */
export function parseQuantity(raw: string): number | null {
  const value = toAsciiDigits(raw).trim();
  if (!/^\d{1,4}$/u.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 1000 ? parsed : null;
}

/** Ids that appear more than once; the server prices one line per variant. */
export function duplicateIds(ids: ReadonlyArray<string | null>): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}
