#!/usr/bin/env node
import { gunzipSync } from "node:zlib";

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const SAMPLE_PER_SITEMAP = 3;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeOrigin(value) {
  const url = new URL(value);
  assert(
    url.protocol === "https:",
    "Production discovery origin must use HTTPS.",
  );
  assert(
    url.pathname === "/" && !url.search && !url.hash,
    "Origin must not contain a path, query, or fragment.",
  );
  assert(!url.username && !url.password && !url.port && !url.hostname.startsWith("www."), "Use the configured credential-free HTTPS apex origin.");
  return url.origin;
}

function locations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/giu)].map((match) =>
    match[1].replaceAll("&amp;", "&"),
  );
}

function validateSameOrigin(urls, origin, seen = new Set()) {
  for (const raw of urls) {
    const url = new URL(raw);
    assert(url.origin === origin, `Cross-origin sitemap URL: ${url.origin}`);
    assert(
      !url.search && !url.hash,
      `Query or fragment leaked into sitemap: ${raw}`,
    );
    assert(!seen.has(url.href), `Duplicate URL in sitemap: ${url.href}`);
    seen.add(url.href);
  }
}

async function boundedResource(url, expectedTypes) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: expectedTypes.join(", ") },
  });
  assert(response.status === 200, `${url} returned HTTP ${response.status}`);
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  assert(
    expectedTypes.some((expected) => type.includes(expected)),
    `${url} has unexpected content-type: ${type || "missing"}`,
  );
  const declared = Number(response.headers.get("content-length"));
  assert(
    !Number.isFinite(declared) || declared <= MAX_BYTES,
    `${url} exceeds the audit response limit.`,
  );
  assert(response.body, `${url} returned an empty response.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= MAX_BYTES, `${url} exceeds the audit response limit.`);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  let body = Buffer.concat(chunks);
  // Fetch decodes Content-Encoding, but a .xml.gz artifact can instead be a
  // raw gzip file. Bound both the transfer and the decompressed document.
  if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body, { maxOutputLength: MAX_BYTES });
  return { text: body.toString("utf8"), headers: response.headers };
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)].map(match => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

function validatePage(html, headers, pageUrl) {
  const noindex = value => /(?:^|[\s,:;])(?:noindex|none)(?:$|[\s,;])/iu.test(value ?? "");
  assert(!noindex(headers.get("x-robots-tag")), `Sitemap page is noindex by HTTP header: ${pageUrl}`);
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const meta = attributes(tag);
    if (/^(robots|googlebot)$/iu.test(meta.name ?? "")) assert(!noindex(meta.content), `Sitemap page is noindex: ${pageUrl}`);
  }
  const canonicals = (html.match(/<link\b[^>]*>/giu) ?? []).map(attributes).filter(link => link.rel?.toLowerCase().split(/\s+/u).includes("canonical"));
  assert(canonicals.length === 1 && canonicals[0].href && new URL(canonicals[0].href, pageUrl).href === pageUrl, `Missing or conflicting canonical: ${pageUrl}`);
  function check(node) {
    if (Array.isArray(node)) { node.forEach(check); return; }
    if (!node || typeof node !== "object") return;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.includes("Product")) {
      const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
      const validOffer = offers.some(offer => offer && /^\d+(?:\.\d+)?$/u.test(String(offer.price ?? offer.priceSpecification?.price ?? "")) && (offer.priceCurrency ?? offer.priceSpecification?.priceCurrency));
      assert(node.name && (validOffer || node.review || node.aggregateRating), `Incomplete Product structured data: ${pageUrl}`);
    }
    Object.values(node).forEach(value => { if (value && typeof value === "object") check(value); });
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    if (attributes(match[1]).type?.toLowerCase() === "application/ld+json") check(JSON.parse(match[2]));
  }
}

export async function audit(originInput) {
  const origin = normalizeOrigin(originInput);
  const { text: robots } = await boundedResource(`${origin}/robots.txt`, ["text/plain"]);
  const advertised = robots.match(/^sitemap:\s*(\S+)\s*$/imu)?.[1];
  assert(advertised, "robots.txt does not advertise a sitemap.");
  assert(
    new URL(advertised).href === `${origin}/sitemap.xml`,
    "robots.txt sitemap is not the canonical sitemap index.",
  );

  const { text: index } = await boundedResource(advertised, ["xml"]);
  assert(
    /<sitemapindex[\s>]/iu.test(index),
    "sitemap.xml is not a sitemap index.",
  );
  const shardUrls = locations(index);
  assert(shardUrls.length > 0, "Sitemap index is empty.");
  assert(shardUrls.length <= 1_000, "Sitemap index exceeds the audit shard limit.");
  validateSameOrigin(shardUrls, origin);

  let sampledPages = 0;
  const allPageUrls = new Set();
  for (const shardUrl of shardUrls) {
    const { text: xml } = await boundedResource(shardUrl, ["xml", "gzip"]);
    assert(/<urlset[\s>]/iu.test(xml), `${shardUrl} is not a URL set.`);
    const pageUrls = locations(xml);
    assert(pageUrls.length <= 50_000, `${shardUrl} exceeds 50,000 URLs.`);
    assert(pageUrls.length > 0, `${shardUrl} is empty.`);
    validateSameOrigin(pageUrls, origin, allPageUrls);
    for (const pageUrl of pageUrls.slice(0, SAMPLE_PER_SITEMAP)) {
      const { text: html, headers } = await boundedResource(pageUrl, ["text/html"]);
      validatePage(html, headers, pageUrl);
      sampledPages += 1;
    }
  }
  return { origin, sitemapShards: shardUrls.length, sitemapUrls: allPageUrls.size, sampledPages };
}

export function selfTest() {
  assert(
    normalizeOrigin("https://example.com") === "https://example.com",
    "Origin normalization failed.",
  );
  assert(
    locations("<loc>https://example.com/a&amp;b</loc>")[0] ===
      "https://example.com/a&b",
    "XML location decoding failed.",
  );
  validateSameOrigin(
    ["https://example.com/a", "https://example.com/b"],
    "https://example.com",
  );
  for (const invalid of [
    "http://example.com",
    "https://example.com/path",
    "https://example.com/?x=1",
  ]) {
    let rejected = false;
    try {
      normalizeOrigin(invalid);
    } catch {
      rejected = true;
    }
    assert(rejected, `Invalid origin was accepted: ${invalid}`);
  }
  return { status: "ok" };
}

if (process.argv[1]?.endsWith("discovery-audit.mjs")) {
  const argument = process.argv[2];
  const result =
    argument === "--self-test" ? selfTest() : await audit(argument ?? "");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
