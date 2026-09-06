import { describe, expect, it, vi } from 'vitest';
import { discountPercent, formatToman, scrollCarousel } from './carousel';

describe('carousel helpers', () => {
  it('formatToman() renders the fa-IR thousands grouping', () => {
    expect(formatToman(340000)).toBe('۳۴۰٬۰۰۰');
    expect(formatToman(0)).toBe('۰');
  });

  it('discountPercent() rounds to a whole percentage', () => {
    expect(discountPercent(1_700_000, 2_000_000)).toBe(15);
    expect(discountPercent(60_000, 100_000)).toBe(40);
    expect(discountPercent(100_000, 100_000)).toBe(0);
  });

  it('scrollCarousel() scrolls the ref by 340 in the given direction', () => {
    const scrollBy = vi.fn();
    const ref = { current: { scrollBy } as unknown as HTMLDivElement };
    scrollCarousel(ref, 'right');
    expect(scrollBy).toHaveBeenCalledWith({ left: 340, behavior: 'smooth' });

    scrollCarousel(ref, 'left');
    expect(scrollBy).toHaveBeenCalledWith({ left: -340, behavior: 'smooth' });
  });

  it('scrollCarousel() is a no-op when the ref is not attached', () => {
    expect(() => scrollCarousel({ current: null }, 'right')).not.toThrow();
  });
});