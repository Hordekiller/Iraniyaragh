import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
  combinationSignature,
} from '../catalog/variant-identifiers';
import { CartService } from './cart.service';

describe.sequential('CartService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `cart_user_${runId}`;
  const customerId = `cart_customer_${runId}`;
  const productId = `cart_product_${runId}`;
  const variantIds = Array.from(
    { length: 102 },
    (_, index) => `cart_variant_${index}_${runId}`,
  );
  const prisma = new PrismaService();
  const cart = new CartService(prisma);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    await prisma.user.create({
      data: {
        id: userId,
        email: `cart-${runId}@example.test`,
        status: 'ACTIVE',
        isEmailVerified: true,
        createdAt: new Date(Date.now() - 60_000),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.customer.create({
      data: {
        id: customerId,
        userId,
        mobile: `+989${numericSuffix(runId)}`,
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'مجموعه ابزار آزمون یکپارچگی سبد',
        slug: `cart-integration-${runId}`,
        status: 'ACTIVE',
      },
    });
    await prisma.productVariant.createMany({
      data: variantIds.map((id, index) => {
        const sku = `CART-${index}-${runId}`;
        return {
          id,
          productId,
          sku,
          skuKey: canonicalizeSku(sku),
          combinationSignature:
            index === 0
              ? EMPTY_AXIS_SIGNATURE
              : combinationSignature([
                  {
                    attributeId: 'cart-integration-axis',
                    optionId: `cart-integration-option-${index}`,
                  },
                ]),
          title: `ابزار آزمون شماره ${index + 1}`,
          costPrice: 8_000_000n + BigInt(index),
          salePrice: 10_000_000n + BigInt(index),
          status: 'ACTIVE' as const,
          isActive: true,
        };
      }),
    });
  });

  beforeEach(async () => {
    await resetCartState();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetCartState();
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('keeps an empty read side-effect free', async () => {
    const first = await cart.getForUser(userId);
    const second = await cart.getForUser(userId);

    expect(first.data.cart).toMatchObject({
      id: null,
      version: 0,
      lines: [],
      updatedAt: null,
    });
    expect(second.data.cart).toMatchObject({ id: null, version: 0 });
    await expect(prisma.cart.count({ where: { customerId } })).resolves.toBe(0);
  });

  it('applies one mutation for concurrent retries with the same key', async () => {
    const input = { variantId: variantIds[0], quantity: 1 };

    const [first, second] = await Promise.all([
      cart.addForUser(userId, input, `same-key-${runId}`),
      cart.addForUser(userId, input, `same-key-${runId}`),
    ]);

    expect(first).toEqual(second);
    const storedCart = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
      include: { items: true, mutations: true },
    });
    expect(storedCart.items).toEqual([
      expect.objectContaining({ variantId: variantIds[0], quantity: 1 }),
    ]);
    expect(storedCart.mutations).toHaveLength(1);
    expect(storedCart.mutations[0]).toMatchObject({
      idempotencyKey: null,
      scope: 'cart.add:/api/v1/cart/lines',
    });
    expect(storedCart.mutations[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not lose concurrent additions with distinct keys', async () => {
    await Promise.all([
      cart.addForUser(
        userId,
        { variantId: variantIds[0], quantity: 2 },
        `quantity-a-${runId}`,
      ),
      cart.addForUser(
        userId,
        { variantId: variantIds[0], quantity: 3 },
        `quantity-b-${runId}`,
      ),
    ]);

    const storedLine = await prisma.cartItem.findFirstOrThrow({
      where: { cart: { customerId }, variantId: variantIds[0] },
    });
    expect(storedLine.quantity).toBe(5);
  });

  it('stores the same opaque key independently per operation scope', async () => {
    const sharedKey = `shared-scope-${runId}`;

    await cart.addForUser(
      userId,
      { variantId: variantIds[0], quantity: 1 },
      sharedKey,
    );
    await cart.setForUser(userId, variantIds[0], 4, sharedKey);

    const mutations = await prisma.cartMutation.findMany({
      where: { customerId },
      select: { keyHash: true, scope: true },
      orderBy: { scope: 'asc' },
    });
    expect(mutations).toEqual([
      {
        keyHash: mutations[0]?.keyHash,
        scope: 'cart.add:/api/v1/cart/lines',
      },
      {
        keyHash: mutations[0]?.keyHash,
        scope: 'cart.set:/api/v1/cart/lines/:variantId',
      },
    ]);
    expect(mutations[0]?.keyHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      prisma.cartItem.findFirstOrThrow({
        where: { cart: { customerId }, variantId: variantIds[0] },
        select: { quantity: true },
      }),
    ).resolves.toEqual({ quantity: 4 });
  });

  it('enforces quantity 99 under concurrent increments', async () => {
    await seedCart([{ variantId: variantIds[0], quantity: 98 }]);

    const results = await Promise.allSettled([
      cart.addForUser(
        userId,
        { variantId: variantIds[0], quantity: 1 },
        `quantity-limit-a-${runId}`,
      ),
      cart.addForUser(
        userId,
        { variantId: variantIds[0], quantity: 1 },
        `quantity-limit-b-${runId}`,
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejection = results.find(
      ({ status }) => status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(UnprocessableEntityException);
    const storedLine = await prisma.cartItem.findFirstOrThrow({
      where: { cart: { customerId }, variantId: variantIds[0] },
    });
    expect(storedLine.quantity).toBe(99);
  });

  it('enforces 100 distinct lines under concurrent inserts', async () => {
    await seedCart(
      variantIds.slice(0, 99).map((variantId) => ({
        variantId,
        quantity: 1,
      })),
    );

    const results = await Promise.allSettled([
      cart.addForUser(
        userId,
        { variantId: variantIds[99], quantity: 1 },
        `line-limit-a-${runId}`,
      ),
      cart.addForUser(
        userId,
        { variantId: variantIds[100], quantity: 1 },
        `line-limit-b-${runId}`,
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejection = results.find(
      ({ status }) => status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(ConflictException);
    await expect(
      prisma.cartItem.count({ where: { cart: { customerId } } }),
    ).resolves.toBe(100);
  });

  it('does not increment the version for a no-op remove', async () => {
    await seedCart([{ variantId: variantIds[0], quantity: 1 }]);
    const before = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
    });

    await cart.removeForUser(userId, variantIds[1], `remove-absent-${runId}`);

    const after = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
    });
    expect(after.version).toBe(before.version);
  });

  it('does not increment the version for a no-op absolute set', async () => {
    await seedCart([{ variantId: variantIds[0], quantity: 3 }]);
    const before = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
    });

    await cart.setForUser(userId, variantIds[0], 3, `set-no-op-${runId}`);

    const after = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
    });
    expect(after.version).toBe(before.version);
  });

  async function seedCart(
    items: Array<{ variantId: string; quantity: number }>,
  ): Promise<void> {
    await prisma.cart.create({
      data: {
        customerId,
        items: { createMany: { data: items } },
      },
    });
  }

  async function resetCartState(): Promise<void> {
    await prisma.cartMutation.deleteMany({ where: { customerId } });
    await prisma.cart.deleteMany({ where: { customerId } });
  }
});

function numericSuffix(value: string): string {
  return value
    .replace(/[^0-9a-f]/gi, '')
    .split('')
    .map((character) => Number.parseInt(character, 16) % 10)
    .join('')
    .padEnd(9, '0')
    .slice(0, 9);
}
