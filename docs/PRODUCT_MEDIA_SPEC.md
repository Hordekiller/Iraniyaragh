# Product media contract

Status: accepted via #161 (independent review approval and merge)
Owner: Platform contract lead (`@Hordekiller`)  
Integration owner: `@Maddyrampant`  
Last reviewed: 2026-09-11

This document is the implementation contract for product images and videos. It
does not claim that upload, transformation, administration or storefront playback
already exists. Persistence and API work must not begin until the policy choices
marked **Decision** are accepted in Epic #3.

## 1. Goals and non-goals

The first release must provide:

- an ordered product gallery containing multiple images and optional videos;
- exactly one primary image for every publishable product;
- an explicit poster/thumbnail for each video;
- responsive image delivery and a responsive, keyboard-operable video player;
- safe direct upload to S3-compatible object storage with server confirmation;
- stable public projections suitable for Product and VideoObject structured data;
- auditability, idempotency, optimistic concurrency and orphan cleanup.

The first release does not include livestreaming, DRM, user-generated media,
external video embeds, 360-degree viewers, automatic AI alt text, or adaptive live
streaming. HLS/DASH can be introduced only after measured need and an accepted ADR.

## 2. Product and user experience

### Gallery behavior

- A gallery is an ordered mixed-media list. Images and videos share one contiguous
  `position`; the API never returns separate lists that clients must interleave.
- The primary asset is an image, is unique per product, and appears first. A video
  cannot be the product/card/checkout fallback image.
- Recommended operational limit: 12 published assets per product, of which at most
  3 are videos. Limits are settings-backed and server-enforced; clients only mirror
  them. Changing a limit must not invalidate existing published products.
- Thumbnail rail: horizontal swipe on mobile and vertical or horizontal rail on
  desktop. Every thumbnail exposes its position and media type; video thumbnails
  display a play indicator and duration.
- Selecting a thumbnail changes the stage without moving keyboard focus. Previous/
  next controls wrap only when explicitly announced; default behavior stops at the
  ends. Swipe is an enhancement, never the only control.
- Image stage supports zoom only after explicit activation. Zoom must not hijack
  page pinch-zoom, keyboard scrolling or pointer escape.
- The active asset is reflected in the URL only as an optional replace-state query
  (for example `?media=assetId`); canonical product URL remains unchanged.
- Gallery layout reserves intrinsic aspect-ratio space to prevent CLS. Portrait and
  landscape assets use `object-fit: contain` against a neutral background and are
  never destructively cropped in the product-detail stage.

### Video player

- Use the native HTML `<video>` baseline with project-styled controls only if the
  resulting controls retain native keyboard, screen-reader and mobile behavior.
  A third-party player requires dependency/security review and evidence that it
  improves accessibility; it is not a default dependency.
- Required attributes/behavior: `controls`, `playsinline`, `preload="metadata"`,
  poster image, no autoplay, no forced loop, no muted-by-default workaround, and
  no playback merely from thumbnail selection.
- Player is bounded by the gallery container, uses the encoded aspect ratio, and
  remains usable at 320 CSS px width and 200% zoom.
- Captions use same-origin WebVTT tracks. A video with meaningful speech cannot be
  published without Persian captions; transcript is required for instructional
  content. Silent demonstration videos must be marked `hasAudio=false` and have a
  concise text description of meaningful visual action.
- Playback errors provide a Persian text fallback and a retry action. They do not
  silently switch to an untrusted external origin.
- Only the poster is loaded initially. The video source is attached when the user
  selects the video; playback begins only after explicit play.

## 3. Persistence contract

Add forward migrations; never edit an already-shared migration.

### `ProductMedia`

| Field                           | Contract                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| `id`                            | opaque CUID primary key                                                   |
| `productId`                     | required relation; restrict destructive product deletion                  |
| `kind`                          | `IMAGE` or `VIDEO`                                                        |
| `state`                         | `PENDING_UPLOAD`, `UPLOADED`, `PROCESSING`, `READY`, `FAILED`, `ARCHIVED` |
| `role`                          | `PRIMARY`, `GALLERY`, or `VIDEO_POSTER`; poster linkage remains explicit  |
| `position`                      | non-negative integer, unique within active product ordering               |
| `altText`                       | nullable only while draft; trimmed, maximum 300 Unicode code points       |
| `caption`                       | optional customer-visible caption, maximum 500 code points                |
| `objectKey`                     | generated server-side, unique, never a client filename or public URL      |
| `originalFilename`              | sanitized display metadata only; never used as a path                     |
| `declaredMime` / `detectedMime` | both retained for security diagnostics                                    |
| `bytes`, `width`, `height`      | positive verified metadata from trusted processing                        |
| `durationMs`                    | required for ready video, absent for image                                |
| `hasAudio`                      | required for ready video                                                  |
| `posterMediaId`                 | required self-relation from video to a ready image poster                 |
| `checksumSha256`                | checksum of confirmed source object; unique per product is optional       |
| `version`                       | optimistic concurrency counter                                            |
| timestamps / actor              | created, updated and archived timestamps plus creating actor              |

### `ProductMediaRendition`

Renditions are immutable generated artifacts: `id`, `mediaId`, `purpose`, `format`,
`objectKey`, `bytes`, `width`, `height`, optional `bitrate`, checksum and creation
time. Unique key is `(mediaId, purpose, format)`. Reprocessing creates a new media
version or atomically replaces the full rendition set; clients never observe a
partially updated set.

Image purposes: `THUMBNAIL` (160w), `CARD` (480w), `DETAIL_SM` (768w),
`DETAIL_MD` (1200w), `DETAIL_LG` (1600w), bounded by source width and without
upscaling. Generate WebP plus JPEG fallback; AVIF is optional after encode-cost and
support measurement. Strip metadata except explicitly retained orientation/color
profile and normalize orientation before dimensions are recorded.

Video baseline: MP4 container with H.264 video and AAC audio for broad playback,
plus a generated poster image. **Decision:** initial maximum 120 seconds, 1080p and
100 MiB source. Encoding settings are deployment configuration, not admin constants.
Originals are private; only approved renditions become public.

Database invariants must include unique primary image per product, unique active
position, valid poster kind/state, non-negative verified dimensions/size/
duration, and legal state transitions. If PostgreSQL partial indexes are required,
express them in SQL migration and cover them with integration tests.

## 4. Upload and processing lifecycle

1. Authorized `POST /admin/products/:productId/media/uploads` validates permission,
   product version, quota, declared metadata and idempotency key; it creates a
   `PENDING_UPLOAD` row and returns a short-lived single-object presigned request.
2. Client uploads directly to a private quarantine prefix. Bucket CORS permits only
   the admin origin and required verbs/headers. Credentials never reach the client.
3. `POST .../media/:mediaId/confirm` is idempotent. The API performs a trusted HEAD,
   validates exact key, byte limit, checksum when supported, and queues processing.
4. A worker downloads through the storage SDK (never a user-controlled URL), checks
   signature/magic bytes, decodes under CPU/memory/time/pixel limits, scans where
   available, strips metadata, generates renditions and records trusted metadata.
5. One transaction changes `PROCESSING` to `READY` and exposes the rendition set.
   Failure records a safe reason code; raw decoder/storage errors stay in redacted
   logs. Retry is bounded and idempotent.
6. Unconfirmed uploads expire after 30 minutes. Quarantine objects, failed sources,
   replaced renditions and archived assets are cleaned by idempotent jobs with a
   safety delay and metrics. Database state is the source of truth for deletion.

Allowed source formats for MVP: JPEG, PNG and WebP images; MP4 video. SVG, GIF,
HTML, PDF, archives, playlists and externally hosted URLs are rejected. Extension,
declared MIME and detected signature must all agree. Filenames are ignored for type
decisions. Limits apply per file, per product and per actor/time window.

## 5. Commands, permissions and audit

Permissions:

- `catalog.media.read`: admin metadata and processing status;
- `catalog.media.write`: initiate/confirm, edit alt/caption, archive and reorder;
- `catalog.publish`: publish-readiness command; upload alone cannot publish;
- public reads expose only ready media belonging to published products.

All mutations require authenticated staff, CSRF/origin protections already defined
for admin commands, stable idempotency semantics, and `If-Match`/expected version on
metadata/reorder/archive operations. Audit attempt and outcome with actor, product,
media ID, request ID and safe before/after fields. Never audit presigned URLs,
object credentials, captions file contents, raw filenames with sensitive data or
decoder output.

Stable errors include `MEDIA_LIMIT_EXCEEDED`, `MEDIA_TYPE_UNSUPPORTED`,
`MEDIA_TOO_LARGE`, `MEDIA_DIMENSIONS_INVALID`, `MEDIA_UPLOAD_EXPIRED`,
`MEDIA_CHECKSUM_MISMATCH`, `MEDIA_NOT_READY`, `MEDIA_PROCESSING_FAILED`,
`MEDIA_POSITION_CONFLICT`, `MEDIA_PRIMARY_REQUIRED`, `MEDIA_POSTER_REQUIRED` and
the existing idempotency/version conflict families.

## 6. API projections

Persistence models are never returned directly. Public media items use a tagged
union:

```ts
type PublicProductMedia =
  | {
      id: string;
      kind: "IMAGE";
      position: number;
      role: "PRIMARY" | "GALLERY" | "VIDEO_POSTER";
      alt: string;
      caption: string | null;
      width: number;
      height: number;
      sources: Array<{
        url: string;
        width: number;
        height: number;
        type: string;
      }>;
    }
  | {
      id: string;
      kind: "VIDEO";
      position: number;
      caption: string | null;
      description: string;
      durationMs: number;
      width: number;
      height: number;
      hasAudio: boolean;
      poster: PublicProductMediaImage;
      sources: Array<{
        url: string;
        type: "video/mp4";
        width: number;
        height: number;
      }>;
      captions: Array<{
        url: string;
        kind: "captions";
        srclang: "fa";
        label: string;
      }>;
    };
```

Public URLs are same-origin application URLs or controlled media-origin URLs, never
storage console URLs or expiring admin upload URLs. Ready-media mutations must
change the public product ETag added by #157. Listing endpoints return only the
primary `CARD` projection; detail returns the ordered gallery. Admin responses may
include state and diagnostics but never storage credentials.

## 7. SEO and discoverability

- Product structured data uses the canonical product URL and ready image renditions.
- A watch page/product detail containing a visible video may emit `VideoObject`
  with stable `name`, `description`, `thumbnailUrl`, `uploadDate`, `duration` and
  `contentUrl` only when those values are real. Do not invent counters or dates.
- The video and poster must be fetchable by search crawlers, visible in rendered
  HTML, and not dependent on user interaction for discovery even though bytes are
  lazy-loaded for playback.
- Dynamic sitemap work includes eligible product pages. Add video-sitemap entries
  only for ready, indexable, materially prominent videos; exclude drafts, archived
  assets and expired URLs.
- Alt text describes the product/view, not keywords. Decorative duplicates use an
  empty alt only when the same information is already adjacent. Video thumbnail alt
  identifies it as a video and the demonstrated view.

## 8. Performance and delivery

- Hero/primary product image is eligible for high fetch priority and must not be
  lazy-loaded when it is the LCP candidate. Gallery assets after the first and video
  bytes are lazy/on-demand.
- Render intrinsic `width`/`height`; use `srcset`/`sizes`; never select image width
  after downloading a desktop source in JavaScript.
- Immutable rendition URLs contain a content/version token and use long-lived
  cache headers. Product JSON/HTML revalidates independently using #157 semantics.
- Proposed budgets to validate on representative mobile hardware/network:
  primary image <= 180 KiB at the selected mobile slot, thumbnail <= 25 KiB,
  no initial video transfer, gallery interaction response <= 100 ms, and product
  page CLS <= 0.1. Budgets are CI/Lighthouse assertions after real pages exist.
- Object-storage failures degrade to the primary fallback/placeholder with logged
  media ID and request ID; they must not break purchasing controls.

## 9. Publish readiness

A product cannot transition to `PUBLISHED` unless:

- one and only one ready primary image exists;
- every published image has reviewed alt text (empty only if explicitly decorative);
- every video is ready, has a ready poster and description, and satisfies the audio/
  captions rule;
- positions are contiguous and all referenced renditions exist;
- at least one active sellable SKU and the existing price/readiness rules pass.

Publishing and media confirmation must tolerate retries and concurrent operators.
The server recalculates readiness transactionally; the admin checklist is advisory.

## 10. Verification matrix

API/database: permission allow/deny, invalid signatures and MIME mismatch, byte and
pixel bombs, expired/missing/swapped object keys, duplicate confirmation, idempotency
payload mismatch, concurrent primary/reorder/publish, processing retry, archive,
orphan cleanup, public projection redaction and ETag change.

Admin: multi-select upload progress, retry/cancel, keyboard reorder alternative,
alt/caption errors, poster selection/generation state, stale-version recovery,
permission denial, mobile layout and no credential leakage in DOM/logs.

Web: ordered mixed gallery, responsive sources, first-image LCP policy, video poster
and explicit playback, keyboard/touch/screen-reader operation, captions/transcript,
reduced motion, 320px/200% zoom, missing rendition fallback, structured data and
video/product sitemap validation.

Operations: quarantine isolation, lifecycle cleanup, queue lag/failure metrics,
storage/transform health, capacity alerts, restore behavior and deletion audit.

## 11. Conflict-safe delivery slices

1. **M0 contract acceptance:** this document plus explicit decisions for limits,
   retention, encoding and caption responsibility. No schema/UI implementation.
2. **M1 persistence/storage (Platform):** forward migration, storage port, private
   upload lifecycle, worker boundary, permissions and integration tests. Owns
   `schema.prisma`, migration, API media module and contracts by prior coordination.
3. **M2 admin authoring (Admin owner):** client port and fixture conforming exactly
   to M1, gallery manager, metadata, reorder, poster and readiness UI. Must not edit
   schema or invent server state.
4. **M3 public projection (Platform):** ready-only media in listing/detail, ETag
   invalidation and OpenAPI. Contract PR precedes web wiring.
5. **M4 storefront (Web owner):** responsive gallery/player/SEO rendering against
   accepted M3 contract. Must not depend on admin fixtures.
6. **M5 integration:** real draft -> upload -> process -> publish -> public discovery
   E2E, accessibility evidence, performance budgets, cleanup and failure drills.

Merge order is `M0 -> M1 -> M2/M3 -> M4 -> M5`; M2 may proceed with accepted
fixtures while M1 is implemented, but M2 cannot merge before the shared contract.

## 12. Accepted implementation defaults for independent review

- [x] Maximum 12 published gallery assets per product, including at most 3 videos.
      Existing products are not unpublished if a future configured limit is lower.
- [x] Video source maximum is 100 MiB, 120 seconds and 1080p. All three checks are
      server-enforced from trusted probe metadata, not browser declarations.
- [x] Catalog/content staff own Persian captions and transcripts. Generated caption
      drafts are never published without an authorized human review.
- [x] A successfully processed private source is retained for 7 days to permit a
      bounded recovery/re-encode window, then removed by an idempotent job. Failed and
      abandoned quarantine objects are retained at most 24 hours. Archiving immediately
      removes public eligibility; renditions are deleted after a 30-day recovery window
      unless a legal/order-history hold applies. Retention values are bounded deployment
      settings and every deletion remains auditable.
- [x] Public renditions use one configured, controlled HTTPS media origin backed by
      S3-compatible storage. Local/dev may use the application/MinIO origin. Production
      must define the exact allowlisted origin for CSP/CORS/SEO; arbitrary external URLs,
      storage-console URLs and expiring admin upload URLs are never public contracts.
- [x] Production processing requires a healthy malware-scanning capability before a
      source can become `READY`; inability to scan fails closed with a retryable safe
      state. Development/test may use an explicit deterministic fake scanner. Signature,
      MIME, decode, resource and pixel-limit validation remain mandatory in every mode.

These defaults become binding only after independent approval and merge of this
contract. Any production exception requires a security review and accepted ADR.

## References

- MDN, responsive images: <https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images>
- OWASP, File Upload Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>
- W3C WAI, accessible audio/video: <https://www.w3.org/WAI/media/av/>
- Google Search Central, video SEO: <https://developers.google.com/search/docs/appearance/video>
- Google Search Central, video sitemaps: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps>
