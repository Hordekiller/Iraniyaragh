import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Routing tests for the real nginx vhost, run against the harness in
 * scripts/nginx-routing-proxy.sh.
 *
 * These exist because no other browser project exercises nginx. Every other
 * project in this suite talks to `127.0.0.1:3001` or `:4173` directly, so nginx is
 * not even in the request path — which is how `/admin` and `/admin/` came to
 * redirect to each other in a loop on a live host while all 30-odd browser tests
 * stayed green.
 *
 * The invariant: nginx and the Admin must agree on which of `/admin` and `/admin/`
 * is canonical. Next.js answers `/admin/` with a redirect back to `/admin`, so
 * nginx has to proxy `/admin` and canonicalise `/admin/` *towards* it.
 * Redirecting the other way loops, and a loop is legal nginx syntax that
 * `nginx -t` accepts.
 *
 * What these tests can and cannot assert. The redirect table belongs to nginx, so
 * it is asserted exactly. The Admin this suite builds has no `basePath`, while the
 * published image is built with `NEXT_PUBLIC_BASE_PATH=/admin`
 * (publish-images.yml), so `/admin` reaches the upstream's own 404 here instead of
 * its `/admin/dashboard` redirect. That is why "no loop" is asserted as
 * *termination within a bounded number of hops* rather than as a 200: the property
 * under test is that the two ends cannot disagree, and the final status belongs to
 * whichever Admin build is upstream. The basePath build is verified on the real
 * host, where /admin/_next assets are actually requested.
 */

const HTTP_ORIGIN = `http://127.0.0.1:${process.env.NGINX_E2E_HTTP_PORT ?? 8080}`;
const HTTPS_ORIGIN = `https://127.0.0.1:${process.env.NGINX_E2E_HTTPS_PORT ?? 8443}`;
const CI = Boolean(process.env.CI);

/**
 * The path a redirect points at, or '' when the response is not a redirect.
 *
 * The request context resolves a relative `Location` against the request URL
 * before exposing it, so asserting on the header directly would compare `/admin`
 * against `http://127.0.0.1:8080/admin`. Reading it back as a path keeps these
 * assertions about routing rather than about how the client rewrote the header.
 */
const redirectPath = (response: { headers(): Record<string, string> }): string => {
  const location = response.headers()['location'];
  if (!location) return '';
  return new URL(location, HTTP_ORIGIN).pathname + new URL(location, HTTP_ORIGIN).search;
};

const firstStorefrontAsset = (): string => {
  const assets = readdirSync(join(process.cwd(), '../apps/web/dist/assets')).filter(name =>
    name.endsWith('.js'),
  );
  expect(assets.length, 'the storefront build produced no hashed JS asset').toBeGreaterThan(0);
  return `/assets/${assets.sort()[0]!}`;
};

test.describe('nginx: admin basePath routing', () => {
  test('/admin is proxied upstream, never redirected to /admin/', async ({ request }) => {
    // maxRedirects 0 exposes the first hop, which is the entire regression: the
    // loop began with `return 301 /admin/`, and this is what would catch it.
    const response = await request.get(`${HTTP_ORIGIN}/admin`, { maxRedirects: 0 });

    expect(redirectPath(response)).not.toBe('/admin/');
    expect(response.status(), 'nginx must answer /admin from the upstream, not a redirect').not.toBe(301);
  });

  test('/admin/ canonicalises to /admin', async ({ request }) => {
    const response = await request.get(`${HTTP_ORIGIN}/admin/`, { maxRedirects: 0 });

    expect(response.status()).toBe(301);
    expect(redirectPath(response)).toBe('/admin');
  });

  test('/admin/ keeps its query string across the canonical redirect', async ({ request }) => {
    // A bare `return 301 /admin` drops this silently.
    const response = await request.get(`${HTTP_ORIGIN}/admin/?next=orders`, { maxRedirects: 0 });

    expect(response.status()).toBe(301);
    expect(redirectPath(response)).toBe('/admin?next=orders');
  });

  test('following /admin terminates instead of looping', async ({ request }) => {
    // Chromium fails with ERR_TOO_MANY_REDIRECTS after 20 hops, so a bounded
    // maxRedirects that completes is the loop assertion.
    const response = await request.get(`${HTTP_ORIGIN}/admin`, { maxRedirects: 5 });

    expect(response.url()).toBe(`${HTTP_ORIGIN}/admin`);
  });

  test('following /admin/ terminates instead of looping', async ({ request }) => {
    const response = await request.get(`${HTTP_ORIGIN}/admin/`, { maxRedirects: 5 });

    expect(response.url()).toBe(`${HTTP_ORIGIN}/admin`);
  });

  test('the two ends cannot disagree on the TLS vhost either', async ({ request }) => {
    // storefront.conf shares one routing file between its HTTP and HTTPS blocks
    // precisely so they cannot drift, so the pair has to hold on both.
    const canonical = await request.get(`${HTTPS_ORIGIN}/admin`, { maxRedirects: 0 });
    expect(redirectPath(canonical)).not.toBe('/admin/');

    const slashed = await request.get(`${HTTPS_ORIGIN}/admin/`, { maxRedirects: 0 });
    expect(slashed.status()).toBe(301);
    expect(redirectPath(slashed)).toBe('/admin');

    const followed = await request.get(`${HTTPS_ORIGIN}/admin/`, { maxRedirects: 5 });
    expect(followed.url()).toBe(`${HTTPS_ORIGIN}/admin`);
  });

  test('a path beneath /admin reaches the Admin, prefix intact', async ({ request }) => {
    // The prefix has to survive the proxy: the Admin is built for it, and this is
    // the same routing that carries /admin/_next assets on the shipped build.
    const response = await request.get(`${HTTP_ORIGIN}/admin/login`, { maxRedirects: 5 });

    expect(response.url()).toContain('/admin/login');
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('nginx: the browser is not trapped', () => {
  test('a real navigation of /admin settles', async ({ page }) => {
    const failed: string[] = [];

    page.on('requestfailed', request => {
      // The upstream Admin answers 404 for a path outside its build's basePath;
      // the navigation itself completing is the property under test.
      if (request.url().includes('/admin')) failed.push(request.url());
    });

    const response = await page.goto('/admin');

    // A loop surfaces here as net::ERR_TOO_MANY_REDIRECTS rather than as a
    // response, so a resolved goto is already the regression assertion.
    expect(response).not.toBeNull();
    expect(page.url()).not.toContain('/admin/');
    expect(failed.filter(url => !url.includes('/admin/'))).toEqual([]);
  });
});

test.describe('nginx: storefront and API do not regress', () => {
  test('the storefront is still served at the root', async ({ request }) => {
    const response = await request.get(`${HTTP_ORIGIN}/`, { maxRedirects: 5 });

    expect(response.status()).toBe(200);
  });

  test('a hashed storefront asset is still served from disk', async ({ request }) => {
    // The routing file serves /assets off the filesystem with a long immutable
    // cache. If a routing change swallowed that, the SPA would render unstyled.
    const response = await request.get(`${HTTP_ORIGIN}${firstStorefrontAsset()}`, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('immutable');
  });

  test('an unknown /assets path is a 404 from the filesystem, not the SPA', async ({ request }) => {
    // try_files $uri =404 has to win over the index.html fallback, otherwise a
    // mistyped asset URL returns HTML and fails as a MIME error in the browser.
    const response = await request.get(`${HTTP_ORIGIN}/assets/not-a-real-file.js`, { maxRedirects: 0 });

    expect(response.status()).toBe(404);
  });

  test('the API is still proxied under /api', async ({ request }) => {
    const response = await request.get(`${HTTP_ORIGIN}/api/v1/health/ready`, { maxRedirects: 5 });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready' });
  });

  test('media is still served under /media', async ({ request }) => {
    // Gated on the CI stack because this is the one assertion that needs the
    // object store, which only the e2e job starts.
    test.skip(!CI, 'needs the MinIO media store from the e2e CI stack');

    // The routing file strips the /media prefix with a rewrite, because the
    // object store is addressed path-style. A 502 here would mean the rewrite
    // stopped working; a 404 is the store correctly reporting no such key.
    const response = await request.get(`${HTTP_ORIGIN}/media/products/not-a-real-object.png`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  });
});