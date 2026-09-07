import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MoneyDto } from './catalog.dto';

describe('MoneyDto', () => {
  it('accepts canonical integer Rial and rejects currencies that cannot be persisted', async () => {
    const rial = Object.assign(new MoneyDto(), { amount: '10000', currency: 'IRR' });
    const unsupported = Object.assign(new MoneyDto(), { amount: '10000', currency: 'USD' });

    await expect(validate(rial)).resolves.toHaveLength(0);
    await expect(validate(unsupported)).resolves.not.toHaveLength(0);
  });
});
