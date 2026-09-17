import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CartController } from './cart.controller';

const principal = { userId: 'u1' } as never;
const response = { data: { cart: { id: 'c1' } } } as never;

describe('CartController', () => {
  it('requires an idempotency key for add', async () => {
    const service = { addForUser: vi.fn() };
    const controller = new CartController(service as never);
    expect(() => controller.add(principal, undefined, { variantId: 'v1', quantity: 1 })).toThrow(BadRequestException);
  });

  it('delegates add and remove with the authenticated owner', async () => {
    const service = { addForUser: vi.fn().mockResolvedValue(response), removeForUser: vi.fn().mockResolvedValue(response), setForUser: vi.fn().mockResolvedValue(response) };
    const controller = new CartController(service as never);
    await expect(controller.add(principal, ' key ', { variantId: 'v1', quantity: 1 })).resolves.toBe(response);
    await expect(controller.remove(principal, ' key ', ' v1 ')).resolves.toBe(response);
    await expect(controller.set(principal, ' key ', ' v1 ', { variantId: 'v1', quantity: 3 })).resolves.toBe(response);
    expect(service.addForUser).toHaveBeenCalledWith('u1', { variantId: 'v1', quantity: 1 }, 'key');
    expect(service.removeForUser).toHaveBeenCalledWith('u1', 'v1', 'key');
    expect(service.setForUser).toHaveBeenCalledWith('u1', 'v1', 3, 'key');
  });

  it('requires both key and variant for remove', async () => {
    const service = { removeForUser: vi.fn() };
    const controller = new CartController(service as never);
    expect(() => controller.remove(principal, undefined, 'v1')).toThrow(BadRequestException);
    expect(() => controller.remove(principal, 'key', ' ')).toThrow(BadRequestException);
  });
});
