import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingSettingsService } from './shipping-settings.service';

const initial = { id: 'method', code: 'post', title: 'پست', amount: 50000n, isActive: false, version: 0, policyRevision: 'old', updatedAt: new Date('2026-10-08T00:00:00Z') };
const input = { title: 'پست', amount: { amount: '50000', currency: 'IRR' as const }, isActive: false, expectedVersion: null };
function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    shippingMethod: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([initial]), count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }) => ({ ...initial, ...data })), update: vi.fn().mockImplementation(async ({ data }) => ({ ...initial, ...data, version: 1 })) },
    shippingMethodMutation: { deleteMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const audit = { record: vi.fn() };
  const prisma = { ...tx, $transaction: vi.fn(async (operation: (value: typeof tx) => unknown) => operation(tx)) };
  return { tx, audit, service: new ShippingSettingsService(prisma as never, audit as never) };
}
describe('Shipping configuration commands', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });
  it('lists bounded safe configuration including inactive tariffs', async () => {
    expect(await ctx.service.list()).toEqual([{ code: 'post', title: 'پست', amount: input.amount, isActive: false, version: 0, policyRevision: 'old', updatedAt: initial.updatedAt.toISOString() }]);
    expect(ctx.tx.shippingMethod.findMany).toHaveBeenCalledWith({ orderBy: { code: 'asc' }, take: 100 });
  });
  it('stores approved IRR configuration with actor-bound retry evidence and audit', async () => {
    const result = await ctx.service.update('actor', 'req', 'post', input, 'key');
    expect(result).toMatchObject({ amount: input.amount, version: 0, isActive: false });
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'shipping.method.created', actorId: 'actor', requestId: 'req' }), ctx.tx);
    const record = ctx.tx.shippingMethodMutation.create.mock.calls[0]![0].data;
    expect(record).toMatchObject({ actorId: 'actor', code: 'post', response: result });
    expect(record.keyHash).not.toBe('key');
    ctx.tx.shippingMethodMutation.findUnique.mockResolvedValue(record);
    expect(await ctx.service.update('actor', 'req-retry', 'post', input, 'key')).toEqual(result);
    expect(ctx.audit.record).toHaveBeenCalledOnce();
    await expect(ctx.service.update('actor', 'req-changed', 'post', { ...input, title: 'تغییر' }, 'key')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });
  it('increments version and invalidates quotes by generating a new revision', async () => {
    ctx.tx.shippingMethod.findUnique.mockResolvedValue(initial);
    const result = await ctx.service.update('actor', 'req', 'post', { ...input, expectedVersion: 0, isActive: true }, 'key');
    expect(result.version).toBe(1); expect(result.policyRevision).not.toBe('old');
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'shipping.method.updated', before: expect.objectContaining({ version: 0 }) }), ctx.tx);
  });
  it('refuses stale writers and unbounded method creation', async () => {
    ctx.tx.shippingMethod.findUnique.mockResolvedValue(initial);
    await expect(ctx.service.update('actor', 'req', 'post', input, 'key')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    ctx.tx.shippingMethod.findUnique.mockResolvedValue(null); ctx.tx.shippingMethod.count.mockResolvedValue(100);
    await expect(ctx.service.update('actor', 'req', 'post', input, 'key')).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(ctx.tx.shippingMethod.create).not.toHaveBeenCalled();
  });
  it.each(['-1', '1.5', '01', '9223372036854775808'])('rejects invalid integer IRR %s before transaction', async (amount) => {
    await expect(ctx.service.update('actor', 'req', 'post', { ...input, amount: { amount, currency: 'IRR' } }, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    expect(ctx.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects title controls, noncanonical codes and unsupported currency', async () => {
    await expect(ctx.service.update('actor', 'req', 'POST', input, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    await expect(ctx.service.update('actor', 'req', 'post', { ...input, title: 'bad\nname' }, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    await expect(ctx.service.update('actor', 'req', 'post', { ...input, amount: { amount: '1', currency: 'IRT' } } as never, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });
});
