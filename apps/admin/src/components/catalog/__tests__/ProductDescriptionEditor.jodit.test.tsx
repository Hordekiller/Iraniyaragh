import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import 'jodit';
import 'jodit/esm/plugins/indent/indent.js';
import 'jodit/esm/plugins/justify/justify.js';
import 'jodit/esm/plugins/source/source.js';
import 'jodit/esm/plugins/clean-html/clean-html.js';
import type { ProductDetail } from '@iranyaragh/contracts';
import { ProductDescriptionEditor } from '../ProductDescriptionEditor';
import { updateProductDescription } from '@/lib/catalog/catalog-api';

vi.mock('@/lib/catalog/catalog-api', () => ({
  createIdempotencyKey: () => 'description-real-jodit-save',
  updateProductDescription: vi.fn(),
  getProduct: vi.fn(),
}));
vi.mock('@/components/editor/ProductMediaPickerDialog', () => ({
  useProductMediaPicker: () => ({ handle: undefined, host: null }),
}));

const originalInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
beforeAll(() => {
  // jsdom lacks innerText; Jodit's actual toolbar reads it when building buttons.
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent ?? ''; },
    set(value: string) { this.textContent = value; },
  });
});
afterAll(() => {
  if (originalInnerText) Object.defineProperty(HTMLElement.prototype, 'innerText', originalInnerText);
  else Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
});
beforeEach(() => {
  vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(updateProductDescription).mockReset();
  vi.mocked(updateProductDescription).mockImplementation(async (_id, input) => ({
    product: { id: 'p1', description: input.description, version: input.expectedVersion + 1 } as ProductDetail,
  }));
});

function PersistedEditor() {
  const [product, setProduct] = useState({ id: 'p1', description: '<p>متن قبلی</p>', version: 1 });
  return <ProductDescriptionEditor {...product} productId={product.id} canWrite
    onServerProduct={(next) => setProduct({ id: next.id, description: next.description ?? '', version: next.version ?? 0 })} />;
}

async function ready() {
  const view = render(<PersistedEditor />);
  await waitFor(() => expect(view.container.querySelector('[data-rich-text-editor]')).toHaveAttribute('data-status', 'ready'));
  return {
    ...view,
    body: view.container.querySelector<HTMLElement>('.jodit-wysiwyg')!,
    source: view.container.querySelector<HTMLTextAreaElement>('.jodit-source__mirror')!,
  };
}

describe('product saving with the real Jodit and controlled React form', () => {
  it('submits the last native edit even when Save runs before React renders it', async () => {
    const { body } = await ready();
    body.innerHTML = '<p>نسخه میانی</p>';
    fireEvent.input(body);
    await waitFor(() => expect(screen.getByTestId('description-save')).toBeEnabled());
    act(() => {
      body.innerHTML = '<p>نسخه نهایی</p>';
      body.dispatchEvent(new Event('input', { bubbles: true }));
      screen.getByTestId('description-save').click();
    });
    await waitFor(() => expect(updateProductDescription).toHaveBeenCalledWith('p1',
      { description: '<p>نسخه نهایی</p>', expectedVersion: 1 }, expect.any(String)));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();
    expect(body.innerHTML).toBe('<p>نسخه نهایی</p>');
  });

  it('saves source mode immediately and retains the accepted result through a mode switch', async () => {
    const { container, body, source } = await ready();
    fireEvent.click(container.querySelector('[data-ref="source"] button')!);
    await waitFor(() => expect(container.querySelector('.jodit-container')).toHaveClass('jodit-source__mode'));
    const html = '<h2>نسخه سورس</h2><p>ذخیرهٔ فوری</p>';
    fireEvent.input(source, { target: { value: html } });
    fireEvent.click(screen.getByTestId('description-save'));
    expect(updateProductDescription).toHaveBeenCalledWith('p1',
      { description: html, expectedVersion: 1 }, expect.any(String));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-ref="source"] button')!);
    expect(body.innerHTML).toBe(html);
  });
});
