import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarehouseDialog } from '../WarehouseDialog';
import { LocationDialog } from '../LocationDialog';

const mocks = vi.hoisted(() => ({ createWarehouse: vi.fn(), updateWarehouse: vi.fn(), createLocation: vi.fn(), updateLocation: vi.fn() }));
vi.mock('@/lib/inventory/warehouses-api', () => ({
  createWarehouse: mocks.createWarehouse, updateWarehouse: mocks.updateWarehouse,
  createLocation: mocks.createLocation, updateLocation: mocks.updateLocation,
}));

const warehouse = {
  id: 'wh-1', code: 'WH-1', name: 'انبار مرکزی', city: 'تهران', address: null,
  isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const location = {
  id: 'loc-1', warehouseId: 'wh-1', code: 'A-1', name: 'ردیف الف', zone: null,
  aisle: null, rack: null, shelf: null, bin: null, isActive: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('warehouse and location mutation dialogs', () => {
  beforeEach(() => {
    mocks.createWarehouse.mockResolvedValue(warehouse);
    mocks.updateWarehouse.mockResolvedValue(warehouse);
    mocks.createLocation.mockResolvedValue(location);
    mocks.updateLocation.mockResolvedValue(location);
  });

  it('validates required warehouse fields before touching the API', async () => {
    render(<WarehouseDialog open warehouse={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(mocks.createWarehouse).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'کد یکتا' }), { target: { value: 'WH-2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'نام انبار' }), { target: { value: 'انبار غرب' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(mocks.createWarehouse).toHaveBeenCalledWith({ code: 'WH-2', name: 'انبار غرب', city: '', address: '' }));
  });

  it('changes active state only through an explicit edit action', async () => {
    const saved = vi.fn();
    render(<WarehouseDialog open warehouse={warehouse} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(screen.getByRole('switch', { name: 'انبار فعال است' }));
    expect(screen.getByText(/غیرفعال‌سازی انبار/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(mocks.updateWarehouse).toHaveBeenCalledWith('wh-1', expect.objectContaining({ isActive: false })));
    expect(saved).toHaveBeenCalledOnce();
  });

  it('keeps uncertain failures visible without automatic resubmission', async () => {
    mocks.createWarehouse.mockRejectedValueOnce(new Error('connection dropped'));
    render(<WarehouseDialog open warehouse={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'کد یکتا' }), { target: { value: 'WH-2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'نام انبار' }), { target: { value: 'انبار غرب' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(await screen.findByText(/نتیجهٔ ذخیره نامشخص است/)).toBeInTheDocument();
    expect(mocks.createWarehouse).toHaveBeenCalledTimes(1);
  });

  it('creates a location in its selected warehouse and edits its lifecycle', async () => {
    const close = vi.fn();
    const saved = vi.fn();
    const { rerender } = render(<LocationDialog open warehouseId="wh-1" location={null} onClose={close} onSaved={saved} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'کد مکان در انبار' }), { target: { value: 'A-2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'نام' }), { target: { value: 'ردیف دوم' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(mocks.createLocation).toHaveBeenCalledWith('wh-1', expect.objectContaining({ code: 'A-2', name: 'ردیف دوم' })));
    expect(saved).toHaveBeenCalledOnce();
    rerender(<LocationDialog open warehouseId="wh-1" location={location} onClose={close} onSaved={saved} />);
    fireEvent.click(screen.getByRole('switch', { name: 'مکان فعال است' }));
    expect(screen.getByText(/مکان غیرفعال/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('loc-1', expect.objectContaining({ isActive: false })));
  });
});
