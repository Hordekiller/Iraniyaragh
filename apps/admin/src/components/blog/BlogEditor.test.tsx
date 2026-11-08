import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlogPostAdmin } from '@iranyaragh/contracts';
import { BlogEditor } from './BlogEditor';
import { createBlogPost, readBlogMedia, readBlogPost, readBlogRevisions, transitionBlogPost, updateBlogPost } from '@/lib/blog/blog-api';

const auth = vi.hoisted(() => ({ user: { userId: 'author', permissions: ['blog.read', 'blog.write'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/editor/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange, disabled }: { value: string; onChange: (html: string) => void; disabled?: boolean }) => <textarea aria-label="متن مقاله" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('@/lib/blog/blog-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/blog/blog-api')>()),
  createBlogPost: vi.fn(), updateBlogPost: vi.fn(), transitionBlogPost: vi.fn(), readBlogPost: vi.fn(), readBlogRevisions: vi.fn(), readBlogMedia: vi.fn(),
}));

const TITLE = /^عنوان\s*\*?$/u;
const longBody = `<p>${'متن کامل مقاله دربارهٔ انتخاب یراق. '.repeat(20)}</p>`;
const post = (over: Partial<BlogPostAdmin> = {}): BlogPostAdmin => ({
  id: 'p1', slug: 'راهنما', title: 'راهنما', excerpt: 'خلاصهٔ پاسخ‌محور که بیش از پنجاه نویسه دارد و برای انتشار کافی است، بله.', bodyHtml: longBody, coverMediaId: null, coverAlt: null, tags: ['لولا'],
  seoTitle: null, seoDescription: null, sources: [], status: 'DRAFT', version: 1, authorId: 'author', authorName: 'نویسنده', reviewerId: null, reviewerName: null, selfReviewed: false,
  publishedAt: null, contentUpdatedAt: '2026-11-01T08:00:00.000Z', archivedAt: null, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', cover: null, ...over,
});

describe('blog editor', () => {
  beforeEach(() => {
    auth.user.permissions = ['blog.read', 'blog.write'];
    vi.mocked(readBlogMedia).mockReset().mockResolvedValue([]);
    vi.mocked(readBlogRevisions).mockReset().mockResolvedValue([]);
    vi.mocked(readBlogPost).mockReset().mockResolvedValue(post());
    vi.mocked(createBlogPost).mockReset().mockResolvedValue(post());
    vi.mocked(updateBlogPost).mockReset().mockResolvedValue(post({ version: 2, title: 'عنوان تازه' }));
    vi.mocked(transitionBlogPost).mockReset().mockResolvedValue(post({ status: 'IN_REVIEW', version: 2 }));
  });

  it('suggests a Persian slug from the title until the slug is edited by hand', async () => {
    render(<BlogEditor postId={null} />);
    const title = await screen.findByRole('textbox', { name: TITLE });
    fireEvent.change(title, { target: { value: 'راهنمای انتخاب لولا' } });
    expect(screen.getByLabelText(/^نشانی \(slug\)/)).toHaveValue('راهنمای-انتخاب-لولا');
    fireEvent.change(screen.getByLabelText(/^نشانی \(slug\)/), { target: { value: 'custom' } });
    fireEvent.change(title, { target: { value: 'عنوان دیگر' } });
    expect(screen.getByLabelText(/^نشانی \(slug\)/)).toHaveValue('custom');
  });

  it('creates a draft with a command key and the parsed tags', async () => {
    render(<BlogEditor postId={null} />);
    fireEvent.change(await screen.findByRole('textbox', { name: TITLE }), { target: { value: 'عنوان' } });
    fireEvent.change(screen.getByLabelText(/^خلاصهٔ/), { target: { value: 'خلاصه' } });
    fireEvent.change(screen.getByLabelText('برچسب‌ها'), { target: { value: 'لولا، ریل ,  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد پیش‌نویس' }));
    await waitFor(() => expect(createBlogPost).toHaveBeenCalled());
    expect(vi.mocked(createBlogPost).mock.calls[0]![0]).toMatchObject({ title: 'عنوان', slug: 'عنوان', tags: ['لولا', 'ریل'], seoTitle: null });
    expect(vi.mocked(createBlogPost).mock.calls[0]![1]).toMatch(/^blog-/);
  });

  it('submits a clean draft for review and blocks status changes while the form is dirty', async () => {
    render(<BlogEditor postId="p1" />);
    const submit = await screen.findByRole('button', { name: 'ارسال برای بازبینی' });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: TITLE }), { target: { value: 'تغییر' } });
    expect(submit).toBeDisabled();
    expect(screen.getByText('پیش از تغییر وضعیت، تغییرات را ذخیره کنید.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: TITLE }), { target: { value: 'راهنما' } });
    fireEvent.click(submit);
    await waitFor(() => expect(transitionBlogPost).toHaveBeenCalledWith('p1', { action: 'submit', expectedVersion: 1 }, expect.stringMatching(/^blog-/)));
    expect(await screen.findByText('ارسال برای بازبینی انجام شد.')).toBeInTheDocument();
  });

  it('hides publish from writers and never offers it for an incomplete article', async () => {
    render(<BlogEditor postId="p1" />);
    await screen.findByRole('button', { name: 'ارسال برای بازبینی' });
    expect(screen.queryByRole('button', { name: 'انتشار' })).toBeNull();
  });

  it('warns about self-review and disables publishing a thin article for publishers', async () => {
    auth.user.permissions = ['blog.read', 'blog.write', 'blog.publish'];
    render(<BlogEditor postId="p1" />);
    expect(await screen.findByText(/نویسندهٔ این مقاله‌اید/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انتشار' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('متن مقاله'), { target: { value: '<p>کوتاه</p>' } });
    await waitFor(() => expect(screen.getByText(/متن مقاله دست‌کم 300/)).toBeInTheDocument());
  });

  it('is read-only without write permission and for published articles without publish permission', async () => {
    auth.user.permissions = ['blog.read'];
    vi.mocked(readBlogPost).mockResolvedValue(post({ status: 'PUBLISHED', version: 3, publishedAt: '2026-11-02T08:00:00.000Z' }));
    render(<BlogEditor postId="p1" />);
    expect(await screen.findByRole('textbox', { name: TITLE })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'ذخیرهٔ تغییرات' })).toBeNull();
    expect(readBlogMedia).not.toHaveBeenCalled();
  });

  it('rejects users without blog.read before any request', () => {
    auth.user.permissions = [];
    render(<BlogEditor postId="p1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مشاهدهٔ مقاله‌ها لازم است.');
    expect(readBlogPost).not.toHaveBeenCalled();
  });
});
