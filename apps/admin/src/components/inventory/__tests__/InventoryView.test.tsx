import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryView } from '../InventoryView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['inventory.read', 'inventory.adjust'] },
  listBalances: vi.fn(), listMovements: vi.fn(), changeStock: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/inventory/ledger-api', () => ({
  listBalances: mocks.listBalances, listMovements: mocks.listMovements, changeStock: mocks.changeStock,
}));

const balance = { warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', onHand: 10, reserved: 2, available: 8, version: 4 };
const movement = { id: 'move-1', warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', type: 'RECEIPT', quantity: 10, beforeOnHand: 0, afterOnHand: 10, reason: null, referenceType: null, referenceId: null, createdAt: '2026-01-01T00:00:00Z' };

describe('InventoryView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['inventory.read', 'inventory.adjust'] };
    mocks.listBalances.mockReset().mockResolvedValue({ items: [balance], count: 1 });
    mocks.listMovements.mockReset().mockResolvedValue({ items: [movement], count: 1 });
    mocks.changeStock.mockReset();
  });

  it('fails closed without read permission', () => {
    mocks.user = { permissions: [] };
    render(<InventoryView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listBalances).not.toHaveBeenCalled();
    expect(mocks.listMovements).not.toHaveBeenCalled();
  });

  it('shows live balance and ledger rows in read-only mode', async () => {
    mocks.user = { permissions: ['inventory.read'] };
    render(<InventoryView />);
    expect(await screen.findByText('رسید')).toBeInTheDocument();
    expect(screen.getAllByText('sku-1').length).toBeGreaterThan(0);
    expect(screen.getByText('دسترسی شما فقط خواندنی است. تغییر فیزیکی موجودی نیازمند inventory.adjust است.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رسید یا تعدیل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رسید/تعدیل' })).not.toBeInTheDocument();
  });

  it('applies exact filters and opens a version-prefilled stock command', async () => {
    render(<InventoryView />);
    await screen.findByText('رسید');
    fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار' }), { target: { value: 'wh-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(mocks.listBalances).toHaveBeenLastCalledWith(expect.objectContaining({ warehouseId: 'wh-1', offset: 0, limit: 25 }), expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'رسید/تعدیل' }));
    expect(screen.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'نسخهٔ مانده' })).toHaveValue('4');
  });

  it('clears stale balances after a failed read and offers retry', async () => {
    mocks.listBalances.mockRejectedValueOnce(new Error('شبکه قطع است'));
    render(<InventoryView />);
    expect(await screen.findByText('شبکه قطع است')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'تلاش دوباره' })[0]);
    expect(await screen.findByText('رسید')).toBeInTheDocument();
    expect(mocks.listBalances).toHaveBeenCalledTimes(2);
  });
});
