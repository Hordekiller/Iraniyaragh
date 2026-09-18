import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRE_AUTH_LEVEL } from '../auth/auth.guard';
import { CheckoutController } from './checkout.controller';

const principal = { userId: 'user-1' } as never;
const address = {
  provinceCode: 'TEH',
  city: 'Tehran',
  address: 'Test street',
  postalCode: '1234567890',
  recipient: 'Test User',
  mobile: '09123456789',
};

describe('CheckoutController', () => {
  it('requires customer OTP authentication for every checkout route', () => {
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, CheckoutController)).toBe(
      'CUSTOMER_OTP',
    );
  });

  it('delegates preview with authenticated ownership', async () => {
    const response = { data: { cart: {}, shipping: [] } };
    const service = { previewForUser: vi.fn().mockResolvedValue(response) };
    const controller = new CheckoutController(service as never);

    await expect(controller.preview(principal, { address })).resolves.toBe(
      response,
    );
    expect(service.previewForUser).toHaveBeenCalledWith('user-1', address);
  });

  it('requires a bounded, control-free idempotency key', () => {
    const service = { createForUser: vi.fn() };
    const controller = new CheckoutController(service as never);
    const input = { address, shippingQuoteId: 'quote-1' };

    expect(() => controller.create(principal, undefined, input)).toThrow(
      BadRequestException,
    );
    expect(() => controller.create(principal, 'x'.repeat(129), input)).toThrow(
      BadRequestException,
    );
    expect(() => controller.create(principal, 'bad\nkey', input)).toThrow(
      BadRequestException,
    );
    expect(service.createForUser).not.toHaveBeenCalled();
  });

  it('passes the normalized retry key without putting it in the body', async () => {
    const response = { data: { order: {}, reservations: [] } };
    const service = { createForUser: vi.fn().mockResolvedValue(response) };
    const controller = new CheckoutController(service as never);
    const input = { address, shippingQuoteId: 'quote-1' };

    await expect(
      controller.create(principal, ' checkout-key ', input),
    ).resolves.toBe(response);
    expect(service.createForUser).toHaveBeenCalledWith(
      'user-1',
      input,
      'checkout-key',
      expect.any(String),
    );
  });
});
