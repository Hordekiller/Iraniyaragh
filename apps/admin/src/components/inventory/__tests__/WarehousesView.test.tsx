import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarehousesView } from '../WarehousesView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['inventory.read', 'inventory.adjust'] },
  listWarehouses: vi.fn(), listLocations: vi.fn(),
  createWarehouse: vi.fn(), updateWarehouse: vi.fn(), createLocation: vi.fn(), updateLocation: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/inventory/warehouses-api', () => ({
  listWarehouses: mocks.listWarehouses, listLocations: mocks.listLocations,
  createWarehouse: mocks.createWarehouse, updateWarehouse: mocks.updateWarehouse,
  createLocation: mocks.createLocation, updateLocation: mocks.updateLocation,
}));

const warehouse = {
  id: 'wh-1', code: 'WH-1', name: 'انبار مرکزی', city: 'تهران', address: null,
  isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const location = {
  id: 'loc-1', warehouseId: 'wh-1', code: 'A-1', name: 'ردیف الف', zone: 'A', aisle: '1',
  rack: null, shelf: null, bin: null, isActive: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('WarehousesView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['inventory.read', 'inventory.adjust'] };
    mocks.listWarehouses.mockResolvedValue({ items: [warehouse], count: 1 });
    mocks.listLocations.mockResolvedValue({ items: [location], count: 1 });
  });

  it('fails closed without read permission and makes no API call', () => {
    mocks.user = { permissions: [] };
    render(<WarehousesView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listWarehouses).not.toHaveBeenCalled();
  });

  it('shows real warehouse and selected-location rows with read-only controls', async () => {
    mocks.user = { permissions: ['inventory.read'] };
    render(<WarehousesView />);
    expect(await screen.findByText('انبار مرکزی')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انبار جدید' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش انبار انبار مرکزی' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'مکان‌ها' }));
    expect(await screen.findByText('ردیف الف')).toBeInTheDocument();
    expect(mocks.listLocations).toHaveBeenCalledWith('wh-1', { offset: 0, limit: 25 }, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'مکان جدید' })).not.toBeInTheDocument();
  });

  it('opens create and edit dialogs only for inventory.adjust', async () => {
    render(<WarehousesView />);
    await screen.findByText('انبار مرکزی');
    fireEvent.click(screen.getByRole('button', { name: 'انبار جدید' }));
    expect(screen.getByRole('dialog', { name: 'انبار جدید' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'انبار جدید' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش انبار انبار مرکزی' }));
    expect(screen.getByRole('dialog', { name: 'ویرایش انبار' })).toBeInTheDocument();
  });

  it('shows failure and retries a bounded list request', async () => {
    mocks.listWarehouses.mockRejectedValueOnce(new Error('شبکه قطع است'));
    render(<WarehousesView />);
    expect(await screen.findByText('شبکه قطع است')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByText('انبار مرکزی')).toBeInTheDocument();
    expect(mocks.listWarehouses).toHaveBeenCalledTimes(2);
  });
});
