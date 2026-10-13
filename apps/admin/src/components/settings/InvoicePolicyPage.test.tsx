import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoicePolicy } from '@iranyaragh/contracts';
import { InvoicePolicyPage } from './InvoicePolicyPage';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { readInvoicePolicy, saveInvoicePolicy } from '@/lib/settings/invoice-policy-api';
const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/invoice-policy-api', () => ({ readInvoicePolicy: vi.fn(), saveInvoicePolicy: vi.fn() }));
const policy: InvoicePolicy = { id: 'policy-test', version: 1, sellerName: 'آزمون فروشنده', sellerAddress: 'نشانی آزمون', sellerContact: 'example.test',
  taxTreatment: 'EXCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 2000, shippingTaxable: false, isActive: false, createdAt: '2026-10-12T00:00:00Z' };
async function choose(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(label) }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
async function fill() {
  await screen.findByText(/تنظیمات فاکتور ثبت نشده/);
  for (const [label, value] of [['نام فروشنده / فروشگاه', policy.sellerName], ['نشانی عمومی فروشنده', policy.sellerAddress], ['اطلاعات تماس عمومی فروشنده', policy.sellerContact],
    ['نرخ مالیات', '۱۰۰۰'], ['سقف تخفیف', '۲۰۰۰'], ['دلیل ثبت نسخهٔ جدید', 'تصویب آزمون']])
    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  await choose('مبنای مالیات مصوب', 'مالیات افزوده به مبلغ پس از تخفیف');
  await choose('مالیات هزینهٔ ارسال', 'بدون مالیات ارسال');
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'ثبت نسخهٔ مصوب' }));
describe('Admin store invoice policy real-server boundary', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage']; auth.isRestoring = false;
    vi.mocked(readInvoicePolicy).mockReset().mockResolvedValue(null);
    vi.mocked(saveInvoicePolicy).mockReset().mockResolvedValue(policy);
  });
  it('provides no seller/rate/treatment default and sends only explicit integer basis points', async () => {
    render(<InvoicePolicyPage />); await screen.findByText(/تنظیمات فاکتور ثبت نشده/);
    expect(screen.getByLabelText(/نرخ مالیات \(واحد پایه\)/)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /مبنای مالیات مصوب/ })).not.toHaveTextContent(/مالیات افزوده|مالیات داخل|معاف/);
    await fill(); submit(); await screen.findByText(/نسخهٔ 1 در سرور ثبت شد/);
    expect(saveInvoicePolicy).toHaveBeenCalledWith({ sellerName: policy.sellerName, sellerAddress: policy.sellerAddress, sellerContact: policy.sellerContact,
      taxTreatment: 'EXCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 2000, shippingTaxable: false, isActive: false, expectedVersion: null, reason: 'تصویب آزمون' },
    expect.stringMatching(/^invoice-policy-/), expect.any(AbortSignal));
  });
  it('denies loading/mutation without permission and waits for session restoration', () => {
    auth.user.permissions = []; const view = render(<InvoicePolicyPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('دسترسی مدیریت تنظیمات لازم است.'); expect(readInvoicePolicy).not.toHaveBeenCalled();
    auth.isRestoring = true; view.rerender(<InvoicePolicyPage />); expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی نشست');
  });
  it('recovers a failed configuration read and does not permit saving against unknown state', async () => {
    vi.mocked(readInvoicePolicy).mockRejectedValueOnce(new ApiNetworkError('private internal detail'));
    render(<InvoicePolicyPage />); await screen.findByText(/دریافت یا تأیید تنظیمات ناموفق/);
    expect(screen.getByRole('button', { name: 'ثبت نسخهٔ مصوب' })).toBeDisabled(); expect(screen.queryByText('private internal detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی تنظیمات سرور' })); await fill();
    expect(screen.getByRole('button', { name: 'ثبت نسخهٔ مصوب' })).toBeEnabled();
  });
  it('requires explicit valid rate/exemption evidence rather than interpreting blank as zero', async () => {
    render(<InvoicePolicyPage />); await fill();
    fireEvent.change(screen.getByLabelText(/نرخ مالیات \(واحد پایه\)/), { target: { value: '' } }); submit();
    expect(screen.getByLabelText(/نرخ مالیات \(واحد پایه\)/)).toBeInvalid(); expect(saveInvoicePolicy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/نرخ مالیات \(واحد پایه\)/), { target: { value: '1.5' } }); submit();
    await screen.findByText(/مشخصات فروشنده، مبنای مالیات/); expect(saveInvoicePolicy).not.toHaveBeenCalled();
    await choose('مبنای مالیات مصوب', 'معاف با دلیل مصوب');
    fireEvent.change(screen.getByLabelText(/نرخ مالیات \(واحد پایه\)/), { target: { value: '0' } }); submit(); expect(saveInvoicePolicy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/دلیل مصوب معافیت/), { target: { value: 'معافیت آزمون' } }); submit();
    await screen.findByText(/نسخهٔ 1 در سرور ثبت شد/);
    expect(vi.mocked(saveInvoicePolicy).mock.calls[0]?.[0]).toMatchObject({ taxTreatment: 'EXEMPT', taxRateBps: 0, exemptionReason: 'معافیت آزمون' });
  });
  it('freezes an ambiguous payload/key and replays it after server read without adopting a changed version', async () => {
    vi.mocked(saveInvoicePolicy).mockRejectedValueOnce(new ApiNetworkError('lost response'));
    vi.mocked(readInvoicePolicy).mockResolvedValueOnce(null).mockResolvedValue({ ...policy, version: 2 });
    render(<InvoicePolicyPage />); await fill(); submit(); await screen.findByText(/نتیجهٔ ثبت مشخص نیست/);
    expect(screen.getByLabelText(/نام فروشنده \/ فروشگاه/)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و بررسی همان درخواست' })); await screen.findByText(/نسخهٔ 1 در سرور ثبت شد/);
    expect(vi.mocked(saveInvoicePolicy).mock.calls[1]?.slice(0, 2)).toEqual(vi.mocked(saveInvoicePolicy).mock.calls[0]?.slice(0, 2));
    expect(screen.getByRole('button', { name: 'ثبت نسخهٔ مصوب' })).toBeDisabled();
  });
  it('does not resend an uncertain mutation if reconciliation read fails', async () => {
    vi.mocked(saveInvoicePolicy).mockRejectedValueOnce(new ApiNetworkError('lost response'));
    vi.mocked(readInvoicePolicy).mockResolvedValueOnce(null).mockRejectedValue(new ApiNetworkError('offline'));
    render(<InvoicePolicyPage />); await fill(); submit(); await screen.findByText(/نتیجهٔ ثبت مشخص نیست/);
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و بررسی همان درخواست' }));
    await waitFor(() => expect(readInvoicePolicy).toHaveBeenCalledTimes(2)); expect(saveInvoicePolicy).toHaveBeenCalledTimes(1);
  });
  it('preserves the operator draft on conflict and requires explicit review of new server settings', async () => {
    vi.mocked(readInvoicePolicy).mockResolvedValueOnce(policy).mockResolvedValueOnce({ ...policy, version: 2, sellerName: 'نسخهٔ دیگر' });
    vi.mocked(saveInvoicePolicy).mockRejectedValueOnce(new ApiClientError({ code: 'STALE_VERSION', statusCode: 409, requestId: 'test', message: 'private detail' }));
    render(<InvoicePolicyPage />); await screen.findByText(/نسخهٔ سرور: 1/);
    fireEvent.change(screen.getByLabelText(/نام فروشنده \/ فروشگاه/), { target: { value: 'ویرایش من' } });
    fireEvent.change(screen.getByLabelText(/دلیل ثبت نسخهٔ جدید/), { target: { value: 'اصلاح آزمون' } }); submit();
    await screen.findByText(/تنظیمات هم‌زمان تغییر کرده‌اند/);
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی تنظیمات سرور' })); await screen.findByText(/نسخهٔ سرور: 2/);
    expect(screen.getByLabelText(/نام فروشنده \/ فروشگاه/)).toHaveValue('ویرایش من'); expect(screen.getByRole('button', { name: 'ثبت نسخهٔ مصوب' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /نسخهٔ جدید را بررسی کردم/ })); submit();
    await waitFor(() => expect(saveInvoicePolicy).toHaveBeenCalledTimes(2)); expect(vi.mocked(saveInvoicePolicy).mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 2, sellerName: 'ویرایش من' });
    expect(vi.mocked(saveInvoicePolicy).mock.calls[1]?.[1]).not.toBe(vi.mocked(saveInvoicePolicy).mock.calls[0]?.[1]);
  });
  it('prevents double submit while awaiting authoritative save', async () => {
    let resolve!: (value: InvoicePolicy) => void; vi.mocked(saveInvoicePolicy).mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<InvoicePolicyPage />); await fill(); submit(); submit();
    expect(saveInvoicePolicy).toHaveBeenCalledTimes(1); expect(screen.getByLabelText(/نام فروشنده \/ فروشگاه/)).toBeDisabled();
    resolve(policy); await screen.findByText(/نسخهٔ 1 در سرور ثبت شد/);
  });
});
