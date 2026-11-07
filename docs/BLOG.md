# Blog / governed articles

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

- `bodyHtml` is sanitized on the server (shared ADR-0016 sanitizer, images dropped,
  `h1` demoted to `h2`). Inline images are not supported; use the cover image
  (a READY product image) with required alt text.
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
change) and `/blog` only when something is live.

## Deploying

1. Forward migration `20261106120000_blog_articles` (new tables only).
2. Run `pnpm --filter @iranyaragh/api rbac:baseline` so `blog.read/write/publish`
   exist and are granted to the system administrator role; grant them to other roles
   deliberately.
3. Production stays noindex while `APP_ENVIRONMENT`/`NODE_ENV` are `staging`.
