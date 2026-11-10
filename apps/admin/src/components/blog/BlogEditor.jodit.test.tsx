import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'jodit';
import 'jodit/esm/plugins/indent/indent.js';
import 'jodit/esm/plugins/justify/justify.js';
import 'jodit/esm/plugins/source/source.js';
import 'jodit/esm/plugins/clean-html/clean-html.js';
import 'jodit/esm/plugins/hr/hr.js';
import type { BlogPostAdmin } from '@iranyaragh/contracts';
import { BlogEditor } from './BlogEditor';
import { ApiNetworkError } from '@/lib/api/client';
import { createBlogPost, readBlogMedia, readBlogPost, readBlogRevisions } from '@/lib/blog/blog-api';

// Unlike BlogEditor.test.tsx this suite keeps the real RichTextEditor and the packaged Jodit,
// because the article page failed only when the actual editor started with the page's own props.
const auth = vi.hoisted(() => ({ user: { userId: 'author', permissions: ['blog.read', 'blog.write'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/blog/blog-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/blog/blog-api')>()),
  createBlogPost: vi.fn(), updateBlogPost: vi.fn(), transitionBlogPost: vi.fn(), readBlogPost: vi.fn(), readBlogRevisions: vi.fn(), readBlogMedia: vi.fn(),
}));

const UNCONFIRMED = /درخواست تأیید نشد/u;
const EDITOR_FAILED = /راه‌اندازی ویرایشگر ناموفق/u;
const body = `<p>${'متن کامل مقاله دربارهٔ انتخاب یراق. '.repeat(20)}</p>`;
const post = (over: Partial<BlogPostAdmin> = {}): BlogPostAdmin => ({
  id: 'p1', slug: 'راهنما', title: 'راهنما', excerpt: 'خلاصهٔ پاسخ‌محور که بیش از پنجاه نویسه دارد و برای انتشار کافی است، بله.', bodyHtml: body, coverMediaId: null, coverAlt: null, tags: ['لولا'],
  seoTitle: null, seoDescription: null, sources: [], status: 'DRAFT', version: 1, authorId: 'author', authorName: 'نویسنده', reviewerId: null, reviewerName: null, selfReviewed: false,
  publishedAt: null, contentUpdatedAt: '2026-11-01T08:00:00.000Z', archivedAt: null, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', cover: null, ...over,
});

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
  vi.mocked(readBlogMedia).mockReset().mockResolvedValue([]);
  vi.mocked(readBlogRevisions).mockReset().mockResolvedValue([]);
  vi.mocked(readBlogPost).mockReset().mockResolvedValue(post());
  vi.mocked(createBlogPost).mockReset();
});

const editorReady = async (container: HTMLElement) => {
  await waitFor(() => expect(container.querySelector('[data-rich-text-editor]')).toHaveAttribute('data-status', 'ready'));
  return container.querySelector<HTMLElement>('.jodit-wysiwyg')!;
};

describe('blog article page with the real editor', () => {
  it('opens a new article with a working editor and no error banner', async () => {
    const { container } = render(<BlogEditor postId={null} />);
    await editorReady(container);
    expect(screen.queryByText(EDITOR_FAILED)).toBeNull();
    expect(screen.queryByText(UNCONFIRMED)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads an existing article into the editor unchanged', async () => {
    const { container } = render(<BlogEditor postId="p1" />);
    const wysiwyg = await editorReady(container);
    await waitFor(() => expect(wysiwyg.innerHTML).toBe(body));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the typed article and reuses the command key when a save is not confirmed', async () => {
    vi.mocked(createBlogPost).mockRejectedValueOnce(new ApiNetworkError('network')).mockResolvedValueOnce(post({ id: 'p2', title: 'عنوان', slug: 'عنوان' }));
    const { container } = render(<BlogEditor postId={null} />);
    const wysiwyg = await editorReady(container);
    fireEvent.change(screen.getByRole('textbox', { name: /^عنوان\s*\*?$/u }), { target: { value: 'عنوان' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^خلاصهٔ پاسخ‌محور\s*\*?$/u }), { target: { value: 'خلاصهٔ کوتاه مقاله' } });
    wysiwyg.innerHTML = '<p>متن فارسی مقاله</p>';
    fireEvent.input(wysiwyg);
    const save = screen.getByRole('button', { name: 'ایجاد پیش‌نویس' });
    fireEvent.click(save);
    expect(await screen.findByText(UNCONFIRMED)).toBeInTheDocument();
    // Nothing the author typed is discarded by the failed request.
    expect(wysiwyg.innerHTML).toBe('<p>متن فارسی مقاله</p>');
    expect(screen.getByRole('textbox', { name: /^عنوان\s*\*?$/u })).toHaveValue('عنوان');
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد پیش‌نویس' }));
    await waitFor(() => expect(createBlogPost).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(createBlogPost).mock.calls;
    expect(first![0]).toMatchObject({ title: 'عنوان', bodyHtml: '<p>متن فارسی مقاله</p>' });
    // Same payload, same idempotency key: the server cannot create the article twice.
    expect(second![1]).toBe(first![1]);
    // The key must be sendable: a browser rejects a header value outside Latin-1 before any request leaves.
    expect(first![1]).toMatch(/^blog-create-[0-9a-f-]{36}$/u);
    expect(() => new Headers({ 'Idempotency-Key': first![1] })).not.toThrow();
    expect(second![0]).toEqual(first![0]);
    await waitFor(() => expect(screen.queryByText(UNCONFIRMED)).toBeNull());
  });
});
