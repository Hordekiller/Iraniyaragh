import sanitizeHtml from 'sanitize-html';

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
export const CONTENT_MEDIA_ID_PATTERN = /^[A-Za-z0-9]{6,128}$/u;

const HEX_OR_FUNCTIONAL_COLOR =
  /^(?:#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/u;

const ALLOWED_TAGS = [
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
  '*': ['dir', 'lang', 'style'],
  a: ['href', 'target', 'rel', 'title'],
  ol: ['start', 'type', 'reversed'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
};

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': {
    color: [HEX_OR_FUNCTIONAL_COLOR],
    'background-color': [HEX_OR_FUNCTIONAL_COLOR],
    'text-align': [/^(?:left|right|center|justify|start|end)$/u],
    direction: [/^(?:ltr|rtl)$/u],
    'font-style': [/^(?:normal|italic|oblique)$/u],
    'font-weight': [/^(?:normal|bold|[1-9]00)$/u],
    'text-decoration': [/^(?:none|underline|overline|line-through)$/u],
  },
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

  const preserveImages = (options.images ?? 'preserve') === 'preserve';
  const tags = preserveImages ? ALLOWED_TAGS.concat('img') : ALLOWED_TAGS;
  const attributes = preserveImages
    ? { ...ALLOWED_ATTRIBUTES, img: ['data-media-id', 'alt'] }
    : ALLOWED_ATTRIBUTES;

  const html = sanitizeHtml(input, {
    allowedTags: tags,
    allowedAttributes: attributes,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: protectImagesFromExternalSources(preserveImages),
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: NON_TEXT_TAGS,
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target !== '_blank') return { tagName, attribs };
        const rel = new Set((attribs.rel ?? '').split(/\s+/u).filter(Boolean));
        rel.add('noopener');
        rel.add('noreferrer');
        return { tagName, attribs: { ...attribs, rel: [...rel].join(' ') } };
      },
    },
  });

  const trimmed = html.trim();
  if (trimmed === '') return { html: null, imageIds: [] };
  assertWithinLimit(trimmed, limit);

  if (!preserveImages) return { html: trimmed, imageIds: [] };

  const imageIds: string[] = [];
  for (const match of trimmed.matchAll(IMG_TAG_PATTERN)) {
    const tag = match[0];
    const mediaId = extractMediaId(tag);
    if (mediaId === null || !CONTENT_MEDIA_ID_PATTERN.test(mediaId)) continue;
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
    const replacement =
      image === undefined
        ? ''
        : `<img data-media-id="${escapeHtmlAttribute(image.id)}" src="${escapeHtmlAttribute(image.url)}" width="${image.width}" height="${image.height}" alt="${escapeHtmlAttribute(image.alt)}">`;
    result = `${result.slice(0, match.index)}${replacement}${result.slice(match.index + match[0].length)}`;
  }
  return result;
}

function extractMediaId(tag: string): string | null {
  const match = tag.match(IMG_MEDIA_ID_PATTERN);
  return match ? match[1] : null;
}

function protectImagesFromExternalSources(preserveImages: boolean) {
  return preserveImages ? { img: ALLOWED_SCHEMES } : undefined;
}