import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDraft } from '@iranyaragh/contracts';
import { InvoiceDraftPage } from './InvoiceDraftPage';
import { executeInvoiceDraft, invoiceDraftHistory, listInvoiceDrafts, readInvoiceDraft, searchInvoiceOptions } from '@/lib/invoices/invoice-drafts-api';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['invoices.read','invoices.manage'] }, isRestoring: false }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/invoices/invoice-drafts-api', () => ({ executeInvoiceDraft: vi.fn(), invoiceDraftHistory: vi.fn(), listInvoiceDrafts: vi.fn(), readInvoiceDraft: vi.fn(), searchInvoiceOptions: vi.fn() }));
// Picker interaction has separate real asynchronous lookup tests; these cases exercise workspace concurrency/recovery.
vi.mock('@/components/orders/StaffOrderOptionPicker', () => ({ StaffOrderOptionPicker: ({ label, value, disabled }: { label: string; value: { label: string } | null; disabled: boolean }) => <input aria-label={label} value={value?.label ?? ''} disabled={disabled} readOnly /> }));
const m = (value: string) => ({ amount: value, currency: 'IRR' as const });
const draft: InvoiceDraft = { id: 'draft-test', version: 0, state: 'DRAFT', source: 'CATALOG', customerId: 'customer-test', buyerLabel: 'Isolated buyer', sourceOrderId: null, sourceOrderVersion: null, sourceTermsMatch: null,
  address: { provinceCode: 'THR', city: 'Test city', address: 'Test address', postalCode: '1234567890', recipient: 'Test buyer', mobile: '+989120000000' }, note: null,
  lines: [{ variantId: 'variant-test', sku: 'TEST', title: 'Test SKU', quantity: 2, unitPrice: m('1000'), discount: m('0'), subtotal: m('2000') }], globalDiscount: m('0'),
  shipping: { code: 'PICKUP', title: 'تحویل حضوری', amount: m('0'), policyRevision: 'staff-pickup-v1' }, pricePolicyRevision: 'catalog-sale-price-v1', quoteExpiresAt: '2026-10-13T00:00:00Z', policyVersion: null,
  quote: null, quotationStatus: 'POLICY_REQUIRED', createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z' };
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'ثبت ویرایش پیش‌فاکتور' }));
async function loaded() { await screen.findByText('وضعیت: پیش‌نویس — نسخهٔ 0'); await waitFor(() => expect(screen.getByRole('button', { name: 'ثبت ویرایش پیش‌فاکتور' })).toBeEnabled()); }
describe('Invoice draft workspace authoritative amounts and safe recovery', () => {
  beforeEach(() => {
    auth.user.permissions = ['invoices.read','invoices.manage']; auth.isRestoring = false;
    vi.mocked(readInvoiceDraft).mockReset().mockResolvedValue(draft);
    vi.mocked(listInvoiceDrafts).mockReset().mockResolvedValue({ items: [], count: 0, offset: 0, limit: 25 });
    vi.mocked(invoiceDraftHistory).mockReset().mockResolvedValue({ items: [], count: 0, offset: 0, limit: 25 });
    vi.mocked(searchInvoiceOptions).mockReset().mockResolvedValue({ items: [{ id: 'PICKUP', label: 'تحویل حضوری', detail: null }], count: 1 });
    vi.mocked(executeInvoiceDraft).mockReset().mockResolvedValue({ draft: { ...draft, version: 1 }, committedVersion: 1, replayed: false }); router.push.mockReset();
  });
  it('denies reads without permission, waits for restoration, and keeps read-only forms locked', async () => {
    auth.user.permissions = []; const view = render(<InvoiceDraftPage id={draft.id} />); expect(screen.getByRole('alert')).toHaveTextContent('دسترسی مشاهدهٔ فاکتور'); expect(readInvoiceDraft).not.toHaveBeenCalled();
    auth.isRestoring = true; view.rerender(<InvoiceDraftPage id={draft.id} />); expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی نشست');
    auth.isRestoring = false; auth.user.permissions = ['invoices.read']; view.rerender(<InvoiceDraftPage id={draft.id} />); await screen.findByText('وضعیت: پیش‌نویس — نسخهٔ 0');
    expect(screen.queryByRole('button', { name: 'ثبت ویرایش پیش‌فاکتور' })).not.toBeInTheDocument(); expect(screen.getByRole('textbox', { name: /تعداد 1/ })).toBeDisabled(); expect(searchInvoiceOptions).not.toHaveBeenCalled();
  });
  it('shows missing policy instead of invented tax and edits only versioned non-price input', async () => {
    render(<InvoiceDraftPage id={draft.id} />); await loaded();
    expect(screen.getByText(/این پیش‌نویس مبلغ نهایی ندارد/)).toBeVisible(); expect(screen.queryByLabelText('مبالغ ثبت‌شدهٔ سرور')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /تخفیف کلی/ }), { target: { value: '۱۰۰' } }); submit(); await screen.findByText('نسخهٔ 1 روی سرور ثبت شد.');
    const command = vi.mocked(executeInvoiceDraft).mock.calls[0][0]; expect(command).toMatchObject({ kind: 'edit', id: draft.id, body: { expectedVersion: 0, globalDiscount: '100' } });
    expect(JSON.stringify(command)).not.toMatch(/unitPrice|taxRate|customerId|state/); expect(command).not.toHaveProperty('price');
  });
  it('prevents editing after a read failure, supports retry, and never displays raw internal errors', async () => {
    vi.mocked(readInvoiceDraft).mockRejectedValueOnce(new ApiNetworkError('internal private details'));
    render(<InvoiceDraftPage id={draft.id} />); await screen.findByText(/نتیجهٔ عملیات تأیید نشد/);
    expect(screen.getByRole('button', { name: 'ایجاد پیش‌فاکتور' })).toBeDisabled(); expect(screen.queryByText('internal private details')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی وضعیت سرور' })); await screen.findByText('وضعیت: پیش‌نویس — نسخهٔ 0');
    expect(screen.getByRole('button', { name: 'ثبت ویرایش پیش‌فاکتور' })).toBeDisabled(); // Unknown initial form is not silently populated on manual non-adopting reload.
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش نسخهٔ سرور برای ویرایش' })); await loaded();
  });
  it('freezes ambiguous input and reuses exact payload/key after reconciliation', async () => {
    vi.mocked(executeInvoiceDraft).mockRejectedValueOnce(new ApiNetworkError('lost response'));
    render(<InvoiceDraftPage id={draft.id} />); await loaded(); submit(); await screen.findByText(/نتیجهٔ ثبت نامشخص است/);
    expect(screen.getByRole('textbox', { name: /تعداد 1/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و تلاش با همان درخواست' })); await screen.findByText('نسخهٔ 1 روی سرور ثبت شد.');
    expect(vi.mocked(executeInvoiceDraft).mock.calls[1].slice(0, 2)).toEqual(vi.mocked(executeInvoiceDraft).mock.calls[0].slice(0, 2));
  });
  it('never resends an unknown write when reconciliation fails', async () => {
    vi.mocked(executeInvoiceDraft).mockRejectedValueOnce(new ApiNetworkError('lost response'));
    vi.mocked(readInvoiceDraft).mockResolvedValueOnce(draft).mockRejectedValue(new ApiNetworkError('offline'));
    render(<InvoiceDraftPage id={draft.id} />); await loaded(); submit(); await screen.findByText(/نتیجهٔ ثبت نامشخص است/);
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و تلاش با همان درخواست' }));
    await waitFor(() => expect(readInvoiceDraft).toHaveBeenCalledTimes(2)); expect(executeInvoiceDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: /تعداد 1/ })).toBeDisabled();
  });
  it('preserves unsaved form on stale-version failure until the operator adopts reviewed server data', async () => {
    vi.mocked(executeInvoiceDraft).mockRejectedValueOnce(new ApiClientError({ code: 'STALE_VERSION', statusCode: 409, requestId: 'test', message: 'private detail' }));
    vi.mocked(readInvoiceDraft).mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, version: 1, note: 'Concurrent note' });
    render(<InvoiceDraftPage id={draft.id} />); await loaded(); fireEvent.change(screen.getByLabelText('توضیحات فاکتور'), { target: { value: 'My note' } }); submit();
    await screen.findByText(/نسخهٔ پیش‌فاکتور تغییر کرده/); expect(screen.getByLabelText('توضیحات فاکتور')).toHaveValue('My note');
    expect(screen.getByRole('button', { name: 'ثبت ویرایش پیش‌فاکتور' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش نسخهٔ سرور برای ویرایش' })); await screen.findByText('وضعیت: پیش‌نویس — نسخهٔ 1');
    expect(screen.getByLabelText('توضیحات فاکتور')).toHaveValue('Concurrent note'); submit(); await waitFor(() => expect(executeInvoiceDraft).toHaveBeenCalledTimes(2));
    expect(vi.mocked(executeInvoiceDraft).mock.calls[1][0]).toMatchObject({ body: { expectedVersion: 1 } });
  });
  it('does not duplicate submission while awaiting server evidence', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof executeInvoiceDraft>>) => void; vi.mocked(executeInvoiceDraft).mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<InvoiceDraftPage id={draft.id} />); await loaded(); submit(); submit(); expect(executeInvoiceDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: /تعداد 1/ })).toBeDisabled(); resolve({ draft: { ...draft, version: 1 }, committedVersion: 1, replayed: false }); await screen.findByText('نسخهٔ 1 روی سرور ثبت شد.');
  });
});
