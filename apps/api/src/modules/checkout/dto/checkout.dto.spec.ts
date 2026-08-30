import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutCustomerDto } from './checkout.dto';

describe('CheckoutCustomerDto', () => {
  it('accepts a normalized Iranian mobile', async () => {
    const dto = plainToInstance(CheckoutCustomerDto, {
      mobile: '+989125553344',
      firstName: 'Ali',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-Iranian / unnormalized mobile', async () => {
    const dto = plainToInstance(CheckoutCustomerDto, { mobile: '09125553344' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty / missing mobile', async () => {
    const dto = plainToInstance(CheckoutCustomerDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
