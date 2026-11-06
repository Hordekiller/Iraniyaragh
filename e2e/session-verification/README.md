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

## Production-equivalent HTTPS run

Set `SESSION_E2E_PRODUCTION_COOKIES=1` to verify the real `__Host-` cookie names
(Secure, Path=/, no Domain) instead of the development names. It needs:

- the API started with `NODE_ENV=staging` (providers `disabled`, non-placeholder
  secrets, an HTTPS apex `PUBLIC_WEB_ORIGIN` such as `https://127-0-0-1.nip.io`);
  the seed and `auth:e2e-staff` still run once with `NODE_ENV=test` on the disposable DB;
- the admin and storefront built for that origin and
  `NGINX_E2E_HTTPS_PORT=443 e2e/scripts/nginx-routing-proxy.sh start` (throwaway certificate);
- `SESSION_E2E_ORIGIN=https://127-0-0-1.nip.io`; the browser ignores the throwaway
  certificate only in this mode. Use `SESSION_E2E_HOST_RULES="MAP host 127.0.0.1"`
  for a hostname that does not resolve publicly.

Staff password sign-in is rate limited (5 per 15 minutes per identifier) and each
TOTP step is accepted once, so run one test at a time with the Redis keys cleared
and about 35 seconds apart: `docker exec <redis> redis-cli flushall` on the
disposable instance only.
