import { expect, test } from '@playwright/test';
test('approved storefront mark, wordmark and browser icons load from the site origin', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const images = page.locator('img[src*="/brand/"]'); await expect(images).not.toHaveCount(0);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href))) {
    expect(new URL(icon).origin).toBe(new URL(page.url()).origin); const response = await request.get(icon); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('image/png');
  }
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth })); expect(size.content).toBeLessThanOrEqual(size.viewport);
});
