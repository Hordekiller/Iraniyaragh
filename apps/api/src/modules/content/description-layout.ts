import postcss, { type ChildNode, type Declaration } from 'postcss';
import { Parser } from 'htmlparser2';

const SCOPE = '[data-rich-text="true"]';
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/u;
const SELECTOR_TOKEN = /\s+|[>+~]|[.#][A-Za-z][A-Za-z0-9_-]*|\*|[a-z][a-z0-9-]*|::?[a-z-]+|\[open\]/y;
const PSEUDOS = new Set([':hover', ':focus-visible', ':first-child', ':last-child', ':before', ':after', '::before', '::after', '::-webkit-details-marker']);
const FORBIDDEN_TAGS = new Set(['html', 'body', 'head', 'script', 'style', 'iframe', 'input', 'button', 'form']);
const PROPERTIES = new Set([
  'color', 'background', 'background-color', 'background-image', 'box-shadow',
  'display', 'box-sizing', 'position', 'inset', 'top', 'right', 'bottom', 'left',
  'direction', 'text-align', 'text-decoration', 'text-transform', 'white-space',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-width', 'border-style', 'border-radius',
  'border-collapse', 'table-layout', 'vertical-align', 'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap',
  'grid-template-columns', 'grid-template-rows', 'gap', 'row-gap', 'column-gap',
  'align-items', 'justify-content', 'flex', 'flex-direction', 'flex-wrap',
  'object-fit', 'object-position', 'aspect-ratio', 'transform', 'transition',
  'cursor', 'list-style', 'float', 'outline', 'outline-offset', 'content',
]);
const FUNCTIONS = new Set(['rgb', 'rgba', 'linear-gradient', 'clamp', 'min', 'max', 'minmax', 'repeat', 'calc', 'scale']);
const PROPERTY_VALUES: Record<string, RegExp> = {
  position: /^(?:static|relative|absolute)$/u,
  'font-family': /^inherit$/u,
  display: /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-row|table-cell|none)$/u,
  cursor: /^(?:auto|default|pointer|text)$/u,
  transition: /^(?:background|background-color|color|opacity)\s+(?:0?\.\d+|[01])s(?:\s+(?:ease|linear|ease-in|ease-out))?$/u,
};

function onlyPresentationFunctions(value: string): boolean {
  let word: { name: string; end: number } | null = null;
  // Consume each word once instead of repeatedly backtracking over identifiers
  // that are not followed by an opening parenthesis.
  for (const token of value.matchAll(/[A-Za-z-]+|\(/gu)) {
    if (token[0] !== '(') {
      word = { name: token[0].toLowerCase(), end: token.index + token[0].length };
      continue;
    }
    if (word && !value.slice(word.end, token.index).trim() && !FUNCTIONS.has(word.name)) return false;
    word = null;
  }
  return true;
}

export function descriptionId(value: string): string | undefined {
  if (!IDENTIFIER.test(value.startsWith('iyc-') ? value.slice(4) : value)) return undefined;
  return value.startsWith('iyc-') ? value : `iyc-${value}`;
}

function declaration(node: Declaration): string | null {
  const property = node.prop.toLowerCase();
  const value = node.value.trim();
  if (!PROPERTIES.has(property) || node.important || value.length > 512) return null;
  if (property === 'content') return /^(?:none|["'][+−-]["'])$/u.test(value) ? `${property}:${value}` : null;
  // No CSS escapes, comments, strings, URLs, variables, custom properties or
  // raw HTML delimiters. Only small presentation functions are supported.
  if (!/^[A-Za-z0-9#%.,()\s/+*-]+$/u.test(value) || value.includes('/*') || value.includes('--')) return null;
  if ([...value.matchAll(/(?:^|[^A-Za-z0-9#])((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gu)].some(match => Number(match[1]) > 4096)) return null;
  if ([...value.matchAll(/\brepeat\s*\(\s*(\d+(?:[eE][+-]?\d+)?)/gu)].some(match => Number(match[1]) > 12)) return null;
  if (!onlyPresentationFunctions(value)) return null;
  const constraint = PROPERTY_VALUES[property];
  if (constraint && !constraint.test(value)) return null;
  return `${property}:${value}`;
}

export function descriptionInlineStyle(input: string): string {
  try {
    const nodes = postcss.parse(`x{${input}}`).first;
    if (nodes?.type !== 'rule') return '';
    return nodes.nodes.filter((node): node is Declaration => node.type === 'decl').map(declaration).filter(Boolean).join(';');
  } catch { return ''; }
}

function safeSelectorToken(value: string): string | null {
  if (FORBIDDEN_TAGS.has(value)) return null;
  if (value.startsWith(':') && !PSEUDOS.has(value)) return null;
  if (!value.startsWith('#')) return value;
  const id = descriptionId(value.slice(1));
  return id ? `#${id}` : null;
}

function scopedSelector(input: string): string | null {
  let source = input.trim();
  if (source.startsWith(`${SCOPE} `)) source = source.slice(SCOPE.length).trimStart();
  if (!source || source.length > 2048) return null;
  const tokens: string[] = [];
  SELECTOR_TOKEN.lastIndex = 0;
  while (SELECTOR_TOKEN.lastIndex < source.length) {
    const at = SELECTOR_TOKEN.lastIndex;
    const token = SELECTOR_TOKEN.exec(source);
    if (token?.index !== at) return null;
    const value = safeSelectorToken(token[0]);
    if (value === null) return null;
    tokens.push(value);
  }
  if (/^[>+~]/u.test(source)) return null;
  return `${SCOPE} ${tokens.join('')}`;
}

function compileNodes(nodes: ChildNode[], depth = 0): string {
  if (depth > 2) return '';
  return nodes.flatMap(node => {
    if (node.type === 'rule') {
      const selectors = node.selector.split(',').map(scopedSelector).filter((value): value is string => value !== null);
      const declarations = node.nodes.filter((child): child is Declaration => child.type === 'decl').map(declaration).filter(Boolean);
      return selectors.length && declarations.length ? [`${selectors.join(',')}{${declarations.join(';')}}`] : [];
    }
    if (node.type === 'atrule' && node.name.toLowerCase() === 'media' && node.nodes
      && /^\(\s*(?:max|min)-width\s*:\s*\d{1,4}px\s*\)$/u.test(node.params)) {
      const body = compileNodes(node.nodes, depth + 1);
      return body ? [`@media ${node.params}{${body}}`] : [];
    }
    return [];
  }).join('');
}

/** Parse HTML/CSS rather than trusting editor source or embedding arbitrary CSS. */
export function descriptionStyles(input: string): string {
  const chunks: string[] = [];
  let insideStyle = false;
  const parser = new Parser({
    onopentag(name) { insideStyle = name === 'style'; },
    ontext(value) { if (insideStyle) chunks.push(value); },
    onclosetag(name) { if (name === 'style') { insideStyle = false; chunks.push('\n'); } },
  });
  parser.end(input);
  if (!chunks.length) return '';
  try { return compileNodes(postcss.parse(chunks.join('')).nodes); } catch { return ''; }
}

export function descriptionPresentationAttributes(attribs: Record<string, string>): Record<string, string> {
  const result = { ...attribs };
  if (result.id) { const id = descriptionId(result.id); if (id) result.id = id; else delete result.id; }
  if (result.class) {
    result.class = result.class.split(/\s+/u).filter(token => IDENTIFIER.test(token)).slice(0, 32).join(' ');
    if (!result.class) delete result.class;
  }
  if (result.style) { const style = descriptionInlineStyle(result.style); if (style) result.style = style; else delete result.style; }
  if (result.href?.startsWith('#')) { const id = descriptionId(result.href.slice(1)); if (id) result.href = `#${id}`; else delete result.href; }
  return result;
}
