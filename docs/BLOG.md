# Blog / governed articles

> Documentation review: **2026-11-07**. [Current implementation and release boundaries](CURRENT_STATE.md) is the starting point. Source, CI, published images, deployed SHA and operator/provider acceptance are separate evidence levels. Dated sections below preserve their original checkpoint and do not assert current VPS parity.

Status: implemented 2026-11-06 (delivers the article part of #125). No article is
authored by the system: the blog stays hidden (`/blog` is a real 404, no footer link,
no sitemap entry) until an operator publishes the first article.

## Workflow and permissions

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED` (published → draft = unpublish).

| Permission     | Allows                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `blog.read`    | list and open articles and revisions                                   |
| `blog.write`   | create/edit drafts and in-review articles, submit for review           |
| `blog.publish` | publish (also scheduled), unpublish, archive, return to draft, edit live/archived content |

Writes require STAFF_MFA with fresh authentication and an `Idempotency-Key`; updates
carry `expectedVersion` (stale writes get `STALE_VERSION`). Every write is audited and
saves an immutable `BlogPostRevision`.

**Review deviation, disclosed:** the SEO plan asks for an independent reviewer.
Publishing records the publisher as `reviewerId`; if the publisher is also the author,
the article is flagged `selfReviewed` in the API, the admin UI and the audit event.
It is allowed so a one-person shop can publish, but it is visible, never silent.

## Content rules

- `bodyHtml` is sanitized on the server (shared ADR-0016 sanitizer, `h1` demoted to
  `h2`). Images (up to 20, plus the cover) are references to READY product images:
  the server rewrites each one with its real URL, width/height and `loading="lazy"`,
  uses the editor's alt text (falling back to the media's alt) and rejects an image
  with no alt or an unavailable image. The cover needs its own alt text.
- Publishing is blocked for thin content: ≥ 300 characters of text and an excerpt of
  ≥ 50 characters.
- Up to 8 tags (labels only, no tag pages) and 10 sources (https, title, access date).
- Renaming a published article keeps the old URL as a one-hop `308` redirect
  (`BlogPostSlug`); a slug can never be reused by another article.
- A future `publishedAt` schedules publication; the article is invisible to the
  public API and sitemap until it is due.

## SEO surface

`/blog` (paginated, canonical per page), `/blog/<slug>`, `/blog/feed.xml` (RSS 2.0).
Article pages emit `BlogPosting` (store as author — staff names are never published —
real `datePublished`/`dateModified`, `citation` from sources), `BreadcrumbList`,
`og:type=article` with published/modified times, and an RSS `<link rel="alternate">`.
The sitemap gains `blog-posts.xml.gz` (with `lastmod` = last significant content
change, and the cover as `image:image`) and `/blog` only when something is live.
Product sitemap URLs carry their first ready image as `image:image`. Share previews
(`og:image`/`twitter:image`) use the widest rendition with real width, height and alt.

## Deploying

1. Forward migration `20261106120000_blog_articles` (new tables only).
2. Run `pnpm --filter @iranyaragh/api rbac:baseline` so `blog.read/write/publish`
   exist and are granted to the system administrator role; grant them to other roles
   deliberately.
3. Production stays noindex while `APP_ENVIRONMENT`/`NODE_ENV` are `staging`.

## Source, runtime and planned publication boundary

The blog capability was delivered by #517; the source adds canonical product seller
identity in #518 and the build-context dependency in #519. Current release evidence,
not the presence of these source files, establishes the actual runtime version.
An empty public blog remains intentionally hidden. A public test article and a
per-article test indexing policy are [planning scope](NEWSLETTER_PLAN_FA.md).

Use the guarded baseline path explicitly: `ALLOW_RBAC_BASELINE=true` plus production
confirmation `RBAC_BASELINE_CONFIRM_PRODUCTION=apply-canonical-rbac-baseline`, then
`node prisma/apply-rbac-baseline.mjs --apply` and `--check` in the selected release's
API environment. Never use a development seed or test identity for this rollout.

Verify public list/RSS, correct empty-blog 404/navigation behavior and anonymous Admin
API denial after deployment. Verify editing/review/publication/scheduling/rename/archive
with a real operator before asserting full live editorial acceptance. Self-reviewed
publication is explicitly flagged; it is not independent review.

Newsletter delivery and welcome-coupon issuance are not implemented by the blog's RSS
or article publisher. Keep them in the separate newsletter plan.
