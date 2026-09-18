import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  checkoutAddressHash,
  normalizeCheckoutAddress,
} from './checkout-address';

const validAddress = {
  provinceCode: 'teh',
  city: ' تهران ',
  address: 'خیابان آزادی، پلاک ۱۰',
  postalCode: '۱۲۳۴۵۶۷۸۹۰',
  recipient: 'گیرنده آزمون یکپارچگی',
  mobile: '۰۹۱۲-۳۴۵-۶۷۸۹',
};

describe('checkout address policy', () => {
  it('normalizes Persian digits, text and Iranian mobile values', () => {
    expect(normalizeCheckoutAddress(validAddress)).toEqual({
      provinceCode: 'TEH',
      city: 'تهران',
      address: 'خیابان آزادی، پلاک ۱۰',
      postalCode: '1234567890',
      recipient: 'گیرنده آزمون یکپارچگی',
      mobile: '+989123456789',
    });
  });

  it.each([
    { ...validAddress, postalCode: '0000000000' },
    { ...validAddress, postalCode: '123' },
    { ...validAddress, mobile: '02112345678' },
    { ...validAddress, provinceCode: '../TEH' },
    { ...validAddress, address: 'line\ncontrol' },
  ])('rejects malformed address input', (input) => {
    expect(() => normalizeCheckoutAddress(input)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('hashes the normalized immutable snapshot deterministically', () => {
    const address = normalizeCheckoutAddress(validAddress);
    expect(checkoutAddressHash(address)).toBe(
      checkoutAddressHash({ ...address }),
    );
    expect(checkoutAddressHash({ ...address, city: 'قم' })).not.toBe(
      checkoutAddressHash(address),
    );
  });
});
