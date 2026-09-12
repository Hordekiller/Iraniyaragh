import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_READ } from '@/lib/catalog/catalog-permissions';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CategoriesView } from '../CategoriesView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['catalog.read', 'catalog.write'] },
  listCategories: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({ listCategories: mocks.listCategories }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const categories = [
  { id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 5 },
  { id: 'c2', name: 'دستگیره‌ها', slug: 'handles', parentId: 'c1', productCount: 2 },
];

describe('CategoriesView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['catalog.read', 'catalog.write'] };
  });

  it('renders categories with their parent names and creation action', async () => {
    mocks.listCategories.mockResolvedValue(categories);
    render(<FeedbackProvider><CategoriesView /></FeedbackProvider>);

    expect(await screen.findByText('دستگیره‌ها')).toBeInTheDocument();
    expect(screen.getAllByText('قفل‌ها').length).toBeGreaterThan(0);
    const row = screen.getByText('دستگیره‌ها').closest('tr');
    expect(within(row!).getByText('قفل‌ها')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /دسته‌بندی جدید/ })).toBeInTheDocument();
  });

  it('shows the forbidden state without catalog.read', async () => {
    mocks.user = { permissions: [] };
    render(<FeedbackProvider><CategoriesView /></FeedbackProvider>);

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it('hides creation and edit for read-only users', async () => {
    mocks.user = { permissions: [CATALOG_READ] };
    mocks.listCategories.mockResolvedValue(categories);
    render(<FeedbackProvider><CategoriesView /></FeedbackProvider>);

    await screen.findByText('دستگیره‌ها');
    expect(screen.queryByRole('button', { name: /دسته‌بندی جدید/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش قفل‌ها' })).not.toBeInTheDocument();
    expect(screen.getByText(/فقط دسترسی خواندن/)).toBeInTheDocument();
  });

  it('opens the create dialog from the page header', async () => {
    mocks.listCategories.mockResolvedValue([]);
    render(<FeedbackProvider><CategoriesView /></FeedbackProvider>);

    await screen.findByText('دسته‌بندی‌ای ثبت نشده است');
    fireEvent.click(screen.getByRole('button', { name: /دسته‌بندی جدید/ }));
    expect(screen.getByRole('dialog', { name: 'دسته‌بندی جدید' })).toBeInTheDocument();
  });
});