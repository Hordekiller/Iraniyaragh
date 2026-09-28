import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError } from '@/lib/api/client';
import { TransferCreateView } from '../TransferCreateView';

const mocks = vi.hoisted(() => ({ user: { permissions: ['inventory.transfer'] }, createTransfer: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/inventory/transfers-api', () => ({ createTransfer: mocks.createTransfer }));

function fill() {
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار مقصد' }), { target: { value: 'wh-2' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه SKU ردیف 1' }), { target: { value: 'sku-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'تعداد ردیف 1' }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه مکان مبدأ ردیف 1' }), { target: { value: 'loc-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه مکان مقصد ردیف 1' }), { target: { value: 'loc-2' } });
}

describe('TransferCreateView', () => {
  beforeEach(() => { mocks.user = { permissions: ['inventory.transfer'] }; mocks.createTransfer.mockReset(); mocks.push.mockReset(); });

  it('rejects incomplete items and a same-warehouse transfer before request', async () => {
    render(<TransferCreateView initialSourceWarehouseId="wh-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'ساخت پیش‌نویس' }));
    expect(await screen.findByText(/انبارهای متمایز/u)).toBeInTheDocument();
    expect(mocks.createTransfer).not.toHaveBeenCalled();
    fill();
    fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار مقصد' }), { target: { value: 'wh-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت پیش‌نویس' }));
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });

  it('sends one explicit item and navigates to the created detail', async () => {
    mocks.createTransfer.mockResolvedValueOnce({ id: 'tr-1' });
    render(<TransferCreateView initialSourceWarehouseId="wh-1" initialVariantId="sku-1" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت پیش‌نویس' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/transfers/tr-1'));
    expect(mocks.createTransfer).toHaveBeenCalledWith({ sourceWarehouseId: 'wh-1', targetWarehouseId: 'wh-2', items: [{ variantId: 'sku-1', quantity: 2, sourceLocationId: 'loc-1', targetLocationId: 'loc-2' }] }, expect.stringMatching(/^inventory-transfer-/u));
  });

  it('locks an unknown create result until the operator checks the list', async () => {
    mocks.createTransfer.mockRejectedValueOnce(new ApiNetworkError('offline'));
    render(<TransferCreateView initialSourceWarehouseId="wh-1" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت پیش‌نویس' }));
    expect(await screen.findByText(/نتیجهٔ ساخت نامشخص است/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ساخت پیش‌نویس' })).toBeDisabled();
    expect(mocks.createTransfer).toHaveBeenCalledTimes(1);
  });
});
