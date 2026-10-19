import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { HomepageCollectionsService } from './homepage-collections.service';

function setup() {
  const config = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'storefront', ...data, updatedAt: new Date('2026-10-19T08:00:00Z') })), update: vi.fn() };
  const commands = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() };
  const tx = { $executeRaw: vi.fn(), homepageCollectionConfig: config, homepageCollectionCommand: commands,
    category: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map(id => ({ id }))) } };
  const audit = { record: vi.fn() };
  const prisma = { homepageCollectionConfig: config, $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)) };
  return { tx, config, commands, audit, service: new HomepageCollectionsService(prisma as never, audit as never) };
}

describe('homepage collection configuration', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => { context = setup(); });

  it('returns an explicit empty configuration before an operator selects carousels', async () => {
    expect(await context.service.read()).toEqual({ version: 0, sections: [], updatedAt: null });
  });

  it('persists an ordered selection with versioning, idempotency and audit evidence', async () => {
    const input = { expectedVersion: 0, sections: [{ categoryId: 'hinges', sortBy: 'BESTSELLING' as const }, { categoryId: 'handles', sortBy: 'NEWEST' as const }] };
    const accepted = await context.service.update('staff-1', 'request-1', input, 'stable-key');
    expect(accepted).toMatchObject({ version: 1, sections: input.sections });
    expect(context.tx.homepageCollectionConfig.create).toHaveBeenCalledWith({ data: { id: 'storefront', version: 1, sections: [
      { kind: 'CATEGORY', categoryId: 'hinges', sortBy: 'BESTSELLING' }, { kind: 'CATEGORY', categoryId: 'handles', sortBy: 'NEWEST' },
    ] } });
    expect(context.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.homepage_collections.updated', actorId: 'staff-1', requestId: 'request-1' }), context.tx);
    const command = context.commands.create.mock.calls[0]![0].data;
    expect(command).toMatchObject({ actorId: 'staff-1', response: accepted });
    expect(command.keyHash).not.toBe('stable-key');
    context.commands.findUnique.mockResolvedValue({ ...command });
    await expect(context.service.update('staff-1', 'retry', input, 'stable-key')).resolves.toEqual(accepted);
    await expect(context.service.update('staff-1', 'retry', { ...input, sections: [] }, 'stable-key')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect(context.audit.record).toHaveBeenCalledOnce();
  });

  it('supports one all-products section alongside categories and upgrades legacy sections on read', async () => {
    const input = { expectedVersion: 0, sections: [
      { kind: 'ALL_PRODUCTS' as const, sortBy: 'NEWEST' as const },
      { categoryId: 'hinges', sortBy: 'BESTSELLING' as const },
    ] };
    const accepted = await context.service.update('staff-1', 'request-2', input, 'all-products-key');
    expect(accepted.sections).toEqual([
      { kind: 'ALL_PRODUCTS', sortBy: 'NEWEST' },
      { kind: 'CATEGORY', categoryId: 'hinges', sortBy: 'BESTSELLING' },
    ]);
    expect(context.tx.category.findMany).toHaveBeenCalledWith({ where: { id: { in: ['hinges'] } }, select: { id: true } });

    context.config.findUnique.mockResolvedValue({ id: 'storefront', version: 1, sections: [{ categoryId: 'hinges', sortBy: 'NEWEST' }], updatedAt: new Date() });
    await expect(context.service.read()).resolves.toMatchObject({ sections: [{ kind: 'CATEGORY', categoryId: 'hinges', sortBy: 'NEWEST' }] });
  });

  it('reconciles a category retry created before section kinds were introduced', async () => {
    const input = { expectedVersion: 2, sections: [{ categoryId: 'hinges', sortBy: 'NEWEST' as const }] };
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const oldResponse = { version: 3, sections: input.sections, updatedAt: '2026-10-19T08:00:00.000Z' };
    context.commands.findUnique.mockResolvedValue({
      payloadHash: hash(JSON.stringify({ expectedVersion: 2, sections: input.sections })),
      response: oldResponse,
    });
    await expect(context.service.update('staff-1', 'retry-after-deploy', input, 'stable-key'))
      .resolves.toEqual(oldResponse);
    expect(context.config.update).not.toHaveBeenCalled();
  });

  it('allows both all-products sort modes but rejects an identical duplicate', async () => {
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: [
      { kind: 'ALL_PRODUCTS', sortBy: 'NEWEST' }, { kind: 'ALL_PRODUCTS', sortBy: 'BESTSELLING' },
    ] }, 'both-all')).resolves.toMatchObject({ sections: [
      { kind: 'ALL_PRODUCTS', sortBy: 'NEWEST' }, { kind: 'ALL_PRODUCTS', sortBy: 'BESTSELLING' },
    ] });
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: [
      { kind: 'ALL_PRODUCTS', sortBy: 'NEWEST' }, { kind: 'ALL_PRODUCTS', sortBy: 'NEWEST' },
    ] }, 'duplicate-all')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });

  it('rejects duplicate categories, unsupported sort modes, unknown IDs and stale versions', async () => {
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: [
      { categoryId: 'hinges', sortBy: 'NEWEST' }, { categoryId: 'hinges', sortBy: 'BESTSELLING' },
    ] }, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    context.tx.category.findMany.mockResolvedValue([]);
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: [{ categoryId: 'deleted', sortBy: 'NEWEST' }] }, 'key-2'))
      .rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    context.config.findUnique.mockResolvedValue({ id: 'storefront', version: 2, sections: [], updatedAt: new Date() });
    await expect(context.service.update('staff', 'request', { expectedVersion: 1, sections: [] }, 'key-3'))
      .rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
  });
});
