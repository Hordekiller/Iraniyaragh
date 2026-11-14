import { describe, expect, it, vi } from 'vitest';
import { HomepageHeroService } from './homepage-hero.service';
import { HomepageHeroController } from './homepage-hero.controller';

function fixture(row: { version: number; slides: unknown[]; updatedAt: Date } | null = null) {
  const productMedia = { findMany: vi.fn(async () => []) };
  const homepageHeroConfig = { findUnique: vi.fn(async () => row), create: vi.fn(async ({ data }: { data: { slides: unknown[]; version: number } }) => ({ ...data, updatedAt: new Date() })), update: vi.fn() };
  const homepageHeroCommand = { findUnique: vi.fn(async () => null), create: vi.fn() };
  const tx = { $executeRaw: vi.fn(), productMedia, homepageHeroConfig, homepageHeroCommand };
  const prisma = { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)), homepageBannerConfig: { findUnique: vi.fn() } };
  const audit = { record: vi.fn() };
  const config = { get: (key: string) => key === 'STOREFRONT_ORIGIN' ? 'https://store.example' : 'https://media.example/products' };
  return { service: new HomepageHeroService(prisma as never, audit as never, config as never), prisma, audit, tx };
}

describe('independent homepage hero slider', () => {
  it('publishes three cabinet hardware photos by default and leaves promotional banners alone', async () => {
    const { service, prisma } = fixture();
    const { banners } = await service.readPublic();
    expect(banners.map(slide => slide.id)).toEqual(['cabinet-hinge', 'cabinet-drawer', 'cabinet-handle']);
    expect(banners[0]?.desktopImage.url).toBe('https://store.example/images/cabinet-hinge-hero.webp');
    expect(prisma.homepageBannerConfig.findUnique).not.toHaveBeenCalled();
    expect((await service.mediaOptions()).map(option => option.id)).toEqual(['cabinet-hinge-hero', 'cabinet-drawer-hero', 'cabinet-handle-hero']);
  });
  it('saves editor changes independently, versioned and audited', async () => {
    const { service, prisma, audit, tx } = fixture();
    const current = await service.readAdmin();
    const edited = current.banners.slice(0, 2).map(slide => ({ id: slide.id, title: slide.title + ' جدید', subtitle: slide.subtitle, ctaLabel: slide.ctaLabel, href: slide.href, desktopMediaId: slide.desktopMediaId, mobileMediaId: slide.mobileMediaId, imageAlt: slide.imageAlt, enabled: slide.enabled, publishAt: slide.publishAt, unpublishAt: slide.unpublishAt }));
    const result = await service.update('staff', 'req', { expectedVersion: 0, banners: edited }, 'hero-key-12345678');
    expect(result.version).toBe(1);
    expect(result.banners).toHaveLength(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.homepage_hero.updated' }), tx);
    expect(prisma.homepageBannerConfig.findUnique).not.toHaveBeenCalled();
    expect(tx.homepageHeroCommand.create).toHaveBeenCalledOnce();
  });
  it('rejects stale writes', async () => {
    const { service } = fixture({ version: 2, slides: [], updatedAt: new Date() });
    await expect(service.update('staff', 'req', { expectedVersion: 1, banners: [] }, 'hero-key-12345678')).rejects.toMatchObject({ status: 409 });
  });
  it('exposes the slider through a separate controller', async () => {
    const service = { readPublic: vi.fn(async () => ({ banners: [] })), readAdmin: vi.fn(async () => ({ version: 0, banners: [], updatedAt: null })), mediaOptions: vi.fn(async () => []), update: vi.fn(async () => ({ version: 1, banners: [], updatedAt: null })) };
    const controller = new HomepageHeroController(service as never);
    expect(await controller.publicConfig()).toEqual({ data: { banners: [] } });
    expect(await controller.adminConfig()).toEqual({ data: { config: { version: 0, banners: [], updatedAt: null } } });
  });
});
