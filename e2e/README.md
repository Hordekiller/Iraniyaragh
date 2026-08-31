# E2E smoke suite

Playwright smoke coverage for the foundation shells:

- `apps/web` — the storefront (React/Vite) with its self-hosted Vazirmatn font.
- `apps/admin` — the operations panel (Next.js 16 / MUI) with its strict CSP and
  self-hosted assets.

Every test exercises an RTL-ready shell and, through
`createExternalRequestsTracker`, enforces a **zero-external-asset gate**: any
HTTP(S) request leaving the page origin fails the run. This is the enforcement
point for the self-hosting policies in both applications.

## Projects

| Project        | App          | Viewport | Device            |
| -------------- | ------------ | -------- | ----------------- |
| `web-desktop`  | storefront   | 1440×900 | Desktop Chrome    |
| `web-mobile`   | storefront   | 412×915  | Pixel 7 (touch)   |
| `admin-desktop`| operations   | 1440×900 | Desktop Chrome    |
| `admin-mobile` | operations   | 412×915  | Pixel 7 (touch)   |

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
```

Configuration overrides (`e2e/playwright.config.ts`):

- `WEB_E2E_URL` / `ADMIN_E2E_URL` — target origins (defaults
  `http://127.0.0.1:4173` / `http://127.0.0.1:3001`).
- `CI` — set by CI: runs strict (`forbidOnly`), retries 2×, uses a single worker
  and starts fresh servers. Locally, already-running servers are reused
  (`reuseExistingServer: !CI`).

Playwright starts both servers itself via the `webServer` array (`vite preview`
and `next start` on pinned ports, `--strictPort`).

## Why taps are dispatched

Pointer interactions in the storefront use the `tap()` helper (a dispatched
`-synthetic 'click'` event) instead of `locator.click()`. Chromium reports a
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
pnpm e2e: 14 tests — 11 passed, 3 skipped (viewport-gated), 0 failed, exit 0
pnpm lint / pnpm typecheck (workspace): green
web build: dist/index.html 0.79 kB — zero external references
```

The strict gate is proven by the suite itself: any Google-Fonts-style external
request would fail `assertNone()` in both applications.