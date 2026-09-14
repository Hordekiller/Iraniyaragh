# Product media M1 execution plan

Status: draft for independent review
Epic: #3, Issue: #162 (owner: `@Hordekiller`)
Integration owner: `@Maddyrampant`
Binds to: `docs/PRODUCT_MEDIA_SPEC.md` (accepted via #161)
Date: 2026-09-14

This plan maps the accepted M1 contract to concrete deliverables, files and tests.
Every item cites the governing spec section or an observed repo fact. Statements
marked **proposal** are implementation choices that remain open for review by the
M1 owner; spec-level statements are binding. Nothing here adds scope beyond M1.

## 0. Precondition

`PRODUCT_MEDIA_SPEC.md` is accepted and merged via #161; its §12 defaults
("become binding only after independent approval and merge of this contract") are
therefore binding. Issue #162 ("Blocked by acceptance and merge of #161") is
**unblocked**. No schema/API/UI media implementation exists today.

## 1. Verified current state (2026-09-14, main @ fe1fe2a7)

| Area | Observed fact |
| --- | --- |
| Object storage | MinIO dev container already in `infrastructure/docker/docker-compose.yml`; env vars `OBJECT_STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET` required+validated in `apps/api/src/config/environment.ts:28-31,245-248,337-340` and present in `.env.example:20-23` + `environment.spec.ts` |
| Storage client | **No** S3/MinIO SDK dependency in `apps/api/package.json`; no storage module, port or adapter exists anywhere |
| Worker | `ioredis` present; **no** BullMQ dependency despite `FOUNDATION.md:23` ("Background jobs: BullMQ"); no queue/processor code exists |
| Schema | `Product` (apps/api/prisma/schema.prisma:417-432) has `version Int @default(1)`, **no** media relations; enums follow SCREAMING_SNAKE state-machine style (`ProductStatus`, `VariantStatus`, …) |
| Product publish states | Schema `ProductStatus`: `DRAFT/ACTIVE/INACTIVE/ARCHIVED` (schema.prisma:63-68). Contracts `CatalogStatus`: `'DRAFT' | 'PUBLISHED' | 'ARCHIVED'` (packages/contracts/src/catalog.ts:7). Spec §9 speaks of `PUBLISHED`; schema has none |
| RBAC | `Permission`/`Role`/`UserRole`/`RolePermission` models exist; permission loading via `auth-permission.service.ts`; seeding lives in `apps/api/prisma/seed.mjs` (`prisma:seed` in package.json:17). No `catalog.media.*`/`catalog.publish` keys exist anywhere |
| Idempotency pattern | `CatalogIdempotencyRecord` (actorId+scope+keyHash, payloadHash, resource) + `catalog-idempotency.service.ts`; reuse semantics, not necessarily the table |
| Audit | `AuditLog` model (action, entityType, entityId, before/after Json, metadata, requestId) + `audit-log.service.ts`; catalog uses `audit.record(...)` |
| ETag | Only `public-catalog-cache.interceptor.ts` (public listing ETag). Spec §6/M3 references a **product** ETag "added by #157" — a product-level ETag is **not found** in the codebase |
| Money | `BigInt` integer-Rial convention in force (`20260831060000_bigint_money`, `VariantPriceRecord`) |
| Migrations | Forward-only, timestamped `YYYYMMDDHHMMSS_name` (e.g. `20260912140000_catalog_variants_attributes`) |
| Tests | Per-package vitest with `*.spec.ts` (unit) and `*.integration-spec.ts` (test DB); coverage thresholds per package (`vitest.config.ts`) |

## 2. Decisions required before/within M1 (no silent choice)

| # | Topic | Asked of | Grounding |
| --- | --- | --- | --- |
| D1 | Publish mapping: schema has no `PUBLISHED`. Either document `ACTIVE` as the publishable ready state (preferred, matches current parity wave) or extend `ProductStatus`. Must be decided before the readiness gate (§9) is encoded | A | schema.prisma:63-68 vs contracts/catalog.ts:7 vs spec §9 |
| D2 | Product ETag "added by #157" is not present for product detail; M1 must not build public projection (that is M3). Decide whether M3 first re-verifies/lands the product ETag work or media-ready mutation lands without ETag invalidation (blocking for M3) | A | spec §6, §11 M3; repo grep |
| D3 | Worker framework: FOUNDATION.md:23 declares BullMQ yet no dependency exists. M1 proposes adding BullMQ (baseline, not a new framework). If avoided, the Redis-based queue alternative must be ADRed | A | FOUNDATION.md:23; api package.json |
| D4 | Malware scan fails closed in prod (spec §12); dev/test use a deterministic fake. Choose the scanner boundary/interface in M1 so `READY` cannot be reached without it | A | spec §12 |
| D5 | Retention settings (unconfirmed ≤30 min, quarantine ≤24 h, private source 7 d, renditions 30 d — spec §12) must be bounded deployment settings; decide config shape (env vs settings table) | A | spec §4.6, §12 |
| D6 | Rendition `purpose` set: spec enumerates image purposes (THUMBNAIL/CARD/DETAIL_SM/MD/LG, spec §3). Video playback MP4 is a generated public artifact; M1 proposes adding `VIDEO_PLAYBACK` purpose. **Proposal** to confirm | A | spec §3, §6 video `sources` |
| D7 | Media origin: dev/local uses "the application/MinIO origin" (spec §12). M1 needs `OBJECT_STORAGE_REGION` + a controlled `PUBLIC_MEDIA_ORIGIN` and bucket CORS restricted to the admin origin/verbs | A | spec §4.2, §6, §12 |

## 3. Deliverables (file map)

Owner codes: **A** = M1 implementer (Platform, #162), **B** = integration owner (review/approval of contract changes).

### 3.1 Schema + migration — A
- `apps/api/prisma/schema.prisma` (hotspot, A-exclusive per #162):
  - Enums: `MediaKind` (`IMAGE`, `VIDEO`), `MediaState` (`PENDING_UPLOAD`, `UPLOADED`, `PROCESSING`, `READY`, `FAILED`, `ARCHIVED`), `MediaRole` (`PRIMARY`, `GALLERY`, `VIDEO_POSTER`), `MediaRenditionPurpose` (D6-dependent).
  - `model ProductMedia`: all fields of spec §3 table (CUID id; `productId` relation with `onDelete: Restrict`; kind; state; role; `position Int`; `altText` (≤300 codepoints, nullable only pre-readiness); `caption` (≤500); `objectKey` (server-generated, unique); `originalFilename` (display only); `declaredMime`+`detectedMime`; `bytes`/`width`/`height` (positive verified); `durationMs` (video-ready only); `hasAudio` (video-ready); `posterMediaId` self-relation (video→ready IMAGE); `checksumSha256`; `version Int` optimistic concurrency; creating actor; `createdAt/updatedAt/archivedAt`).
  - `model ProductMediaRendition`: `id`, `mediaId`, `purpose`, `format`, `objectKey`, `bytes`, `width`, `height`, optional `bitrate`, `checksumSha256`, `createdAt`; unique `@@unique([mediaId, purpose, format])` (spec §3: immutable generated artifacts, atomically-replaced set).
  - Add `media ProductMedia[]` + `renditions` back-relation on `Product` (Restrict, per spec §3).
- Forward migration `apps/api/prisma/migrations/<timestamp>_product_media` (never edit shared files):
  - SQL partial unique indexes (mandatory per spec §3 "Database invariants … If PostgreSQL partial indexes are required, express them in SQL migration and cover them with integration tests"):
    - unique `(productId, position)` WHERE `state <> 'ARCHIVED'`;
    - unique `(productId)` WHERE `role = 'PRIMARY' AND state = 'READY'` (**proposal**: least-contradictory reading of "unique primary image per product").
  - CHECK constraints (spec §3 "non-negative verified dimensions/size/duration"): `bytes/width/height >= 0`; when `state = 'READY'`: required `width/height > 0`, image `durationMs IS NULL`, video `durationMs IS NOT NULL AND hasAudio IS NOT NULL`; text lengths via application validation (DB as defense-in-depth where cheap).
  - Appendix migration for D1 (if publish mapping changes `ProductStatus`).

### 3.2 Contracts — A (B reviews per #162 "Contract changes require review from @Maddyrampant")
- `packages/contracts/src/media.ts` (new) — **types only, never Prisma models** (FOUNDATION.md:104-106):
  - Authored typing of §4 admin commands: upload intent (declaredMime, declaredExt/isVideo?, position intent), confirm, metadata (alt/caption), reorder, archive, readiness command.
  - §6 tagged union `PublicProductMedia` exactly as the spec type (retained now, consumed by M3).
  - Shared error-code family per spec §5 (`MEDIA_*` + idempotency/version families already in FOUNDATION.md:124-134).
  - Re-export from `packages/contracts/src/index.ts`.
- Proposal-Note: media types stay independent of `CatalogStatus` until D1 resolves.

### 3.3 Storage port + adapter — A
- New `apps/api/src/modules/media/storage.port.ts`: interface `ObjectStorage` — `presignPut(key, contentType, maxBytes, ttl)`, `headObject(key)`, `getObject(key)` (stream, SDK-only — spec §4.4), `deleteObject(key)`, `copyFromQuarantine(key)`, object-key helpers (generate server-side unique key; never client filename/path — spec §3 `objectKey`, §4.2).
- `S3StorageAdapter` in same module using `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (**proposal**, A, D7: region/path-style):
  - private quarantine prefix + private processed-source prefix; public rendition prefix; signed URLs are short-lived and never logged/returned in projections (spec §4.1, §5, §6).
- `apps/api/src/config/environment.ts`: add `OBJECT_STORAGE_REGION` (D7), `PUBLIC_MEDIA_ORIGIN` (D7), retention settings (D5) with the same strict validation style; update `environment.spec.ts` and `.env.example`.
- infra: docker-compose MinIO init (bucket + CORS policy restricted to admin origin/verbs, spec §4.2); no secrets committed (dev creds are already `change-me` in `.env.example:22`).

### 3.4 Worker boundary + processor — A
- D3-dependent: BullMQ queue (foundation baseline) with a bounded worker for media processing.
- `media-processor.service.ts`:
  - download via SDK (never user-controlled URL — spec §4.4);
  - validate declared vs detected MIME and signature/magic bytes (spec §4.4, §4 "Extension, declared MIME and detected signature must all agree");
  - enforce bytes ≤100 MiB, duration ≤120 s, height ≤1080p from trusted probe (spec §12; server-enforced, not client claims);
  - decode under CPU/memory/time/pixel limits, reject pixel/byte bombs (spec §10);
  - malware scan fail-closed (`READY` is unreachable without it); deterministic fake scanner in dev/test (spec §12);
  - strip metadata except retained orientation/color profile; normalize orientation before recording dimensions (spec §3);
  - generate renditions: WebP + JPEG fallback at 160/480/768/1200/1600w, never upscale (spec §3); video: baseline MP4 (H.264/AAC) + poster image (spec §12, §3); prayer artifacts immutable, set swapped atomically (spec §3);
  - record trusted metadata (bytes/width/height/durationMs/hasAudio/checksum) from its own output, never from browser;
  - state transition `PROCESSING → READY` and rendition-set exposure in **one transaction** (spec §4.5); bounded idempotent retry; failure → `FAILED` with safe reason code; raw decoder/storage errors only in redacted logs (spec §4.5);
  - quarantine-period enforcement hook (spec §4.6).

### 3.5 Retention / cleanup jobs — A
- Scheduled idempotent jobs (BullMQ repeatables):
  - expire `PENDING_UPLOAD` > 30 min (spec §4.6);
  - quarantine/failed/abandoned ≤ 24 h;
  - private processed source 7 d then delete;
  - archived assets: renditions deleted after 30-d window unless legal/hold (spec §12; D5 switch shape);
  - DB state is the deletion source of truth; every deletion is an audited action with delay + metrics (spec §4.6).

### 3.6 Admin API module — A
- New `apps/api/src/modules/media/` mirroring catalog module structure (controller/`*.dto.ts`/`*.service.ts`/`*.module.ts`/`*.spec.ts`):
  - `POST /admin/products/:productId/media/uploads` — permission `catalog.media.write`; verify product `version` (optimistic concurrency), quota (settings-backed 12 assets / ≤3 videos, spec §3/§12), declared metadata, idempotency key; create `PENDING_UPLOAD`; return short-lived single-object presigned URL (spec §4.1).
  - `POST /admin/products/:productId/media/:mediaId/confirm` — idempotent; trusted HEAD; exact-key + byte-limit (+checksum when supported) validation; enqueue processing (spec §4.3).
  - `PATCH …/:mediaId` (alt/caption), reorder, archive — with `If-Match`/expected version; permission `catalog.media.write` (spec §5).
  - publish-readiness command guarded by `catalog.publish`; server recalculation transactional (spec §9); cannot run while D1 unresolved.
  - Admin responses: metadata + processing status only; never storage credentials, never signed URLs (spec §5, §6).
- `media-idempotency.service.ts` reusing the `CatalogIdempotencyRecord` primitive semantics (actorId+scope+keyHash+payloadHash; mismatch → `IDEMPOTENCY_CONFLICT`) — decide table reuse vs new scoped table (**proposal**).
- Audit via `audit-log.service.ts`: attempt + outcome with actor, product, mediaId, requestId, safe before/after (spec §5); redaction list per spec §5.
- `apps/api/prisma/seed.mjs`: add permission keys `catalog.media.read`, `catalog.media.write`, `catalog.publish` (checked against existing seed policy test `seed-policy.test.mjs`).
- OpenAPI on all admin routes (`@nestjs/swagger`, matching existing modules).

### 3.7 Config / settings — A
- Settings-backed, server-enforced limits (12 assets, ≤3 videos, 100 MiB, 120 s, 1080p, retention) (spec §12); changing a limit must not invalidate existing products — enforce at mutation time only.

## 4. State machine and invariants

Allowed transitions (**proposal set for A**, grounded in spec §4):

| From | To | Condition |
| --- | --- | --- |
| `PENDING_UPLOAD` | `UPLOADED` | confirm validated (spec §4.3) |
| `PENDING_UPLOAD` | `FAILED` / quarantine-cleanup | expiry > 30 min (spec §4.6) |
| `UPLOADED` | `PROCESSING` | enqueued (spec §4.3-4.4) |
| `PROCESSING` | `READY` | validate+scan+decode+renditions OK, atomic commit (spec §4.5) |
| `PROCESSING` | `FAILED` | bounded retries exhausted; safe reason (spec §4.5) |
| `READY` | `ARCHIVED` | authorized archive; randition deletion deferred 30 d (spec §12) |

Invariants enforced in service + tests (spec §3): unique ready primary per product (partial index), unique active position (partial index), valid poster kind/state, non-negative verified dimensions/size/duration, legal transitions only, rendition immutability with atomic set replacement.

## 5. Verification

Run (per AGENTS.md, narrowest first):
```bash
docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.override.yml up -d postgres minio
CI=true pnpm --filter @iranyaragh/api test        # after implementation, with test DB
pnpm --filter @iranyaragh/api lint && pnpm --filter @iranyaragh/api build
```

Test matrix maps spec §10 (API/database + Operations):
- Unit: signature ↔ declared-MIME mismatch, size/duration/pixel limits, idempotency replay + payload mismatch, version conflict, state-transition legality, retention math, quota enforcement, storage adapter (presign/head/get/delete), permission allow/deny (read against write), redaction of logs/audit.
- Integration (test DB + MinIO): presign→confirm→process→READY; duplicate confirm; expired/missing/swapped object keys; concurrent primary/reorder/publish; bounded retry idempotency; archive + deferred rendition delete; orphan cleanup; partial-index uniqueness; audit rows; fail-closed scanner in prod-mode config.
- Failure paths: byte bomb, pixel bomb, MIME mismatch, quota headroom, media-type rejection list (SVG/GIF/HTML/PDF/archives/playlists/external URLs — spec §4), upload expiry.

## 6. Definition of Done (FOUNDATION §8 applied)

Business rule in service layer; input validation; permission check; transaction boundary reviewed; audit event; idempotency; stable error codes; unit+integration tests; OpenAPI; forward-only migration reviewed; observability; security/privacy review. M1 must not implement admin or storefront UI (issue #162), and never exposes Prisma models via API.

## 7. Slices, ownership and merge order (spec §11)

| Slice | Content | Owner |
| --- | --- | --- |
| M0 | Contract acceptance | merged via #161 |
| M1 | Persistence/storage, port, private lifecycle, worker boundary, permissions, integration tests | A |
| M2 | Admin authoring: client port + fixtures conforming to M1, gallery manager, metadata/reorder/poster/readiness UI | B (after M1 contract) |
| M3 | Public projection ready-only, product ETag (re-verify D2), OpenAPI | A |
| M4 | Storefront gallery/player/SEO rendering | B |
| M5 | E2E, a11y evidence, budget, cleanup drills | A+B |

Merge order `M0 → M1 → M2/M3 → M4 → M5`. M2 may proceed on accepted fixtures only after the shared contract (M1) is agreed; M2 cannot merge before it (spec §11).

## 8. Parallel B-lane (allowed now, pre-merge)

- M3/M4 fixture and type-readiness pass against the promised `PublicProductMedia` union (§6) and §12 defaults — no code, no merge.
- If D2 blocks M3 later, document the ETag gap in `docs/PROJECT_STATUS.md` so the B-lane B2/M4 does not depend on unmerged semantics.

## 9. Out of scope (explicit)

Livestreaming, DRM, user-generated media, external embeds, 360°/adaptive, HLS/DASH, AI alt-text (spec §1); any admin or storefront UI (issue #162); any public media projection (M3).