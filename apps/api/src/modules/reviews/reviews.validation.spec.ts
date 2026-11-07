import { describe, expect, it } from 'vitest';
import { cleanText, publicAuthorName, validateNote, validateReply, validateReviewInput } from './reviews.validation';
import { MODERATION, summarize } from './reviews.service';

const ok = { rating: 4, title: 'کیفیت عالی', body: 'درب بسیار محکم و تمیز نصب شد، راضی هستم.' };

describe('review validation', () => {
  it('accepts a normal review and normalises whitespace', () => {
    expect(validateReviewInput({ ...ok, body: '  درب بسیار   محکم است \n\n\n\n و تمیز  ' })).toEqual({ rating: 4, title: 'کیفیت عالی', body: 'درب بسیار محکم است\n\nو تمیز' });
  });
  it.each([0, 6, 3.5, NaN])('rejects rating %s', rating => { expect(() => validateReviewInput({ ...ok, rating })).toThrow(); });
  it('rejects too-short and too-long bodies', () => {
    expect(() => validateReviewInput({ ...ok, body: 'خوب' })).toThrow();
    expect(() => validateReviewInput({ ...ok, body: 'ا'.repeat(2001) })).toThrow();
  });
  it('rejects links, e-mail, phone numbers (Latin and Persian digits) and markup', () => {
    for (const body of ['برای خرید به www.shop.ir مراجعه کنید', 'ایمیل من a@b.com است عالی', 'تماس بگیرید ۰۹۱۲۳۴۵۶۷۸۹ لطفا', 'call 09123456789 now please', 'متن <b>درشت</b> است و طولانی', 'کانال t.me/abc بسیار خوب بود']) {
      expect(() => validateReviewInput({ ...ok, body })).toThrow();
    }
  });
  it('treats an empty title as none and strips invisible characters', () => {
    expect(validateReviewInput({ ...ok, title: '   ' }).title).toBeNull();
    expect(cleanText('a‮b​c')).toBe('abc');
  });
  it('requires a reason for reject/hide notes and bounds the reply', () => {
    expect(() => validateNote('', true)).toThrow();
    expect(validateNote('', false)).toBeNull();
    expect(validateReply('   ')).toBeNull();
    expect(() => validateReply('x'.repeat(1001))).toThrow();
  });
  it('never exposes more than first name and last initial', () => {
    expect(publicAuthorName('احمد', 'رضایی')).toBe('احمد ر.');
    expect(publicAuthorName(null, null)).toBe('خریدار فروشگاه');
  });
});

describe('review aggregates and moderation graph', () => {
  it('summarises distribution and rounds the average to one decimal', () => {
    expect(summarize([])).toEqual({ count: 0, average: null, counts: [0, 0, 0, 0, 0] });
    expect(summarize([[5, 2], [4, 1]])).toEqual({ count: 3, average: 4.7, counts: [0, 0, 0, 1, 2] });
  });
  it('only approves non-live reviews, rejects pending ones and hides live ones', () => {
    expect(MODERATION.approve.from).not.toContain('APPROVED');
    expect(MODERATION.reject.from).toEqual(['PENDING']);
    expect(MODERATION.hide.from).toEqual(['APPROVED']);
  });
});
