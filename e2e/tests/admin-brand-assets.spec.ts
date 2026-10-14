import { expect, test } from '@playwright/test';
test('approved Admin wordmark, Persian fonts and browser icons load locally', async ({ page, request }) => {
  await page.goto('/login'); const logo = page.getByRole('img', { name: 'ایران یراق' }); await expect(logo.first()).toBeVisible();
  await expect.poll(() => logo.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(async () => { const faces = await document.fonts.load('400 12px "Iraniyaragh Sans"', 'ایران یراق'); return faces.length > 0 && faces.every(face => face.status === 'loaded'); })).toBe(true);
  for (const icon of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href))) {
    expect(new URL(icon).origin).toBe(new URL(page.url()).origin); const response = await request.get(icon); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('image/png');
  }
});
