import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service';

const variant = {
  id: 'variant-drill-18v',
  sku: 'DRILL-18V-01',
  title: 'دریل شارژی ۱۸ ولت',
  salePrice: 12_500_000n,
  product: { name: 'دریل شارژی', status: 'ACTIVE' },
  inventory: [{ available: 4 }],
};
const persistedCart = {
  id: 'cart-customer-1',
  customerId: 'customer-1',
  version: 2,
  updatedAt: new Date('2026-09-18T08:00:00.000Z'),
  items: [
    {
      cartId: 'cart-customer-1',
      variantId: variant.id,
      quantity: 2,
      variant,
    },
  ],
};
const future = new Date('2099-01-01T00:00:00.000Z');

function setup() {
  const tx = {
    cartMutation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    productVariant: { findFirst: vi.fn().mockResolvedValue(variant) },
    cart: {
      upsert: vi.fn().mockResolvedValue({ id: persistedCart.id }),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: persistedCart.id }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(persistedCart),
    },
    cartItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    customer: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'customer-1', userId: 'user-1' }),
    },
    cart: { findUnique: vi.fn().mockResolvedValue(persistedCart) },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { service: new CartService(prisma as never), prisma, tx };
}

function fingerprint(scope: string, payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify({ scope, payload }))
    .digest('hex');
}

describe('CartService', () => {
  it('returns a server-priced persisted cart without writing', async () => {
    const { service, prisma } = setup();

    const result = await service.getForUser('user-1');

    expect(result.data.cart.lines[0].unitPrice.amount).toBe('12500000');
    expect(result.data.cart.lines[0].lineTotal.amount).toBe('25000000');
    expect(result.data.cart.lines[0].available).toBe(4);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an explicit empty view without creating a cart', async () => {
    const { service, prisma } = setup();
    prisma.cart.findUnique.mockResolvedValue(null);

    const result = await service.getForUser('user-1');

    expect(result.data.cart).toMatchObject({
      id: null,
      version: 0,
      lines: [],
      updatedAt: null,
      quote: {
        subtotal: { amount: '0', currency: 'IRR' },
        shipping: { amount: '0', currency: 'IRR' },
        total: { amount: '0', currency: 'IRR' },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unlinked authenticated user', async () => {
    const { service, prisma } = setup();
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(service.getForUser('user-2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.cart.findUnique).not.toHaveBeenCalled();
  });

  it.each([0, -1, 100, 1.5])(
    'rejects add quantity %s before persistence',
    async (quantity) => {
      const { service, prisma } = setup();

      await expect(
        service.addForUser(
          'user-1',
          { variantId: variant.id, quantity },
          'add-invalid',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([' ', 'x'.repeat(129), 'unsafe\nkey'])(
    'rejects invalid idempotency key %j before persistence',
    async (key) => {
      const { service, prisma } = setup();

      await expect(
        service.addForUser(
          'user-1',
          { variantId: variant.id, quantity: 1 },
          key,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects an inactive or unknown variant', async () => {
    const { service, tx } = setup();
    tx.productVariant.findFirst.mockResolvedValue(null);

    await expect(
      service.addForUser(
        'user-1',
        { variantId: 'variant-missing', quantity: 1 },
        'add-missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds a line and persists only the hashed, scoped replay key', async () => {
    const { service, prisma, tx } = setup();

    const result = await service.addForUser(
      'user-1',
      { variantId: variant.id, quantity: 1 },
      'checkout-client-retry-1',
    );

    expect(result.data.cart.lines[0].quantity).toBe(2);
    expect(tx.cartMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'customer-1',
        scope: 'cart.add:/api/v1/cart/lines',
        idempotencyKey: null,
        keyHash: createHash('sha256')
          .update('checkout-client-retry-1')
          .digest('hex'),
        expiresAt: expect.any(Date),
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('replays a scoped response without repeating cart side effects', async () => {
    const { service, tx } = setup();
    const payload = { variantId: variant.id, quantity: 1 };
    const response = { data: { cart: { id: persistedCart.id } } };
    tx.cartMutation.findUnique.mockResolvedValueOnce({
      id: 'mutation-1',
      fingerprint: fingerprint('cart.add:/api/v1/cart/lines', payload),
      responseJson: response,
      expiresAt: future,
    });

    await expect(
      service.addForUser('user-1', payload, 'add-replay'),
    ).resolves.toEqual(response);
    expect(tx.productVariant.findFirst).not.toHaveBeenCalled();
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('replays an unexpired legacy record during the migration window', async () => {
    const { service, tx } = setup();
    const payload = { variantId: variant.id, quantity: 1 };
    const response = { data: { cart: { id: persistedCart.id } } };
    tx.cartMutation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'legacy-mutation-1',
        idempotencyKey: 'legacy-add-key',
        fingerprint: createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex'),
        responseJson: response,
        expiresAt: future,
      });

    await expect(
      service.addForUser('user-1', payload, 'legacy-add-key'),
    ).resolves.toEqual(response);
    expect(tx.productVariant.findFirst).not.toHaveBeenCalled();
  });

  it('allows the same opaque key in a different operation scope', async () => {
    const { service, tx } = setup();

    await service.addForUser(
      'user-1',
      { variantId: variant.id, quantity: 1 },
      'shared-client-key',
    );
    await service.setForUser('user-1', variant.id, 3, 'shared-client-key');

    expect(tx.cartMutation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'cart.add:/api/v1/cart/lines',
        }),
      }),
    );
    expect(tx.cartMutation.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'cart.set:/api/v1/cart/lines/:variantId',
        }),
      }),
    );
  });

  it('rejects a scoped key reused with a different payload', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique.mockResolvedValueOnce({
      id: 'mutation-conflict',
      fingerprint: 'different',
      responseJson: {},
      expiresAt: future,
    });

    await expect(
      service.addForUser(
        'user-1',
        { variantId: variant.id, quantity: 1 },
        'add-conflict',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes an expired exact replay before accepting the key again', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique
      .mockResolvedValueOnce({
        id: 'mutation-expired',
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);

    await service.addForUser(
      'user-1',
      { variantId: variant.id, quantity: 1 },
      'expired-replay',
    );

    expect(tx.cartMutation.delete).toHaveBeenCalledWith({
      where: { id: 'mutation-expired' },
    });
    expect(tx.cartMutation.create).toHaveBeenCalledOnce();
  });

  it('bounds opportunistic expired replay cleanup', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findMany.mockResolvedValue([
      { id: 'expired-1' },
      { id: 'expired-2' },
    ]);

    await service.setForUser('user-1', variant.id, 3, 'cleanup-expired');

    expect(tx.cartMutation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(tx.cartMutation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['expired-1', 'expired-2'] } },
    });
  });

  it('rejects a new line after the 100-line limit', async () => {
    const { service, tx } = setup();
    tx.cartItem.count.mockResolvedValue(100);

    await expect(
      service.addForUser(
        'user-1',
        { variantId: variant.id, quantity: 1 },
        'line-limit',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('increments an existing line without applying the distinct-line limit', async () => {
    const { service, tx } = setup();
    tx.cartItem.findUnique.mockResolvedValue({ quantity: 2 });
    tx.cartItem.count.mockResolvedValue(100);

    await service.addForUser(
      'user-1',
      { variantId: variant.id, quantity: 1 },
      'increment-existing',
    );

    expect(tx.cartItem.count).not.toHaveBeenCalled();
    expect(tx.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: 3 } }),
    );
  });

  it('rejects an increment that would exceed quantity 99', async () => {
    const { service, tx } = setup();
    tx.cartItem.findUnique.mockResolvedValue({ quantity: 99 });

    await expect(
      service.addForUser(
        'user-1',
        { variantId: variant.id, quantity: 1 },
        'quantity-limit',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('removes a line and increments the cart version once', async () => {
    const { service, tx } = setup();

    await service.removeForUser('user-1', variant.id, 'remove-existing');

    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: persistedCart.id, variantId: variant.id },
    });
    expect(tx.cart.update).toHaveBeenCalledOnce();
  });

  it('does not drift the version when removing an absent line', async () => {
    const { service, tx } = setup();
    tx.cartItem.deleteMany.mockResolvedValue({ count: 0 });

    await service.removeForUser('user-1', variant.id, 'remove-absent-line');

    expect(tx.cart.update).not.toHaveBeenCalled();
  });

  it('records an idempotent empty remove without creating a cart', async () => {
    const { service, tx } = setup();
    tx.cart.findUnique.mockResolvedValue(null);

    const response = await service.removeForUser(
      'user-1',
      variant.id,
      'remove-no-cart',
    );

    expect(response.data.cart).toMatchObject({ id: null, version: 0 });
    expect(tx.cart.upsert).not.toHaveBeenCalled();
    expect(tx.cartMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cartId: null }),
    });
  });

  it('sets an absolute quantity and records a scoped replay', async () => {
    const { service, tx } = setup();

    await service.setForUser('user-1', variant.id, 3, 'set-absolute');

    expect(tx.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          cartId: persistedCart.id,
          variantId: variant.id,
          quantity: 3,
        },
        update: { quantity: 3 },
      }),
    );
    expect(tx.cartMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'cart.set:/api/v1/cart/lines/:variantId',
      }),
    });
  });

  it('does not drift the version when setting the existing quantity', async () => {
    const { service, tx } = setup();
    tx.cartItem.findUnique.mockResolvedValue({ quantity: 3 });

    await service.setForUser('user-1', variant.id, 3, 'set-no-op');

    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
    expect(tx.cart.update).not.toHaveBeenCalled();
    expect(tx.cartMutation.create).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 100, 1.5])(
    'rejects set quantity %s before persistence',
    async (quantity) => {
      const { service, prisma } = setup();

      await expect(
        service.setForUser('user-1', variant.id, quantity, 'set-invalid'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('retries a serializable conflict with the same operation', async () => {
    const { service, prisma, tx } = setup();
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx),
      );

    await service.setForUser('user-1', variant.id, 3, 'retry-serialization');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns a stable conflict after exhausting serialization retries', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(
      service.setForUser('user-1', variant.id, 3, 'retry-exhausted'),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});
