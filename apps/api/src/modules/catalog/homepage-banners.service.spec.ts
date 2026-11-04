import { describe, expect, it, vi } from 'vitest';
import type { HomepageBannerInput } from '@iranyaragh/contracts';
import { isLive, isSafeBannerHref, validateBanners } from './homepage-banners.service';

const banner = (over: Partial<HomepageBannerInput> = {}): HomepageBannerInput => ({
  id: 'b1', title: 'لولا', subtitle: null, ctaLabel: 'مشاهده', href: '/categories/hinges', desktopMediaId: 'm1', mobileMediaId: null,
  imageAlt: 'لولا', enabled: true, publishAt: null, unpublishAt: null, ...over,
});

describe('homepage banners', () => {
  it.each(['/categories/x', 'https://example.com/a'])('accepts %s', href => expect(isSafeBannerHref(href)).toBe(true));
  it.each(['//evil.com', 'javascript:alert(1)', 'http://x.com', '/a b', '/\\evil', 'data:text/html,x'])('rejects %s', href => expect(isSafeBannerHref(href)).toBe(false));

  it('validates, trims and normalises dates', () => {
    const [b] = validateBanners({ expectedVersion: 0, banners: [banner({ title: '  لولا ', publishAt: '2026-11-05T00:00:00+03:30' })] });
    expect(b!.title).toBe('لولا');
    expect(b!.publishAt).toBe('2026-11-04T20:30:00.000Z');
  });
  it('rejects more than four, duplicate ids, unsafe links and inverted windows', () => {
    const five = Array.from({ length: 5 }, (_, i) => banner({ id: `b${i}` }));
    expect(() => validateBanners({ expectedVersion: 0, banners: five })).toThrow();
    expect(() => validateBanners({ expectedVersion: 0, banners: [banner(), banner()] })).toThrow();
    expect(() => validateBanners({ expectedVersion: 0, banners: [banner({ href: 'javascript:1' })] })).toThrow();
    expect(() => validateBanners({ expectedVersion: 0, banners: [banner({ publishAt: '2026-11-05T00:00:00Z', unpublishAt: '2026-11-04T00:00:00Z' })] })).toThrow();
  });
  it('honours enable flag and schedule', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(isLive(banner(), now)).toBe(true);
    expect(isLive(banner({ enabled: false }), now)).toBe(false);
    expect(isLive(banner({ publishAt: '2026-11-05T00:00:00Z' }), now)).toBe(false);
    expect(isLive(banner({ unpublishAt: '2026-11-04T11:00:00Z' }), now)).toBe(false);
  });
});

import { HomepageBannersService } from './homepage-banners.service';
import { HomepageBannersController } from './homepage-banners.controller';

const rendition = [{ objectKey: 'p/a.webp', width: 1200, height: 600 }];
function fixture(stored: unknown[] = [], version = 1) {
  const media = { findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id?.in ?? ['m1']).filter(id => id !== 'missing').map(id => ({ id, altText: 'alt', renditions: rendition, product: { name: 'P' } }))) };
  const row = stored.length || version ? { version, banners: stored, updatedAt: new Date('2026-11-04T00:00:00Z') } : null;
  const tx = {
    $executeRaw: vi.fn(), productMedia: media,
    homepageBannerCommand: { findUnique: vi.fn(async () => null), create: vi.fn() },
    homepageBannerConfig: { findUnique: vi.fn(async () => row), update: vi.fn(async ({ data }: { data: { version: number; banners: unknown } }) => ({ ...data, updatedAt: new Date() })), create: vi.fn(async ({ data }: { data: object }) => ({ ...data, updatedAt: new Date() })) },
  };
  const prisma = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const audit = { record: vi.fn() };
  const config = { get: () => 'https://cdn.test/products' };
  return { tx, prisma, audit, service: new HomepageBannersService(prisma as never, audit as never, config as never) };
}

describe('HomepageBannersService', () => {
  it('exposes only live banners with resolvable images publicly', async () => {
    const { service } = fixture([banner({ id: 'on' }), banner({ id: 'off', enabled: false }), banner({ id: 'noimg', desktopMediaId: 'missing' })]);
    const { banners } = await service.readPublic();
    expect(banners.map(b => b.id)).toEqual(['on']);
    expect(banners[0]!.desktopImage.url).toBe('https://cdn.test/products/p/a.webp');
  });
  it('lists media options', async () => {
    const { service } = fixture();
    expect((await service.mediaOptions())[0]).toMatchObject({ id: 'm1', productName: 'P' });
  });
  it('saves with version bump, audit and idempotency record', async () => {
    const { service, audit, tx } = fixture([banner()], 1);
    const result = await service.update('actor', 'req', { expectedVersion: 1, banners: [banner({ title: 'new' })] }, 'key-12345678');
    expect(result.version).toBe(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.homepage_banners.updated' }), tx);
    expect(tx.homepageBannerCommand.create).toHaveBeenCalled();
  });
  it('creates the first config row', async () => {
    const { service, tx } = fixture([], 0);
    await service.update('a', 'r', { expectedVersion: 0, banners: [banner()] }, 'key-12345678');
    expect(tx.homepageBannerConfig.create).toHaveBeenCalled();
  });
  it('rejects stale versions and non-ready media', async () => {
    const { service } = fixture([banner()], 3);
    await expect(service.update('a', 'r', { expectedVersion: 1, banners: [] }, 'key-12345678')).rejects.toMatchObject({ status: 409 });
    await expect(service.update('a', 'r', { expectedVersion: 3, banners: [banner({ desktopMediaId: 'missing' })] }, 'key-12345678')).rejects.toMatchObject({ status: 400 });
  });
  it('replays an identical retry and rejects a different payload for the same key', async () => {
    const f = fixture([banner()], 1);
    const body = { expectedVersion: 1, banners: [banner()] };
    await f.service.update('a', 'r', body, 'key-12345678');
    const payloadHash = (f.tx.homepageBannerCommand.create.mock.calls[0]![0] as { data: { payloadHash: string } }).data.payloadHash;
    f.tx.homepageBannerCommand.findUnique.mockResolvedValue({ payloadHash, response: { version: 2 } } as never);
    await expect(f.service.update('a', 'r', body, 'key-12345678')).resolves.toEqual({ version: 2 });
    f.tx.homepageBannerCommand.findUnique.mockResolvedValue({ payloadHash: 'x', response: {} } as never);
    await expect(f.service.update('a', 'r', body, 'key-12345678')).rejects.toMatchObject({ status: 409 });
  });
  it('controller delegates to the service', async () => {
    const service = { readPublic: vi.fn(async () => ({ banners: [] })), readAdmin: vi.fn(async () => ({ version: 0 })), mediaOptions: vi.fn(async () => []), update: vi.fn(async () => ({ version: 1 })) };
    const controller = new HomepageBannersController(service as never);
    expect(await controller.publicConfig()).toEqual({ data: { banners: [] } });
    expect(await controller.adminConfig()).toEqual({ data: { config: { version: 0 } } });
    expect(await controller.mediaOptions()).toEqual({ data: { items: [] } });
    await controller.update({ userId: 'u' } as never, 'key-12345678', { expectedVersion: 0, banners: [] } as never);
    expect(service.update).toHaveBeenCalledWith('u', expect.anything(), expect.anything(), 'key-12345678');
  });
});
