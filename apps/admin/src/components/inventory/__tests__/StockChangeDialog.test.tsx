import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { StockChangeDialog } from '../StockChangeDialog';

const mocks = vi.hoisted(() => ({ changeStock: vi.fn() }));
vi.mock('@/lib/inventory/ledger-api', () => ({ changeStock: mocks.changeStock }));

function fillRequired() {
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار' }), { target: { value: 'wh-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه مکان' }), { target: { value: 'loc-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'شناسه SKU' }), { target: { value: 'sku-1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'تعداد' }), { target: { value: '3' } });
}

describe('StockChangeDialog', () => {
  beforeEach(() => mocks.changeStock.mockReset());

  it('rejects invalid or missing adjustment reason before any request', async () => {
    render(<StockChangeDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    fillRequired();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'نوع تغییر' }));
    fireEvent.click(screen.getByRole('option', { name: 'تعدیل کاهشی (−)' }));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تغییر' }));
    expect(await screen.findByText('برای تعدیل دستی، دلیل الزامی است.')).toBeInTheDocument();
    expect(mocks.changeStock).not.toHaveBeenCalled();
  });

  it('submits signed delta with row version and keeps one key across an unknown-result retry', async () => {
    mocks.changeStock.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce({ id: 'move-1' });
    const saved = vi.fn();
    render(<StockChangeDialog initial={{ warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', version: 4 }} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'نوع تغییر' }));
    fireEvent.click(screen.getByRole('option', { name: 'تعدیل کاهشی (−)' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'تعداد' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'دلیل' }), { target: { value: 'اصلاح شمارش' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تغییر' }));
    expect(await screen.findByText(/نتیجهٔ ثبت نامشخص است/)).toBeInTheDocument();
    expect(mocks.changeStock).toHaveBeenCalledWith({ warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', type: 'ADJUSTMENT_OUT', delta: -3, reason: 'اصلاح شمارش', expectedVersion: 4 }, expect.stringMatching(/^inventory-change-/u));
    const firstKey = mocks.changeStock.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تغییر' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(mocks.changeStock.mock.calls[1][1]).toBe(firstKey);
  });

  it('shows an explicit version conflict instead of claiming a successful adjustment', async () => {
    mocks.changeStock.mockRejectedValueOnce(new ApiClientError({ code: 'INVENTORY_VERSION_CONFLICT', message: 'conflict', requestId: 'req-1', statusCode: 409 }));
    const saved = vi.fn();
    render(<StockChangeDialog onClose={vi.fn()} onSaved={saved} />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تغییر' }));
    expect(await screen.findByText(/نسخهٔ مانده تغییر کرده است/)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });

  it('shows insufficient stock and keeps the dialog open for reconciliation', async () => {
    mocks.changeStock.mockRejectedValueOnce(new ApiClientError({ code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', requestId: 'req-2', statusCode: 409 }));
    render(<StockChangeDialog onClose={vi.fn()} onSaved={vi.fn()} />);
    fillRequired();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'نوع تغییر' }));
    fireEvent.click(screen.getByRole('option', { name: 'تعدیل کاهشی (−)' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'دلیل' }), { target: { value: 'اصلاح شمارش' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تغییر' }));
    expect(await screen.findByText('موجودی آزاد برای این برداشت کافی نیست.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' })).toBeInTheDocument();
  });
});
