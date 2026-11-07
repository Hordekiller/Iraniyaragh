import { BadRequestException } from '@nestjs/common';
import type { ReviewInput } from '@iranyaragh/contracts';

// Value imports from the unbuilt contracts package crash compiled Node; keep in sync with reviews.ts.
export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 2000;
export const REVIEW_TITLE_MAX = 100;
export const REVIEW_REPLY_MAX = 1000;
export const REVIEW_NOTE_MAX = 300;
export const REVIEW_NOTE_MIN = 3;

const invalid = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });
// Zero-width, bidi-override and BOM code points are stripped by code point (no literal invisible characters in source).
const isInvisible = (code: number) => (code >= 0x200b && code <= 0x200d) || code === 0x2060 || code === 0xfeff || (code >= 0x202a && code <= 0x202e);
const isControl = (code: number) => (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
// Links, e-mail addresses and phone-like digit runs are how review spam and off-platform contact leak in.
const LINK = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|ir|net|org|info|me|co)\b|t\.me\/|@[a-z0-9_]{4,})/iu;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const PERSIAN_DIGITS = /[۰-۹٠-٩]/gu;
const digitsOnly = (text: string) => text.replace(PERSIAN_DIGITS, ch => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(ch) % 10));
const PHONE = /(?:\+?98|0)?9\d{9}|\d{8,}/u;

/** Collapse whitespace noise but keep paragraph breaks; strip control and bidi-override characters. */
export function cleanText(value: string): string {
  const kept = [...value.normalize('NFC')].filter(ch => { const code = ch.codePointAt(0)!; return !isInvisible(code) && !isControl(code); }).join('');
  return kept.replace(/\r\n?/gu, '\n').replace(/[ \t]+/gu, ' ').replace(/ ?\n ?/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
}

export function assertNoContactOrLink(text: string, field: string): void {
  if (LINK.test(text) || EMAIL.test(text) || PHONE.test(digitsOnly(text).replace(/[\s-]/gu, ''))) {
    throw invalid(`${field} نباید شامل لینک، ایمیل یا شماره تماس باشد.`);
  }
}

export function validateReviewInput(raw: ReviewInput): ReviewInput {
  if (!raw || typeof raw !== 'object') throw invalid('Review body is required.');
  if (!Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5) throw invalid('امتیاز باید عددی صحیح بین ۱ تا ۵ باشد.');
  if (raw.title !== null && raw.title !== undefined && typeof raw.title !== 'string') throw invalid('عنوان نامعتبر است.');
  if (typeof raw.body !== 'string') throw invalid('متن نظر الزامی است.');
  const title = raw.title ? cleanText(raw.title).replace(/\n+/gu, ' ') : null;
  const body = cleanText(raw.body);
  if (title && title.length > REVIEW_TITLE_MAX) throw invalid(`عنوان حداکثر ${REVIEW_TITLE_MAX} نویسه است.`);
  if (body.length < REVIEW_BODY_MIN) throw invalid(`متن نظر دست‌کم ${REVIEW_BODY_MIN} نویسه باشد.`);
  if (body.length > REVIEW_BODY_MAX) throw invalid(`متن نظر حداکثر ${REVIEW_BODY_MAX} نویسه است.`);
  // Reviews are rendered as plain text, never HTML; refuse markup rather than silently rewriting it.
  if (/[<>]/u.test(body) || (title && /[<>]/u.test(title))) throw invalid('استفاده از نشانه‌گذاری HTML مجاز نیست.');
  assertNoContactOrLink(body, 'متن نظر');
  if (title) assertNoContactOrLink(title, 'عنوان');
  return { rating: raw.rating, title: title || null, body };
}

export function validateNote(note: string | null | undefined, required: boolean): string | null {
  const text = note ? cleanText(note).replace(/\n+/gu, ' ') : '';
  if (required && text.length < REVIEW_NOTE_MIN) throw invalid('برای رد یا پنهان‌کردن نظر، دلیل لازم است.');
  if (text.length > REVIEW_NOTE_MAX) throw invalid(`یادداشت حداکثر ${REVIEW_NOTE_MAX} نویسه است.`);
  return text || null;
}

export function validateReply(reply: string | null | undefined): string | null {
  const text = reply ? cleanText(reply) : '';
  if (text.length > REVIEW_REPLY_MAX) throw invalid(`پاسخ حداکثر ${REVIEW_REPLY_MAX} نویسه است.`);
  if (/[<>]/u.test(text)) throw invalid('استفاده از نشانه‌گذاری HTML مجاز نیست.');
  return text || null;
}

/** Public display name: first name and last initial. Falls back to a neutral label; never the mobile. */
export function publicAuthorName(first: string | null, last: string | null): string {
  const f = first?.trim();
  const l = last?.trim();
  if (f && l) return `${f} ${[...l][0]}.`;
  return f || (l ? `${[...l][0]}.` : 'خریدار فروشگاه');
}
