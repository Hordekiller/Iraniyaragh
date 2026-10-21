import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCollectionsService } from './homepage-collections.service';

function setup() {
  const config = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'storefront', ...data, updatedAt: new Date('2026-10-19T08:00:00Z') })), update: vi.fn() };
  const commands = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() };
  const roots = Array.from({ length: 6 }, (_, index) => ({ id: `root-${index}`, name: `دسته ${index}`, slug: `root-${index}`, parentId: null, _count: { products: 6 - index } }));
  const tx = { $executeRaw: vi.fn(), homepageCollectionConfig: config, homepageCollectionCommand: commands,
    category: { findMany: vi.fn(async (args?: { where?: { id: { in: string[] } }; select?: unknown }) => args?.where ? args.where.id.in.map(id => ({ id, parentId: null })) : roots) } };
  const audit = { record: vi.fn() };
  const prisma = { homepageCollectionConfig: config, category: tx.category, $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)) };
  return { tx, config, commands, audit, service: new HomepageCollectionsService(prisma as never, audit as never) };
}

describe('homepage collection configuration', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => { context = setup(); });

  it('provides five parent-category defaults, ranked by catalog coverage, before settings are customized', async () => {
    expect(await context.service.read()).toEqual({ version: 0, sections: Array.from({ length: 5 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: 'NEWEST' })), updatedAt: null });
  });

  it('persists an ordered selection with versioning, idempotency and audit evidence', async () => {
    const input = { expectedVersion: 0, sections: Array.from({ length: 5 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: index === 0 ? 'BESTSELLING' as const : 'NEWEST' as const })) };
    const accepted = await context.service.update('staff-1', 'request-1', input, 'stable-key');
    expect(accepted).toMatchObject({ version: 1, sections: input.sections });
    expect(context.tx.homepageCollectionConfig.create).toHaveBeenCalledWith({ data: { id: 'storefront', version: 1, sections: input.sections } });
    expect(context.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.homepage_collections.updated', actorId: 'staff-1', requestId: 'request-1' }), context.tx);
    const command = context.commands.create.mock.calls[0]![0].data;
    expect(command).toMatchObject({ actorId: 'staff-1', response: accepted });
    expect(command.keyHash).not.toBe('stable-key');
    context.commands.findUnique.mockResolvedValue({ ...command });
    await expect(context.service.update('staff-1', 'retry', input, 'stable-key')).resolves.toEqual(accepted);
    await expect(context.service.update('staff-1', 'retry', { ...input, sections: input.sections.map((section, index) => ({ ...section, sortBy: index === 0 ? 'NEWEST' as const : section.sortBy })) }, 'stable-key')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect(context.audit.record).toHaveBeenCalledOnce();
  });

  it('accepts a smaller selection than the maximum, so a catalog with few root categories stays configurable', async () => {
    const input = { expectedVersion: 0, sections: [{ categoryId: 'root-0', sortBy: 'BESTSELLING' as const }] };
    await expect(context.service.update('staff-2', 'request-2', input, 'key-small')).resolves.toMatchObject({ version: 1, sections: input.sections });
    await expect(context.service.update('staff-2', 'request-3', { expectedVersion: 0, sections: [] }, 'key-empty'))
      .rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });

  it('rejects duplicate categories, unsupported sort modes, unknown IDs and stale versions', async () => {
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: [
      ...Array.from({ length: 4 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: 'NEWEST' as const })), { categoryId: 'root-0', sortBy: 'BESTSELLING' as const },
    ] }, 'key')).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    context.tx.category.findMany.mockResolvedValue([]);
    const fiveSections = Array.from({ length: 5 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: 'NEWEST' as const }));
    await expect(context.service.update('staff', 'request', { expectedVersion: 0, sections: fiveSections }, 'key-2'))
      .rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    context.config.findUnique.mockResolvedValue({ id: 'storefront', version: 2, sections: [], updatedAt: new Date() });
    context.tx.category.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map(id => ({ id, parentId: null })));
    await expect(context.service.update('staff', 'request', { expectedVersion: 1, sections: fiveSections }, 'key-3'))
      .rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
  });

  it('normalizes configured subcategories to their parent and fills exactly five unique roots', async () => {
    const roots = Array.from({ length: 6 }, (_, index) => ({ id: `root-${index}`, name: `دسته ${index}`, slug: `root-${index}`, parentId: null, _count: { products: 0 } }));
    const child = { id: 'child-1', name: 'زیر دسته', slug: 'child', parentId: 'root-1', _count: { products: 7 } };
    context.config.findUnique.mockResolvedValue({ id: 'storefront', version: 4, sections: [{ categoryId: 'child-1', sortBy: 'BESTSELLING' }, { categoryId: 'root-1', sortBy: 'NEWEST' }], updatedAt: new Date('2026-10-19T08:00:00Z') });
    context.tx.category.findMany.mockResolvedValue([...roots, child]);
    await expect(context.service.read()).resolves.toMatchObject({ version: 4, sections: [
      { categoryId: 'root-1', sortBy: 'BESTSELLING' }, { categoryId: 'root-0', sortBy: 'NEWEST' }, { categoryId: 'root-2', sortBy: 'NEWEST' },
      { categoryId: 'root-3', sortBy: 'NEWEST' }, { categoryId: 'root-4', sortBy: 'NEWEST' },
    ] });
  });
});
