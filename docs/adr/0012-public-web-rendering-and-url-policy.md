# ADR-0012: Public web rendering and canonical URL policy

- Status: Proposed; becomes Accepted after independent review and merge
- Date: 2026-09-08
- Owners: Web/Product lead implements; Platform/API lead verifies contracts
- Parent: #122
- Decision issue: #124

## Context

The customer web is currently a single-route React/Vite prototype whose meaningful
content appears only after client JavaScript. The production catalog needs useful
initial HTML, deterministic metadata, dynamic product/category/brand/guide routes,
safe revalidation and crawl controls. A custom Vite SSR server would duplicate
routing, data-loading, head and cache machinery. Static-only generation cannot keep
price, lifecycle and availability evidence current without rebuilding the whole site.

`apps/admin` already establishes Next.js 16 and React 19 in the monorepo, while
`ARCHITECTURE.md` explicitly anticipates route-by-route storefront migration. The
NestJS API remains the only source of commerce truth.

## Decision

Migrate `apps/web` route-by-route to Next.js App Router. Server Components render
public discovery content by default; Client Components are isolated to interaction
such as authentication, cart controls and carousels. No price, availability,
eligibility, canonical or indexability rule moves into the UI.

### Rendering and freshness

- Home and approved evergreen content may use static generation with governed
  revalidation.
- Category, brand and product pages use server rendering/data caching with tagged
  on-demand invalidation from versioned catalog/outbox events.
- Availability displayed in indexable HTML is a coarse public state from the API,
  never a warehouse quantity. Add-to-cart and checkout always revalidate live state.
- Cache keys include canonical entity/version and locale, never identity, cookie or
  authorization. Personalized fragments cannot alter canonical public HTML.
- A failed revalidation serves last known-good public content only within its defined
  stale window. Archive/unpublish/price-safety events bypass stale serving and purge.
- Preview/draft rendering requires an expiring, scoped server-validated token and is
  `noindex`; preview responses never populate public caches.

Dynamic sitemap XML remains an API/worker-owned read projection per
`SEO_GEO_AI_DISCOVERY_PLAN.md`, rather than coupling the catalog enumeration contract
to framework metadata helpers. Next.js serves page metadata and `/robots.txt` may
proxy or render the canonical policy; `/sitemap.xml` routes to the API-backed index.

### Canonical origin and host

- Production uses one configured HTTPS apex origin. All `www`, HTTP and alternate
  deployment hosts redirect to it at the edge in one permanent hop.
- `PUBLIC_WEB_ORIGIN` is server-only, required and strictly parsed in production:
  HTTPS, apex host, no credentials, path, query, fragment or trailing slash.
- Preview/staging hosts emit `X-Robots-Tag: noindex, nofollow` globally, are access
  controlled where feasible, and never appear in canonical URLs or sitemaps.
- Proxy host headers and forwarded headers never construct canonicals. Only the
  validated configured origin may do so.

The actual registered domain is an operational input before deployment; this ADR
fixes apex-as-canonical behavior without committing an unpurchased domain.

### URL grammar

Initial Persian URLs are locale-unprefixed:

- `/`;
- `/products/{slug}`;
- `/categories/{slug}`;
- `/brands/{slug}`;
- `/guides/{slug}`;
- `/policies/{slug}`.

Rules:

- lowercase ASCII route segments; entity slug is canonical Unicode NFC Persian or
  lowercase ASCII letters/digits separated by one ASCII hyphen;
- normalize Arabic `ي`/`ك` to Persian `ی`/`ک`, remove diacritics and control/bidi
  characters, collapse whitespace/hyphens, and reject empty/reserved/colliding slugs;
- IDs, prices, dates, stock labels and marketing text do not enter canonical slugs;
- no trailing slash except `/`; edge/framework redirects alternate form once;
- percent encoding is normalized; decoded slash, dot-segments and ambiguous Unicode
  are rejected, not silently reinterpreted;
- published slugs are stable. A privileged rename transaction stores redirect
  history, rejects chains/loops/collisions and invalidates page/sitemap/feed caches;
- route matching remains case-sensitive at the application contract even when an
  upstream filesystem is not.

Future non-Persian locales receive explicit prefixes such as `/en/...`. Persian
canonical URLs remain stable; reciprocal `hreflang` and `x-default` appear only when
equivalent approved pages exist.

### Query, pagination and indexability

- Tracking parameters are removed by redirect when safe and never influence content.
- Internal search, sort, page-size and arbitrary facets are `noindex,follow`, absent
  from sitemaps and excluded from cache-key explosion.
- Only allowlisted, editorially owned facet landing pages get clean path URLs and may
  be indexable; query combinations never self-promote into landing pages.
- Pagination uses crawlable links and self-canonical pages. Distinct page 2+ content
  is not canonicalized to page 1. Empty/out-of-range pages return `404`.
- Cart, checkout, authentication, account, order, API and admin surfaces use
  `noindex` plus authentication/access controls as applicable and are never sitemap
  candidates.
- Published eligible entities return `200`; old slugs return one-hop `308`; unknown
  resources return `404`; intentionally permanently removed resources use `410` only
  under the recorded lifecycle policy.

### Metadata ownership

The API public projection owns factual fields and lifecycle. The web route owns the
presentation template. Metadata is resolved in this order: validated editorial
override, deterministic template from public projection, safe fallback. Canonical,
robots and JSON-LD cannot be arbitrary editor HTML. Visible page facts, metadata,
JSON-LD and merchant feed must match.

## Alternatives considered

### Keep client-only Vite SPA

Rejected: weak initial HTML and duplicated head/indexability behavior; crawler-side
rendering is not an acceptable dependency for primary commerce discovery.

### Build custom Vite SSR

Rejected for MVP: technically feasible, but the team would own routing, streaming,
data/cache invalidation, head, error boundaries and deployment integration already
provided by the selected monorepo framework. It adds a second server-rendering stack.

### Full static export

Rejected as the sole strategy: large/dynamic catalog lifecycle, price and availability
updates require event-driven freshness and controlled stale behavior. Static output
remains valid selectively for evergreen pages.

### Render public HTML inside NestJS

Rejected: couples presentation/templates to the business API and violates client/API
separation. NestJS provides projections and sitemap enumeration, not storefront UI.

## Migration plan

1. Freeze the current Vite visual baseline with screenshots, accessibility and E2E.
2. Add Next.js runtime/build configuration within `apps/web`; align the already-used
   monorepo React/Next versions in one reviewed dependency change.
3. Introduce shared server-only API client, validated `PUBLIC_WEB_ORIGIN`, root Persian
   layout, not-found/error boundaries and global non-production robots protection.
4. Migrate `/` without visual regression, then category, brand, product, guide and
   policy routes. Each route ships only after initial-HTML, metadata, a11y, performance
   and API failure tests.
5. Add tag invalidation receiver/worker boundary, dynamic sitemap routes and feed
   parity through their dedicated issues.
6. Migrate interactive auth/cart islands without changing backend security or pricing.
7. Remove the Vite entry only after all production routes and rollback evidence pass.

During migration the edge routes a whole path to one runtime; a path is never served
by both based on crawler/user-agent. Rollback restores the previous path mapping and
last known-good deployment, not a crawler-specific response.

## Verification gates

- View-source contains unique title, description, canonical, Persian `lang`/RTL,
  primary content and eligible JSON-LD with JavaScript disabled.
- Host/header injection, alternate host/scheme, trailing slash, Unicode variants,
  query parameters, redirects, loops and collision tests pass.
- Draft/private/archived/search/facet/cart/account/admin routes cannot enter sitemap
  or indexable responses.
- Cache isolation, invalidation, concurrent publish/rename, stale-safety and API
  outage tests pass.
- HTML/API/JSON-LD/feed parity and no sensitive field leakage pass.
- Lighthouse lab budgets, representative mobile E2E and production Discovery Audit
  pass before removing the Vite fallback.

## Consequences

- The customer web gains a Node rendering runtime and requires deployment health,
  scaling, cache and observability ownership.
- Route migration and dependency alignment are finite upfront work, but reuse the
  framework already operated in this repository.
- Server Components reduce browser JavaScript when boundaries are respected; they do
  not excuse unbounded backend calls or caching personal data.
- #129 and #126 are unblocked after independent approval of this ADR. #127 follows
  their stable public projections/templates.

## Primary references

- Next.js rendering and caching: <https://nextjs.org/docs/app/getting-started/fetching-data>
- Next.js metadata: <https://nextjs.org/docs/app/getting-started/metadata-and-og-images>
- Next.js internationalization: <https://nextjs.org/docs/app/guides/internationalization>
- Google JavaScript SEO basics: <https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics>
- Google canonical guidance: <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>
- Google faceted navigation guidance: <https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation>

References reviewed 2026-09-08. Framework behavior is pinned by the repository lockfile
and reverified during the migration PR.
