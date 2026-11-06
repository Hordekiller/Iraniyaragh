#!/usr/bin/env node
/**
 * Page-level SEO contract for the Persian storefront. Pure functions take the
 * rendered HTML and return every violation (not just the first) so a report is
 * actionable. `error` findings fail CI; `warn` findings are advisory.
 *
 *   node seo-page-check.mjs --base http://127.0.0.1:3000 --origin https://example.com [--allow-noindex]
 *
 * `--allow-noindex` is for non-production builds, which are noindex by design;
 * every other check still applies.
 */
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)].map(m => [m[1].toLowerCase(), m[2] ?? m[3]]));
const tags = (html, name) => (html.match(new RegExp(`<${name}\\b[^>]*>`, 'giu')) ?? []).map(attrs);
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const text = html => decode(html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/giu, ' ').replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();

export function jsonLdNodes(html, issues = []) {
  const nodes = [];
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    Object.values(node).forEach(walk);
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/giu)) {
    if (attrs(match[1]).type?.toLowerCase() !== 'application/ld+json') continue;
    try { walk(JSON.parse(match[2])); } catch { issues.push({ level: 'error', message: 'JSON-LD is not valid JSON' }); }
  }
  return nodes;
}
const typesOf = node => [node['@type']].flat().filter(Boolean);

/** @returns {{level:'error'|'warn', message:string}[]} */
export function checkPage(html, { url, origin, kind = 'page', allowNoindex = false }) {
  const issues = [];
  const error = message => issues.push({ level: 'error', message });
  const warn = message => issues.push({ level: 'warn', message });
  const page = new URL(url);
  const path = page.pathname;

  const root = tags(html, 'html')[0] ?? {};
  if (root.lang?.toLowerCase() !== 'fa') error('<html lang="fa"> is missing');
  if (root.dir?.toLowerCase() !== 'rtl') error('<html dir="rtl"> is missing');
  if (!tags(html, 'meta').some(m => m.charset)) warn('meta charset is missing');
  if (!tags(html, 'meta').some(m => m.name?.toLowerCase() === 'viewport')) error('meta viewport is missing');

  const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '').trim();
  if (!title) error('<title> is missing');
  else if ([...title].length > 70) warn(`title is ${[...title].length} characters (aim for <= 70)`);
  if (html.match(/<title\b/giu)?.length > 1) error('more than one <title>');

  const metas = tags(html, 'meta');
  const meta = (key, value) => metas.filter(m => m[key]?.toLowerCase() === value);
  const description = meta('name', 'description');
  if (description.length !== 1 || !description[0].content?.trim()) error('exactly one non-empty meta description is required');
  else {
    const length = [...description[0].content.trim()].length;
    if (length < 50 || length > 200) warn(`meta description is ${length} characters (aim for 50-200)`);
  }
  if (description[0]?.content && title && description[0].content.trim() === title.replace(/\s*\|.*$/u, '')) warn('meta description duplicates the title');

  const robots = [...meta('name', 'robots'), ...meta('name', 'googlebot')].map(m => m.content ?? '');
  if (!allowNoindex && robots.some(value => /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/iu.test(value))) error('page is noindex');

  const canonicals = tags(html, 'link').filter(l => l.rel?.toLowerCase().split(/\s+/u).includes('canonical'));
  let canonical;
  if (canonicals.length !== 1 || !canonicals[0].href) error(`exactly one canonical is required (found ${canonicals.length})`);
  else {
    try {
      canonical = new URL(canonicals[0].href);
      if (canonical.origin !== origin) error(`canonical origin ${canonical.origin} is not ${origin}`);
      if (canonical.hash) error('canonical contains a fragment');
      if ([...canonical.searchParams.keys()].some(key => key !== 'page')) error('canonical contains a non-pagination query');
      if (canonical.pathname !== page.pathname) error(`canonical path ${canonical.pathname} differs from ${page.pathname}`);
      if (canonical.pathname.length > 1 && canonical.pathname.endsWith('/')) error('canonical has a trailing slash');
    } catch { error('canonical is not an absolute URL'); }
  }

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].map(m => text(m[1]));
  if (h1s.length !== 1) error(`exactly one <h1> is required (found ${h1s.length})`);
  else if (!h1s[0]) error('<h1> is empty');
  // Headings must not skip a level (h1 -> h3) — screen readers and crawlers use the outline.
  let previous = 0;
  for (const m of html.matchAll(/<h([1-6])\b/giu)) {
    const level = Number(m[1]);
    if (previous && level > previous + 1) { warn(`heading level jumps from h${previous} to h${level}`); break; }
    previous = level;
  }

  const og = key => meta('property', `og:${key}`)[0]?.content;
  for (const key of ['title', 'description', 'url', 'image', 'locale', 'site_name', 'type']) if (!og(key)) error(`og:${key} is missing`);
  if (og('locale') && og('locale') !== 'fa_IR') error('og:locale must be fa_IR');
  if (og('url') && canonical && new URL(og('url'), origin).href !== canonical.href) error('og:url differs from canonical');
  for (const key of ['image']) if (og(key) && !/^https:\/\//iu.test(og(key)) && !/^http:\/\/(?:127\.0\.0\.1|localhost)/iu.test(og(key))) error(`og:${key} is not an absolute HTTPS URL`);
  if (!meta('name', 'twitter:card')[0]) error('twitter:card is missing');

  for (const img of tags(html, 'img')) {
    if (!('alt' in img)) error(`<img> without alt: ${(img.src ?? '').slice(0, 80)}`);
    else if (kind === 'article' && !img.alt.trim() && img['data-media-id']) error(`article image with empty alt: ${(img.src ?? '').slice(0, 80)}`);
    if (!(img.width && img.height) && !/^data:/u.test(img.src ?? '')) warn(`<img> without width/height (layout shift): ${(img.src ?? '').slice(0, 80)}`);
  }
  for (const a of tags(html, 'a')) {
    if (a.href !== undefined && (a.href.trim() === '' || a.href.trim() === '#' || /^javascript:/iu.test(a.href.trim()))) error('anchor with an empty, "#" or javascript: href');
  }

  const body = text(html.replace(/^[\s\S]*?<body\b[^>]*>/iu, ''));
  if (kind !== 'notfound' && body.length < 200) warn(`very little visible text in initial HTML (${body.length} characters)`);

  const nodes = jsonLdNodes(html, issues);
  const all = type => nodes.filter(n => typesOf(n).includes(type));
  // External citations (CreativeWork) legitimately point off-site; own entities must not.
  for (const node of nodes.filter(n => !typesOf(n).includes('CreativeWork'))) for (const key of ['url', '@id']) {
    if (typeof node[key] === 'string' && /^https?:/iu.test(node[key]) && new URL(node[key]).origin !== origin) error(`JSON-LD ${key} leaves the canonical origin: ${node[key]}`);
  }
  const products = all('Product');
  if (products.length > 1) error('more than one Product node on a page');
  for (const product of products) {
    const offers = [product.offers].flat().filter(Boolean);
    if (!product.name) error('Product without name');
    if (!offers.some(o => /^\d+(?:\.\d+)?$/u.test(String(o.price ?? '')) && o.priceCurrency)) error('Product without a complete Offer (price + priceCurrency)');
    if (!product.image) warn('Product without image');
    if (canonical && product.url && new URL(product.url).href !== canonical.href) error('Product url differs from canonical');
  }
  const crumbs = all('BreadcrumbList');
  // Fixture builds have no discovery projection, so catalog entities legitimately omit rich data.
  const richDataOptional = allowNoindex && (kind === 'product' || (kind === 'collection' && !path.startsWith('/blog')));
  if (kind !== 'home' && kind !== 'notfound' && !richDataOptional && crumbs.length !== 1) error(`exactly one BreadcrumbList is required (found ${crumbs.length})`);
  for (const list of crumbs) {
    const items = list.itemListElement ?? [];
    if (!items.length) error('BreadcrumbList is empty');
    items.forEach((item, index) => {
      if (item.position !== index + 1) error('BreadcrumbList positions are not sequential');
      if (!item.name || !item.item) error('BreadcrumbList item without name or url');
    });
    const last = items.at(-1)?.item;
    if (last && canonical && new URL(last).href !== canonical.href) error('last breadcrumb differs from canonical');
  }
  if (kind === 'home') {
    if (!all('Organization').length) error('home is missing Organization');
    if (!all('WebSite').length) error('home is missing WebSite');
  }
  if (kind === 'article') {
    const posts = all('BlogPosting');
    if (posts.length !== 1) error(`exactly one BlogPosting is required (found ${posts.length})`);
    for (const post of posts) {
      for (const key of ['headline', 'datePublished', 'dateModified', 'author', 'publisher', 'description']) if (!post[key]) error(`BlogPosting without ${key}`);
      if (post.headline && [...post.headline].length > 110) error('BlogPosting headline exceeds 110 characters');
      if (post.datePublished && post.dateModified && Date.parse(post.dateModified) < Date.parse(post.datePublished)) error('BlogPosting dateModified precedes datePublished');
      if (post.author?.['@type'] === 'Person') error('BlogPosting must not publish staff names as author');
      if (canonical && post.url && new URL(post.url).href !== canonical.href) error('BlogPosting url differs from canonical');
    }
    if (og('type') && og('type') !== 'article') error('og:type must be article on an article');
    if (!meta('property', 'article:published_time')[0]) error('article:published_time is missing');
  }
  if (kind === 'collection' && !richDataOptional && !all('CollectionPage').length) error('collection is missing CollectionPage');
  for (const org of all('Organization')) if (!org.name || !org.url) error('Organization needs name and url');
  return issues;
}

export function summarize(results) {
  const errors = results.flatMap(r => r.issues.filter(i => i.level === 'error').map(i => `${r.url}: ${i.message}`));
  const warnings = results.flatMap(r => r.issues.filter(i => i.level === 'warn').map(i => `${r.url}: ${i.message}`));
  return { pages: results.length, errors, warnings };
}

const hrefs = html => [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/giu)].map(m => decode(m[1]));

async function fetchHtml(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { accept: 'text/html' } });
  return { status: response.status, html: await response.text(), headers: response.headers };
}

/** Crawl a running instance: fixed public routes plus the first product/category/brand it links to. */
export async function run({ base, origin, allowNoindex }) {
  const routes = [['/', 'home'], ['/catalog', 'collection'], ['/categories', 'page'], ['/custom-doors', 'page'], ['/help', 'page'], ['/blog', 'collection']];
  const catalog = await fetchHtml(`${base}/catalog`);
  const first = prefix => hrefs(catalog.html).find(h => h.startsWith(prefix));
  const product = first('/products/');
  if (product) routes.push([product, 'product']);
  const blog = await fetchHtml(`${base}/blog`);
  const article = hrefs(blog.html).find(h => /^\/blog\/[^/?#]+$/u.test(h) && h !== '/blog/feed.xml');
  if (article) routes.push([article, 'article']);
  const categoriesPage = await fetchHtml(`${base}/categories`);
  const category = hrefs(categoriesPage.html).find(h => h.startsWith('/categories/'));
  if (category) routes.push([category, 'collection']);
  const results = [];
  for (const [path, kind] of routes) {
    const { status, html, headers } = await fetchHtml(`${base}${path}`);
    const issues = status === 200 ? checkPage(html, { url: `${origin}${path}`, origin, kind, allowNoindex }) : [{ level: 'error', message: `HTTP ${status}` }];
    if (!allowNoindex && /noindex/iu.test(headers.get('x-robots-tag') ?? '')) issues.push({ level: 'error', message: 'noindex by HTTP header' });
    results.push({ url: `${origin}${path}`, issues });
  }
  const missing = await fetchHtml(`${base}/no-such-page-${Date.now()}`);
  if (missing.status !== 404) results.push({ url: `${origin}/(unknown)`, issues: [{ level: 'error', message: `unknown URL returned HTTP ${missing.status}, expected 404 (soft-404)` }] });
  return results;
}

if (process.argv[1]?.endsWith('seo-page-check.mjs')) {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  const base = arg('--base'); const origin = arg('--origin');
  if (!base || !origin) { console.error('usage: seo-page-check.mjs --base <url> --origin <canonical origin> [--allow-noindex]'); process.exit(2); }
  const summary = summarize(await run({ base, origin, allowNoindex: process.argv.includes('--allow-noindex') }));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}
