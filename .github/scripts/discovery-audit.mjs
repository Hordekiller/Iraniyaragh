#!/usr/bin/env node

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
  return url.origin;
}

function locations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/giu)].map((match) =>
    match[1].replaceAll("&amp;", "&"),
  );
}

function validateSameOrigin(urls, origin) {
  const seen = new Set();
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

async function boundedText(url, expectedTypes) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: expectedTypes.join(", ") },
  });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
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
  const text = await response.text();
  assert(
    Buffer.byteLength(text) <= MAX_BYTES,
    `${url} exceeds the audit response limit.`,
  );
  return text;
}

export async function audit(originInput) {
  const origin = normalizeOrigin(originInput);
  const robots = await boundedText(`${origin}/robots.txt`, ["text/plain"]);
  const advertised = robots.match(/^sitemap:\s*(\S+)\s*$/imu)?.[1];
  assert(advertised, "robots.txt does not advertise a sitemap.");
  assert(
    new URL(advertised).href === `${origin}/sitemap.xml`,
    "robots.txt sitemap is not the canonical sitemap index.",
  );

  const index = await boundedText(advertised, ["xml"]);
  assert(
    /<sitemapindex[\s>]/iu.test(index),
    "sitemap.xml is not a sitemap index.",
  );
  const shardUrls = locations(index);
  assert(shardUrls.length > 0, "Sitemap index is empty.");
  validateSameOrigin(shardUrls, origin);

  let sampledPages = 0;
  for (const shardUrl of shardUrls) {
    const xml = await boundedText(shardUrl, ["xml", "gzip"]);
    assert(/<urlset[\s>]/iu.test(xml), `${shardUrl} is not a URL set.`);
    const pageUrls = locations(xml);
    assert(pageUrls.length <= 50_000, `${shardUrl} exceeds 50,000 URLs.`);
    validateSameOrigin(pageUrls, origin);
    for (const pageUrl of pageUrls.slice(0, SAMPLE_PER_SITEMAP)) {
      const html = await boundedText(pageUrl, ["text/html"]);
      assert(
        !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/iu.test(
          html,
        ),
        `Sitemap page is noindex: ${pageUrl}`,
      );
      const canonical = html.match(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/iu,
      )?.[1];
      assert(
        canonical && new URL(canonical, pageUrl).href === pageUrl,
        `Missing or conflicting canonical: ${pageUrl}`,
      );
      sampledPages += 1;
    }
  }
  return { origin, sitemapShards: shardUrls.length, sampledPages };
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
