import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPostsView } from './BlogPostsView';
import { listBlogPosts } from '@/lib/blog/blog-api';

const auth = vi.hoisted(() => ({ user: { userId: 'u', permissions: ['blog.read', 'blog.write'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/blog/blog-api', () => ({ listBlogPosts: vi.fn() }));
const row = { id: 'p1', slug: 'راهنما', title: 'راهنمای لولا', status: 'PUBLISHED' as const, version: 3, authorName: 'نویسنده', publishedAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z' };

describe('blog posts list', () => {
  beforeEach(() => {
    auth.user.permissions = ['blog.read', 'blog.write'];
    vi.mocked(listBlogPosts).mockReset().mockResolvedValue({ items: [row], meta: { page: 1, pages: 1, total: 1, perPage: 20 } });
  });
  it('lists articles with status, links to the editor and offers creation to writers', async () => {
    render(<BlogPostsView />);
    expect(await screen.findByRole('link', { name: 'راهنمای لولا' })).toHaveAttribute('href', '/blog/p1');
    expect(screen.getByText('منتشرشده')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مقالهٔ جدید/ })).toHaveAttribute('href', '/blog/new');
  });
  it('filters by status and shows a clear empty state', async () => {
    render(<BlogPostsView />);
    await screen.findByRole('link', { name: 'راهنمای لولا' });
    vi.mocked(listBlogPosts).mockResolvedValue({ items: [], meta: { page: 1, pages: 1, total: 0, perPage: 20 } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'وضعیت' }));
    fireEvent.click(await screen.findByRole('option', { name: 'پیش‌نویس' }));
    await waitFor(() => expect(listBlogPosts).toHaveBeenLastCalledWith({ page: 1, status: 'DRAFT', q: undefined }, expect.anything()));
    expect(await screen.findByText('مقاله‌ای پیدا نشد')).toBeInTheDocument();
  });
  it('hides creation without write permission and blocks reading without blog.read', () => {
    auth.user.permissions = ['blog.read'];
    const { unmount } = render(<BlogPostsView />);
    expect(screen.queryByRole('link', { name: /مقالهٔ جدید/ })).toBeNull();
    unmount();
    auth.user.permissions = [];
    render(<BlogPostsView />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مشاهدهٔ مقاله‌ها لازم است.');
  });
});
