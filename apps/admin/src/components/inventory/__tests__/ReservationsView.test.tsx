import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationsView } from '../ReservationsView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['inventory.read', 'inventory.adjust'] },
  listReservations: vi.fn(), createManualReservation: vi.fn(), transitionManualReservation: vi.fn(), listBalances: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/inventory/reservations-api', () => ({
  listReservations: mocks.listReservations, createManualReservation: mocks.createManualReservation,
  transitionManualReservation: mocks.transitionManualReservation,
}));
vi.mock('@/lib/inventory/ledger-api', () => ({ listBalances: mocks.listBalances }));

const manual = { id: 'res-1', warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', orderId: null, quantity: 2, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const order = { ...manual, id: 'res-order', orderId: 'order-1' };

describe('ReservationsView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['inventory.read', 'inventory.adjust'] };
    mocks.listReservations.mockReset().mockResolvedValue({ items: [manual, order], count: 2 });
    mocks.createManualReservation.mockReset();
    mocks.transitionManualReservation.mockReset();
    mocks.listBalances.mockReset().mockResolvedValue({ items: [], count: 0 });
  });

  it('fails closed without read permission', () => {
    mocks.user = { permissions: [] };
    render(<ReservationsView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listReservations).not.toHaveBeenCalled();
  });

  it('renders raw order and manual reservations read-only without lifecycle controls', async () => {
    mocks.user = { permissions: ['inventory.read'] };
    render(<ReservationsView />);
    expect(await screen.findByText('res-order')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /سفارش order-1/u })).toHaveAttribute('href', '/orders/order-1');
    expect(screen.queryByRole('button', { name: 'رزرو دستی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'آزادسازی' })).not.toBeInTheDocument();
  });

  it('filters server-side and offers actions only for independent active reservations', async () => {
    render(<ReservationsView />);
    expect(await screen.findByText('res-order')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'آزادسازی' })).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'شناسه SKU' }), { target: { value: 'sku-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(mocks.listReservations).toHaveBeenLastCalledWith(expect.objectContaining({ variantId: 'sku-1', offset: 0, limit: 25 }), expect.any(AbortSignal)));
  });
});
