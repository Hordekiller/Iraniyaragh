import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { audit } from "./discovery-audit.mjs";

const origin = "https://example.com";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const loc = urls => urls.map(url => `<loc>${origin}${url}</loc>`).join("");
function fixtures({ html, headers = {}, secondShard = false, responseStatus = 200 } = {}) {
  const page = html ?? `<link href="${origin}/products/test" rel="canonical"><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Isolated test", offers: { price: "9007199254740993", priceCurrency: "IRR" } })}</script>`;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "error");
    const path = new URL(url).pathname;
    if (path === "/robots.txt") return new Response(`User-agent: *\nSitemap: ${origin}/sitemap.xml`, { headers: { "content-type": "text/plain" } });
    if (path === "/sitemap.xml") return new Response(`<sitemapindex>${loc(secondShard ? ["/one.xml.gz", "/two.xml.gz"] : ["/one.xml.gz"])}</sitemapindex>`, { headers: { "content-type": "application/xml" } });
    if (path.endsWith(".xml.gz")) return new Response(gzipSync(`<urlset>${loc(["/products/test"])}</urlset>`), { headers: { "content-type": "application/gzip" } });
    assert.equal(path, "/products/test");
    return new Response(page, { status: responseStatus, headers: { "content-type": "text/html", ...headers } });
  };
}

test("audits actual gzip artifacts, canonical attribute order and a complete truthful offer", async () => {
  fixtures();
  assert.deepEqual(await audit(origin), { origin, sitemapShards: 1, sitemapUrls: 1, sampledPages: 1 });
});
test("rejects duplicate destinations across different shards", async () => {
  fixtures({ secondShard: true });
  await assert.rejects(audit(origin), /Duplicate URL/u);
});
test("rejects HTTP noindex even if HTML itself looks indexable", async () => {
  fixtures({ headers: { "x-robots-tag": "googlebot: noindex, follow" } });
  await assert.rejects(audit(origin), /noindex by HTTP header/u);
});
test("rejects noindex metadata regardless of attribute order or crawler name", async () => {
  for (const name of ["robots", "googlebot"]) {
    fixtures({ html: `<meta content="noindex, follow" name="${name}"><link href="${origin}/products/test" rel="canonical">` });
    await assert.rejects(audit(origin), /page is noindex/u);
  }
});
test("rejects a product missing all required commercial/review evidence", async () => {
  fixtures({ html: `<link href="${origin}/products/test" rel="canonical"><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Isolated test"}]}</script>` });
  await assert.rejects(audit(origin), /Incomplete Product/u);
});
test("rejects missing, duplicate and conflicting canonical tags", async () => {
  for (const html of ["<h1>Test</h1>", `<link rel="canonical" href="${origin}/other">`, `<link rel="canonical" href="${origin}/products/test"><link rel="canonical" href="${origin}/products/test">`]) {
    fixtures({ html });
    await assert.rejects(audit(origin), /canonical/u);
  }
});
test("rejects partial success responses for sitemap destinations", async () => {
  fixtures({ responseStatus: 206 });
  await assert.rejects(audit(origin), /HTTP 206/u);
});
