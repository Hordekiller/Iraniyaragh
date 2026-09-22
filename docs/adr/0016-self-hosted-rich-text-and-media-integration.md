# ADR-0016: Self-hosted Rich Text and Product Media Integration

- Status: Accepted
- Date: 2026-09-21
- Scope: Product description authoring first; reusable content-editor boundary
- Owners: Platform/API and Admin
- Decision record: issue #279 and explicit product-owner direction

## Context

Product descriptions are currently stored as an ambiguous string. Product create
and Excel import persist that string without HTML sanitization, while the public
storefront renders it as plain text. The Admin needs Persian/RTL rich-text
authoring, but a browser editor must never become the security boundary or create
a second media-upload system.

The existing Product Media pipeline already owns private direct upload, MinIO
storage, processing, trusted dimensions, ready-state transitions and controlled
public renditions. Jodit's built-in uploader, file browser and image dialog would
duplicate that pipeline and create nested-modal/focus problems.

## Decisions

### Editor engine and asset boundary

- Use the open-source MIT `jodit` package, exact-pinned at `4.15.1` for the first
  integration. Jodit is loaded only in the Admin client and its JavaScript, CSS,
  icons and language data are bundled by the application. No CDN, API key,
  license server or runtime external asset is allowed.
- Integrate Jodit directly instead of adding a React wrapper. A repository-owned
  reusable component controls lifecycle, value synchronization, Persian RTL,
  accessibility labels and the content profile.
- Disable Jodit's uploader, file browser and native image popup. The Image toolbar
  control captures the current selection and opens the IranYaragh Product Media
  picker directly.

### Stored content contract

- `Product.description` contains either `null` or a sanitized HTML fragment. It is
  not Markdown, a document, a URL or trusted arbitrary HTML.
- Product-description input is bounded to 100,000 UTF-16 code units before and
  after sanitization. Empty sanitized content is persisted as `null`.
- The initial allowlist supports `p`, `br`, `h1` through `h6`, emphasis,
  underline, ordered/unordered lists, links, tables, alignment spans/divisions,
  blockquotes, horizontal rules, figures, captions and controlled images.
- Inline styles are property- and value-allowlisted. Script/style/iframe/object/
  embed/SVG/MathML/form controls, comments, event handlers, arbitrary `data-*`,
  CSS URLs/expressions/custom properties and executable or private URL schemes are
  removed. Links may use HTTP(S), relative, `mailto` and `tel`; `_blank` links are
  forced to `rel="noopener noreferrer"`.
- H1-H6 remain available because the authoring requirement explicitly includes
  them. Product UI guidance prefers H2-H6 so the page-level product heading can
  remain the primary H1; the backend does not silently rewrite author intent.
- Server-side sanitization uses exact-pinned `sanitize-html@2.17.7`, which includes
  the current raw-text/foreign-namespace XSS fixes. Browser output is never trusted
  as already safe.

### Media projection and validation

- Every stored description image carries a repository-owned `data-media-id`.
  Product description writes accept only a `READY` `IMAGE` that belongs to that
  exact product and has a processed public rendition.
- The server rewrites `src`, `width` and `height` from the authoritative media row
  and validated `PUBLIC_MEDIA_ORIGIN`. Client-provided object keys, private URLs,
  presigned upload URLs and arbitrary external image URLs are never persisted.
- The Admin picker projection contains only media ID, canonical public URL, alt,
  optional caption and intrinsic rendition dimensions. It never exposes private
  object keys or upload credentials.
- Create-product content cannot reference media because no product-owned media can
  exist before the product ID exists. The supported flow is create Draft, redirect
  to Product edit, then select/upload through the existing Product Media pipeline.
- Stored legacy descriptions are sanitized again at API projection time. Invalid
  legacy image nodes are removed rather than causing a public-read failure.

### Persistence and audit

- A dedicated idempotent, optimistic-versioned Product description command owns
  content updates. It requires Staff MFA plus `catalog.write` and records safe
  hashes, lengths, media counts, actor and request ID rather than raw HTML in audit.
- Product create and Excel import use the same sanitizer, closing alternate write
  paths. Public API contracts remain independent of Prisma models.
- Storefront HTML rendering consumes only the sanitized API field. Structured data
  receives a plain-text projection rather than embedded markup.

### Reuse boundary

- The editor component accepts a content profile and media-picker adapter so the
  editing engine can later serve Blog Post, Guide and Landing Page content.
- Product Media is product-scoped. Future global editorial media requires its own
  accepted persistence/permission contract; this ADR does not fake that capability
  or detach media ownership from Product.
- Blog revision, reviewer and preview workflows remain separate content-domain
  requirements. Reusable editor code does not imply that a Blog CMS is delivered.

## Alternatives considered

- **Jodit uploader/file browser:** rejected because it duplicates the authoritative
  media lifecycle and risks private/presigned URLs entering content.
- **Client-only sanitization:** rejected because clients are untrusted and Excel/API
  callers can bypass the browser.
- **Store arbitrary HTML and sanitize on every render only:** rejected because
  unsafe payloads would remain the canonical stored value and every future consumer
  would need to remember the boundary.
- **Build a custom editor:** rejected because Jodit supplies the editing engine and
  toolbar behavior; IranYaragh only owns lifecycle, policy and media integration.

## Consequences

- The API dependency graph grows by one audited pure-JavaScript sanitizer and its
  development-only TypeScript declarations; the Admin later adds one exact-pinned
  editor package.
- Product description writes become versioned and can fail with stable validation,
  stale-version or media-readiness errors.
- Existing plain-text descriptions remain valid HTML text and are projected safely.
- Description images remain coupled to their product. Archiving a referenced media
  item must make subsequent content writes fail until the reference is removed or
  replaced; public projection remains fail-safe.

## Required verification

- Adversarial sanitizer corpus: scripts, event handlers, malformed/raw-text and
  SVG/MathML payloads, encoded JavaScript URLs, CSS URL/expression attempts and
  invalid media references.
- Positive Persian/RTL, headings, lists, links, tables, colors, blockquotes and
  idempotent-sanitization coverage.
- Authorization deny, optimistic concurrency, idempotent replay, product ownership,
  READY/kind/rendition enforcement and safe audit tests.
- Real Product Media picker insertion with cursor restoration, no nested Jodit
  modal, no external runtime request and no private URL in persisted HTML.
- API/Admin/Web full affected-package checks, production builds and E2E/a11y
  evidence before the complete feature is declared delivered.
