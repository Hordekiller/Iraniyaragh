import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage, summarize } from "./seo-page-check.mjs";

const origin = "https://example.com";
const url = `${origin}/products/hinge`;
const text = "لولای کابینت با مشخصات کامل و قیمت اعلام‌شده برای خرید آنلاین. ".repeat(6);
const ld = data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const product = { "@type": "Product", name: "لولا", image: ["https://example.com/a.webp"], url, offers: { price: "100", priceCurrency: "IRR" } };
const crumbs = { "@type": "BreadcrumbList", itemListElement: [{ position: 1, name: "خانه", item: origin + "/" }, { position: 2, name: "لولا", item: url }] };
function page({ lang = 'lang="fa" dir="rtl"', head = "", body = "", title = "لولای کابینت | ایرانی یراق", jsonld = [product, crumbs], canonical = url } = {}) {
  return `<!DOCTYPE html><html ${lang}><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><title>${title}</title>
<meta name="description" content="مشخصات و قیمت لولای کابینت در ایرانی یراق؛ مشاهدهٔ مشخصات کامل کالا و وضعیت موجودی."/>
<link rel="canonical" href="${canonical}"/><meta property="og:title" content="t"/><meta property="og:description" content="d"/><meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="https://example.com/x.png"/><meta property="og:locale" content="fa_IR"/><meta property="og:site_name" content="s"/><meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary"/>${head}${ld(jsonld)}</head><body><h1>لولا</h1><p>${text}</p>${body}</body></html>`;
}
const errors = (html, options = {}) => checkPage(html, { url, origin, kind: "product", ...options }).filter(i => i.level === "error").map(i => i.message);

test("a complete page has no errors", () => assert.deepEqual(errors(page()), []));
test("requires fa/rtl, canonical, single h1 and description", () => {
  assert.match(errors(page({ lang: "" })).join("\n"), /lang="fa"[\s\S]*dir="rtl"/u);
  assert.match(errors(page({ canonical: origin + "/products/other" })).join("\n"), /canonical path/u);
  assert.match(errors(page({ canonical: "https://evil.test/products/hinge" })).join("\n"), /canonical origin/u);
  assert.match(errors(page({ body: "<h1>دوم</h1>" })).join("\n"), /exactly one <h1>/u);
  assert.match(errors(page().replace(/<meta name="description"[^>]*>/u, "")).join("\n"), /meta description/u);
});
test("noindex is an error in production and tolerated for staging builds", () => {
  const html = page({ head: '<meta name="robots" content="noindex, nofollow"/>' });
  assert.match(errors(html).join("\n"), /noindex/u);
  assert.deepEqual(errors(html, { allowNoindex: true }), []);
});
test("rejects images without alt and placeholder links", () => {
  assert.match(errors(page({ body: '<img src="/a.png"/>' })).join("\n"), /without alt/u);
  assert.deepEqual(errors(page({ body: '<img src="/a.png" alt="لولا"/><a href="#main-content">x</a>' })), []);
  assert.match(errors(page({ body: '<a href="#">x</a>' })).join("\n"), /empty/u);
});
test("validates Product and breadcrumb structured data truthfully", () => {
  assert.match(errors(page({ jsonld: [{ ...product, offers: { price: "free" } }, crumbs] })).join("\n"), /complete Offer/u);
  assert.match(errors(page({ jsonld: [product] })).join("\n"), /BreadcrumbList/u);
  assert.match(errors(page({ jsonld: [product, product, crumbs] })).join("\n"), /more than one Product/u);
  assert.match(errors(page({ jsonld: [{ ...crumbs, itemListElement: [{ position: 2, name: "x", item: url }] }, product] })).join("\n"), /sequential/u);
  assert.match(errors(page({ jsonld: [{ ...product, url: "https://evil.test/p" }, crumbs] })).join("\n"), /leaves the canonical origin/u);
});
test("home requires Organization and WebSite", () => {
  const home = page({ jsonld: [{ "@type": "Organization", name: "x", url: origin }] });
  assert.match(checkPage(home, { url: origin + "/", origin, kind: "home", allowNoindex: true }).map(i => i.message).join("\n"), /WebSite/u);
});
test("warnings do not fail but are reported", () => {
  const issues = checkPage(page({ title: "ا".repeat(90) }), { url, origin, kind: "product" });
  assert.ok(issues.some(i => i.level === "warn" && /title is/u.test(i.message)));
  const summary = summarize([{ url, issues }]);
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.warnings.length > 0, true);
});

test("articles need one truthful BlogPosting and article Open Graph", () => {
  const articleUrl = `${origin}/blog/guide`;
  const post = { "@type": "BlogPosting", url: articleUrl, headline: "راهنما", description: "d", datePublished: "2026-11-01T00:00:00Z", dateModified: "2026-11-02T00:00:00Z", author: { "@type": "Organization", name: "x", url: origin }, publisher: { "@type": "Organization", name: "x", url: origin } };
  const crumbs2 = { "@type": "BreadcrumbList", itemListElement: [{ position: 1, name: "خانه", item: origin + "/" }, { position: 2, name: "راهنما", item: articleUrl }] };
  const html = page({ canonical: articleUrl, jsonld: [post, crumbs2], head: '<meta property="article:published_time" content="2026-11-01T00:00:00Z"/>' }).replace('content="website"', 'content="article"');
  const run = html2 => checkPage(html2, { url: articleUrl, origin, kind: "article" }).filter(i => i.level === "error").map(i => i.message).join("\n");
  assert.equal(run(html), "");
  const cited = page({ canonical: articleUrl, jsonld: [{ ...post, citation: [{ "@type": "CreativeWork", name: "منبع", url: "https://other.example.org/s" }] }, crumbs2], head: '<meta property="article:published_time" content="2026-11-01T00:00:00Z"/>' }).replace('content="website"', 'content="article"');
  assert.equal(run(cited), "", "external citations are allowed");
  assert.match(run(html.replace('"@type":"BlogPosting"', '"@type":"Thing"')), /exactly one BlogPosting/u);
  assert.match(run(html.replace('"author":{"@type":"Organization"', '"author":{"@type":"Person"')), /staff names/u);
  assert.match(run(html.replace('"dateModified":"2026-11-02T00:00:00Z"', '"dateModified":"2026-10-01T00:00:00Z"')), /precedes/u);
  assert.match(run(html.replace('content="article"', 'content="website"')), /og:type must be article/u);
  assert.match(run(html.replace(/<meta property="article:published_time"[^>]*>/u, "")), /published_time/u);
});

test("article images need alt text; missing dimensions are advisory", () => {
  const articleUrl = `${origin}/blog/guide`;
  const post = { "@type": "BlogPosting", url: articleUrl, headline: "راهنما", description: "d", datePublished: "2026-11-01T00:00:00Z", dateModified: "2026-11-02T00:00:00Z", author: { "@type": "Organization", name: "x", url: origin }, publisher: { "@type": "Organization", name: "x", url: origin } };
  const crumbs2 = { "@type": "BreadcrumbList", itemListElement: [{ position: 1, name: "خانه", item: origin + "/" }, { position: 2, name: "راهنما", item: articleUrl }] };
  const html = body => page({ canonical: articleUrl, jsonld: [post, crumbs2], head: '<meta property="article:published_time" content="2026-11-01T00:00:00Z"/>', body }).replace('content="website"', 'content="article"');
  const issues = body => checkPage(html(body), { url: articleUrl, origin, kind: "article" });
  assert.ok(issues('<img data-media-id="m1" src="https://c/a.webp" width="10" height="10" alt="">').some(i => i.level === "error" && /empty alt/u.test(i.message)));
  assert.ok(!issues('<img data-media-id="m1" src="https://c/a.webp" width="10" height="10" alt="لولا">').some(i => i.level === "error"));
  assert.ok(issues('<img src="https://c/a.webp" alt="لولا">').some(i => i.level === "warn" && /width\/height/u.test(i.message)));
});
