import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import type { BlogPostInput, BlogSource } from '@iranyaragh/contracts';
import { ContentTooLargeError, sanitizeDescriptionFragment } from '../content/content-sanitizer';
import { Parser } from 'htmlparser2';
import { isCanonicalSlug } from '../discovery/discovery.policy';

// Value imports from the unbuilt contracts package crash compiled Node; keep in sync with blog.ts.
export const BLOG_MAX_TAGS = 8;
export const BLOG_MAX_SOURCES = 10;
/** Thin-content guard: an article must carry real prose before it can go live. */
export const BLOG_MIN_PUBLISH_TEXT = 300;
const WORDS_PER_MINUTE = 200;

const invalid = (message: string) => new BadRequestException({ code: 'INVALID_REQUEST', message });
const within = (value: unknown, max: number, min = 0): value is string => typeof value === 'string' && value.trim().length >= min && value.length <= max;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** Text content of sanitized HTML. Entities are decoded in a single pass so `&amp;lt;` stays `&lt;`. */
export function plainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['style', 'script', 'textarea', 'option'] })
    .replace(/&(?:amp|lt|gt|quot|#39);/gu, entity => ENTITIES[entity]!)
    .replace(/\s+/gu, ' ').trim();
}
export function readingMinutes(html: string): number {
  const words = plainText(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
/** The page title is the only h1; authors' h1 headings are demoted so the outline stays valid. */
export function demoteH1(html: string): string {
  return html.replace(/<h1(\s[^>]*)?>/giu, (_m, attrs: string | undefined) => `<h2${attrs ?? ''}>`).replace(/<\/h1>/giu, '</h2>');
}
export function normalizeTag(tag: string): string {
  return tag.normalize('NFC').replace(/[‌‏‎]+/gu, '‌').replace(/\s+/gu, ' ').trim();
}
function isHttpsUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && value.length <= 500; } catch { return false; }
}

export type ValidatedBlogInput = Omit<BlogPostInput, 'bodyHtml'> & { bodyHtml: string };
export type ValidatedBlogDraft = ValidatedBlogInput & { /** Media referenced from the body, in document order. */ imageIds: string[] };

export type BlogBodyImage = { id: string; url: string; width: number; height: number; altText: string | null };
const escapeAttr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Replace each `<img data-media-id>` with a server-built image: real URL and dimensions from the
 * authoritative media row, the editor's own alt text (falling back to the media's), lazy loading.
 * Every image must end up with alt text; unresolved ids are an error, never a silent drop.
 */
export function rewriteBlogImages(html: string, images: readonly BlogBodyImage[]): string {
  const byId = new Map(images.map(image => [image.id, image]));
  return html.replace(/<img\b[^>]*>/giu, tag => {
    let id = ''; let alt = '';
    new Parser({ onopentag(_name, attribs) { id = attribs['data-media-id'] ?? ''; alt = (attribs.alt ?? '').trim(); } }).end(tag);
    const image = byId.get(id);
    if (!image) throw invalid('An image in the article is not an available, processed image.');
    const text = alt || image.altText?.trim() || '';
    if (!text) throw invalid('Every image in the article needs alt text.');
    return `<img data-media-id="${escapeAttr(image.id)}" src="${escapeAttr(image.url)}" width="${image.width}" height="${image.height}" alt="${escapeAttr(text.slice(0, 200))}" loading="lazy" decoding="async">`;
  });
}

/** Validate and normalise editor input. The body is sanitized here; callers never persist raw HTML. */
export function validateBlogInput(input: BlogPostInput): ValidatedBlogDraft {
  if (!input || typeof input !== 'object') throw invalid('Article body is missing.');
  if (!within(input.slug, 250, 1) || !isCanonicalSlug(input.slug)) throw invalid('Slug must use lowercase letters, Persian letters, digits and single hyphens.');
  if (!within(input.title, 160, 1)) throw invalid('Title is required (at most 160 characters).');
  if (!within(input.excerpt, 400, 1)) throw invalid('Excerpt is required (at most 400 characters).');
  if (typeof input.bodyHtml !== 'string') throw invalid('Article text is required.');
  if (input.seoTitle !== null && !within(input.seoTitle, 70)) throw invalid('SEO title is at most 70 characters.');
  if (input.seoDescription !== null && !within(input.seoDescription, 200)) throw invalid('SEO description is at most 200 characters.');
  if (input.coverMediaId !== null && !(typeof input.coverMediaId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(input.coverMediaId))) throw invalid('Cover image id is invalid.');
  if (input.coverMediaId !== null && !within(input.coverAlt, 200, 1)) throw invalid('Cover image alt text is required.');
  if (!Array.isArray(input.tags) || input.tags.length > BLOG_MAX_TAGS) throw invalid(`At most ${BLOG_MAX_TAGS} tags are allowed.`);
  const tags = [...new Set(input.tags.map(tag => (typeof tag === 'string' ? normalizeTag(tag) : '')))];
  if (tags.some(tag => tag.length < 1 || tag.length > 40)) throw invalid('Each tag must be 1–40 characters.');
  if (!Array.isArray(input.sources) || input.sources.length > BLOG_MAX_SOURCES) throw invalid(`At most ${BLOG_MAX_SOURCES} sources are allowed.`);
  const sources: BlogSource[] = input.sources.map(source => {
    const ok = source && within(source.title, 200, 1) && typeof source.url === 'string' && isHttpsUrl(source.url) && typeof source.accessedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(source.accessedAt) && !Number.isNaN(Date.parse(source.accessedAt));
    if (!ok) throw invalid('Each source needs a title, an https URL and an access date (YYYY-MM-DD).');
    return { title: source.title.trim(), url: new URL(source.url).href, accessedAt: source.accessedAt };
  });
  let bodyHtml: string; let imageIds: string[];
  try {
    // Images are kept only as media references; the service resolves them against READY media rows.
    const fragment = sanitizeDescriptionFragment(input.bodyHtml, { images: 'preserve', limit: 200_000 });
    bodyHtml = demoteH1(fragment.html ?? ''); imageIds = fragment.imageIds;
    if (imageIds.length > 20) throw invalid('At most 20 images are allowed in one article.');
  } catch (error) {
    if (error instanceof ContentTooLargeError) throw invalid('Article text is too large.');
    throw error;
  }
  return {
    slug: input.slug, title: input.title.trim(), excerpt: input.excerpt.trim(), bodyHtml,
    coverMediaId: input.coverMediaId, coverAlt: input.coverMediaId ? input.coverAlt!.trim() : null,
    tags, seoTitle: input.seoTitle?.trim() || null, seoDescription: input.seoDescription?.trim() || null, sources, imageIds,
  };
}

/** Problems that block publication (drafts may be incomplete). */
export function publishBlockers(post: Pick<ValidatedBlogInput, 'bodyHtml' | 'excerpt' | 'title'>): string[] {
  const blockers: string[] = [];
  if (plainText(post.bodyHtml).length < BLOG_MIN_PUBLISH_TEXT) blockers.push(`Article text must contain at least ${BLOG_MIN_PUBLISH_TEXT} characters.`);
  if (post.excerpt.trim().length < 50) blockers.push('Excerpt must contain at least 50 characters.');
  return blockers;
}

/** Keys of an input whose change counts as a significant public content change. */
export const SIGNIFICANT_FIELDS = ['slug', 'title', 'excerpt', 'bodyHtml', 'coverMediaId', 'coverAlt', 'seoTitle', 'seoDescription', 'sources', 'tags'] as const;
export function significantlyChanged(before: ValidatedBlogInput, after: ValidatedBlogInput): boolean {
  return SIGNIFICANT_FIELDS.some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}
