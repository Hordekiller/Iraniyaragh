import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { ShippingSettingsService } from './shipping-settings.service';

describe.sequential('Shipping settings database integration', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const actorId = `shipping_settings_${suffix}`;
  const code = `shipping-${suffix}`;
  const prisma = new PrismaService();
  const service = new ShippingSettingsService(prisma, new AuditLogService(prisma));
  const input = { title: 'ارسال آزمون', amount: { amount: '50000', currency: 'IRR' as const }, isActive: false, expectedVersion: null };
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    await prisma.user.create({ data: { id: actorId, email: `${suffix}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60000) } });
  });
  afterAll(async () => {
    if (!connected) return;
    await prisma.shippingMethodMutation.deleteMany({ where: { actorId } });
    await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.shippingMethod.deleteMany({ where: { code } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('creates one inactive tariff and one audit across concurrent same-key requests', async () => {
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => service.update(actorId, `req-${suffix}`, code, input, 'create-key')));
    for (const result of outcomes) expect(result).toEqual(outcomes[0]);
    expect(outcomes[0]).toMatchObject({ code, version: 0, isActive: false, amount: input.amount });
    await expect(prisma.shippingMethod.count({ where: { code } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { actorId } })).resolves.toBe(1);
    await expect(prisma.shippingMethodMutation.count({ where: { actorId } })).resolves.toBe(1);
  });

  it('rejects same-key changed payload without changing the tariff', async () => {
    await expect(service.update(actorId, 'req-conflict', code, { ...input, amount: { amount: '1', currency: 'IRR' } }, 'create-key'))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(prisma.shippingMethod.findUnique({ where: { code } })).resolves.toMatchObject({ amount: 50000n, version: 0 });
  });

  it('changes revision on update, preserves replay evidence after another change and prevents stale writers', async () => {
    const first = await service.update(actorId, 'req-first', code, input, 'create-key');
    const update = { ...input, isActive: true, amount: { amount: '70000', currency: 'IRR' as const }, expectedVersion: 0 };
    const second = await service.update(actorId, 'req-update', code, update, 'update-key');
    expect(second.version).toBe(1);
    expect(second.policyRevision).not.toBe(first.policyRevision);
    expect(await service.update(actorId, 'req-old-replay', code, input, 'create-key')).toEqual(first);
    await expect(service.update(actorId, 'req-stale', code, update, 'other-key')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    expect((await service.list()).find((item) => item.code === code)).toEqual(second);
  });

  it('allows only one concurrent update of the same current version', async () => {
    const results = await Promise.allSettled([80000, 90000].map((amount) => service.update(actorId, 'req-race', code,
      { ...input, expectedVersion: 1, amount: { amount: String(amount), currency: 'IRR' } }, `race-${amount}`)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_VERSION' } } });
    await expect(prisma.shippingMethod.findUnique({ where: { code } })).resolves.toMatchObject({ version: 2 });
  });

  it.each(['-1', '1.5', '01', '9223372036854775808'])('rejects invalid IRR %s before writing', async (amount) => {
    await expect(service.update(actorId, 'req-invalid', code, { ...input, amount: { amount, currency: 'IRR' } }, 'invalid-key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });
});
