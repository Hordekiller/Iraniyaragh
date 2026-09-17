import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CartService } from './cart.service';

const variant = { id: 'v1', sku: 'SKU-1', title: 'Drill', salePrice: 1250n, product: { name: 'Tool', status: 'ACTIVE' } };
const cart = { id: 'c1', customerId: 'c1', version: 2, updatedAt: new Date('2026-01-01T00:00:00Z'), items: [{ cartId: 'c1', variantId: 'v1', quantity: 2, variant }] };

function setup() {
  const tx = {
    cartMutation: { findUnique: vi.fn(), create: vi.fn() },
    productVariant: { findFirst: vi.fn().mockResolvedValue(variant) },
    cart: { upsert: vi.fn().mockResolvedValue({ id: 'c1', customerId: 'c1', version: 1 }), update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue(cart) },
    cartItem: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), upsert: vi.fn() },
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
});
