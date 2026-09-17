import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CartService } from './cart.service';

const variant = { id: 'v1', sku: 'SKU-1', title: 'Drill', salePrice: 1250n, product: { name: 'Tool', status: 'ACTIVE' }, inventory: [{ available: 4 }] };
const cart = { id: 'c1', customerId: 'c1', version: 2, updatedAt: new Date('2026-01-01T00:00:00Z'), items: [{ cartId: 'c1', variantId: 'v1', quantity: 2, variant }] };

function setup() {
  const tx = {
    cartMutation: { findUnique: vi.fn(), create: vi.fn() },
    productVariant: { findFirst: vi.fn().mockResolvedValue(variant) },
    cart: { upsert: vi.fn().mockResolvedValue({ id: 'c1', customerId: 'c1', version: 1 }), update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue(cart) },
    cartItem: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), upsert: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = { customer: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1' }) }, cart: { upsert: vi.fn().mockResolvedValue(cart) }, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  return { service: new CartService(prisma as never), prisma, tx };
}

describe('CartService', () => {
  it('returns a server-priced cart view', async () => {
    const { service } = setup();
    const result = await service.getForUser('u1');
    expect(result.data.cart.lines[0].unitPrice.amount).toBe('1250');
    expect(result.data.cart.lines[0].lineTotal.amount).toBe('2500');
    expect(result.data.cart.lines[0].available).toBe(4);
  });

  it('rejects invalid quantities before persistence', async () => {
    const { service, prisma } = setup();
    await expect(service.addForUser('u1', { variantId: 'v1', quantity: 0 }, 'k1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unlinked authenticated user', async () => {
    const { service, prisma } = setup();
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.getForUser('u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an inactive or unknown variant', async () => {
    const { service, tx } = setup();
    tx.productVariant.findFirst.mockResolvedValue(null);
    await expect(service.addForUser('u1', { variantId: 'missing', quantity: 1 }, 'k2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a reused key with a different payload', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint: 'bad' });
    await expect(service.addForUser('u1', { variantId: 'v1', quantity: 1 }, 'k3')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a new line after the line limit', async () => {
    const { service, tx } = setup();
    tx.cartItem.count.mockResolvedValue(100);
    await expect(service.addForUser('u1', { variantId: 'v1', quantity: 1 }, 'k4')).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds a new line and records the response for replay', async () => {
    const { service, tx } = setup();
    const result = await service.addForUser('u1', { variantId: 'v1', quantity: 1 }, 'k5');
    expect(result.data.cart.lines[0].quantity).toBe(2);
    expect(tx.cartMutation.create).toHaveBeenCalledOnce();
  });

  it('replays a stored response for the same key and payload', async () => {
    const { service, tx } = setup();
    const input = { variantId: 'v1', quantity: 1 };
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const response = { data: { cart: { id: 'c1' } } };
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint, responseJson: response });
    await expect(service.addForUser('u1', input, 'k6')).resolves.toEqual(response);
    expect(tx.productVariant.findFirst).not.toHaveBeenCalled();
  });

  it('increments an existing line without exceeding the limit', async () => {
    const { service, tx } = setup();
    tx.cartItem.findUnique.mockResolvedValue({ quantity: 2 });
    await service.addForUser('u1', { variantId: 'v1', quantity: 1 }, 'k7');
    expect(tx.cartItem.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { quantity: 3 } }));
  });

  it('removes a line and records an idempotent response', async () => {
    const { service, tx } = setup();
    const result = await service.removeForUser('u1', 'v1', 'k8');
    expect(result.data.cart.id).toBe('c1');
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'c1', variantId: 'v1' } });
    expect(tx.cartMutation.create).toHaveBeenCalledOnce();
  });

  it('replays an idempotent remove without deleting twice', async () => {
    const { service, tx } = setup();
    const fingerprint = createHash('sha256').update(JSON.stringify({ variantId: 'v1' })).digest('hex');
    const response = { data: { cart: { id: 'c1' } } };
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint, responseJson: response });
    await expect(service.removeForUser('u1', 'v1', 'k9')).resolves.toEqual(response);
    expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a remove key reused with a different variant', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint: 'different' });
    await expect(service.removeForUser('u1', 'v1', 'k10')).rejects.toBeInstanceOf(ConflictException);
  });

  it('sets an absolute quantity and records the response for replay', async () => {
    const { service, prisma, tx } = setup();
    const result = await service.setForUser('u1', 'v1', 3, 'set-1');
    expect(result.data.cart.id).toBe('c1');
    expect(tx.cartItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { cartId: 'c1', variantId: 'v1', quantity: 3 },
      update: { quantity: 3 },
    }));
    expect(tx.cart.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { version: { increment: 1 } } });
    expect(tx.cartMutation.create).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it.each([0, -1, 100, 1.5])('rejects set quantity %s before persistence', async quantity => {
    const { service, prisma } = setup();
    await expect(service.setForUser('u1', 'v1', quantity, 'set-invalid')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replays a stored set response without repeating side effects', async () => {
    const { service, tx } = setup();
    const fingerprint = createHash('sha256').update(JSON.stringify({ variantId: 'v1', quantity: 3 })).digest('hex');
    const response = { data: { cart: { id: 'c1' } } };
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint, responseJson: response });
    await expect(service.setForUser('u1', 'v1', 3, 'set-replay')).resolves.toEqual(response);
    expect(tx.productVariant.findFirst).not.toHaveBeenCalled();
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects a set key reused with a different payload', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique.mockResolvedValue({ fingerprint: 'different' });
    await expect(service.setForUser('u1', 'v1', 3, 'set-conflict')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects setting an inactive or unknown variant', async () => {
    const { service, tx } = setup();
    tx.productVariant.findFirst.mockResolvedValue(null);
    await expect(service.setForUser('u1', 'missing', 2, 'set-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects creating a set line after the line limit', async () => {
    const { service, tx } = setup();
    tx.cartItem.count.mockResolvedValue(100);
    await expect(service.setForUser('u1', 'v1', 2, 'set-limit')).rejects.toBeInstanceOf(ConflictException);
  });
});
