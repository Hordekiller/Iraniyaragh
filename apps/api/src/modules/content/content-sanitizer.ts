import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';
import { descriptionPresentationAttributes, descriptionStyles } from './description-layout';

/**
 * Server-side rich-text sanitization contract for Product description content
 * (ADR-0016). Clients are untrusted: a browser editor is never the security
 * boundary. All write paths and projections must pass through this module.
 *
 * Image nodes are carried exclusively as `<img data-media-id="...">` and are
 * never trusted for `src`/`width`/`height`; those attributes are rewritten from
 * authoritative Product Media rows by the caller.
 */
export const CONTENT_HTML_LIMIT_UTF16 = 100_000;

const ALLOWED_TAGS = [
  'article', 'section', 'aside', 'header', 'footer', 'details', 'summary',
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'sub',
  'sup',
  'mark',
  'small',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'a',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'figure',
  'figcaption',
  'blockquote',
  'hr',
  'div',
  'span',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['dir', 'lang', 'style', 'class', 'id', 'aria-label'],
  a: ['href', 'target', 'rel', 'title'],
  ol: ['start', 'type', 'reversed'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  details: ['open'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

const NON_TEXT_TAGS = ['script', 'style', 'textarea', 'option', 'svg', 'math'];

const IMG_TAG_PATTERN = /<img\b[^>]*>/giu;
const IMG_MEDIA_ID_PATTERN = /\bdata-media-id\s*=\s*["']([^"']+)["']/u;

export type ResolvedContentImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
};

export type SanitizedContentFragment = {
  /** Sanitized HTML fragment, or `null` when the sanitized content is empty. */
  html: string | null;
  /** Referenced `data-media-id` values, in document order, de-duplicated. */
  imageIds: string[];
};

export class ContentTooLargeError extends Error {
  readonly code = 'DESCRIPTION_TOO_LARGE';

  constructor(limit: number) {
    super(`Product description exceeds the ${limit} UTF-16 code-unit limit.`);
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function assertWithinLimit(value: string, limit: number): void {
  if (value.length > limit) throw new ContentTooLargeError(limit);
}

/**
 * Sanitizes a rich-text fragment. With `images: 'preserve'`, `img` elements are
 * reduced to `data-media-id` and `alt` so the caller can validate and rewrite
 * them against authoritative Product Media rows; with `images: 'drop'`, image
 * nodes are removed entirely (create and Excel-import paths, which cannot own
 * product media yet).
 */
export function sanitizeDescriptionFragment(
  input: string | null | undefined,
  options: { images?: 'drop' | 'preserve'; limit?: number } = {},
): SanitizedContentFragment {
  const limit = options.limit ?? CONTENT_HTML_LIMIT_UTF16;
  if (input === null || input === undefined || input === '') {
    return { html: null, imageIds: [] };
  }
  assertWithinLimit(input, limit);
  const styles = descriptionStyles(input);

  const preserveImages = (options.images ?? 'preserve') === 'preserve';
  const tags = preserveImages ? ALLOWED_TAGS.concat('img') : ALLOWED_TAGS;
  const attributes = preserveImages
    ? { ...ALLOWED_ATTRIBUTES, img: ['data-media-id', 'alt'] }
    : ALLOWED_ATTRIBUTES;

  const html = sanitizeHtml(input, {
    allowedTags: tags,
    allowedAttributes: attributes,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: protectImagesFromExternalSources(preserveImages),
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: NON_TEXT_TAGS,
    transformTags: {
      '*': (tagName, original) => {
        const attribs = descriptionPresentationAttributes(original);
        if (tagName !== 'a' || attribs.target !== '_blank') return { tagName, attribs };
        const rel = new Set((attribs.rel ?? '').split(/\s+/u).filter(Boolean));
        rel.add('noopener');
        rel.add('noreferrer');
        return { tagName, attribs: { ...attribs, rel: [...rel].join(' ') } };
      },
    },
  });

  if (html.trim() === '') return { html: null, imageIds: [] };
  // Only parser-compiled, scoped presentation rules can cross this boundary.
  // Raw style tags were discarded by sanitize-html above.
  const trimmed = `${styles ? `<style>${styles}</style>` : ''}${html.trim()}`;
  assertWithinLimit(trimmed, limit);

  if (!preserveImages) return { html: trimmed, imageIds: [] };

  const imageIds: string[] = [];
  for (const match of trimmed.matchAll(IMG_TAG_PATTERN)) {
    const mediaId = extractMediaId(match[0]);
    if (mediaId === null || mediaId === '') continue;
    if (!imageIds.includes(mediaId)) imageIds.push(mediaId);
  }
  return { html: trimmed, imageIds };
}

/**
 * Rewrites shape-bearing `data-media-id` image nodes using authoritative media
 * rows. Every referenced id must resolve to a row in `images`; unresolved nodes
 * are removed rather than left in a potentially unsafe or private state. All
 * serialization escapes attribute values.
 */
export function rewriteDescriptionImages(
  html: string,
  images: readonly ResolvedContentImage[],
): string {
  const matches = [...html.matchAll(IMG_TAG_PATTERN)];
  const byId = new Map(images.map(image => [image.id, image]));
  let result = html;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const mediaId = extractMediaId(match[0]);
    const image = mediaId === null ? undefined : byId.get(mediaId);
    let presentation = '';
    const parser = new Parser({ onopentag(_name, attribs) {
      const safe = descriptionPresentationAttributes(attribs);
      presentation = ['class', 'id', 'style'].filter(name => safe[name]).map(name => ` ${name}="${escapeHtmlAttribute(safe[name]!)}"`).join('');
    } });
    parser.end(match[0]);
    const replacement =
      image === undefined
        ? ''
        : `<img data-media-id="${escapeHtmlAttribute(image.id)}" src="${escapeHtmlAttribute(image.url)}" width="${image.width}" height="${image.height}" alt="${escapeHtmlAttribute(image.alt)}"${presentation}>`;
    result = `${result.slice(0, match.index)}${replacement}${result.slice(match.index + match[0].length)}`;
  }
  return result;
}

function extractMediaId(tag: string): string | null {
  const match = tag.match(IMG_MEDIA_ID_PATTERN);
  return match ? match[1] : null;
}

function protectImagesFromExternalSources(preserveImages: boolean): Record<string, string[]> {
  // sanitize-html expects an object when checking a[href]. Explicit undefined
  // overrides its default and throws for links on create/import (images: drop).
  return preserveImages ? { img: ALLOWED_SCHEMES } : {};
}
