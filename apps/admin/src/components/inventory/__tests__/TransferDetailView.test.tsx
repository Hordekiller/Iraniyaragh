import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError } from '@/lib/api/client';
import { TransferDetailView } from '../TransferDetailView';

const mocks = vi.hoisted(() => ({
  user: { permissions: ['inventory.transfer', 'inventory.approve', 'inventory.read'] },
  getTransfer: vi.fn(), transitionTransfer: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/inventory/transfers-api', () => ({ getTransfer: mocks.getTransfer, transitionTransfer: mocks.transitionTransfer }));

const transfer = { id: 'tr-1', code: 'TRF-1', sourceWarehouseId: 'wh-1', targetWarehouseId: 'wh-2', status: 'REQUESTED', version: 1, items: [{ id: 'line-1', variantId: 'sku-1', quantity: 2, sourceLocationId: 'loc-1', targetLocationId: 'loc-2' }], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

describe('TransferDetailView', () => {
  beforeEach(() => {
    mocks.user = { permissions: ['inventory.transfer', 'inventory.approve', 'inventory.read'] };
    mocks.getTransfer.mockReset().mockResolvedValue(transfer);
    mocks.transitionTransfer.mockReset();
  });

  it('fails closed without transfer permission even when approval is present', () => {
    mocks.user = { permissions: ['inventory.approve'] };
    render(<TransferDetailView transferId="tr-1" />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.getTransfer).not.toHaveBeenCalled();
  });

  it('hides approval without inventory.approve but keeps permitted cancellation', async () => {
    mocks.user = { permissions: ['inventory.transfer'] };
    render(<TransferDetailView transferId="tr-1" />);
    expect(await screen.findByRole('heading', { name: 'انتقال TRF-1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأیید' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'لغو' })).toBeInTheDocument();
  });

  it('rechecks version and sends approval with a stable key', async () => {
    mocks.transitionTransfer.mockResolvedValueOnce({ ...transfer, status: 'APPROVED', version: 2 });
    render(<TransferDetailView transferId="tr-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید' }));
    expect(await screen.findByText(/نسخهٔ تأییدشده:/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأیید تأیید' }));
    await waitFor(() => expect(mocks.transitionTransfer).toHaveBeenCalledWith('tr-1', 'approve', { expectedVersion: 1 }, expect.stringMatching(/^inventory-transfer-approve-/u)));
    expect(await screen.findByText(/تأییدشده/u)).toBeInTheDocument();
  });

  it('blocks a stale detail and never sends a transition', async () => {
    mocks.getTransfer.mockResolvedValueOnce(transfer).mockResolvedValueOnce({ ...transfer, version: 2 });
    render(<TransferDetailView transferId="tr-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید' }));
    expect(await screen.findByText(/انتقال هم‌زمان تغییر کرده است/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید تأیید' })).toBeDisabled();
    expect(mocks.transitionTransfer).not.toHaveBeenCalled();
  });

  it('does not retry an unknown dispatch result', async () => {
    mocks.getTransfer.mockResolvedValue({ ...transfer, status: 'APPROVED', version: 2 });
    mocks.transitionTransfer.mockRejectedValueOnce(new ApiNetworkError('offline'));
    render(<TransferDetailView transferId="tr-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'ارسال' }));
    await screen.findByText(/نسخهٔ تأییدشده:/u);
    fireEvent.click(screen.getByRole('button', { name: 'تأیید ارسال فیزیکی' }));
    expect(await screen.findByText(/نتیجه نامشخص است/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید ارسال فیزیکی' })).toBeDisabled();
    expect(mocks.transitionTransfer).toHaveBeenCalledTimes(1);
  });
});
