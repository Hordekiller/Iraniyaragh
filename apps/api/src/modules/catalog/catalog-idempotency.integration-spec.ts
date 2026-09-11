import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogService } from './catalog.service';

describe.sequential('Catalog mutation idempotency database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const requestIdPrefix = `cat-idem-${runId}`;
  const prisma = new PrismaService();
  const catalog = new CatalogService(prisma, new AuditLogService(prisma), new CatalogIdempotencyService(prisma));
  const key = (name: string) => `idem-${name}-${runId}`;
  let actorId = '';
  let secondActorId = '';
  let connected = false;

  const productInput = (suffix: string) => ({
    name: `Idempotent Product ${suffix}`,
    slug: `idempotent-product-${suffix}-${runId}`,
    variants: [{
      sku: `IDEM-SKU-${suffix}-${runId}`,
      costPrice: { amount: '100000', currency: 'IRR' as const },
      salePrice: { amount: '125000', currency: 'IRR' as const },
    }],
  });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    const mobileSuffix = runId.replace(/\D/g, '').padEnd(7, '7').slice(0, 7);
    const createdAt = new Date(Date.now() - 60_000);
    const actor = await prisma.user.create({ data: { mobile: `+98912${mobileSuffix}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt } });
    const secondActor = await prisma.user.create({ data: { mobile: `+98913${mobileSuffix}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt } });
    actorId = actor.id;
    secondActorId = secondActor.id;
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: requestIdPrefix } } });
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: `idempotent-product-` } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: `idempotent-product-` } } });
    await prisma.catalogIdempotencyRecord.deleteMany({ where: { actorId: { in: [actorId, secondActorId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [actorId, secondActorId] } } });
    await prisma.$disconnect();
  });

  it('replays the original response without a second product or audit row', async () => {
    const input = productInput('replay');
    const first = await catalog.createProduct(actorId, key('replay'), input);
    const second = await catalog.createProduct(actorId, key('replay'), input);

    expect(second).toEqual(first);
    await expect(prisma.product.count({ where: { slug: input.slug } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityId: first.data.product.id } })).resolves.toBe(1);
  });

  it('rejects the same key with a different canonical payload', async () => {
    await catalog.createProduct(actorId, key('conflict'), productInput('conflict-a'));
    await expect(catalog.createProduct(actorId, key('conflict'), productInput('conflict-b')))
      .rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_CONFLICT' },
      });
  });

  it('isolates identical keys by actor', async () => {
    const first = await catalog.createProduct(actorId, key('actor'), productInput('actor-a'));
    const second = await catalog.createProduct(secondActorId, key('actor'), productInput('actor-b'));

    expect(first.data.product.id).not.toBe(second.data.product.id);
    await expect(prisma.catalogIdempotencyRecord.count({ where: { scope: 'catalog.product.create', keyHash: { not: '' } } })).resolves.toBeGreaterThanOrEqual(2);
  });

  it('converges concurrent identical commands to one committed product', async () => {
    const input = productInput('race');
    const results = await Promise.allSettled([
      catalog.createProduct(actorId, key('race'), input),
      catalog.createProduct(actorId, key('race'), input),
    ]);
    const fulfilled = results.filter(result => result.status === 'fulfilled');

    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0].value).toEqual(fulfilled[1].value);
    await expect(prisma.product.count({ where: { slug: input.slug } })).resolves.toBe(1);
  });

  it('does not retain an idempotency row when the mutation rolls back', async () => {
    const input = { ...productInput('rollback'), brandId: 'missing-brand' };
    const rawKey = key('rollback');
    await expect(catalog.createProduct(actorId, key('rollback'), input)).rejects.toMatchObject({
      response: { code: 'INVALID_REFERENCE' },
    });
    await expect(prisma.catalogIdempotencyRecord.count({
      where: {
        actorId,
        scope: 'catalog.product.create',
        keyHash: createHash('sha256').update(rawKey, 'utf8').digest('hex'),
      },
    })).resolves.toBe(0);
    await expect(prisma.product.count({ where: { slug: input.slug } })).resolves.toBe(0);
  });
});
