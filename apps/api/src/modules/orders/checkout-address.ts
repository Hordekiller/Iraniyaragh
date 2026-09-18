import { UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CheckoutAddress } from '@iranyaragh/contracts';
import { normalizeIranianMobile } from '../auth/mobile';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function asciiDigits(value: string): string {
  return [...value]
    .map((character) => {
      const persian = PERSIAN_DIGITS.indexOf(character);
      if (persian >= 0) return String(persian);
      const arabicIndic = ARABIC_INDIC_DIGITS.indexOf(character);
      return arabicIndic >= 0 ? String(arabicIndic) : character;
    })
    .join('');
}

function normalizedText(value: string, maxLength: number): string | null {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/[\t ]+/gu, ' ');
  if (
    !normalized ||
    normalized.length > maxLength ||
    [...normalized].some(isControlCharacter)
  ) {
    return null;
  }
  return normalized;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint < 32 || codePoint === 127;
}

export function normalizeCheckoutAddress(
  input: CheckoutAddress,
): CheckoutAddress {
  const provinceCode = normalizedText(
    asciiDigits(input.provinceCode),
    32,
  )?.toUpperCase();
  const city = normalizedText(input.city, 100);
  const address = normalizedText(input.address, 500);
  const recipient = normalizedText(input.recipient, 120);
  const postalCode = asciiDigits(input.postalCode).replace(/[\s-]/gu, '');
  const mobile = normalizeIranianMobile(asciiDigits(input.mobile))?.value;

  if (
    !provinceCode ||
    !/^[A-Z0-9_-]+$/u.test(provinceCode) ||
    !city ||
    !address ||
    !recipient ||
    !/^\d{10}$/u.test(postalCode) ||
    /^0{10}$/u.test(postalCode) ||
    !mobile
  ) {
    throw new UnprocessableEntityException({
      code: 'INVALID_REQUEST',
      message: 'Delivery address is invalid.',
    });
  }

  return { provinceCode, city, address, postalCode, recipient, mobile };
}

export function checkoutAddressHash(address: CheckoutAddress): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        address.provinceCode,
        address.city,
        address.address,
        address.postalCode,
        address.recipient,
        address.mobile,
      ]),
    )
    .digest('hex');
}
