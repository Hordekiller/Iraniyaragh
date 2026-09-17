# Product media M5 integration evidence

Last updated: 2026-09-17

Branch: `feat/product-media-m5` (base `83dcbcb`). Owner: `@Maddyrampant`.
This document records what was actually executed against the local and CI
runtime. It is evidence of _verified_ behavior, not a claim that the accepted
`PRODUCT_MEDIA_SPEC.md` contract is fully implemented. Known gaps are listed in
the last section and were intentionally reported rather than changed in code.

## Scope of this slice

- **M4 storefront gallery** (the accepted M4 slice had no runtime: the earlier
  `#227` change touched `docs/PROJECT_STATUS.md` only). The committed work adds
  the ordered mixed-media gallery, lazy video mount, accessible controls and
  truthful `Product`/`VideoObject` JSON-LD on the live product page.
- **M5 integration**: a real draft → upload → process → publish → public
  discovery Playwright journey plus failure drills, a repeatable bucket
  provisioning script, and object-storage/worker wiring in the CI `e2e` job.

## Verified in this slice

| Check                                                     | Command                                                                                         | Result                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| API unit + config suite                                   | `NODE_ENV=test pnpm --filter @iranyaragh/api exec vitest run` + `node --test prisma/*.test.mjs` | 59 files / 690 tests passed |
| API typecheck / build (with the `esModuleInterop` fix)    | `pnpm --filter @iranyaragh/api typecheck` / `build`                                             | pass                        |
| Web unit suite                                            | `pnpm --filter @iranyaragh/web test`                                                            | 42 files / 343 tests passed |
| Web lint / typecheck / build                              | `pnpm --filter @iranyaragh/web lint` / `typecheck` / `build`                                    | pass                        |
| E2E lint / typecheck                                      | `pnpm --filter @iranyaragh/e2e lint` / `typecheck`                                              | pass                        |
| M5 API E2E (real Postgres + Redis + MinIO + media worker) | see below                                                                                       | 6 / 6 passed                |

## End-to-end evidence

`e2e/tests/api-media-publish-to-discovery.spec.ts` (project `api-http`) runs
against a real API, the media worker, Redis/BullMQ and a live MinIO bucket:

```bash
NODE_ENV=test AUTH_DEV_CODE=dev-admin-code-123 \
  pnpm --filter @iranyaragh/e2e exec playwright test \
  tests/api-media-publish-to-discovery.spec.ts --project=api-http
# 6 passed (6.1s)
```

1. **publishes an image end to end and serves it through public discovery and
   object storage** — draft product + variant, upload intent, direct `PUT` to
   MinIO, confirm, worker `READY` with real dimensions, alt metadata, primary,
   publish, then `GET /catalog/products/:slug` returns the media and the
   rendition origin responds `200 image/webp` with
   `Cache-Control: public, max-age=31536000, immutable` and an `ETag`.
2. **refuses to publish without a ready primary image** — `422`,
   `MEDIA_PRIMARY_REQUIRED`.
3. **rejects oversized and type-mismatched upload intents** — `MEDIA_TOO_LARGE`
   and `MEDIA_TYPE_UNSUPPORTED`.
4. **refuses to confirm an object that was never uploaded and rejects stale
   metadata** — `MEDIA_NOT_READY` on confirm, `409` on a stale version `PATCH`.
5. **replays a retried confirm idempotently without duplicating the media** —
   same media id, no duplicate row.
6. **keeps a published product with no alt text out of public media
   projection** — documents the projection/publish-readiness asymmetry below.

The same journey was independently reproduced by hand against the local stack
(`/tmp/opencode/m5/flow.mjs`): `READY` 800×600, publish `PUBLISHED`, public
detail returned 1 media item with 10 sources, and the origin served
`image/webp` with immutable caching.

## CI object storage and worker

The `e2e` job in `.github/workflows/ci.yml` now:

- starts `minio/minio` (pinned by digest) with `MINIO_ROOT_PASSWORD=change-me-now`
  and waits on `/minio/health/live`;
- runs `pnpm --filter @iranyaragh/api media:bucket`
  (`apps/api/scripts/provision-media-bucket.mjs`), which idempotently creates the
  `products` bucket and applies a public read-only `GetObject` policy;
- sets `PUBLIC_MEDIA_ORIGIN=http://127.0.0.1:9000/products` and aligns
  `OBJECT_STORAGE_SECRET_KEY` with the MinIO root password;
- starts `node apps/api/dist/src/media-worker.js` alongside the API and tails its
  log when the suite fails.

Previously the job declared `OBJECT_STORAGE_*` but ran no object storage and no
worker, so media confirmation could never reach `READY` in CI.

## Runtime defect found and fixed

`apps/api/tsconfig.json` had `allowSyntheticDefaultImports: true` without
`esModuleInterop: true`. Typecheck passed, but the emitted JS called
`sharp_1.default(...)` and `exceljs_1.default.Workbook()`, both `undefined` at
runtime. Every confirmed image upload failed in the worker
(`MEDIA_PROCESSING_FAILED`) and catalog import/export was broken. Adding
`"esModuleInterop": true` emits `__importDefault(...)`; the worker now reaches
`READY`. This is the only behavior change outside M4/M5 scope and needs explicit
reviewer acknowledgement.

`apps/api/package.json`'s `worker:media` script was also corrected from
`node dist/media-worker.js` to `node dist/src/media-worker.js` (the Nest build
emits `dist/src/*`).

## Documented gaps and contract discrepancies (reported, not changed)

Per the agreed direction these are documented for the contract owner; no code
was changed for them.

1. **Video pipeline is not implemented.** The upload API accepts `kind=VIDEO`
   (`video/mp4`, `GALLERY` role, 100 MiB / 3-video limits), but
   `ProductMediaImageProcessor.process` returns immediately for non-images
   (`image-processor.service.ts:55`). A confirmed video therefore stays in
   `UPLOADED` forever with no failure code surfaced, so the spec §2/§3/§9
   video gallery, poster and captions behavior cannot be exercised end to end.
2. **`catalog.publish` does not exist.** Spec §5 reserves a `catalog.publish`
   permission for the publish-readiness command. The publish route is guarded by
   `catalog.write` (`catalog.controller.ts:96`) and the key is not seeded
   anywhere, so publish is not separated from general catalog writes.
3. **Upload intent TTL is 15 minutes, not 30.** `media-policy.service.ts` defaults
   `PRODUCT_MEDIA_UPLOAD_TTL_SECONDS` to `15 * 60`; spec §4 states unconfirmed
   uploads expire after 30 minutes.
4. **Publish readiness is weaker than spec §9.** The guard only requires exactly
   one `READY` primary image and one active variant. It does **not** require
   reviewed alt text, contiguous positions, an existing poster for videos or
   poster/description readiness. The public projection independently drops media
   with a null `altText`, so a published product can silently expose zero images
   (covered by drill 6 above).
5. **Retention defaults are as implemented** — source 7 days after `READY`,
   24 hours after `FAILED`, archived renditions deleted after 30 days
   (`image-processor.service.ts:102/113`, `media-cleanup.service.ts:6`) — which
   matches the accepted §12 defaults.
6. **Malware scanning is the deterministic fake in dev/test.** Production
   fail-closed scanning (§12) has no real scanner evidence yet.

## Not verified

- Production/staging S3/CORS, the exact allowlisted HTTPS media origin and CDN
  behavior.
- Real malware-scanner integration.
- Spec §8 performance budgets (LCP image ≤ 180 KiB, CLS ≤ 0.1, interaction
  ≤ 100 ms) and Lighthouse/CI budget assertions.
- Video playback, captions and video structured data against real video bytes.
- Deletion/lifecycle audits in production.

## Reviewer focus

- `apps/api/tsconfig.json` `esModuleInterop` fix and its blast radius.
- The M4 gallery interaction model (`MediaGallery.tsx`) and the JSON-LD truth
  rules (`ProductPage.tsx`).
- The M5 spec assertions, especially the publish/projection asymmetry in gap 4.
