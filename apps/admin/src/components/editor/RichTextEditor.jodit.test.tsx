import { render, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'jodit';
import 'jodit/esm/plugins/indent/indent.js';
import 'jodit/esm/plugins/justify/justify.js';
import 'jodit/esm/plugins/source/source.js';
import 'jodit/esm/plugins/clean-html/clean-html.js';
import 'jodit/esm/plugins/hr/hr.js';
import { RichTextEditor } from './RichTextEditor';

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
});

const noop = () => undefined;
const editorOf = (container: HTMLElement) => container.querySelector('[data-rich-text-editor]');

describe('RichTextEditor with the real packaged Jodit', () => {
  // The article editor passes no placeholder. An explicit `placeholder: undefined` replaced Jodit's
  // default, its placeholder plugin threw "i18n: Need string in first argument" and the article
  // page showed "راه‌اندازی ویرایشگر ناموفق بود." on every load.
  it.each(['article', 'default'] as const)('initializes the %s variant without a placeholder or height', async (variant) => {
    const onError = vi.fn();
    const { container } = render(<RichTextEditor value="<p>متن فارسی</p>" onChange={noop} variant={variant} onError={onError} />);
    await waitFor(() => expect(editorOf(container)).not.toHaveAttribute('data-status', 'loading'));
    expect(onError).not.toHaveBeenCalled();
    expect(editorOf(container)).toHaveAttribute('data-status', 'ready');
    expect(container.querySelector('[data-testid="rich-text-editor-error"]')).toBeNull();
    expect(container.querySelector<HTMLElement>('.jodit-wysiwyg')?.innerHTML).toBe('<p>متن فارسی</p>');
    expect(container.querySelector('textarea.jodit-source__mirror')).not.toBeNull();
  });

  it('initializes the article editor exactly as the blog page mounts it', async () => {
    const onError = vi.fn();
    const { container } = render(
      <RichTextEditor value="" onChange={noop} disabled={false} height={420} ariaLabel="ویرایشگر متن مقاله" variant="article" onError={onError}
        mediaPicker={{ productId: 'blog', open: noop }} />,
    );
    await waitFor(() => expect(editorOf(container)).not.toHaveAttribute('data-status', 'loading'));
    expect(onError).not.toHaveBeenCalled();
    expect(editorOf(container)).toHaveAttribute('data-status', 'ready');
  });

  it('still shows a supplied placeholder', async () => {
    const { container } = render(<RichTextEditor value="" onChange={noop} placeholder="متن مقاله را بنویسید" />);
    await waitFor(() => expect(editorOf(container)).toHaveAttribute('data-status', 'ready'));
    expect(container.querySelector('.jodit-placeholder')?.textContent).toBe('متن مقاله را بنویسید');
  });
});
