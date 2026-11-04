import { describe, expect, it } from 'vitest';
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
