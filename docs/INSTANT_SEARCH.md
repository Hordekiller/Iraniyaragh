# Instant storefront search

## Engine decision

The production VPS observation on 2026-11-28 was 3.8 GiB RAM, about 646 MiB
available, no swap, and about 4.1 GiB free disk (90% used). A separate
Meilisearch process plus persistent index and rebuild headroom would compete
with PostgreSQL, the API and the storefront on this host. The current public
catalog contained 25 active products. Search therefore uses PostgreSQL's
`pg_trgm` and `fuzzystrmatch` extensions, an indexed normalized projection,
and bounded queries. It adds no SaaS, browser key, or separate container.
Reconsider a separate search engine only after measured catalog growth and
reserved VPS capacity justify it.

## Public behavior

`GET /api/v1/search/suggest?q=...` returns up to eight public products,
categories, brands and an approved or keyboard correction when applicable.
`GET /api/v1/search/products` applies category, brand, availability, discount,
price and verified attribute filters before count and pagination. It supports
relevance, newest, bestseller and price sorting. The browser starts requests
after two meaningful characters and a 120 ms debounce, cancels obsolete
requests, and updates the complete `/search` list while typing after 180 ms.
The latter changes the URL with `replace`, preserving filters and resetting
the page. The shared header, shop header and mobile overlay use the same
component. Search URLs retain the existing noindex policy.

The versioned `search_normalize_v1` pipeline handles Arabic/Persian Yeh and
Kaf, digits, diacritics, tatweel, ZWNJ, spaces and English case. A joined
adjacent-token term supports compounds. Automatic one-edit typo matching is
limited to Persian words of at least four letters. Numeric terms and model
identifiers are never fuzzy matched. A bounded Latin-to-Persian keyboard
alternative and reviewed aliases cover selected mixed-language terms. Stored
catalog names remain unchanged. Avoid aliases between different sizes,
mechanisms, materials or compatible parts.

The projection holds public titles, slugs, variant SKU, barcode, title,
verified dimensions, active attribute names and values, category ancestors,
brand, approved keywords and sanitized description text. PostgreSQL remains
authoritative. The response rechecks active product and variant status and
hydrates current price, media and inventory from existing commerce reads.
No indexed price or stock value is trusted for checkout.

## Synchronization and recovery

Migrations `20261128110000_instant_search`,
`20261128120000_search_verified_variant_specs` and
`20261128130000_search_trigger_efficiency` and
`20261128140000_search_bulk_variant_sync` and
`20261128150000_search_term_fk_alignment` create the projection, indexes,
triggers and initial backfill. Bulk variant statements refresh each affected
product once. Index replacement happens in the same database
transaction as catalog writes; a failed catalog transaction also rolls back
its projection. Product publication, archives, variants, category, brand and
attribute updates are covered by triggers. Price, inventory and media are
read live, so they do not need an index event or projection rewrite. Search visibility is immediate
after a committed transaction, subject to read replica lag if one is added
later. Writes that cannot update the projection fail rather than silently
dropping indexing work.

Before applying migrations to production, take a database backup and verify
that it restores to an isolated database according to the existing operations
runbook. Check free space for a full index rebuild and run migrations during a
low-write window; trigger backfill holds a transaction and must be monitored.
Do not run demo seeds or fixture authentication against the sales database.
After migration, compare active variants with SearchDocument count and run
sample public queries. The staff page at `/catalog/search` shows missing
documents and offers an authorized, audited reindex in batches of 25 products.
Every batch has a fresh idempotency key. Back up SearchAlias and
SearchProductKeywords with the normal database backup.

Rollback the application to its previous release if search causes a storefront
regression. Leave additive tables, extensions and migrations in place; do not
drop them or rewrite applied migrations. The earlier catalog route can serve
ordinary listing until a forward repair is deployed. Search also falls back
to an indexed normalized title prefix query with a 500 ms SQL timeout if the
projection path fails. A degraded response is marked `degraded: true`.

## Security, operations and measurement

Public search has a per-IP 180 requests/minute limit, validates query size and
filter shapes, bounds result size and SQL execution time, and uses `no-store`
for live price and stock responses. Administrative reads require
`catalog.read`; alias, keyword and reindex writes require `catalog.write`,
fresh staff MFA, idempotency and audit logging. Only known catalog-token
queries are retained in daily aggregates, with unknown or sensitive-looking
input grouped as `[unrecognized]`; 30-day retention is enforced at writes.
Raw IP, identity and arbitrary query strings are not stored for analytics.
The staff page reports searches, zero results and validated result clicks.
Purchase conversion is explicitly **not measured** in this implementation;
the dashboard says so rather than presenting a fabricated rate.

Monitor API error rate and latency for both search endpoints, PostgreSQL
statement timeouts, `SearchDocument` missing count, table/index sizes, and
query volume. Recheck p95 under representative concurrent traffic before any
production rollout. Local fixture search latency and golden relevance are
reported in the PR; they are not a production-load or real-catalog benchmark.
The performance target is warm suggestion API p95 at or below 100 ms. It is
not claimed as achieved until measured on the deployed environment with a
representative catalog and concurrency.

On 2026-11-28, the isolated PostgreSQL fixture run completed 30 warm direct
database searches with p95 12.77 ms. Its golden set had top-three hit rate
1.00, MRR 1.00 and zero-result rate 0.00. One committed product-to-projection
update took 9.31 ms, and the projection tables and indexes occupied 311,296
bytes. These measurements use synthetic test products and do not include HTTP,
real catalog size, server concurrency or VPS resource consumption.
