import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryCostPolicyState } from '@iranyaragh/contracts';
import { InventoryCostPolicyPage } from './InventoryCostPolicyPage';
import { inventoryCostPolicy } from '@/lib/settings/inventory-cost-policy-api';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
const auth = vi.hoisted(() => ({ user: { userId: 'operator-test', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/inventory-cost-policy-api', () => ({ inventoryCostPolicy: vi.fn() }));
const empty: InventoryCostPolicyState = { policy: null, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE' };
const selected: InventoryCostPolicyState = { ...empty, policy: { id: 'cost-policy-test', version: 1, method: 'FIFO', createdAt: '2026-10-14T00:00:00Z' } };
async function choose() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'روش هزینهٔ مصوب' }));
  fireEvent.click(await screen.findByRole('option', { name: 'FIFO؛ مصرف از خریدهای قدیمی‌تر' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'دلیل انتخاب یا تغییر روش' }), { target: { value: 'انتخاب مصوب آزمون' } });
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' }));
const mutations = () => vi.mocked(inventoryCostPolicy).mock.calls.filter(call => call[1]);
describe('Admin inactive cost-method configuration', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage']; auth.isRestoring = false;
    vi.mocked(inventoryCostPolicy).mockReset().mockImplementation(async (_signal, mutation) => mutation ? selected : empty);
  });
  it('waits for auth and denies both read and writes without permission', () => {
    auth.isRestoring = true; const view = render(<InventoryCostPolicyPage />); expect(screen.getByRole('status')).toHaveTextContent('بررسی نشست');
    expect(inventoryCostPolicy).not.toHaveBeenCalled(); auth.isRestoring = false; auth.user.permissions = []; view.rerender(<InventoryCostPolicyPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات'); expect(inventoryCostPolicy).not.toHaveBeenCalled();
  });
  it('has no inferred method/activation field and sends the explicit selection with version/key', async () => {
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.');
    expect(screen.getByRole('combobox')).toHaveTextContent('هنوز انتخاب نشده'); expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await choose(); submit(); await screen.findByText('نسخهٔ 1 ثبت شد؛ ارزش‌گذاری همچنان غیرفعال است.');
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]).toEqual([expect.any(AbortSignal), { body: { method: 'FIFO', expectedVersion: null, reason: 'انتخاب مصوب آزمون' }, key: expect.stringMatching(/^cost-policy-/) }]);
    expect(screen.getByText(/ارزش‌گذاری مالی انبار غیرفعال است/)).toBeInTheDocument();
  });
  it('a failed read leaves saving disabled and recovers without exposing diagnostics', async () => {
    vi.mocked(inventoryCostPolicy).mockRejectedValueOnce(new ApiNetworkError('private database detail'));
    render(<InventoryCostPolicyPage />); await screen.findByText(/تنظیمات تأیید نشد/);
    expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeDisabled(); expect(screen.queryByText('private database detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی روش هزینه' })); await screen.findByText('روش هزینه هنوز ثبت نشده است.');
    expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeEnabled(); expect(screen.queryByText(/تنظیمات تأیید نشد/)).not.toBeInTheDocument();
  });
  it('blocks repeated submit and retains exactly the same uncertain key and body after reconciliation', async () => {
    let reject!: (cause: unknown) => void;
    vi.mocked(inventoryCostPolicy).mockImplementationOnce(async () => empty).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.'); await choose(); submit(); submit();
    await waitFor(() => expect(mutations()).toHaveLength(1)); reject(new ApiNetworkError('private send detail'));
    await screen.findByText(/نتیجهٔ ثبت مشخص نیست/); expect(screen.getByRole('combobox')).toHaveClass('Mui-disabled');
    const captured = mutations()[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و بررسی همان درخواست' }));
    await screen.findByText(/نسخهٔ 1 ثبت شد/); expect(mutations()).toHaveLength(2); expect(mutations()[1][1]).toEqual(captured);
  });
  it('failed reconciliation cannot resend an ambiguous mutation', async () => {
    vi.mocked(inventoryCostPolicy).mockResolvedValueOnce(empty).mockRejectedValueOnce(new ApiNetworkError('unknown')).mockRejectedValueOnce(new ApiNetworkError('read failed'));
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.'); await choose(); submit(); await screen.findByText(/نتیجهٔ ثبت مشخص نیست/);
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و بررسی همان درخواست' })); await waitFor(() => expect(inventoryCostPolicy).toHaveBeenCalledTimes(3));
    expect(mutations()).toHaveLength(1); expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeDisabled();
  });
  it('requires an explicit current-version review after conflict and keeps the chosen form', async () => {
    vi.mocked(inventoryCostPolicy).mockResolvedValueOnce(empty).mockRejectedValueOnce(new ApiClientError({ code: 'STALE_VERSION', message: 'private', requestId: 'test', statusCode: 409 })).mockResolvedValue(selected);
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.'); await choose(); submit(); await screen.findByText(/تنظیمات تغییر کرده است/);
    expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی روش هزینه' })); await screen.findByText('نسخهٔ سرور: 1');
    expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'نسخهٔ جدید را بررسی کردم' })); submit();
    await waitFor(() => expect(mutations()).toHaveLength(2)); expect(mutations()[1][1]?.body.expectedVersion).toBe(1);
  });
  it('historical replay is shown as evidence while actual current head requires review', async () => {
    const latest = { ...selected, policy: { ...selected.policy!, version: 2, method: 'MOVING_WEIGHTED_AVERAGE' as const } };
    vi.mocked(inventoryCostPolicy).mockResolvedValueOnce(empty).mockResolvedValueOnce(selected).mockResolvedValueOnce(latest);
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.'); await choose(); submit();
    await screen.findByText('نسخهٔ سرور: 2'); expect(screen.getByText('روش ذخیره‌شده: میانگین موزون متحرک')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت روش بدون فعال‌سازی' })).toBeDisabled();
    expect(screen.getByText('ارزش‌گذاری مالی: غیرفعال')).toBeInTheDocument();
  });
  it('fresh-auth denial is specific and never presented as policy success', async () => {
    vi.mocked(inventoryCostPolicy).mockResolvedValueOnce(empty).mockRejectedValueOnce(new ApiClientError({ code: 'AUTH_REAUTHENTICATION_REQUIRED', message: '', requestId: 'test', statusCode: 401 }));
    render(<InventoryCostPolicyPage />); await screen.findByText('روش هزینه هنوز ثبت نشده است.'); await choose(); submit();
    await screen.findByText(/تأیید تازهٔ رمز و کد دومرحله‌ای/); expect(screen.queryByText(/نسخهٔ 1 ثبت شد/)).not.toBeInTheDocument();
  });
});
