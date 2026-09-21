const HIDDEN_CONTENT_TAGS = [
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
];

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'DIV',
  'UL',
  'OL',
  'LI',
  'DL',
  'DT',
  'DD',
  'BLOCKQUOTE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TH',
  'TD',
  'CAPTION',
  'FIGURE',
  'FIGCAPTION',
  'HR',
  'BR',
  'SECTION',
  'ARTICLE',
  'ASIDE',
  'HEADER',
  'FOOTER',
  'PRE',
  'ADDRESS',
]);

function textOf(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as Element;
  if (element.tagName.toUpperCase() === 'IMG') {
    return element.getAttribute('alt') ?? '';
  }
  let result = '';
  element.childNodes.forEach((child) => {
    const chunk = textOf(child);
    if (!chunk) return;
    const needsSeparator =
      result !== '' &&
      !/\s$/u.test(result) &&
      child.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAGS.has((child as Element).tagName.toUpperCase());
    result += needsSeparator ? ` ${chunk}` : chunk;
  });
  return result;
}

/**
 * Plain-text projection of server-sanitized rich-text HTML (ADR-0016).
 *
 * Structured data (Schema.org) and machine-readable consumers require text,
 * never embedded markup. `DOMParser` decodes entities and strips tags without
 * executing scripts or loading resources; it never trusts the input as safe.
 */
export function richTextToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.body
    .querySelectorAll(HIDDEN_CONTENT_TAGS.join(','))
    .forEach((node) => node.remove());
  return textOf(parsed.body).replace(/\s+/gu, ' ').trim();
}