import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GuestCartService } from './guest-cart.service';

const currentHash = 'a'.repeat(64);
const replacementHash = 'b'.repeat(64);
const future = new Date('2099-01-01T00:00:00.000Z');
const createdAt = new Date('2026-09-19T08:00:00.000Z');
const variant = {
  id: 'variant-1',
  sku: 'SKU-1',
  title: 'دریل شارژی',
  salePrice: 12_500_000n,
  product: { name: 'دریل شارژی', status: 'ACTIVE' },
  inventory: [{ available: 8 }],
};
const guestCart = {
  id: 'guest-cart-1',
  customerId: null,
  guestTokenHash: currentHash,
  guestExpiresAt: future,
  version: 1,
  createdAt,
  updatedAt: createdAt,
  items: [],
};
const customerCart = {
  id: 'customer-cart-1',
  customerId: 'customer-1',
  guestTokenHash: null,
  guestExpiresAt: null,
  version: 2,
  createdAt,
  updatedAt: createdAt,
  items: [],
};

function pricedCart(
  base: typeof guestCart | typeof customerCart,
  quantity = 1,
) {
  return {
    ...base,
    items: [
      {
        id: 'line-1',
        cartId: base.id,
        variantId: variant.id,
        quantity,
        createdAt,
        updatedAt: createdAt,
        variant,
      },
    ],
  };
}

function setup() {
  const tx = {
    cart: {
      findUnique: vi.fn().mockResolvedValue(guestCart),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn().mockResolvedValue(pricedCart(guestCart)),
      create: vi.fn().mockResolvedValue({
        ...guestCart,
        id: 'guest-cart-replacement',
        guestTokenHash: replacementHash,
      }),
      update: vi.fn().mockResolvedValue(pricedCart(guestCart)),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cartItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    guestCartMutation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    cartMutation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    productVariant: { findFirst: vi.fn().mockResolvedValue({ id: variant.id }) },
  };
  const prisma = {
    customer: { findUnique: vi.fn().mockResolvedValue({ id: 'customer-1' }) },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const audit = { record: vi.fn() };
  return {
    service: new GuestCartService(prisma as never, audit as never),
    prisma,
    tx,
    audit,
  };
}

describe('GuestCartService', () => {
  it('bounds scheduled cleanup and rechecks expiry before deletion', async () => {
    const { service, tx } = setup();
    tx.cart.findMany.mockResolvedValue([{ id: 'expired-1' }]);
    tx.cart.deleteMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-09-20T00:00:00.000Z');

    await expect(service.sweepExpired(now, 25)).resolves.toBe(1);
    expect(tx.cart.findMany).toHaveBeenCalledWith({
      where: { customerId: null, guestExpiresAt: { lte: now } },
      orderBy: [{ guestExpiresAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: 25,
    });
    expect(tx.cart.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['expired-1'] },
        customerId: null,
        guestExpiresAt: { lte: now },
      },
    });
  });

  it('persists the established session owner on the first mutation and stores scoped hashed replay data', async () => {
    const { service, tx } = setup();
    tx.cart.findUnique.mockResolvedValueOnce(null);

    const result = await service.addForToken(
      currentHash,
      [replacementHash],
      { variantId: variant.id, quantity: 1 },
      'guest-add-1',
    );

    expect(result.replacementTokenHash).toBeNull();
    expect(tx.cart.create).toHaveBeenCalledWith({
      data: {
        guestTokenHash: currentHash,
        guestExpiresAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(tx.guestCartMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cartId: 'guest-cart-replacement',
        scope: 'guest-cart.add:/api/v1/guest-cart/lines',
        keyHash: createHash('sha256').update('guest-add-1').digest('hex'),
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    });
  });

  it('reuses an active token and enforces the same quantity bounds as customer carts', async () => {
    const { service, tx } = setup();

    const result = await service.addForToken(
      currentHash,
      [replacementHash],
      { variantId: variant.id, quantity: 2 },
      'guest-add-2',
    );
    expect(result.replacementTokenHash).toBeNull();
    expect(tx.cart.create).not.toHaveBeenCalled();
    expect(tx.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: 2 }),
      }),
    );

    await expect(
      service.addForToken(
        currentHash,
        [replacementHash],
        { variantId: variant.id, quantity: 100 },
        'invalid-quantity',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rotates an expired guest identity before applying a mutation', async () => {
    const { service, tx } = setup();
    tx.cart.findUnique.mockResolvedValueOnce({
      ...guestCart,
      guestExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const result = await service.setForToken(
      currentHash,
      [replacementHash],
      variant.id,
      2,
      'rotate-expired',
    );

    expect(result.replacementTokenHash).toBe(replacementHash);
    expect(tx.cart.delete).toHaveBeenCalledWith({
      where: { id: guestCart.id },
    });
    expect(tx.cart.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guestTokenHash: replacementHash }),
      }),
    );
  });

  it('replays the same guest mutation without repeating line side effects', async () => {
    const { service, tx } = setup();
    const replay = { data: { cart: { id: guestCart.id } } };
    const scope = 'guest-cart.remove:/api/v1/guest-cart/lines/:variantId';
    tx.guestCartMutation.findUnique.mockResolvedValueOnce({
      id: 'guest-replay-1',
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ scope, payload: { variantId: variant.id } }))
        .digest('hex'),
      responseJson: replay,
      expiresAt: future,
    });

    await expect(
      service.removeForToken(
        currentHash,
        [replacementHash],
        variant.id,
        'remove-replay',
      ),
    ).resolves.toMatchObject({ response: replay });
    expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.guestCartMutation.create).not.toHaveBeenCalled();
  });

  it('rejects a guest replay key reused with a different payload', async () => {
    const { service, tx } = setup();
    tx.guestCartMutation.findUnique.mockResolvedValueOnce({
      id: 'guest-conflict-1',
      fingerprint: 'different',
      responseJson: {},
      expiresAt: future,
    });

    await expect(
      service.addForToken(
        currentHash,
        [replacementHash],
        { variantId: variant.id, quantity: 1 },
        'guest-conflict',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('expires stale reads and never returns their lines', async () => {
    const { service, tx } = setup();
    tx.cart.findUnique.mockResolvedValueOnce({
      ...guestCart,
      guestExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const result = await service.getForToken(currentHash);

    expect(result.credentialState).toBe('expired');
    expect(result.response.data.cart).toMatchObject({ id: null, lines: [] });
    expect(tx.cart.delete).toHaveBeenCalledWith({
      where: { id: guestCart.id },
    });
  });

  it('distinguishes an unpersisted fresh session from an expired owner', async () => {
    const { service, tx } = setup();
    tx.cart.findUnique.mockResolvedValueOnce(null);

    const result = await service.getForToken(currentHash);

    expect(result.credentialState).toBe('missing');
    expect(result.response.data.cart).toMatchObject({ id: null, lines: [] });
    expect(tx.cart.delete).not.toHaveBeenCalled();
  });

  it('merges equal variants deterministically, caps quantity and invalidates the guest identity', async () => {
    const { service, tx, audit } = setup();
    const mergeGuest = {
      ...guestCart,
      items: [
        {
          id: 'guest-line-1',
          cartId: guestCart.id,
          variantId: variant.id,
          quantity: 5,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    tx.cart.findUnique.mockImplementation(async ({ where }: {
      where: { guestTokenHash?: string; customerId?: string };
    }) => {
      if (where.guestTokenHash) return mergeGuest;
      if (where.customerId) return customerCart;
      return null;
    });
    tx.cartItem.findMany.mockResolvedValue([
      { id: 'customer-line-1', variantId: variant.id, quantity: 98 },
    ]);
    tx.cart.findUniqueOrThrow.mockResolvedValue(pricedCart(customerCart, 99));

    const result = await service.mergeForUser(
      'user-1',
      currentHash,
      'merge-1',
      'request-1',
    );

    expect(result.data.warnings).toEqual([
      { variantId: variant.id, code: 'QUANTITY_CAPPED' },
    ]);
    expect(tx.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'customer-line-1' },
      data: { quantity: 99 },
    });
    expect(tx.cart.delete).toHaveBeenCalledWith({
      where: { id: guestCart.id },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cart.guest.merged',
        actorId: 'user-1',
        requestId: 'request-1',
        metadata: expect.not.objectContaining({
          guestTokenHash: expect.anything(),
        }),
      }),
      tx,
    );
  });

  it('returns a stable warning instead of silently dropping a line at the 100-line boundary', async () => {
    const { service, tx } = setup();
    const mergeGuest = {
      ...guestCart,
      items: [
        {
          id: 'guest-new-line',
          cartId: guestCart.id,
          variantId: 'guest-only-variant',
          quantity: 1,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    tx.cart.findUnique.mockImplementation(async ({ where }: {
      where: { guestTokenHash?: string; customerId?: string };
    }) =>
      where.guestTokenHash ? mergeGuest : customerCart,
    );
    tx.cartItem.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        id: `line-${index}`,
        variantId: `variant-${index}`,
        quantity: 1,
      })),
    );
    tx.cart.findUniqueOrThrow.mockResolvedValue(pricedCart(customerCart));

    const result = await service.mergeForUser(
      'user-1',
      currentHash,
      'merge-line-limit',
      'request-2',
    );

    expect(result.data.warnings).toEqual([
      { variantId: 'guest-only-variant', code: 'LINE_LIMIT_REACHED' },
    ]);
    expect(tx.cartItem.createMany).not.toHaveBeenCalled();
  });

  it('replays a completed merge after the success response cleared the guest cookie', async () => {
    const { service, tx } = setup();
    const replay = {
      data: { cart: { id: customerCart.id }, warnings: [] },
    };
    tx.cartMutation.findUnique.mockResolvedValueOnce({
      id: 'merge-replay-1',
      fingerprint: 'stored-fingerprint',
      responseJson: replay,
      expiresAt: future,
    });

    await expect(
      service.mergeForUser('user-1', null, 'merge-retry', 'request-3'),
    ).resolves.toEqual(replay);
    expect(tx.cart.findUnique).not.toHaveBeenCalled();
    expect(tx.cartMutation.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of a merge key with a different presented guest cart', async () => {
    const { service, tx } = setup();
    tx.cartMutation.findUnique.mockResolvedValueOnce({
      id: 'merge-conflict-1',
      fingerprint: 'different',
      responseJson: {},
      expiresAt: future,
    });

    await expect(
      service.mergeForUser(
        'user-1',
        currentHash,
        'merge-conflict',
        'request-4',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
