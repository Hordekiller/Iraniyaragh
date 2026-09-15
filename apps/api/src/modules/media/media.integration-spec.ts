import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';

describe.sequential('Product media database invariants', () => {
  const prisma = new PrismaService();
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  let connected = false;
  let actorId = '';
  let productId = '';

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    const actor = await prisma.user.create({
      data: { email: `media-${runId}@example.test`, status: 'ACTIVE' },
    });
    actorId = actor.id;
    const product = await prisma.product.create({
      data: { name: `Media ${runId}`, slug: `media-${runId}` },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.productMedia.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  const mediaData = (position: number) => ({
    productId,
    kind: 'IMAGE' as const,
    state: 'READY' as const,
    role: 'PRIMARY' as const,
    position,
    objectKey: `test/${runId}/${randomUUID()}.webp`,
    originalFilename: 'primary.webp',
    declaredMime: 'image/webp',
    declaredBytes: 100n,
    detectedMime: 'image/webp',
    bytes: 100n,
    width: 100,
    height: 100,
    checksumSha256: randomUUID().replaceAll('-', '').repeat(2),
    createdById: actorId,
    uploadExpiresAt: new Date(Date.now() + 60_000),
  });

  it('allows only one active primary under concurrent writes', async () => {
    const results = await Promise.allSettled([
      prisma.productMedia.create({ data: mediaData(0) }),
      prisma.productMedia.create({ data: mediaData(1) }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    await expect(prisma.productMedia.count({
      where: { productId, role: 'PRIMARY', state: { not: 'ARCHIVED' } },
    })).resolves.toBe(1);
  });

  it('releases position and primary uniqueness only after archival', async () => {
    await prisma.productMedia.updateMany({
      where: { productId, role: 'PRIMARY' },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    await expect(prisma.productMedia.create({ data: mediaData(0) })).resolves.toMatchObject({
      productId,
      position: 0,
      role: 'PRIMARY',
    });
  });
});
