import { expect, test } from '@playwright/test';

test.describe('api: promotions public and customer surface', () => {
  test('the public campaign feed exposes only display fields and never coupon or customer data', async ({ request }) => {
    const response = await request.get('/api/v1/promotions/public');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { data: { items: Array<Record<string, unknown>> } };
    expect(Array.isArray(body.data.items)).toBe(true);
    for (const item of body.data.items) {
      expect(Object.keys(item).sort()).toEqual(['amount', 'badgeText', 'endsAt', 'id', 'kind', 'name', 'percentBp', 'scheduled', 'scope', 'startsAt']);
    }
  });

  test('applying or removing a coupon requires an authenticated customer', async ({ request }) => {
    expect((await request.put('/api/v1/cart/coupon', { data: { code: 'SAVE10' } })).status()).toBe(401);
    expect((await request.delete('/api/v1/cart/coupon')).status()).toBe(401);
  });
});
