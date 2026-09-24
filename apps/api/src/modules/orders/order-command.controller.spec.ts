import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { OrderCommandController } from './order-command.controller';

const principal = { userId: 'user-1' } as never;

describe('OrderCommandController', () => {
  it('requires customer OTP authentication and no extra permission for customer cancel', () => {
    const metadata = Reflect.getMetadata(
      REQUIRE_AUTH_LEVEL,
      OrderCommandController.prototype.cancelAsCustomer,
    );
    expect(metadata).toBe('CUSTOMER_OTP');
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION,
        OrderCommandController.prototype.cancelAsCustomer,
      ),
    ).toBeUndefined();
  });

  it('requires staff MFA and orders.manage for staff cancel', () => {
    const metadata = Reflect.getMetadata(
      REQUIRE_AUTH_LEVEL,
      OrderCommandController.prototype.cancelAsStaff,
    );
    expect(metadata).toBe('STAFF_MFA');
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION,
        OrderCommandController.prototype.cancelAsStaff,
      ),
    ).toBe('orders.manage');
  });

  it('delegates customer cancel with class-scoped identity and request id', async () => {
    const response = { data: { order: { status: 'CANCELLED' } } };
    const service = {
      cancelAsCustomer: vi.fn().mockResolvedValue(response),
    };
    const controller = new OrderCommandController(service as never);

    await expect(
      controller.cancelAsCustomer(principal, 'order-1', 'key-1'),
    ).resolves.toBe(response);
    expect(service.cancelAsCustomer).toHaveBeenCalledWith(
      'user-1',
      'order-1',
      expect.objectContaining({
        idempotencyKey: 'key-1',
        requestId: expect.any(String),
      }),
    );
  });

  it('delegates staff cancel with its own actor id', async () => {
    const response = { data: { order: { status: 'CANCELLED' } } };
    const staff = { userId: 'staff-1' } as never;
    const service = { cancelAsStaff: vi.fn().mockResolvedValue(response) };
    const controller = new OrderCommandController(service as never);

    await expect(
      controller.cancelAsStaff(staff, 'order-1', 'key-1'),
    ).resolves.toBe(response);
    expect(service.cancelAsStaff).toHaveBeenCalledWith(
      'staff-1',
      'order-1',
      expect.objectContaining({ idempotencyKey: 'key-1' }),
    );
  });

  it('requires a bounded, control-free idempotency key', () => {
    const service = { cancelAsCustomer: vi.fn() };
    const controller = new OrderCommandController(service as never);

    expect(() =>
      controller.cancelAsCustomer(principal, 'order-1', undefined),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.cancelAsCustomer(principal, 'order-1', 'x'.repeat(129)),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.cancelAsCustomer(principal, 'order-1', 'bad\nk-ey'),
    ).toThrow(BadRequestException);
    expect(service.cancelAsCustomer).not.toHaveBeenCalled();
  });

  it('trims and forwards a normalized retry key', async () => {
    const response = { data: { order: { status: 'CANCELLED' } } };
    const service = {
      cancelAsCustomer: vi.fn().mockResolvedValue(response),
    };
    const controller = new OrderCommandController(service as never);

    await expect(
      controller.cancelAsCustomer(principal, 'order-1', '  key-1  '),
    ).resolves.toBe(response);
    expect(service.cancelAsCustomer).toHaveBeenCalledWith(
      'user-1',
      'order-1',
      expect.objectContaining({ idempotencyKey: 'key-1' }),
    );
  });
});