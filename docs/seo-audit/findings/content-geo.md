# Content, GEO and public-delivery audit

Observed 2026-11-15. Read-only live requests; no production data changed. Repository baseline inspected before other agents' edits. Findings describe that baseline, not deployment acceptance.

## Scope and interpretation

Domain independently confirmed from public-origin tests and documented callback URL: https://iraniyaragh.com. Inspected repository SSR/metadata/discovery/product/article paths, public raw HTML, robots, sitemap index and every sitemap shard. This is a sample content audit, not a complete crawl of every URL. Browser-rendered DOM, Search Console, Google-selected canonical, Rich Results Test, Core Web Vitals, backlinks and actual AI citations were not measured by this audit. No numeric SEO/GEO score is assigned.

Google says AI Overviews/AI Mode use existing SEO fundamentals; eligibility requires indexed content that can show a snippet. There is no special AI schema or additional text file requirement, and satisfying requirements does not guarantee indexing. Crawl access, useful visible text, internal discovery and schema/content agreement are the relevant implementation targets. [Google AI features](https://developers.google.com/search/docs/appearance/ai-features).

## Live evidence

| Surface | Observation |
| --- | --- |
| `/` | HTTP 200, Persian `lang=fa`, RTL, `index, follow`, apex canonical, server-delivered product links and prices, Organization + WebSite JSON-LD. Approximately 68,500 characters of HTML. |
| `/robots.txt` | HTTP 200: wildcard user agent permits `/`, disallows `/api/`, advertises canonical sitemap. |
| `/sitemap.xml` | HTTP 200, valid sitemap index. Four advertised gzip XML shards all returned HTTP 200 and decompressed/parsed. |
| Sitemap inventory | 5 static URLs, 11 products, 3 categories, 9 brands; 28 URLs total. No article shard. This does not prove all 28 pages are indexed or accessible. |
| `/categories/concealed-cabinet-hinges` | HTTP 200, correct canonical, index/follow, H1, five linked products, CollectionPage/ItemList and BreadcrumbList in raw HTML; no category explanatory text. |
| `/products/kolity-k63-soft-close-overlay-hinge` | HTTP 200 on retry, 120,680 delivered bytes. Full product description, specifications, installation instructions and human-readable FAQ in raw HTML; Product and BreadcrumbList JSON-LD. Eight rendered image tags all have nonempty alt. No links to `/brands/…` in raw HTML. |
| `/blog` | HTTP 404 on retry; repository deliberately returns 404 for empty public article collection, consistent with no blog sitemap shard/home navigation. This is not itself a routing defect. |
| `/llms.txt` | HTTP 404. Optional; not a Google SEO/AI-search failure. |

Initial Python fetches of product/blog hit TLS handshake timeouts; subsequent curl requests succeeded. Web fetch service could not access the domain while direct requests could. This is insufficient to diagnose an outage, bot blocking, or persistent server slowness. Do not turn these samples into an uptime/Core Web Vitals claim. Home response used `private, no-cache, no-store`; request-local caching in code intentionally preserves price/inventory correctness.

## Findings and concrete next steps

1. **Medium — brand pages have weak internal discovery.** Nine brand URLs exist in the live sitemap, but sampled product brand appears as plain text (`apps/web/src/views/ProductPage.tsx`). Project the stored canonical brand slug through the public catalog and render an ordinary brand anchor. Do not fabricate slugs by lowercasing translated brand names. Verify product-to-brand links and brand-page canonical using raw HTML. Sitemap inclusion does not replace useful internal navigation.
2. **Medium — category and brand landing content is only a grid.** `apps/web/src/server/CollectionPage.tsx` emits generic descriptions and product cards. For published categories add verified buying guidance that answers compatibility and selection questions, plus links to relevant products/guides. For hinges, useful questions concern overlay/inset installation, door dimensions, cup size and adjustment; values must come from actual specifications. Do not auto-fill unsupported load ratings or broad keyword text. This is an editorial opportunity, not a guaranteed ranking fix.
3. **Medium — shipping/return policies remain unfinalized.** Policy route explicitly stays noindex because business rules await approval. Do not invent shipping fees, deadlines, warranty or return windows merely to populate merchant schema. Complete real business policy and public visible wording first; then project eligible schema. Missing optional merchant properties are not automatically critical validation errors. [Google merchant listings](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing).
4. **Low — indexable help articles omitted from sitemap.** Eleven static help topics are implemented at `/help/[slug]` and linked from the index, but only `/help` is included in static shard. Add canonical help-topic URLs from a shared authoritative list if they remain intentionally indexable. Keep policy/private/search URLs excluded.
5. **Low — image schema unnecessarily repeats renditions.** Baseline `product-json-ld.ts` emits every source of each image, including small thumbnails and duplicate-format sizes. Sample Product schema is consequently large. Prefer a suitable high-resolution rendition per unique approved image; preserve distinct gallery images and actual URLs. This is a payload-quality improvement, not evidence that current JSON-LD is invalid.
6. **Editorial backlog — no live buying-guide collection.** `/blog` is currently empty/404; code already supports sourced articles, publication/update dates, visible references and BlogPosting. Publish only researched, useful guides with verified specs, such as choosing hinge mount type or measuring drawer-slide compatibility. Add contextual product/category links. Do not publish mass-generated thin pages for GEO.
7. **Low — future article byline alignment.** `articleJsonLd` uses the store Organization as author, while article header has no visible author attribution. Add an honest store/editorial byline when articles are authored by that organization. Do not expose private staff identities or invent individual credentials.

## What already works for GEO

The sampled product is not a JavaScript-only shell: title, price, compatibility details, tables, FAQ and installation text are server-delivered. Next server routes provide initial product data to client components. This helps consumers that do not execute JavaScript; Google itself processes crawling, rendering and indexing separately. [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

The K63 description contains clear self-contained passages (overlay installation, clip-on connection, 35 mm cup and stated door-thickness range). Their factual accuracy was not independently validated against manufacturer documentation, so reuse should retain product-source verification. No arbitrary word-count rule is necessary. The page correctly says there are no reviews and does not fabricate aggregate ratings. Public business contact identity exists in the home/footer/schema; cross-platform entity ownership and mentions were not researched, so no claim of missing external authority is made.

## Crawler policy snapshot

All entries below inherit the observed wildcard rule: public HTML allowed and `/api/` disallowed. This is robots policy only, not proof of CDN access or actual crawler visits.

| User agent | Access | Capability distinction |
| --- | --- | --- |
| Googlebot | Public pages allowed | Google Search crawling, including basis for Google AI features |
| OAI-SearchBot | Public pages allowed | OpenAI search crawler; separate from GPTBot |
| PerplexityBot | Public pages allowed | Perplexity crawler |
| Claude-SearchBot | Public pages allowed | Claude search crawler; separate from ClaudeBot |
| GPTBot | Public pages allowed | OpenAI training crawler; permission is not evidence of ChatGPT citation |
| ClaudeBot | Public pages allowed | Training crawler; permission is not evidence of Claude search citation |
| Google-Extended | Public pages allowed | Separate control from Googlebot; not evidence of Google Search indexing |
| CCBot | Public pages allowed | Common Crawl access; not a search-ranking guarantee |

No bot-specific policy change is necessary for this observed public access objective. Licensing/training policy should remain an explicit business choice. No `llms.txt`, fake FAQ rich-result claim, invented review score, invented sameAs profile, or unsupported freshness claim is recommended.

## Remaining acceptance evidence

Use authenticated Search Console to inspect sitemap processing, indexing exclusions, representative product/category/home live tests, selected canonicals, Product/Merchant listing/Breadcrumb reports, security/manual actions and available Core Web Vitals data. Compare actual rendered Google HTML against raw public content. Run Rich Results Test on representative complete/incomplete products and real variant cases after deployment. Record dates, inspected URLs and actual report results; absence of report data is not a pass. Source guidance distinguishes required fields and critical errors from optional improvements and recommends post-deployment URL inspection. [Google Product overview](https://developers.google.com/search/docs/appearance/structured-data/product).
