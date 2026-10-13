import { describe, expect, it } from 'vitest';
import { invoiceDraftFields, invoiceDraftVersion } from './invoice-draft.validation';
const input = { address: { provinceCode: 'THR', city: 'Test', address: 'Test address', postalCode: '1234567890', recipient: 'Test buyer', mobile: '+989120000000' },
  lines: [{ variantId: 'real-sku', quantity: 2, discount: '0' }], globalDiscount: '0', shippingMethodCode: 'PICKUP', note: null };
describe('Independent draft boundary rejects money/identity ambiguity', () => {
  it.each([{ lines: [null] }, { lines: [] }, { lines: [...input.lines,...input.lines] }, { lines: [{ ...input.lines[0], quantity: 0 }] },
    { lines: [{ ...input.lines[0], quantity: 1001 }] }, { lines: [{ ...input.lines[0], discount: '1.5' }] }, { globalDiscount: '-1' }, { globalDiscount: '01' },
    { globalDiscount: '9223372036854775808' }, { shippingMethodCode: 'unapproved<script>' }, { address: null }, { note: '<script>unsafe</script>' }])('rejects invalid input without JavaScript TypeError', patch => {
    try { invoiceDraftFields({ ...input, ...patch } as typeof input); throw new Error('Expected rejection'); }
    catch (error) { expect(error).not.toBeInstanceOf(TypeError); expect(error).toHaveProperty('response'); }
  });
  it('normalizes Persian address digits and retains exact canonical IRR strings', () => {
    expect(invoiceDraftFields({ ...input, address: { ...input.address, postalCode: '۱۲۳۴۵۶۷۸۹۰', mobile: '۰۹۱۲۰۰۰۰۰۰۰' }, note: '  متن آزمون  ' })).toMatchObject({ address: input.address, note: 'متن آزمون', globalDiscount: '0' });
  });
  it.each([-1, 1.5, 2147483647])('rejects invalid optimistic version %s', version => expect(() => invoiceDraftVersion(version)).toThrow());
});
