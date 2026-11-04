import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
test('approved storefront mark, wordmark and browser icons load from the site origin', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const images = page.locator('img[src*="/brand/"]'); await expect(images).not.toHaveCount(0);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href))) {
    expect(new URL(icon).origin).toBe(new URL(page.url()).origin); const response = await request.get(icon); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toMatch(/image\/(?:png|x-icon|vnd\.microsoft\.icon)/);
    if (new URL(icon).pathname.endsWith('.ico')) {
      const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../assets/brand/manifest.json'), 'utf8'));
      expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(manifest.sources.favicon);
    }
  }
  await expect(page.locator('header img[src*="wordmark-"]').first()).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('header img[src*="wordmark-"]').first()).toBeVisible();
    const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(size.content).toBeLessThanOrEqual(size.viewport);
  }
});
