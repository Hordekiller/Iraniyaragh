import { expect } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';

export const isMobile = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 768;

/**
 * Stable locator for the admin sidebar drawer.
 *
 * The AdminShell swaps the element's ARIA role between `complementary` (closed)
 * and `dialog` (open) when the mobile drawer is toggled, so a role-based query
 * (getByRole('complementary')) can never target it in both states. Matching on
 * the element/tag and its stable `aria-label` works regardless of the open state.
 */
export const adminSidebar = (page: Page): Locator => page.locator('aside[aria-label="منوی اصلی"]');

/**
 * Signs the dev admin into the admin panel by driving the real login UI.
 *
 * The admin token is held in memory only (AUTH_CONTRACT §7: no
 * localStorage/sessionStorage/document.cookie), so it cannot be replayed via
 * Playwright's storageState. The only reliable way to reach the authenticated
 * shell is to perform the actual sign-in through the login page.
 *
 * Requires the API to be running with `AUTH_DEV_CODE` set and the dev admin
 * seeded (see the e2e job in .github/workflows/ci.yml).
 */
export async function signInDiAsAdmin(page: Page) {
  const devCode = process.env.AUTH_DEV_CODE;
  if (!devCode) {
    throw new Error('AUTH_DEV_CODE must be set to sign in to the admin panel in e2e.');
  }

  await page.goto('/login');
  await page.getByLabel('کد دسترسی توسعه‌دهنده').fill(devCode);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

/**
 * Fires a (synthetic) click on the element. Used instead of `locator.click()`
 * for pointer interactions: Chromium reports a negative `scrollLeft` for RTL
 * pages, which Playwright's hit-target maths mis-handles on mobile emulation
 * (the click point lands outside the visual viewport and the document root
 * "intercepts the pointer events"). The React handlers are DOM-event driven, so
 * the dispatched click still exercises the real behavior.
 */
export async function tap(locator: Locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.dispatchEvent('click');
}

/**
 * Records every http(s) request the page makes and fails the test as soon as an
 * assertion runs if any of them target an origin different from the page origin.
 *
 * Both app shells are self-hosted foundations: the storefront and the admin
 * panel must never load third-party assets (fonts, scripts, images). The web
 * app self-hosts Vazirmatn as a variable woff2; the admin uses local fonts and
 * a strict CSP.
 */
export function createExternalRequestsTracker(page: Page) {
  const requests: string[] = [];
  const onRequest = (request: Request) => {
    if (/^https?:\/\//.test(request.url())) requests.push(request.url());
  };
  page.on('request', onRequest);

  return {
    async assertNone() {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      page.off('request', onRequest);
      const pageOrigin = new URL(page.url()).origin;
      const external = requests.filter(url => new URL(url).origin !== pageOrigin);
      expect(external, `External asset requests observed: ${external.join(', ')}`).toEqual([]);
    },
  };
}