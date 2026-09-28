import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError } from '@/lib/api/client';
import { ReservationCreateDialog } from '../ReservationCreateDialog';
import { ReservationActionDialog } from '../ReservationActionDialog';

const mocks = vi.hoisted(() => ({ createManualReservation: vi.fn(), transitionManualReservation: vi.fn(), listBalances: vi.fn() }));
vi.mock('@/lib/inventory/reservations-api', () => ({
  createManualReservation: mocks.createManualReservation, transitionManualReservation: mocks.transitionManualReservation,
}));
vi.mock('@/lib/inventory/ledger-api', () => ({ listBalances: mocks.listBalances }));

const reservation = { id: 'res-1', warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', orderId: null, quantity: 2, status: 'ACTIVE' as const, expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

describe('reservation Admin dialogs', () => {
  beforeEach(() => {
    mocks.createManualReservation.mockReset();
    mocks.transitionManualReservation.mockReset();
    mocks.listBalances.mockReset().mockResolvedValue({ items: [{ warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', version: 4, onHand: 5, reserved: 2, available: 3 }], count: 1 });
  });

  it('validates manual-create quantity and submits without an orderId', async () => {
    mocks.createManualReservation.mockResolvedValueOnce({ ...reservation });
    const saved = vi.fn();
    render(<ReservationCreateDialog initial={{ warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', version: 4 }} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت رزرو' }));
    expect(await screen.findByText(/شناسه‌ها، تعداد، نسخه/u)).toBeInTheDocument();
    expect(mocks.createManualReservation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'تعداد' }), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/انقضا/u), { target: { value: '2099-01-01T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت رزرو' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const [input, key] = mocks.createManualReservation.mock.calls[0];
    expect(input).toEqual(expect.objectContaining({ warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', quantity: 2, expectedVersion: 4 }));
    expect(input).not.toHaveProperty('orderId');
    expect(key).toMatch(/^inventory-reserve-/u);
  });

  it('prefetches exact balance version and rejects an opposite terminal state', async () => {
    mocks.transitionManualReservation.mockResolvedValueOnce({ ...reservation, status: 'RELEASED' });
    const saved = vi.fn();
    render(<ReservationActionDialog reservation={reservation} action="consume" onClose={vi.fn()} onSaved={saved} />);
    expect(await screen.findByText(/نسخهٔ مانده: ۴/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأیید مصرف' }));
    expect(await screen.findByText(/وضعیت رزرو هم‌زمان تغییر کرده است/u)).toBeInTheDocument();
    expect(mocks.transitionManualReservation).toHaveBeenCalledWith('res-1', 'consume', { expectedVersion: 4 });
    expect(saved).not.toHaveBeenCalled();
  });

  it('does not auto-retry an unknown lifecycle result', async () => {
    mocks.transitionManualReservation.mockRejectedValueOnce(new ApiNetworkError('offline'));
    render(<ReservationActionDialog reservation={reservation} action="release" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText(/نسخهٔ مانده: ۴/u);
    fireEvent.click(screen.getByRole('button', { name: 'تأیید آزادسازی' }));
    expect(await screen.findByText(/نتیجه نامشخص است/u)).toBeInTheDocument();
    expect(mocks.transitionManualReservation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'تأیید آزادسازی' })).toBeDisabled();
  });
});
