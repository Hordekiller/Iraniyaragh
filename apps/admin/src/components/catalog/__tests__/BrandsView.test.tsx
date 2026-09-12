import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_READ } from '@/lib/catalog/catalog-permissions';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { BrandsView } from '../BrandsView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['catalog.read', 'catalog.write'] },
  listBrands: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({ listBrands: mocks.listBrands }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const brand = { id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 3 };

describe('BrandsView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['catalog.read', 'catalog.write'] };
  });

  it('renders brands with counts and creation action for writers', async () => {
    mocks.listBrands.mockResolvedValue([brand]);
    render(<FeedbackProvider><BrandsView /></FeedbackProvider>);

    expect(await screen.findByText('آبان لک')).toBeInTheDocument();
    expect(screen.getByText('abanlock')).toBeInTheDocument();
    expect(screen.getByText(/۳/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /برند جدید/ })).toBeInTheDocument();

    const row = screen.getByText('آبان لک').closest('tr');
    expect(within(row!).getByRole('button', { name: 'ویرایش آبان لک' })).toBeInTheDocument();
  });

  it('shows the forbidden state without catalog.read', async () => {
    mocks.user = { permissions: [] };
    render(<FeedbackProvider><BrandsView /></FeedbackProvider>);

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listBrands).not.toHaveBeenCalled();
  });

  it('hides creation and edit for read-only users', async () => {
    mocks.user = { permissions: [CATALOG_READ] };
    mocks.listBrands.mockResolvedValue([brand]);
    render(<FeedbackProvider><BrandsView /></FeedbackProvider>);

    await screen.findByText('آبان لک');
    expect(screen.queryByRole('button', { name: /برند جدید/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /ویرایش/ }).length).toBe(0);
    expect(screen.queryByRole('button', { name: 'ویرایش آبان لک' })).not.toBeInTheDocument();
    expect(screen.getByText(/فقط دسترسی خواندن/)).toBeInTheDocument();
  });

  it('opens the create dialog from the page header', async () => {
    mocks.listBrands.mockResolvedValue([]);
    render(<FeedbackProvider><BrandsView /></FeedbackProvider>);

    await screen.findByText('برندی ثبت نشده است');
    fireEvent.click(screen.getByRole('button', { name: /برند جدید/ }));
    expect(screen.getByRole('dialog', { name: 'برند جدید' })).toBeInTheDocument();
  });
});