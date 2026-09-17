# E2E smoke suite

Playwright smoke coverage for the foundation shells:

- `apps/web` — the storefront (React/Vite) with its self-hosted Vazirmatn font,
  covering the RTL shell, hero slider, product modal + cart toast, category
  filtering, the responsive search interactions and the customer OTP login
  states (valid/invalid code, rate-limit back-off, resend gating, memory-only
  sessions).
- `apps/admin` — the operations panel (Next.js 16 / MUI) with its strict CSP and
  self-hosted assets.

Every test exercises an RTL-ready shell and, through
`createExternalRequestsTracker`, enforces a **zero-external-asset gate**: any
HTTP(S) request leaving the page origin fails the run. This is the enforcement
point for the self-hosting policies in both applications.

## Projects

| Project         | App        | Viewport | Device          |
| --------------- | ---------- | -------- | --------------- |
| `web-desktop`   | storefront | 1440×900 | Desktop Chrome  |
| `web-mobile`    | storefront | 412×915  | Pixel 7 (touch) |
| `admin-desktop` | operations | 1440×900 | Desktop Chrome  |
| `admin-mobile`  | operations | 412×915  | Pixel 7 (touch) |
| `api-http`      | API        | —        | HTTP request context |

Viewport-specific cases are gated with `test.skip(!isMobile(page))` /
`test.skip(isMobile(page))` at runtime.

## Running

Both apps must build locally first (the root `e2e` script builds them itself).

```bash
pnpm e2e:install               # first time only — install Chromium
pnpm e2e                       # build web + admin, then run the suite
```

Finer control:

```bash
pnpm --filter @iranyaragh/e2e smoke                     # run without building
pnpm --filter @iranyaragh/e2e smoke --headed
pnpm --filter @iranyaragh/e2e smoke --project=web-mobile
pnpm --filter @iranyaragh/e2e test:report               # open the HTML report
pnpm --filter @iranyaragh/e2e lint
pnpm --filter @iranyaragh/e2e typecheck
```

Configuration overrides (`e2e/playwright.config.ts`):

- `WEB_E2E_URL` / `ADMIN_E2E_URL` — target origins (defaults
  `http://127.0.0.1:4173` / `http://127.0.0.1:3001`).
- `CI` — set by CI: runs strict (`forbidOnly`), retries 2×, uses a single worker
  and starts fresh servers. Locally, already-running servers are reused
  (`reuseExistingServer: !CI`).

Playwright starts both servers itself via the `webServer` array (`vite preview`
and `next start` on pinned ports, `--strictPort`).

## API integration (`api-http`)

The `api-http` project drives the real API with `APIRequestContext` and does not
need the web/admin pages. The product-media journey
(`tests/api-media-publish-to-discovery.spec.ts`) additionally needs PostgreSQL,
Redis, a running media worker, and an S3-compatible object store:

```bash
# local infra (ports: postgres 55432, redis 56379, minio 9000/9001)
docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.override.yml up -d postgres redis minio

# create the bucket + public read policy (reads OBJECT_STORAGE_*)
OBJECT_STORAGE_ENDPOINT=http://localhost:9000 \
  OBJECT_STORAGE_ACCESS_KEY=minio OBJECT_STORAGE_SECRET_KEY=change-me-now \
  pnpm --filter @iranyaragh/api media:bucket

# API and worker must share the MinIO credentials and public origin
NODE_ENV=test OBJECT_STORAGE_SECRET_KEY=change-me-now \
  PUBLIC_MEDIA_ORIGIN=http://localhost:9000/products \
  node apps/api/dist/src/media-worker.js &

AUTH_DEV_CODE=dev-admin-code-123 \
  pnpm --filter @iranyaragh/e2e exec playwright test \
  tests/api-media-publish-to-discovery.spec.ts --project=api-http
```

CI provides all of this in the `e2e` job (MinIO service via `docker run`, bucket
provisioning, media worker) and sets `AUTH_DEV_CODE=dev-e2e-access-code`,
`PUBLIC_MEDIA_ORIGIN` and the object-storage variables. See
`docs/MEDIA_M5_EVIDENCE.md` for the verified matrix and open gaps.

## Why taps are dispatched

Pointer interactions in the storefront use the `tap()` helper (a dispatched
synthetic `click` event) instead of `locator.click()`. Chromium reports a
negative `scrollLeft` on RTL pages; Playwright's hit-target math then mis-places
the click point under mobile emulation and blames the document root for
"intercepting pointer events". Dispatched events still invoke the real React
handlers, so the behavior under test is unchanged and deterministic across
viewports.

## Failure diagnostics

- `outputDir: test-results` — per-failure screenshot, video, trace and
  `error-context.md`.
- HTML report at `e2e/playwright-report` (`open: 'never'`).
- Both directories are gitignored. On CI failure they are uploaded as a
  `playwright-artifacts` artifact by the `e2e` job.

## Acceptance evidence (2026-08-31)

```text
pnpm e2e: 18 test runs — 14 passed, 4 skipped (viewport-gated), 0 failed, exit 0
pnpm lint / pnpm typecheck (including the E2E package): green
web build: dist/index.html 0.79 kB — zero external references
```

The strict gate is proven by the suite itself: any Google-Fonts-style external
request would fail `assertNone()` in both applications.

The GitHub Actions `e2e` job installs Chromium with its Linux system dependencies,
builds both applications, runs this suite after the quality job, and retains the
HTML report, traces, screenshots and videos when a failure occurs.
