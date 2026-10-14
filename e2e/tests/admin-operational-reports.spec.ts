import { expect, test } from '@playwright/test';
import { signInDiAsAdmin, tap } from './helpers';

test('staff reads real operational evidence, order pages and immutable debtor aging', async ({
  page,
}) => {
  await signInDiAsAdmin(page);
  const summaryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/reports/admin/operations' &&
      response.request().method() === 'GET',
  );
  await page.goto('/reports');
  await expect(
    page.getByRole('heading', { name: 'گزارش‌های عملیاتی', level: 1 }),
  ).toBeVisible();
  const response = await summaryResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const { data } = await response.json();
  expect(data.report.timezone).toBe('Asia/Tehran');
  for (const total of Object.values(data.report.totals) as {
    amount: { amount: string; currency: string };
  }[]) {
    expect(total.amount.currency).toBe('IRR');
    expect(total.amount.amount).toMatch(/^-?\d+$/);
  }
  await expect(
    page.getByRole('button', { name: 'بازخوانی گزارش', exact: true }),
  ).toBeVisible();
  const ordersResponse = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname ===
        '/api/v1/reports/admin/operations/orders' &&
      item.request().method() === 'GET',
  );
  await tap(page.getByRole('tab', { name: 'سفارش و پرداخت', exact: true }));
  const orders = await ordersResponse;
  expect(orders.status()).toBe(200);
  const orderData = (await orders.json()).data;
  expect(orderData.items.length).toBeLessThanOrEqual(25);
  expect(new URL(orders.url()).searchParams.has('grain')).toBe(false);
  if (orderData.items.length) {
    await expect(
      page.getByRole('table', { name: 'گزارش سفارش و پرداخت' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: orderData.items[0].number, exact: true }),
    ).toBeVisible();
  } else
    await expect(
      page.getByText('سفارشی با این فیلتر وجود ندارد.', { exact: true }),
    ).toBeVisible();
  const debtorResponse = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname ===
        '/api/v1/reports/admin/operations/debtors' &&
      item.request().method() === 'GET',
  );
  await tap(page.getByRole('tab', { name: 'بدهکاران و سررسید', exact: true }));
  const debtors = await debtorResponse;
  expect(debtors.status()).toBe(200);
  expect(debtors.headers()['cache-control']).toBe('no-store');
  const debtData = (await debtors.json()).data;
  expect(debtData.items.length).toBeLessThanOrEqual(25);
  if (debtData.items.length)
    await expect(
      page.getByRole('table', { name: 'گزارش بدهکاران و سررسید' }),
    ).toBeVisible();
  else
    await expect(
      page.getByText('بدهی یا تعهد برگشت وجهی با این فیلتر وجود ندارد.', {
        exact: true,
      }),
    ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'گزارش‌های عملیاتی', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'بازخوانی گزارش', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'بدهکاران و سررسید', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.get('view')).toBe('debtors');
});
