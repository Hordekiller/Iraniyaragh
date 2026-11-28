import { describe, expect, it, vi } from 'vitest';
import type { ShopContent, ShopUpdate } from '@iranyaragh/contracts';
import { DEFAULT_SHOP_CONTENT, ShopService } from './shop.service';

const banner = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, title: id, subtitle: null, ctaLabel: 'مشاهده', href: '/catalog',
  desktopMediaId: `media-${id}`, mobileMediaId: null, imageAlt: id,
  enabled: true, publishAt: null, unpublishAt: null, ...overrides,
});

function service(content?: ShopContent) {
  const prisma = {
    shopConfig: { findUnique: vi.fn(async () => content ? { content, version: 3, updatedAt: new Date('2026-01-01') } : null) },
    productMedia: { findMany: vi.fn(async () => []) },
  };
  const idempotency = { run: vi.fn() };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => 'https://media.example.test/products') };
  return { shop: new ShopService(prisma as never, idempotency as never, audit as never, config as never), prisma, idempotency, audit };
}

describe('ShopService', () => {
  it('returns safe defaults without creating a shop record', async () => {
    const { shop, prisma } = service();
    expect(await shop.readAdmin()).toMatchObject({ version: 0, updatedAt: null, sections: DEFAULT_SHOP_CONTENT.sections });
    expect(await shop.readPublic()).toMatchObject({ hero: [], banners: [], sections: DEFAULT_SHOP_CONTENT.sections });
    expect(prisma.productMedia.findMany).not.toHaveBeenCalled();
  });

  it('publishes only live, READY images and enabled sections', async () => {
    const content: ShopContent = {
      ...DEFAULT_SHOP_CONTENT,
      hero: [banner('live'), banner('future', { publishAt: '2099-01-01T00:00:00.000Z' }), banner('missing')],
      banners: [banner('disabled', { enabled: false }), banner('live-banner')],
      categoryIds: ['category-1'], brandIds: ['brand-1'],
      sections: [{ ...DEFAULT_SHOP_CONTENT.sections[0]!, enabled: false }, DEFAULT_SHOP_CONTENT.sections[1]!],
    };
    const { shop, prisma } = service(content);
    prisma.productMedia.findMany.mockResolvedValueOnce([
      { id: 'media-live', renditions: [{ objectKey: 'renditions/live.webp', width: 800, height: 600 }] },
      { id: 'media-live-banner', renditions: [{ objectKey: 'renditions/banner.webp', width: 600, height: 300 }] },
    ] as never);
    const published = await shop.readPublic();
    expect(published.hero.map(item => item.id)).toEqual(['live']);
    expect(published.banners.map(item => item.id)).toEqual(['live-banner']);
    expect(published.hero[0]?.desktopImage?.url).toContain('renditions/live.webp');
    expect(published.sections.map(item => item.kind)).toEqual(['offers']);
    expect(published).toMatchObject({ categoryIds: ['category-1'], brandIds: ['brand-1'] });
    expect(prisma.productMedia.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assetScope: 'STOREFRONT', state: 'READY' }) }));
  });

  it('rejects duplicate section identifiers before starting a mutation', async () => {
    const { shop, idempotency } = service();
    const section = DEFAULT_SHOP_CONTENT.sections[0]!;
    const input = { expectedVersion: 0, hero: [], banners: [], categoryIds: [], brandIds: [], sections: [section, section] } as ShopUpdate;
    await expect(shop.update('staff', 'key', input)).rejects.toMatchObject({ status: 400 });
    expect(idempotency.run).not.toHaveBeenCalled();
  });

  it('enforces optimistic version and validates references in the transaction', async () => {
    const { shop, idempotency } = service();
    const input = { expectedVersion: 0, hero: [], banners: [], categoryIds: ['missing'], brandIds: [], sections: [] } as ShopUpdate;
    const tx = {
      $executeRaw: vi.fn(async () => 1), shopConfig: { findUnique: vi.fn(async () => ({ version: 1 })) },
      category: { count: vi.fn(async () => 0) }, brand: { count: vi.fn(async () => 0) },
      product: { count: vi.fn(async () => 0) }, productMedia: { count: vi.fn(async () => 0) },
    };
    idempotency.run.mockImplementation(async ({ execute }) => execute(tx));
    await expect(shop.update('staff', 'key', input)).rejects.toMatchObject({ status: 409 });
    tx.shopConfig.findUnique.mockResolvedValueOnce(null as never);
    await expect(shop.update('staff', 'key2', input)).rejects.toMatchObject({ status: 400 });
    expect(tx.category.count).toHaveBeenCalledWith({ where: { id: { in: ['missing'] } } });
  });

  it('writes a validated configuration, image references and a redacted audit event', async () => {
    const { shop, idempotency, audit } = service();
    const input = { expectedVersion: 0, hero: [banner('new')], banners: [], categoryIds: [], brandIds: [], sections: [] } as ShopUpdate;
    const tx = {
      $executeRaw: vi.fn(async () => 1), shopConfig: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ version: 1, updatedAt: new Date('2026-01-01') })),
      },
      category: { count: vi.fn(async () => 0) }, brand: { count: vi.fn(async () => 0) },
      product: { count: vi.fn(async () => 0) }, productMedia: { count: vi.fn(async () => 1) },
      shopAssetReference: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    };
    idempotency.run.mockImplementation(async ({ execute }) => (await execute(tx)).response);
    expect(await shop.update('staff', 'key', input)).toMatchObject({ version: 1, hero: [{ id: 'new' }] });
    expect(tx.shopAssetReference.createMany).toHaveBeenCalledWith({ data: [{ configId: 'shop', mediaId: 'media-new' }] });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.shop.updated', before: { version: 0 }, after: { version: 1, sectionCount: 0 } }), tx);
  });
});
