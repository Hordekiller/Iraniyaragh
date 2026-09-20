import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
  combinationSignature,
} from '../catalog/variant-identifiers';
import { GuestCartService } from './guest-cart.service';

describe.sequential('GuestCartService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `guest_cart_user_${runId}`;
  const customerId = `guest_cart_customer_${runId}`;
  const productId = `guest_cart_product_${runId}`;
  const variantIds = Array.from(
    { length: 3 },
    (_, index) => `guest_cart_variant_${index}_${runId}`,
  );
  const tokenA = digestSeed(`guest-a-${runId}`);
  const tokenB = digestSeed(`guest-b-${runId}`);
  const replacement = digestSeed(`guest-replacement-${runId}`);
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const cart = new GuestCartService(prisma, audit);
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
        email: `guest-cart-${runId}@example.test`,
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
        name: 'ابزار آزمون سبد مهمان',
        slug: `guest-cart-integration-${runId}`,
        status: 'ACTIVE',
      },
    });
    await prisma.productVariant.createMany({
      data: variantIds.map((id, index) => {
        const sku = `GUEST-CART-${index}-${runId}`;
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
                    attributeId: 'guest-cart-axis',
                    optionId: `guest-cart-option-${index}`,
                  },
                ]),
          title: `ابزار مهمان ${index + 1}`,
          costPrice: 5_000_000n + BigInt(index),
          salePrice: 7_000_000n + BigInt(index),
          status: 'ACTIVE' as const,
          isActive: true,
        };
      }),
    });
  });

  beforeEach(async () => {
    await resetState();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetState();
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('enforces exactly one valid customer or guest owner at the database boundary', async () => {
    const now = new Date();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Cart" ("id", "version", "createdAt", "updatedAt")
        VALUES (${`ownerless_${runId}`}, 1, ${now}, ${now})
      `,
    ).rejects.toBeDefined();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Cart" (
          "id", "customerId", "guestTokenHash", "guestExpiresAt",
          "version", "createdAt", "updatedAt"
        ) VALUES (
          ${`dual_owner_${runId}`}, ${customerId}, ${tokenA},
          ${new Date(now.getTime() + 60_000)}, 1, ${now}, ${now}
        )
      `,
    ).rejects.toBeDefined();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Cart" (
          "id", "guestTokenHash", "guestExpiresAt", "version", "createdAt", "updatedAt"
        ) VALUES (
          ${`bad_hash_${runId}`}, ${'not-a-sha256'},
          ${new Date(now.getTime() + 60_000)}, 1, ${now}, ${now}
        )
      `,
    ).rejects.toBeDefined();
  });

  it('applies one anonymous mutation for concurrent same-key retries', async () => {
    await seedGuestCart(tokenA);
    const input = { variantId: variantIds[0], quantity: 1 };

    const [first, second] = await Promise.all([
      cart.addForToken(tokenA, [replacement], input, `same-key-${runId}`),
      cart.addForToken(tokenA, [replacement], input, `same-key-${runId}`),
    ]);

    expect(first.response).toEqual(second.response);
    const stored = await prisma.cart.findUniqueOrThrow({
      where: { guestTokenHash: tokenA },
      include: { items: true, guestMutations: true },
    });
    expect(stored.items).toEqual([
      expect.objectContaining({ variantId: variantIds[0], quantity: 1 }),
    ]);
    expect(stored.guestMutations).toHaveLength(1);
    expect(stored.guestMutations[0]?.keyHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('bootstraps exactly one owner for concurrent first-mutation same-key retries', async () => {
    const input = { variantId: variantIds[0], quantity: 1 };
    const key = `bootstrap-same-key-${runId}`;

    const [first, second] = await Promise.all([
      cart.addForToken(tokenA, [replacement], input, key),
      cart.addForToken(tokenA, [replacement], input, key),
    ]);

    expect(first).toEqual(second);
    expect(first.replacementTokenHash).toBeNull();
    const carts = await prisma.cart.findMany({
      where: { guestTokenHash: tokenA },
      include: { items: true, guestMutations: true },
    });
    expect(carts).toHaveLength(1);
    expect(carts[0]?.items).toEqual([
      expect.objectContaining({ variantId: variantIds[0], quantity: 1 }),
    ]);
    expect(carts[0]?.guestMutations).toHaveLength(1);
  });

  it('keeps two anonymous token owners isolated', async () => {
    await Promise.all([seedGuestCart(tokenA), seedGuestCart(tokenB)]);

    await Promise.all([
      cart.addForToken(
        tokenA,
        [replacement],
        { variantId: variantIds[0], quantity: 2 },
        `owner-a-${runId}`,
      ),
      cart.addForToken(
        tokenB,
        [replacement],
        { variantId: variantIds[1], quantity: 3 },
        `owner-b-${runId}`,
      ),
    ]);

    const [ownerA, ownerB] = await Promise.all([
      prisma.cart.findUniqueOrThrow({
        where: { guestTokenHash: tokenA },
        include: { items: true },
      }),
      prisma.cart.findUniqueOrThrow({
        where: { guestTokenHash: tokenB },
        include: { items: true },
      }),
    ]);
    expect(ownerA.items).toEqual([
      expect.objectContaining({ variantId: variantIds[0], quantity: 2 }),
    ]);
    expect(ownerB.items).toEqual([
      expect.objectContaining({ variantId: variantIds[1], quantity: 3 }),
    ]);
  });

  it('refreshes the rolling 24-hour idle deadline on an active read', async () => {
    const originalExpiry = new Date(Date.now() + 60_000);
    await prisma.cart.create({
      data: {
        guestTokenHash: tokenA,
        guestExpiresAt: originalExpiry,
      },
    });

    const result = await cart.getForToken(tokenA);
    const stored = await prisma.cart.findUniqueOrThrow({
      where: { guestTokenHash: tokenA },
    });

    expect(result.credentialState).toBe('active');
    expect(stored.guestExpiresAt?.getTime()).toBeGreaterThan(
      originalExpiry.getTime(),
    );
    expect(stored.guestExpiresAt?.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1_000,
    );
  });

  it('atomically merges once under concurrent retry, invalidates the guest owner and replays after cookie clearing', async () => {
    await prisma.cart.create({
      data: {
        customerId,
        items: {
          create: { variantId: variantIds[0], quantity: 98 },
        },
      },
    });
    await prisma.cart.create({
      data: {
        guestTokenHash: tokenA,
        guestExpiresAt: new Date(Date.now() + 86_400_000),
        items: {
          createMany: {
            data: [
              { variantId: variantIds[0], quantity: 5 },
              { variantId: variantIds[1], quantity: 2 },
            ],
          },
        },
      },
    });
    const key = `merge-${runId}`;

    const [first, second] = await Promise.all([
      cart.mergeForUser(userId, tokenA, key, `request-a-${runId}`),
      cart.mergeForUser(userId, tokenA, key, `request-b-${runId}`),
    ]);

    expect(first).toEqual(second);
    expect(first.data.warnings).toEqual([
      { variantId: variantIds[0], code: 'QUANTITY_CAPPED' },
    ]);
    const customer = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
      include: { items: { orderBy: { variantId: 'asc' } }, mutations: true },
    });
    expect(customer.items).toEqual([
      expect.objectContaining({ variantId: variantIds[0], quantity: 99 }),
      expect.objectContaining({ variantId: variantIds[1], quantity: 2 }),
    ]);
    expect(customer.mutations).toHaveLength(1);

    await expect(
      prisma.cart.count({ where: { guestTokenHash: tokenA } }),
    ).resolves.toBe(0);

    await expect(
      cart.mergeForUser(userId, null, key, `request-replay-${runId}`),
    ).resolves.toEqual(first);
    await expect(
      prisma.auditLog.count({
        where: { action: 'cart.guest.merged', entityId: customer.id },
      }),
    ).resolves.toBe(1);
  });

  it('returns an empty view and removes an expired guest cart', async () => {
    const now = Date.now();
    await prisma.cart.create({
      data: {
        guestTokenHash: tokenA,
        createdAt: new Date(now - 2_000),
        guestExpiresAt: new Date(now - 1_000),
      },
    });

    const result = await cart.getForToken(tokenA);

    expect(result.credentialState).toBe('expired');
    expect(result.response.data.cart).toMatchObject({ id: null, lines: [] });
    await expect(
      prisma.cart.count({ where: { guestTokenHash: tokenA } }),
    ).resolves.toBe(0);
  });

  it('sweeps only a bounded expired batch and safely rechecks concurrent cleanup', async () => {
    const now = new Date();
    const expired = await prisma.cart.create({
      data: {
        guestTokenHash: tokenA,
        createdAt: new Date(now.getTime() - 2_000),
        guestExpiresAt: new Date(now.getTime() - 1_000),
        items: { create: { variantId: variantIds[0], quantity: 1 } },
        guestMutations: {
          create: {
            scope: 'guest-cart.cleanup:test',
            keyHash: digestSeed(`cleanup-key-${runId}`),
            fingerprint: digestSeed(`cleanup-fingerprint-${runId}`),
            responseJson: { data: { cart: { id: 'expired' } } },
            expiresAt: new Date(now.getTime() + 60_000),
          },
        },
      },
    });
    await prisma.cart.create({
      data: {
        guestTokenHash: tokenB,
        guestExpiresAt: new Date(now.getTime() + 60_000),
      },
    });

    const deleted = await Promise.all([
      cart.sweepExpired(now, 1),
      cart.sweepExpired(now, 1),
    ]);

    expect(deleted.reduce((total, count) => total + count, 0)).toBe(1);
    await expect(
      prisma.cart.count({ where: { id: expired.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.cart.count({ where: { guestTokenHash: tokenB } }),
    ).resolves.toBe(1);
  });

  async function seedGuestCart(tokenHash: string): Promise<void> {
    await prisma.cart.create({
      data: {
        guestTokenHash: tokenHash,
        guestExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  }

  async function resetState(): Promise<void> {
    await prisma.auditLog.deleteMany({
      where: { action: 'cart.guest.merged', actorId: userId },
    });
    await prisma.cartMutation.deleteMany({ where: { customerId } });
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { customerId },
          { guestTokenHash: { in: [tokenA, tokenB, replacement] } },
        ],
      },
    });
  }
});

function digestSeed(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}

function numericSuffix(value: string): string {
  return value
    .replace(/[^0-9a-f]/giu, '')
    .split('')
    .map((character) => Number.parseInt(character, 16) % 10)
    .join('')
    .padEnd(9, '0')
    .slice(0, 9);
}
