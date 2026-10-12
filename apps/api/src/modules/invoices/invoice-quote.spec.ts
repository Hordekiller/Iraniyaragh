import { describe, expect, it } from 'vitest';
import type { InvoicePolicyFields } from '@iranyaragh/contracts';
import { quoteInvoice } from './invoice-quote';
import { invoicePolicyUpdate } from './invoice-policy.validation';

const policy: InvoicePolicyFields = { sellerName: 'فروشگاه آزمون ایزوله', sellerAddress: 'نشانی عمومی آزمون', sellerContact: 'example.test',
  taxTreatment: 'EXCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 10000, shippingTaxable: false, isActive: true };
const line = (price: string, id = 'line1', quantity = 1, discount = '0') => ({ id, unitPrice: price, quantity, discount });
const input = { lines: [line('100')], globalDiscount: '0', shipping: '0' };
const value = (amount: string) => ({ amount, currency: 'IRR' });

describe('Exact store invoice quotation (no checkout/payment mutations)', () => {
  it('rounds exclusive tax per line half-up and sums persisted components', () => {
    const result = quoteInvoice(policy, { ...input, lines: [line('5', 'a'), line('5', 'b')], shipping: '3' });
    expect(result.lines.map(row => row.tax)).toEqual([value('1'), value('1')]);
    expect(result).toMatchObject({ subtotal: value('10'), netAmount: value('13'), tax: value('2'), total: value('15') });
    expect(quoteInvoice({ ...policy, shippingTaxable: true }, { ...input, shipping: '5' })).toMatchObject({ tax: value('11'), total: value('116') });
  });
  it('extracts inclusive tax without adding it a second time', () => {
    const result = quoteInvoice({ ...policy, taxTreatment: 'INCLUSIVE', shippingTaxable: true }, { ...input, lines: [line('110')], shipping: '55' });
    expect(result).toMatchObject({ subtotal: value('110'), shipping: value('55'), netAmount: value('150'), tax: value('15'), total: value('165') });
    expect(result.lines[0]).toMatchObject({ netAmount: value('100'), tax: value('10'), total: value('110') });
  });
  it('requires explicit exemption evidence and zero rate for exempt treatment', () => {
    expect(quoteInvoice({ ...policy, taxTreatment: 'EXEMPT', taxRateBps: 0, exemptionReason: 'سیاست معافیت آزمون' }, input).tax).toEqual(value('0'));
    for (const patch of [{ taxTreatment: 'EXEMPT' as const, taxRateBps: 0 }, { taxTreatment: 'EXEMPT' as const, exemptionReason: 'reason' }, { exemptionReason: 'not exempt' }])
      expect(() => quoteInvoice({ ...policy, ...patch }, input)).toThrow();
  });
  it('allocates global discount by largest remainders with stable line-order ties', () => {
    const result = quoteInvoice(policy, { ...input, lines: [line('10', 'a'), line('10', 'b'), line('10', 'c')], globalDiscount: '2' });
    expect(result.lines.map(row => row.discount.amount)).toEqual(['1', '1', '0']);
    expect(result.discount).toEqual(value('2'));
    const afterLineDiscount = quoteInvoice(policy, { ...input, lines: [line('10', 'a', 1, '5'), line('10', 'b')], globalDiscount: '3' });
    expect(afterLineDiscount.lines.map(row => row.discount.amount)).toEqual(['6', '2']);
  });
  it('enforces the combined line/global discount cap exactly without rounding the cap upward', () => {
    expect(() => quoteInvoice({ ...policy, discountCapBps: 3333 }, { ...input, lines: [line('3')], globalDiscount: '1' })).toThrow();
    expect(() => quoteInvoice({ ...policy, discountCapBps: 1000 }, { ...input, lines: [line('100', 'a', 1, '10')], globalDiscount: '1' })).toThrow();
    expect(quoteInvoice(policy, { ...input, lines: [line('10', 'a'), line('0', 'b')], globalDiscount: '10' }).total).toEqual(value('0'));
    expect(quoteInvoice(policy, { ...input, lines: [line('0')] })).toMatchObject({ subtotal: value('0'), discount: value('0'), total: value('0') });
  });
  it('keeps huge amounts exact beyond JavaScript safe integer range', () => {
    expect(quoteInvoice({ ...policy, taxRateBps: 0 }, { ...input, lines: [line('9007199254740993', 'large', 2)] }).total).toEqual(value('18014398509481986'));
    expect(quoteInvoice({ ...policy, taxRateBps: 0 }, { ...input, lines: [line('9223372036854775807')] }).total).toEqual(value('9223372036854775807'));
  });
  it.each(['-1', '1.1', '01', '1e3', '۱۰۰', '9223372036854775808'])('rejects noncanonical/out-of-range IRR %s', price => {
    expect(() => quoteInvoice(policy, { ...input, lines: [line(price)] })).toThrow();
  });
  it('rejects line, subtotal, tax and shipping overflow', () => {
    for (const lines of [[line('9223372036854775807', 'a', 2)], [line('9223372036854775807', 'a'), line('1', 'b')], [line('9223372036854775807')]])
      expect(() => quoteInvoice(policy, { ...input, lines })).toThrow();
    expect(() => quoteInvoice({ ...policy, taxRateBps: 0 }, { ...input, lines: [line('9223372036854775807')], shipping: '1' })).toThrow();
  });
  it('rejects empty/duplicate lines, invalid quantities, excessive line discount and inactive/missing policy', () => {
    for (const lines of [[], [line('1', 'a'), line('1', 'a')], [line('1', 'a', 0)], [line('1', 'a', 1.5)], [line('1', 'a', 1000001)], [line('1', 'a', 1, '2')], Array.from({ length: 201 }, (_, i) => line('1', String(i)))])
      expect(() => quoteInvoice(policy, { ...input, lines })).toThrow();
    expect(() => quoteInvoice({ ...policy, isActive: false }, input)).toThrow();
    expect(() => quoteInvoice({ ...policy, sellerName: '' }, input)).toThrow();
  });
  it('conserves allocation and financial components over bounded diverse integer inputs', () => {
    for (let sample = 0; sample < 150; sample++) {
      const lines = Array.from({ length: sample % 13 + 1 }, (_, i) => line(String((sample * 17 + i * 31) % 1000), `line-${i}`));
      const subtotal = lines.reduce((sum, row) => sum + BigInt(row.unitPrice), 0n);
      const discount = subtotal * BigInt(sample % 101) / 100n;
      for (const treatment of ['EXCLUSIVE', 'INCLUSIVE'] as const) {
        const result = quoteInvoice({ ...policy, taxTreatment: treatment, taxRateBps: sample * 61 % 10001 }, { lines, globalDiscount: discount.toString(), shipping: '0' });
        expect(result.lines.reduce((sum, row) => sum + BigInt(row.discount.amount), 0n)).toBe(discount);
        expect(result.lines.reduce((sum, row) => sum + BigInt(row.total.amount), 0n)).toBe(BigInt(result.total.amount));
        expect(BigInt(result.netAmount.amount) + BigInt(result.tax.amount)).toBe(BigInt(result.total.amount));
        for (const row of result.lines) expect(BigInt(row.discount.amount)).toBeLessThanOrEqual(BigInt(row.subtotal.amount));
      }
    }
  });
});

describe('Explicit operator policy validation', () => {
  const valid = { ...policy, expectedVersion: null, reason: 'سیاست آزمون' };
  it('canonicalizes only bounded plain text without assuming a rate', () => {
    expect(invoicePolicyUpdate({ ...valid, sellerName: '  فروشندهٔ آزمون  ' }).sellerName).toBe('فروشندهٔ آزمون');
    expect(invoicePolicyUpdate(valid).taxRateBps).toBe(1000);
  });
  it.each([{ sellerName: ' ' }, { sellerAddress: '<script>x</script>' }, { sellerContact: 'a\nb' }, { reason: '\u202etest' }, { taxRateBps: 1.5 }, { taxRateBps: -1 }, { taxRateBps: 10001 }, { discountCapBps: undefined }, { shippingTaxable: undefined }, { expectedVersion: undefined }, { expectedVersion: 0 }, { expectedVersion: 2147483647 }])('fails incomplete/unsafe policy before persistence', patch => {
    expect(() => invoicePolicyUpdate({ ...valid, ...patch } as typeof valid)).toThrow();
  });
});
