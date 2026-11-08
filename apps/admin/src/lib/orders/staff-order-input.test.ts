import { describe, expect, it } from 'vitest';
import { PROVINCES } from './iran-provinces';
import { duplicateIds, emptyAddress, parseQuantity, toAsciiDigits, validateAddress } from './staff-order-input';

const valid = { provinceCode: 'THR', city: 'تهران', address: 'خیابان ولیعصر', postalCode: '۱۲۳۴۵۶۷۸۹۰', recipient: 'زهرا', mobile: '۰۹۱۲۳۴۵۶۷۸۹' };

describe('staff order input helpers', () => {
  it('converts Persian and Arabic-Indic digits only', () => {
    expect(toAsciiDigits('۰۹۱۲٣٤ab')).toBe('091234ab');
  });
  it('accepts a complete address typed with Persian digits', () => {
    expect(validateAddress(valid)).toEqual({});
  });
  it('reports each invalid field next to its name', () => {
    const errors = validateAddress({ ...emptyAddress(), postalCode: '123', mobile: '0812' });
    expect(Object.keys(errors).sort()).toEqual(['address', 'city', 'mobile', 'postalCode', 'provinceCode', 'recipient']);
    expect(validateAddress({ ...valid, postalCode: '0000000000' }).postalCode).toBeTruthy();
    expect(validateAddress({ ...valid, mobile: '+989123456789' })).toEqual({});
  });
  it('parses quantity 1..1000 only', () => {
    expect(parseQuantity('۵')).toBe(5);
    expect(parseQuantity(' 1000 ')).toBe(1000);
    for (const bad of ['0', '1001', '', '1.5', 'x', '-1']) expect(parseQuantity(bad)).toBeNull();
  });
  it('finds a variant listed twice and ignores empty rows', () => {
    expect([...duplicateIds(['a', null, 'b', 'a'])]).toEqual(['a']);
  });
  it('lists every province once with unique codes the API accepts', () => {
    expect(PROVINCES).toHaveLength(31);
    expect(new Set(PROVINCES.map((p) => p.value)).size).toBe(31);
    expect(new Set(PROVINCES.map((p) => p.label)).size).toBe(31);
    for (const p of PROVINCES) expect(p.value).toMatch(/^[A-Z0-9_-]+$/u);
  });
});
