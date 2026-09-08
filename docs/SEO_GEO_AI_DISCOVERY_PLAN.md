# SEO, GEO and AI Discovery Foundation

Status: delivery baseline; reviewed 2026-09-08. Owner A is Platform/API and owner
B is Web/Content. Every production change requires independent verification.

## 1. Outcome and non-goals

Iraniyaragh must expose accurate, crawlable and attributable Persian commerce
information to conventional search, shopping surfaces and answer engines. SEO
(search discovery), AEO/GEO (answer/citation readiness) and on-site AI share the
same governed catalog source; none may invent price, availability, specifications,
policy or advice.

There is no guaranteed ranking or AI citation. `llms.txt` may be offered as an
experimental convenience, but is not an indexing control and never replaces HTML,
robots.txt, sitemaps, feeds or structured data.

## 2. Architecture decisions required before UI implementation

The current customer web is a client-rendered Vite SPA. Public product, category,
brand, guide and policy URLs require useful HTML, title, canonical, language and
structured data in the initial response. Select SSR, SSG with safe revalidation, or
another server-rendered discovery surface in an accepted ADR; do not bolt critical
metadata onto client-only rendering. Admin, account, cart, checkout and search-result
pages remain non-indexable.

Canonical production origin, host policy (`www` or apex), trailing-slash policy,
Persian slug/transliteration rules and future locale URL strategy are configuration,
not scattered literals. Redirects use one hop and preserve no tracking parameters.

## 3. URL and indexability contract

| Surface                                              | Index                    | Sitemap    | Structured data                |
| ---------------------------------------------------- | ------------------------ | ---------- | ------------------------------ |
| Home                                                 | yes                      | pages      | Organization/WebSite           |
| Published category                                   | yes                      | categories | BreadcrumbList/CollectionPage  |
| Active brand landing                                 | yes when substantive     | brands     | BreadcrumbList/CollectionPage  |
| Published sellable product                           | yes                      | products   | Product + Offer where eligible |
| Original guide/FAQ/policy                            | yes when approved        | content    | Article/appropriate page type  |
| Facets, sort, internal search, tracking URLs         | no                       | no         | no rich-result targeting       |
| Cart, checkout, account, auth, admin, API            | no                       | no         | no                             |
| Draft, archived, deleted, unavailable-without-policy | no or governed retention | no         | no stale Offer                 |

Indexability is a server-side projection of lifecycle, canonicality, content quality
and policy. A URL excluded from sitemap is not automatically `noindex`; robots
blocking is not a substitute for `noindex`, because a blocked page cannot expose its
directive. Redirect, `404`, or `410` is selected from lifecycle policy.

## 4. Dynamic sitemap system

The system generates XML at request time from a read-optimized, cached projection;
no product URL is maintained manually or frozen into a frontend build.

Public endpoints:

- `/robots.txt` advertises the canonical `/sitemap.xml`;
- `/sitemap.xml` is a sitemap index;
- `/sitemaps/products-{cursor}.xml.gz` contains published eligible products;
- `/sitemaps/categories-{cursor}.xml.gz`, `brands-{cursor}.xml.gz` and
  `content-{cursor}.xml.gz` are separate shards;
- image/video/news extensions are added only when their documented eligibility and
  metadata exist.

Mandatory behavior:

- absolute HTTPS canonical URLs from an allowlisted production origin;
- UTF-8, XML escaping, correct XML or gzip content type and no cookies;
- at most 50,000 URLs or 50 MB uncompressed per sitemap; use a lower operational
  shard target (for example 10,000) and stable cursor/range keys, never offset scans;
- `lastmod` is the last significant indexable-content change, not request/build time;
- no `changefreq`/`priority` guessing and no fake fresh dates;
- deterministic ordering and no duplicates across shards;
- DB query selects only required fields and uses a matching eligibility/index path;
- short edge/object cache plus stale-if-error; ETag/Last-Modified and conditional GET;
- publish/archive/slug/canonical/content/media changes emit an outbox event that
  invalidates affected shard/index and queues search-engine notification;
- deletion disappears from sitemap quickly and follows redirect/404/410 policy;
- generation failure fails closed with last known-good artifact where safe, alerts,
  and never emits a partial `200` XML document;
- sitemap endpoints are rate-limited separately from customers and protected against
  cache stampede; generation metrics include duration, URL count, age and failures.

Submission: robots discovery plus Google Search Console/Bing Webmaster submission.
IndexNow sends changed canonical URLs in bounded, deduplicated background batches;
it complements crawling and never contains private URLs. Google notification/indexing
APIs must not be misused for ordinary commerce pages.

## 5. Page-level technical SEO

- Unique Persian title and description generated from approved fields with editorial
  overrides; no keyword stuffing or duplicated boilerplate.
- Exactly one canonical; self-canonical on primary pages; pagination/facet behavior
  follows the URL contract.
- `<html lang="fa" dir="rtl">`; future locales use reciprocal `hreflang`, including
  `x-default`, only after equivalent pages exist.
- Semantic headings, links with real `href`, breadcrumbs, descriptive alt text and
  crawlable navigation; important discovery never depends only on JS events.
- Open Graph/social metadata use canonical title, summary and approved image.
- HTTP status, canonical, robots meta/header and rendered content never contradict.
- Core Web Vitals budgets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75 by page type;
  responsive images, declared dimensions, local fonts and minimal hydration.

### Link relationship and robots rules

- Normal internal editorial/navigation links remain followable; adding `nofollow`
  site-wide is prohibited.
- `rel="sponsored"` marks paid/affiliate links and `rel="ugc"` marks untrusted
  user-generated links. `nofollow` is reserved for relationships that cannot
  otherwise be endorsed; values may be combined when accurate.
- `nofollow` is a link hint, not an indexing directive. Page exclusion uses an
  accessible `noindex` meta/X-Robots-Tag, canonical/redirect, or `404`/`410` according
  to lifecycle. Do not robots-block a page merely to hide its `noindex` directive.
- New-tab links use safe browser relationship values in addition to the semantic
  relationship. Staff cannot override these semantics ad hoc.

### Store tags, facets and pagination

Product tags are governed landing-page entities, not an unlimited byproduct of data
entry. A tag becomes indexable only with a unique slug, approved title/summary,
meaningful product set, internal-link purpose, canonical URL and no substantial
overlap with a category/brand. Empty, thin, duplicate, typo, single-use and purely
operational tags are `noindex,follow` and absent from sitemaps; obsolete tags merge
with a one-hop redirect or return the lifecycle-approved status.

Filter combinations, sort order, page size, internal search and tracking parameters
are non-indexable and excluded from sitemaps. Crawlable curated facets require an
explicit allowlist and content owner. Pagination has stable self-canonicals and
crawlable links; page 2+ is not automatically canonicalized to page 1 when its
product set is distinct. Query-parameter rules are tested to prevent crawl traps.

## 6. Structured data and commerce feeds

JSON-LD is rendered from the same public projection as visible HTML. It is schema
validated, never contains hidden or fabricated facts, and is removed/updated with
the underlying state.

- Organization/OnlineStore identity, legal/contact/return/shipping policies;
- WebSite and breadcrumb graph;
- Product identity (stable SKU/GTIN/MPN/brand only when real), images, description;
- Offer price in the site currency, URL, item condition, seller and server-derived
  availability; never expose warehouse quantities;
- MerchantReturnPolicy and OfferShippingDetails only after business policy is approved;
- ProductGroup/variants only after canonical variant policy is accepted;
- AggregateRating/Review only from genuine visible reviews—never self-generated;
- Article/HowTo/FAQ types only when the visible page and current search-feature
  eligibility justify them; markup does not guarantee a rich result.

Merchant Center/free-listing feed is generated from the same projection and checked
for parity of ID, URL, title, image, price, currency and availability. Mismatch is a
release-blocking data defect. Feed credentials and diagnostics are operational secrets.

## 7. AI answer and citation readiness (GEO/AEO)

AI search agents must receive fast, stable, factual HTML—not a separate cloaked
version. Important pages lead with a concise answer/specification summary, then
evidence, tables, definitions, compatibility guidance, author/reviewer and meaningful
`dateModified`. Claims cite primary manufacturer or standards sources where relevant.

Crawler policy is explicit and reviewed quarterly:

- permit search/index agents needed for discovery, subject to capacity controls;
- decide training agents separately (for example Google-Extended and GPTBot);
- do not assume one vendor token controls search, training and user-triggered fetch;
- document OAI-SearchBot, ChatGPT-User, GPTBot and equivalent verified vendor agents;
- verify crawler IP/rDNS using vendor procedures before special treatment; user-agent
  text alone grants no trust or access;
- public content only: robots, AI agents and feeds never bypass authorization,
  paywalls, rate limits or data classification.

Optional `/llms.txt` and `/llms-full.txt` are generated from approved canonical public
content, disclose no extra facts, carry freshness provenance, and are monitored as an
experiment. Success is measured by crawl logs, indexed/cited landing pages, assisted
sessions and conversion—not file existence.

### Article, guide and landing-page editor

The content system supports `draft → in_review → approved/scheduled → published →
archived` with author, independent reviewer, timestamps, immutable revision history,
preview tokens, autosave recovery and audited publish/unpublish/redirect operations.
AI may create a labeled draft but cannot approve or publish it.

Editor fields are structured rather than one opaque HTML blob: content type, Persian
title, slug, excerpt/answer summary, semantic blocks, headings, tables, media/alt text,
product/category relations, author/reviewer, primary sources with access date,
fact-review date, canonical override (privileged), robots policy (bounded choices),
social metadata and structured-data eligibility. Output uses an allowlisted sanitizer;
scripts, event handlers, unsafe embeds and arbitrary JSON-LD are rejected.

Article tags and store product tags have separate taxonomies and ownership. Synonyms
and aliases map to one entity; Unicode/Persian normalization and collision checks are
server-side. Editors receive duplicate-title/slug, orphan, broken-link, missing-alt,
heading-order, thin-content, stale-source and schema/visible-content parity warnings.
Keyword density is not a quality score.

Publication invalidates page/navigation/sitemap/feed caches and emits a versioned
outbox event. Scheduled publication uses UTC internally and Iran time only in UI.
Unpublish requires redirect/retention choice and prevents orphaned internal links.

## 8. On-site AI foundation

AI features start behind a provider-neutral application port and feature flags.
Approved initial uses are semantic query understanding, product comparison/summarizing
from retrieved public catalog facts, content-assistant drafts and support retrieval.
Prices, stock, eligibility and orders always come from deterministic services.

Required controls: purpose and data classification, consent where applicable,
prompt-injection boundaries, tenant/user authorization before retrieval, allowlisted
tools, schema-constrained outputs, citations to retrieved records, Persian evaluation
sets, human approval for publication, model/provider/version registry, cost/latency
budgets, redacted telemetry, retention/deletion, rate limits, kill switch and fallback.
Customer-facing output must identify uncertainty and must not provide unsafe technical
installation advice without approved source material.

## 9. Measurement and observability

Baselines are segmented by page type and branded/non-branded intent:

- crawl/index coverage, sitemap submitted/discovered/indexed counts and crawl errors;
- impressions, clicks, CTR and average position (directional, not a quality target);
- merchant diagnostics and price/availability parity;
- Core Web Vitals and render/index regressions;
- server-log verified bot requests, status/cache/latency, crawl traps and 5xx;
- answer-engine referrals and manually sampled citations/answer correctness;
- AI retrieval groundedness, citation validity, unsafe/hallucinated answer rate,
  latency, token/cost per successful task and human acceptance rate;
- organic/AI-assisted add-to-cart and conversion without storing query-level PII.

### Performance test workflow

Performance has three complementary gates:

1. PR laboratory tests run repeatable Lighthouse/browser measurements on home,
   category, product, guide, cart and checkout fixtures. Budgets cover LCP/CLS/TBT as
   a lab proxy, accessibility/SEO failures, JavaScript/CSS/image/font bytes, request
   count and server-rendered HTML size. Compare medians, not one noisy run.
2. Post-deploy synthetic tests use representative mobile network profiles, verify
   TTFB/cache/compression/image behavior and store trend artifacts. Severe regression
   blocks promotion or triggers rollback; transient noise has bounded visible retry.
3. Privacy-reviewed RUM reports p75 LCP/INP/CLS by page type, device and geography.
   It requires sufficient samples and never stores full URLs containing private data.

Initial budgets are the Core Web Vitals targets above plus repository-owned bundle
and request baselines recorded when server rendering lands. Raising a threshold only
to make CI green is prohibited. Third-party scripts require an owner, purpose,
consent classification, performance budget, expiry review and kill switch.

Search Console, Bing Webmaster and merchant access uses least privilege and named
owners. Exported query data follows retention and privacy policy.

## 10. Automated workflows

`Discovery Contract` runs on relevant pull requests: build/render fixtures, validate
robots/canonical/indexability matrix, XML/gzip sitemaps, same-origin/duplicate rules,
JSON-LD schemas, HTML/structured-data parity and secret/PII absence.

`Production Discovery Audit` runs after deployment and daily: fetch robots and sitemap
index, sample every shard/page type, verify status/canonical/robots/rendered content,
schema, feed parity, freshness and latency; preserve a sanitized report and alert on
regression. It must never crawl admin/account/cart/checkout.

`Performance Budget` runs on relevant web pull requests and after deployment:
exercises the representative template matrix, compares checked-in budgets/baselines,
uploads reports and publishes a concise regression summary. Production RUM alerts
remain separate from flaky laboratory thresholds.

`URL Change Publisher` consumes transactional outbox events: deduplicate and batch
IndexNow submissions, invalidate caches, retry known-safe failures with backoff and DLQ,
and retain outcome—not customer data. Reconciliation detects unpublished changes.

`Content Quality Gate` requires writer + independent reviewer for public claims and
AI drafts, records source/freshness, detects duplicates/thin content and schedules
re-review. AI cannot auto-publish.

`Quarterly Discovery Review` revalidates crawler tokens, official eligibility,
structured-data fields, policies, query demand, citations and experiments; changes
are recorded rather than silently chasing algorithms.

## 11. Delivery plan and gates

| Wave            | Platform/API (A)                                   | Web/Content (B)                              | Exit evidence                             |
| --------------- | -------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| D0 contract     | rendering ADR, origin/URL/index policy             | taxonomy, templates, keyword/entity research | approved matrices and baselines           |
| D1 crawl        | dynamic sitemap/index, robots, cache/invalidation  | server-rendered canonical templates          | crawler integration and failure tests     |
| D2 commerce     | public projection, schema/feed parity              | product/category/brand metadata              | rich-result/feed validation fixtures      |
| D3 authority    | provenance/content model                           | Persian guides, policies, internal links     | editorial review and source evidence      |
| D4 AI discovery | crawler controls/logging, optional llms experiment | answer blocks/entity consistency             | citation sampling and no private exposure |
| D5 on-site AI   | provider port/RAG/evals/guardrails                 | cited UX and human review                    | adversarial evals, budgets, kill switch   |
| D6 operate      | scheduled audit, alerts, dashboards                | optimization backlog                         | 30-day clean production evidence          |

Dependencies: published catalog and stable URL projection precede D1/D2; approved
shipping/return/pricing policies precede their markup; production origin precedes
webmaster verification; on-site AI does not block MVP commerce.

## 12. Definition of Done

- Public pages provide useful initial HTML and pass indexability matrix tests.
- Dynamic sitemap is correct under publish, update, archive, slug change, empty shard,
  large dataset, concurrent regeneration and upstream failure.
- Visible facts, API projection, JSON-LD and merchant feed are consistent.
- Product/article tags obey their separate governance; facet/query crawl traps and
  misuse of nofollow/noindex are covered by tests.
- Editor publication is revisioned, permissioned, sanitized, independently reviewed
  and connected to cache/sitemap/feed invalidation.
- No private/duplicate/faceted URL leaks into crawl surfaces.
- Performance/accessibility/security budgets pass on representative devices.
- Search/AI crawler policy and training decision are explicit and reversible.
- AI output is retrieved, cited, evaluated, redacted, cost-bounded and kill-switchable.
- Production audit, dashboards, owner, alert route, rollback and quarterly review exist.

## 13. Primary references

- Google Search essentials and ecommerce: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>, <https://developers.google.com/search/docs/specialty/ecommerce>
- Google sitemaps and limits: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>, <https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps>
- Google Product data: <https://developers.google.com/search/docs/appearance/structured-data/product>
- Google crawler controls: <https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers>
- Google link relationship guidance: <https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links>
- Google robots meta guidance: <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag>
- Google Core Web Vitals: <https://developers.google.com/search/docs/appearance/core-web-vitals>
- Schema.org Product: <https://schema.org/Product>
- IndexNow protocol: <https://www.indexnow.org/documentation>
- OpenAI crawlers: <https://platform.openai.com/docs/bots>

References were checked 2026-09-08. Official documentation is authoritative when
eligibility, crawler tokens or protocol behavior changes.
