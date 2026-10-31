import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'jodit';
import 'jodit/esm/plugins/indent/indent.js';
import 'jodit/esm/plugins/justify/justify.js';
import 'jodit/esm/plugins/source/source.js';
import 'jodit/esm/plugins/clean-html/clean-html.js';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ApiNetworkError } from '@/lib/api/client';
import { ProductCreateForm } from '../ProductCreateForm';

const mocks = vi.hoisted(() => ({ create: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { permissions: ['catalog.write'] } }) }));
vi.mock('@/lib/catalog/catalog-api', () => ({ createProduct: mocks.create, createIdempotencyKey: () => 'product-create-real-jodit-test', listBrands: async () => [], listCategories: async () => [] }));
const originalInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return this.textContent ?? ''; }, set(value: string) { this.textContent = value; } }));
afterAll(() => { if (originalInnerText) Object.defineProperty(HTMLElement.prototype, 'innerText', originalInnerText); else Reflect.deleteProperty(HTMLElement.prototype, 'innerText'); });
beforeEach(() => {
  vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  mocks.create.mockReset(); mocks.replace.mockReset();
  mocks.create.mockImplementation(async input => ({ product: { id: 'new-product', name: input.name, slug: input.slug } }));
});
async function ready() {
  const view = render(<FeedbackProvider><ProductCreateForm /></FeedbackProvider>);
  await waitFor(() => expect(view.container.querySelector('[data-rich-text-editor]')).toHaveAttribute('data-status', 'ready'));
  fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'کالای آزمایشی' } });
  fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'synthetic-product' } });
  fireEvent.change(document.getElementById('variant-0-sku')!, { target: { value: 'SYNTHETIC-SKU' } });
  fireEvent.change(document.getElementById('variant-0-sale')!, { target: { value: '10000' } });
  return { ...view, body: view.container.querySelector<HTMLElement>('.jodit-wysiwyg')!, source: view.container.querySelector<HTMLTextAreaElement>('.jodit-source__mirror')! };
}
describe('Create product reads the live Jodit draft', () => {
  it('captures a long Persian final native edit before React can render it', async () => {
    const { body } = await ready();
    const html = `<h2>راهنمای نصب</h2><p>${'توضیحات فارسی محصول '.repeat(3000)}</p>`;
    expect(html.length).toBeGreaterThan(10000); expect(html.length).toBeLessThan(100000);
    act(() => { body.innerHTML = html; body.dispatchEvent(new Event('input', { bubbles: true })); screen.getByRole('button', { name: 'ثبت کالا' }).click(); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ description: html }), 'product-create-real-jodit-test'));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/catalog/products/new-product'));
  });
  it('keeps an uncertain source-mode creation frozen and replays the identical payload/key', async () => {
    mocks.create.mockRejectedValueOnce(new ApiNetworkError('test response lost'));
    const { container, source } = await ready();
    fireEvent.click(container.querySelector('[data-ref="source"] button')!);
    const html = '<h2>نسخهٔ نهایی سورس</h2><p>ذخیرهٔ فوری</p>';
    act(() => { source.value = html; source.dispatchEvent(new Event('input', { bubbles: true })); screen.getByRole('button', { name: 'ثبت کالا' }).click(); });
    const retry = await screen.findByRole('button', { name: 'پیگیری ثبت کالا' });
    expect(screen.getByLabelText(/نام کالا/)).toBeDisabled(); await waitFor(() => expect(source).toHaveAttribute('readonly'));
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/catalog/products/new-product'));
    expect(mocks.create.mock.calls).toHaveLength(2); expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(mocks.create.mock.calls[0][0].description).toBe(html);
  });
  it('checks the current source size rather than an older React render and never truncates it', async () => {
    const { container, source } = await ready(); fireEvent.click(container.querySelector('[data-ref="source"] button')!);
    const html = 'ی'.repeat(100001);
    act(() => { source.value = html; source.dispatchEvent(new Event('input', { bubbles: true })); screen.getByRole('button', { name: 'ثبت کالا' }).click(); });
    expect(await screen.findByText('توضیحات همراه با کد HTML حداکثر ۱۰۰٬۰۰۰ نویسه است.')).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(source.value).toBe(html);
  });
});
