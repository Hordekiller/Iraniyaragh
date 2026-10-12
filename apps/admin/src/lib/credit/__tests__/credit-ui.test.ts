import { describe, expect, it } from 'vitest';
import { creditRial, parseCreditIrr } from '../credit-ui';
describe('Credit IRR boundary presentation', () => {
  it('preserves Persian input and large integer precision', () => {
    expect(parseCreditIrr('۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳')).toBe('9007199254740993');
    expect(parseCreditIrr('٠', true)).toBe('0');
    expect(creditRial('9007199254740993')).toContain('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳');
  });
  it.each(['', '-1', '1.5', '01', '9223372036854775808', '1e3', '0'])('rejects an invalid positive amount %s', value => {
    expect(parseCreditIrr(value)).toBeNull();
  });
});
