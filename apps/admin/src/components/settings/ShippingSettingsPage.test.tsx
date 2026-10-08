import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingSettingsPage } from './ShippingSettingsPage';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { readShippingMethods, saveShippingMethod } from '@/lib/settings/shipping-settings-api';

const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/shipping-settings-api', () => ({ readShippingMethods: vi.fn(), saveShippingMethod: vi.fn() }));
const method = { code: 'post', title: 'پست', amount: { amount: '50000', currency: 'IRR' as const }, isActive: false, version: 0, policyRevision: 'r0', updatedAt: '2026-10-08T00:00:00Z' };

async function fill() {
  await screen.findByText(/هیچ روش ارسالی ثبت نشده است/);
  fireEvent.change(screen.getByLabelText(/کد روش ارسال/), { target: { value: 'post' } });
  fireEvent.change(screen.getByLabelText(/نام قابل نمایش/), { target: { value: 'پست' } });
  fireEvent.change(screen.getByLabelText(/هزینهٔ مصوب ارسال/), { target: { value: '۵۰۰۰۰' } });
}

describe('Admin approved shipping tariffs', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage']; vi.mocked(readShippingMethods).mockReset().mockResolvedValue([]);
    vi.mocked(saveShippingMethod).mockReset().mockResolvedValue(method);
  });
  it('stores only explicit integer IRR values and defaults new methods to inactive', async () => {
    render(<ShippingSettingsPage />); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' }));
    await screen.findByText(/تعرفه در سرور ذخیره شد/);
    expect(saveShippingMethod).toHaveBeenCalledWith('post', { title: 'پست', amount: method.amount, isActive: false, expectedVersion: null }, expect.stringMatching(/^shipping-/), expect.any(AbortSignal));
  });
  it('locks the exact payload and retries the same key after an uncertain response', async () => {
    vi.mocked(saveShippingMethod).mockRejectedValueOnce(new ApiNetworkError('connection lost'));
    render(<ShippingSettingsPage />); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' }));
    await screen.findByText(/نتیجه ذخیره مشخص نیست/);
    expect(screen.getByLabelText(/هزینهٔ مصوب ارسال/)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'بررسی دوباره همین درخواست' }));
    await screen.findByText(/تعرفه در سرور ذخیره شد/);
    expect(vi.mocked(saveShippingMethod).mock.calls[1]?.slice(0, 3)).toEqual(vi.mocked(saveShippingMethod).mock.calls[0]?.slice(0, 3));
  });
  it('preserves a changed draft through version conflict and requires review of the new version', async () => {
    vi.mocked(readShippingMethods).mockResolvedValueOnce([method]).mockResolvedValueOnce([{ ...method, version: 1 }]);
    vi.mocked(saveShippingMethod).mockRejectedValueOnce(new ApiClientError({ code: 'STALE_VERSION', message: '', statusCode: 409, requestId: 'test' }));
    render(<ShippingSettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'پست — غیرفعال' }));
    fireEvent.change(screen.getByLabelText(/هزینهٔ مصوب ارسال/), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' }));
    await screen.findByText(/تنظیمات تغییر کرده‌اند/);
    fireEvent.click(screen.getByRole('button', { name: 'دریافت نسخهٔ جدید برای بررسی' }));
    await waitFor(() => expect(readShippingMethods).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' })).toBeEnabled());
    expect(screen.getByLabelText(/هزینهٔ مصوب ارسال/)).toHaveValue('60000');
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' }));
    await screen.findByText(/تعرفه در سرور ذخیره شد/);
    expect(vi.mocked(saveShippingMethod).mock.calls[1]?.[1]).toMatchObject({ expectedVersion: 1, amount: { amount: '60000', currency: 'IRR' } });
  });
  it('does not read or mutate settings when the UI principal lacks permission', () => {
    auth.user.permissions = []; render(<ShippingSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('دسترسی مدیریت تنظیمات لازم است.');
    expect(readShippingMethods).not.toHaveBeenCalled(); expect(saveShippingMethod).not.toHaveBeenCalled();
  });
  it('rejects floating point fees before sending a request', async () => {
    render(<ShippingSettingsPage />); await fill();
    fireEvent.change(screen.getByLabelText(/هزینهٔ مصوب ارسال/), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تعرفهٔ مصوب' }));
    await screen.findByText(/نام، مبلغ ریالی/);
    expect(saveShippingMethod).not.toHaveBeenCalled();
  });
});
