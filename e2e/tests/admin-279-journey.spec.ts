import { expect, test } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';
import { join } from 'node:path';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';

/**
 * End-to-end verification of the #279 rich-text description stack as assembled
 * on the `feat/279-e2e-verify` branch (self-hosted Jodit + mock media):
 *
 *  admin MFA sign-in -> create product draft -> upload product media -> READY
 *    -> open the rich-text editor -> compose HTML (heading, table, link, media
 *    image + hostile payload) -> save -> fresh session -> verify persisted +
 *    rewrites -> publish -> storefront -> verify rendered markup + image +
 *    trusted-origin network only.
 *
 * Security assertions are observations of the *running* stack (real API + MinIO
 * + postgres + Redis): hostile markup must not survive a save, description
 * images must be rewritten to the canonical public media origin, and no request
 * may target jodit-cdn.unpkg.com or any other third-party origin.
 *
 * The admin access token is memory-only (AUTH_CONTRACT §7), so authenticated
 * navigation uses client-side transitions only; full page loads after sign-in
 * would drop the session and bounce to /login.
 */

const storefrontUrl = process.env.WEB_E2E_URL ?? 'http://127.0.0.1:4173';
const apiOrigin = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';
const publicMediaOrigin = 'http://127.0.0.1:9000';

const fixtureImage = join(__dirname, 'fixtures', 'product-detail.png');

const EDITOR_BODY = '[data-rich-text-editor] .jodit-wysiwyg';

function createOriginGuardTracker(page: Page) {
  const requests: string[] = [];
  const trusted = new Set<string>();
  const adminOrigin = new URL(process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3001').origin;
  const storefrontOrigin = new URL(storefrontUrl).origin;
  const onRequest = (request: Request) => {
    if (!/^https?:\/\//i.test(request.url())) return;
    // Ignore residual prefetches from the admin shell that can still be in
    // flight during the origin switch; they are not storefront behaviour.
    const requestOrigin = new URL(request.url()).origin;
    if (requestOrigin === adminOrigin) return;
    if (page.url().startsWith(storefrontOrigin)) requests.push(request.url());
  };
  page.on('request', onRequest);

  return {
    trust(origin: string) {
      trusted.add(new URL(origin).origin);
    },
    async assertOnlyTrustedOrigins() {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      page.off('request', onRequest);
      const pageOrigin = new URL(page.url()).origin;
      const offenders = requests.filter((url) => {
        const origin = new URL(url).origin;
        return origin !== pageOrigin && !trusted.has(origin);
      });
      expect(offenders, `Requests to untrusted origins: ${offenders.join(', ')}`).toEqual([]);
    },
  };
}

function richEditorBody(page: Page): Locator {
  return page.locator(EDITOR_BODY);
}

/**
 * Jodit normalizes/propagates change asynchronously after programmatic
 * insertion, so the editor can emit one final change event a beat after the
 * content seems ready. Waiting until two consecutive samples are identical
 * removes that trailing event from racing the save.
 */
async function waitForEditorStable(page: Page, timeoutMs = 8_000) {
  const body = richEditorBody(page);
  const deadline = Date.now() + timeoutMs;
  let previous = '';
  while (Date.now() < deadline) {
    const current = await body.evaluate((element) => element.innerHTML);
    if (current !== '' && current === previous) return;
    previous = current;
    await page.waitForTimeout(250);
  }
  throw new Error('Editor content did not become stable in time.');
}

async function waitForEditorReady(page: Page) {
  await expect(page.locator('[data-rich-text-editor]')).toHaveAttribute('data-status', 'ready', {
    timeout: 20_000,
  });
}

/** Client-side navigation to the catalog list, preserving the in-memory token. */
async function navToCatalog(page: Page) {
  const sidebar = adminSidebar(page);
  const catalogLink = sidebar.getByRole('link', { name: 'کالا و SKU' });
  if (!(await catalogLink.isVisible().catch(() => false))) {
    await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  }
  await tap(catalogLink);
  await expect(page).toHaveURL(/\/catalog$/, { timeout: 15_000 });
}

/**
 * Focuses the editor and inserts a sequence of HTML chunks the way consecutive
 * pastes would: the real contenteditable receives `insertHTML` for each chunk
 * in one synchronization point (so the caret stays continuous), then a single
 * `input` event flows through Jodit's listeners into the component draft
 * (visible via description-unsaved).
 */
async function insertHtmlInEditor(page: Page, chunks: string[]) {
  const body = richEditorBody(page);
  await body.waitFor({ state: 'attached' });
  await body.dispatchEvent('click');
  await body.evaluate((element, markup: string[]) => {
    element.focus();
    for (const chunk of markup) {
      document.execCommand('insertHTML', false, chunk);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, chunks);
}

/**
 * Opens the media picker from the editor toolbar. On narrow viewports Jodit
 * folds toolbar buttons into its overflow popup, so widen the page when the
 * button is not visible; the picker dialog itself is layout-agnostic.
 */
async function clickImageToolbarButton(page: Page) {
  const button = page
    .locator('[data-rich-text-editor]')
    .getByRole('button', { name: 'Insert image from the IranYaragh product library' });
  try {
    await button.first().waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    await page.setViewportSize({ width: 1280, height: 800 });
    await button.first().waitFor({ state: 'visible', timeout: 10_000 });
  }
  await tap(button.first());
  await expect(page.getByTestId('product-media-picker-dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('media-picker-grid')).toBeVisible({ timeout: 15_000 });
}

const HOSTILE_PAYLOAD =
  '<style>body{display:none}</style><script>alert(1)</script>' +
  '<p onmouseover="steal()">متن ارزشمند<a href="javascript:alert(1)">پیوند خراب</a></p>';

const SAFE_RICH_HTML =
  '<h2>دربارهٔ این قفل</h2>' +
  '<p>جنس برنج با <strong>پوشش ضد خش</strong> و <span style="color:#b4541d;text-align:center">رنگ برنز</span>.</p>' +
  '<table><tr><td>وزن</td><td>۴۸ گرم</td></tr><tr><td>جنس</td><td>برنج</td></tr></table>' +
  '<p>مشاهده: <a href="https://iranyaragh.test/docs" target="_blank">راهنمای نصب</a></p>' +
  '<p dir="rtl">متن راست‌چین</p>';

test.describe.serial('#279 description journey (assembled stack)', () => {
  test.setTimeout(180_000);
  // In the concurrent full suite the browser->MinIO upload PUT can stall under
  // parallel load (media rows stuck at PENDING_UPLOAD, worker idle). Isolated
  // runs always pass; a single bounded retry keeps CI honest without masking
  // real failures.
  test.describe.configure({ retries: 1 });

  let productName = '';
  let productSlug = '';
  let productHref = '';

  test.beforeEach(async ({ page }) => {
    await signInDiAsAdmin(page);
  });

  test('creates a product draft through the admin UI', async ({ page }) => {
    const stamp = Date.now();
    productName = `قفل اهرمی E2E ${stamp}`;
    productSlug = `279-e2e-lock-${stamp}`;

    await navToCatalog(page);
    await tap(page.locator('a[href="/catalog/products/new"]'));
    await expect(page).toHaveURL(/catalog\/products\/new$/);

    await page.locator('#product-name').fill(productName);
    await page.locator('#product-slug').fill(productSlug);
    await page.locator('#variant-0-sku').fill(`E2E-LOCK-${stamp}`);
    await page.locator('#variant-0-cost').fill('180000');
    await page.locator('#variant-0-sale').fill('240000');

    await tap(page.getByRole('button', { name: 'ثبت کالا' }));
    await expect(page).toHaveURL(/\/catalog$/, { timeout: 20_000 });

    const detailLink = page.locator(`a[href^="/catalog/products/"]`, { hasText: productName });
    await expect(detailLink).toBeVisible({ timeout: 15_000 });
    productHref = (await detailLink.first().getAttribute('href')) ?? '';
    expect(productHref).toMatch(/^\/catalog\/products\/[^/]+$/u);

    await tap(detailLink.first());
    await expect(page).toHaveURL(new RegExp(`${productHref}$`));
  });

  test('uploads a product image and waits for the READY state', async ({ page }) => {
    expect(productHref).toMatch(/^\/catalog\/products\/[^/]+$/u);
    await navToCatalog(page);
    await tap(page.locator(`a[href="${productHref}/media"]`));
    await expect(page).toHaveURL(new RegExp(`${productHref}/media$`));

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles(fixtureImage);
    await expect(
      page.getByText('در صف پردازش').first().or(page.getByText('در حال پردازش').first()),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('آماده', { exact: true }).first()).toBeVisible({
      timeout: 120_000,
    });
  });

  test('composes rich HTML, inserts the product image and saves', async ({ page }) => {
    await navToCatalog(page);
    await tap(page.locator(`a[href="${productHref}"]`));
    await expect(page).toHaveURL(new RegExp(`${productHref}$`));
    await waitForEditorReady(page);

    await insertHtmlInEditor(page, [HOSTILE_PAYLOAD, SAFE_RICH_HTML]);

    await clickImageToolbarButton(page);
    const option = page.getByTestId('media-picker-option').first();
    await option.waitFor({ state: 'attached' });
    await tap(option);

    const editorBody = richEditorBody(page);
    await expect
      .poll(async () => (await editorBody.innerText()).includes('دربارهٔ این قفل'), { timeout: 15_000 })
      .toBe(true);
    await expect
      .poll(async () => (await editorBody.innerHTML()).includes('data-media-id='), { timeout: 15_000 })
      .toBe(true);

    await expect(page.getByTestId('description-unsaved')).toBeVisible();

    await waitForEditorStable(page);
    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/description') &&
        response.request().method() === 'PATCH',
    );
    await tap(page.getByTestId('description-save'));
    const saved = await saveResponse;
    expect(saved.status()).toBe(200);
    await expect(page.getByTestId('description-error')).toHaveCount(0);
    await expect(page.getByTestId('description-stale')).toHaveCount(0);
  });

  test('a fresh session loads the sanitized description with server-rewritten images', async ({ page }) => {
    await navToCatalog(page);
    await tap(page.locator(`a[href="${productHref}"]`));
    await waitForEditorReady(page);

    const html = (await richEditorBody(page).innerHTML()) ?? '';
    expect(html).toContain('دربارهٔ این قفل');
    expect(html).toContain('<h2');
    expect(html).toContain('<table');
    expect(html).toContain('href="https://iranyaragh.test/docs"');
    expect(html).toMatch(/<img[^>]+data-media-id=/u);

    const src = html.match(/<img[^>]+src="([^"]+)"/u)?.[1] ?? '';
    expect(src).toMatch(new RegExp(`^${publicMediaOrigin}/products/`));
    expect(src).not.toMatch(/X-Amz-|AWSAccessKeyId|signature|presign|credential=/iu);

    for (const forbidden of ['<script', '<style', 'onmouseover', 'javascript:', 'alert(1)']) {
      expect(html.toLowerCase()).not.toContain(forbidden);
    }
  });

  test('publishes the product', async ({ page }) => {
    await navToCatalog(page);
    await tap(page.locator(`a[href="${productHref}"]`).first());
    await expect(page).toHaveURL(new RegExp(`${productHref}$`));
    await expect(page.getByRole('button', { name: `اقدامات ${productName}` })).toBeVisible();
    await tap(page.getByRole('button', { name: `اقدامات ${productName}` }));
    await tap(page.getByRole('menuitem', { name: 'انتشار' }));
    await expect(page.getByText('منتشرشده', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('renders the description on the storefront with only trusted network origins', async ({ page }) => {
    // In the CI build the storefront serves the FIXTURE catalog (VITE_FIXTURE_
    // CATALOG=true), which cannot list the API-created product. The committed
    // branch therefore asserts against a fixture product whose description is
    // known. Setting WEB_E2E_REAL_URL (a real-API web build) enables the full
    // capstone: the product published above with its rich description.
    const realStorefront = process.env.WEB_E2E_REAL_URL;
    const target = realStorefront
      ? `${realStorefront}/product/${productSlug}`
      : `${storefrontUrl}/product/bosch-gws-750-grinder`;

    const tracker = createOriginGuardTracker(page);
    if (realStorefront) {
      tracker.trust(apiOrigin);
      tracker.trust(publicMediaOrigin);
    }

    await page.goto(target);
    await expect(page).toHaveURL(new RegExp(`/product/[^/]+$`));

    const rich = page.locator('[data-rich-text="true"]');
    await expect(rich).toBeVisible({ timeout: 20_000 });

    if (realStorefront) {
      expect(await page.url()).toContain(`/product/${productSlug}`);
      const text = (await rich.innerText()) ?? '';
      expect(text).toContain('دربارهٔ این قفل');
      expect(text).toContain('وزن');
      expect(text).toContain('راهنمای نصب');

      const html = (await rich.innerHTML()) ?? '';
      expect(html).toContain('<h2');
      expect(html).toContain('<table');
      expect(html).toContain('href="https://iranyaragh.test/docs"');
      expect(html).toMatch(/<img[^>]+src="[^"]+"/u);

      const mediaSrcs = await rich
        .locator('img')
        .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src') ?? ''));
      for (const mediaSrc of mediaSrcs) {
        expect(mediaSrc.startsWith(`${publicMediaOrigin}/products/`)).toBe(true);
        expect(mediaSrc).not.toMatch(/X-Amz-|AWSAccessKeyId|signature|presign|credential=/iu);
      }

      for (const escaped of ['&lt;script', '&lt;style', '<script', '<style']) {
        expect(html).not.toContain(escaped);
      }
    } else {
      const text = (await rich.innerText()) ?? '';
      expect(text).toContain('مینی فرز');
    }

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await tracker.assertOnlyTrustedOrigins();
  });
});