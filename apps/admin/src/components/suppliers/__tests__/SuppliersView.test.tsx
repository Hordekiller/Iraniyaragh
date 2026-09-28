import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuppliersView } from '../SuppliersView';

const mocks = vi.hoisted(() => ({
  user: { permissions: [] as string[] },
  listSuppliers: vi.fn(),
  listSupplierHistory: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('@/lib/suppliers/suppliers-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/suppliers/suppliers-api')>('@/lib/suppliers/suppliers-api');
  return { ...actual, listSuppliers: mocks.listSuppliers, listSupplierHistory: mocks.listSupplierHistory };
});

const supplier = {
  id: 'sup-1', code: 'SUP-1', name: 'تأمین تهران', mobile: '09120000000', phone: null,
  email: null, nationalId: null, economicCode: '111-222', isActive: true, version: 3,
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
};
const inactive = { ...supplier, id: 'sup-2', code: 'SUP-2', name: 'تأمین غیرفعال', isActive: false };

const renderView = () => render(<SuppliersView />);

describe('SuppliersView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.permissions = ['suppliers.read', 'suppliers.manage'];
    mocks.listSuppliers.mockResolvedValue({ items: [supplier, inactive], count: 2 });
    mocks.listSupplierHistory.mockResolvedValue({
      items: [{ id: 'a1', action: 'supplier.created', actorId: 'staff-1', createdAt: '2026-09-28T00:00:00.000Z' }],
      count: 1,
    });
  });

  it('blocks a principal without suppliers.read and never calls the API', async () => {
    mocks.user.permissions = [];
    renderView();
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    await waitFor(() => expect(mocks.listSuppliers).not.toHaveBeenCalled());
  });

  it('reads the real list with the bounded default query', async () => {
    renderView();
    await screen.findByText('تأمین تهران');
    expect(mocks.listSuppliers).toHaveBeenCalledWith({ offset: 0, limit: 25 }, expect.anything());
  });

  it('sends isActive=false for the inactive filter and resets paging', async () => {
    renderView();
    await screen.findByText('تأمین تهران');
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال' }));
    await waitFor(() =>
      expect(mocks.listSuppliers).toHaveBeenCalledWith({ offset: 0, limit: 25, isActive: false }, expect.anything()),
    );
  });

  it('hides every mutation control from a read-only principal', async () => {
    mocks.user.permissions = ['suppliers.read'];
    renderView();
    await screen.findByText('تأمین تهران');
    expect(screen.getByText(/دسترسی شما فقط خواندنی است/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأمین‌کننده جدید' })).toBeNull();
    expect(screen.queryByRole('button', { name: /ویرایش تأمین‌کننده/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'سابقه' }).length).toBe(2);
    expect(screen.getByText(/حذف سخت تأمین‌کننده در سیستم وجود ندارد/)).toBeInTheDocument();
  });

  it('loads audit history for the selected supplier', async () => {
    renderView();
    await screen.findByText('تأمین تهران');
    fireEvent.click(screen.getAllByRole('button', { name: 'سابقه' })[0]);
    expect(await screen.findByText('ایجاد')).toBeInTheDocument();
    expect(mocks.listSupplierHistory).toHaveBeenCalledWith('sup-1', { offset: 0, limit: 25 }, expect.anything());
  });

  it('offers no hard delete and explains deactivation instead', async () => {
    renderView();
    await screen.findByText('تأمین تهران');
    expect(screen.queryByRole('button', { name: /حذف/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'تأمین‌کننده جدید' })).toBeInTheDocument();
  });

  it('surfaces a list failure with a retry that refetches', async () => {
    mocks.listSuppliers.mockRejectedValueOnce(new Error('سرویس در دسترس نیست.'));
    renderView();
    expect(await screen.findByText('سرویس در دسترس نیست.')).toBeInTheDocument();
    mocks.listSuppliers.mockResolvedValue({ items: [supplier], count: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(screen.getAllByText('تأمین تهران').length).toBeGreaterThan(0));
  });

  it('renders rows inside a captioned, accessible table', async () => {
    renderView();
    await screen.findByText('تأمین تهران');
    const table = screen.getByRole('table', { name: 'فهرست تأمین‌کنندگان' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('SUP-1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('111-222')).toBeInTheDocument();
    expect(within(rows[1]).getByText('09120000000')).toBeInTheDocument();
  });
});
