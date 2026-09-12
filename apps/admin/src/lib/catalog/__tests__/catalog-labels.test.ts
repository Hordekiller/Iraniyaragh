import { describe, expect, it } from 'vitest';
import {
  AMOUNT_PATTERN,
  SLUG_PATTERN,
  catalogStatusLabel,
  catalogStatusTone,
  displayAmount,
  formatRial,
  normalizeSlug,
} from '../catalog-labels';

describe('catalog-labels', () => {
  it('maps statuses to localized labels and tones', () => {
    expect(catalogStatusLabel('DRAFT')).toBe('پیش‌نویس');
    expect(catalogStatusLabel('PUBLISHED')).toBe('منتشرشده');
    expect(catalogStatusLabel('ARCHIVED')).toBe('بایگانی‌شده');
    expect(catalogStatusTone('PUBLISHED')).toBe('success');
    expect(catalogStatusTone('DRAFT')).toBe('neutral');
    expect(catalogStatusTone('ARCHIVED')).toBe('error');
  });

  it('validates slug and amount patterns', () => {
    expect(SLUG_PATTERN.test('lock-handle-brass')).toBe(true);
    expect(SLUG_PATTERN.test('Lock_Handle')).toBe(false);
    expect(SLUG_PATTERN.test('')).toBe(false);
    expect(AMOUNT_PATTERN.test('150000')).toBe(true);
    expect(AMOUNT_PATTERN.test('1,500')).toBe(false);
    expect(AMOUNT_PATTERN.test('12345678901234567890')).toBe(false);
  });

  it('formats Rial amounts with Persian digits', () => {
    expect(formatRial({ amount: '150000', currency: 'IRR' })).toBe('۱۵۰٬۰۰۰ ریال');
    expect(displayAmount('20000')).toBe('۲۰٬۰۰۰');
  });

  it('falls back gracefully for malformed amounts', () => {
    expect(formatRial({ amount: '', currency: 'IRR' })).toBe(' ریال');
    expect(formatRial({ amount: 'abc', currency: 'IRR' })).toBe('abc ریال');
  });

  it('normalizes slugs from user typing', () => {
    expect(normalizeSlug('Lock Handle Brass!')).toBe('lock-handle-brass');
    expect(normalizeSlug('  ')).toBe('');
    expect(normalizeSlug('A---B')).toBe('a-b');
  });
});