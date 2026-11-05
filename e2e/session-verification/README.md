# Session reliability — real-stack browser verification

Opt-in (not part of `pnpm e2e`): needs a disposable `_test`/`sf_test` Postgres,
Redis, the built API, the admin built with `NEXT_PUBLIC_BASE_PATH=/admin`, the
real storefront and `e2e/scripts/nginx-routing-proxy.sh` so both apps share one
origin. Run: `playwright test -c session-verification/playwright.config.ts`
with `SESSION_E2E_ORIGIN`, `SESSION_E2E_PG_CONTAINER` and the usual
`E2E_STAFF_*` / `JWT_ACCESS_SECRET` / `DATABASE_URL` variables.
Server inactivity is back-dated in the test DB; the browser clock uses
`page.clock`. The customer session is minted by `mint-session.cjs`
(test DB only) because the customer OTP cannot be read.
