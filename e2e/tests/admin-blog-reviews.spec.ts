import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

/**
 * Real-browser regression for three operator-reported Admin failures, against
 * the real API and database with no mocked response:
 *
 * - «فهرست دریافت نشد» on the reviews page: its default list request was
 *   rejected with 400 by the compiled API (an absent optional rating became NaN).
 * - «راه‌اندازی ویرایشگر ناموفق بود» on every article page: the packaged Jodit
 *   aborted when the article editor passed no placeholder.
 * - «درخواست تأیید نشد … مقاله ذخیره‌شده فرض نشود» shown on load, before any save.
 *
 * Unit tests could not see the first one (the test transpiler emits different
 * class fields than the production build) and mocked the editor for the others,
 * so the assembled page is asserted here.
 */
const LIST_FAILED = /فهرست دریافت نشد/u;
const EDITOR_FAILED = /راه‌اندازی ویرایشگر ناموفق/u;
const UNCONFIRMED = /درخواست تأیید نشد/u;

async function openFromSidebar(page: Page, label: string, url: RegExp): Promise<void> {
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name: label }));
  await expect(page).toHaveURL(url);
}

const isApi = (response: Response, path: string, method = 'GET'): boolean =>
  response.url().includes(`/api/v1${path}`) && response.request().method() === method;
const isApiExact = (response: Response, path: string, method = 'GET'): boolean =>
  new URL(response.url()).pathname === `/api/v1${path}` && response.request().method() === method;

test('staff opens the review list, writes an article in the real editor, saves it and reads it back', async ({ page }) => {
  await signInDiAsAdmin(page);

  // ── Reviews: the default "pending" list is accepted by the real API ────────
  const reviewList = page.waitForResponse(response => isApi(response, '/reviews/admin?'));
  await openFromSidebar(page, 'نظرات مشتریان', /\/reviews$/);
  const reviews = await reviewList;
  expect(new URL(reviews.url()).searchParams.get('status')).toBe('PENDING');
  expect(new URL(reviews.url()).searchParams.has('rating'), 'the default request carries no rating filter').toBe(false);
  expect(reviews.status(), 'the unfiltered review list must not be rejected').toBe(200);
  await expect(page.getByRole('heading', { name: 'نظرات مشتریان', level: 1 })).toBeVisible();
  await expect(page.getByText('نظر بررسی‌نشده‌ای وجود ندارد.')).toBeVisible();
  await expect(page.getByText(LIST_FAILED)).toHaveCount(0);

  // A supplied rating filter still reaches the API as a number and is accepted.
  const rated = page.waitForResponse(response => isApi(response, '/reviews/admin?') && response.url().includes('rating=5'));
  await tap(page.getByRole('combobox', { name: 'امتیاز' }));
  await tap(page.getByRole('option', { name: /۵/u }));
  expect((await rated).status()).toBe(200);
  await expect(page.getByText(LIST_FAILED)).toHaveCount(0);

  // ── Blog: empty list, then the article editor starts without any error ─────
  const postList = page.waitForResponse(response => isApi(response, '/blog/admin/posts?'));
  await openFromSidebar(page, 'مقالات وبلاگ', /\/blog$/);
  expect((await postList).status()).toBe(200);
  await expect(page.getByText(LIST_FAILED)).toHaveCount(0);

  await tap(page.getByRole('link', { name: 'مقالهٔ جدید' }));
  await expect(page).toHaveURL(/\/blog\/new$/);
  const editor = page.locator('[data-rich-text-editor]');
  await expect(editor).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await expect(page.getByText(EDITOR_FAILED)).toHaveCount(0);
  await expect(page.getByText(UNCONFIRMED), 'no save was attempted, so nothing may be reported unconfirmed').toHaveCount(0);
  await expect(page.locator('.MuiAlert-colorError')).toHaveCount(0);

  // ── Write a Persian article, including a source-mode round trip ───────────
  const suffix = Date.now().toString(36);
  const title = `راهنمای آزمون ویرایشگر ${suffix}`;
  const excerpt = 'این خلاصهٔ پاسخ‌محور برای آزمون ذخیره و بازخوانی مقاله در مرورگر واقعی نوشته شده است.';
  const paragraph = 'انتخاب لولای مناسب به وزن و ضخامت درب بستگی دارد.';
  await page.getByRole('textbox', { name: 'عنوان', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'خلاصهٔ پاسخ‌محور', exact: true }).fill(excerpt);

  const wysiwyg = editor.locator('.jodit-wysiwyg');
  await wysiwyg.click();
  await page.keyboard.type(paragraph);
  await expect(wysiwyg).toContainText(paragraph);

  // Source mode shows the same HTML and accepts a pasted block unchanged.
  const sourceButton = editor.locator('.jodit-toolbar-button_source button');
  await tap(sourceButton);
  const source = editor.locator('textarea.jodit-source__mirror');
  await expect(source).toBeVisible();
  await expect(source).toHaveValue(new RegExp(paragraph, 'u'));
  const html = `<p>${paragraph}</p><h2>نکات نصب</h2><table><tbody><tr><td>وزن درب</td><td>۴۰ کیلوگرم</td></tr></tbody></table>`;
  await source.fill(html);
  await tap(sourceButton);
  await expect(wysiwyg.locator('h2')).toHaveText('نکات نصب');
  await expect(wysiwyg.locator('table td')).toHaveCount(2);

  // ── Save: confirmed by the server, then read back independently ───────────
  const created = page.waitForResponse(response => isApiExact(response, '/blog/admin/posts', 'POST'));
  await tap(page.getByRole('button', { name: 'ایجاد پیش‌نویس' }));
  const createResponse = await created;
  expect(createResponse.status(), 'the article draft must be created').toBeLessThan(300);
  expect(createResponse.request().headers()['idempotency-key']).toMatch(/^blog-/u);
  const createdPost = ((await createResponse.json()) as { data: { post: { id: string; version: number; bodyHtml: string } } }).data.post;
  await expect(page).toHaveURL(new RegExp(`/blog/${createdPost.id}$`, 'u'));
  await expect(page.getByText(UNCONFIRMED)).toHaveCount(0);

  // A full reload restores the session and reads the article from the server.
  const reread = page.waitForResponse(response => isApiExact(response, `/blog/admin/posts/${createdPost.id}`));
  await page.reload();
  const stored = ((await (await reread).json()) as { data: { post: { title: string; excerpt: string; bodyHtml: string; status: string } } }).data.post;
  expect(stored.title).toBe(title);
  expect(stored.excerpt).toBe(excerpt);
  expect(stored.status).toBe('DRAFT');
  expect(stored.bodyHtml).toBe(createdPost.bodyHtml);
  expect(stored.bodyHtml).toContain(paragraph);
  expect(stored.bodyHtml).toContain('<h2>نکات نصب</h2>');
  expect(stored.bodyHtml).toContain('<td>۴۰ کیلوگرم</td>');

  // The reopened editor shows the persisted article and still has no error.
  await expect(editor).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'عنوان', exact: true })).toHaveValue(title);
  await expect(editor.locator('.jodit-wysiwyg h2')).toHaveText('نکات نصب');
  await expect(page.getByText(EDITOR_FAILED)).toHaveCount(0);
  await expect(page.getByText(UNCONFIRMED)).toHaveCount(0);

  // ── Edit and save again; the list then shows exactly one such article ─────
  const editedTitle = `${title} ویرایش`;
  await page.getByRole('textbox', { name: 'عنوان', exact: true }).fill(editedTitle);
  const updated = page.waitForResponse(response => isApiExact(response, `/blog/admin/posts/${createdPost.id}`, 'PUT'));
  await tap(page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));
  expect((await updated).status()).toBeLessThan(300);
  await expect(page.getByRole('status').filter({ hasText: 'ذخیره انجام شد.' })).toBeVisible();

  // A status change is a separate command with its own key; it must reach the server too.
  const submitted = page.waitForResponse(response => isApiExact(response, `/blog/admin/posts/${createdPost.id}/transition`, 'POST'));
  await tap(page.getByRole('button', { name: 'ارسال برای بازبینی' }));
  const submitResponse = await submitted;
  expect(submitResponse.request().headers()['idempotency-key']).toMatch(/^blog-submit-/u);
  expect(submitResponse.status()).toBeLessThan(300);
  await expect(page.getByRole('status').filter({ hasText: 'ارسال برای بازبینی انجام شد.' })).toBeVisible();
  await expect(page.getByText(UNCONFIRMED)).toHaveCount(0);

  const listed = page.waitForResponse(response => isApi(response, '/blog/admin/posts?'));
  await openFromSidebar(page, 'مقالات وبلاگ', /\/blog$/);
  expect((await listed).status()).toBe(200);
  await page.getByRole('textbox', { name: 'جستجوی عنوان یا نشانی' }).fill(suffix);
  await expect(page.getByRole('link', { name: editedTitle })).toHaveCount(1);
  await expect(page.getByRole('row', { name: new RegExp(suffix, 'u') })).toContainText('در انتظار بازبینی');
  await expect(page.getByText(LIST_FAILED)).toHaveCount(0);
});
