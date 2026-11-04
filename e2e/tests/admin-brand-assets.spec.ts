import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
test('approved Admin wordmark, Persian fonts and browser icons load locally', async ({ page, request }) => {
  await page.goto('/login'); const logo = page.getByRole('img', { name: 'ایرانی یراق' }); await expect(logo.first()).toBeVisible();
  await expect.poll(() => logo.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(async () => { const faces = await document.fonts.load('400 12px "Iraniyaragh Sans"', 'ایرانی یراق'); return faces.length > 0 && faces.every(face => face.status === 'loaded'); })).toBe(true);
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href))) {
    expect(new URL(icon).origin).toBe(new URL(page.url()).origin); const response = await request.get(icon); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toMatch(/image\/(?:png|x-icon|vnd\.microsoft\.icon)/);
    if (new URL(icon).pathname.endsWith('.ico')) {
      const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../assets/brand/manifest.json'), 'utf8'));
      expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(manifest.sources.favicon);
    }
  }
});
