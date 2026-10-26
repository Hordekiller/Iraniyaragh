import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDocument } from '@iranyaragh/contracts';
import { InvoiceDocumentPage } from './InvoiceDocumentPage';
import { ApiNetworkError } from '@/lib/api/client';
import { listInvoiceDocuments, readInvoiceDocument } from '@/lib/invoices/invoice-documents-api';
import { prepareInvoicePrint } from '@/lib/invoices/invoice-print';
const auth = vi.hoisted(() => ({ user: { userId: 'staff-a', permissions: ['invoices.read'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/invoices/invoice-documents-api', () => ({ listInvoiceDocuments: vi.fn(), readInvoiceDocument: vi.fn() }));
vi.mock('@/lib/invoices/invoice-print', () => ({ prepareInvoicePrint: vi.fn(async () => undefined) }));
vi.mock('./InvoicePublication', () => ({ InvoicePublication: () => null }));
const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const document = {
  id: 'doc-a', number: 'IRY-2026-000001', orderId: 'order-a', issuedAt: '2026-10-13T10:00:00Z', policyVersion: 3,
  seller: { name: 'فروشگاه زمان صدور', address: 'نشانی فروشنده', contact: 'تماس عمومی' }, buyerLabel: 'خریدار سند',
  address: { city: 'تهران', address: 'نشانی ثبت‌شده', postalCode: '1234567890', recipient: 'گیرنده سند', mobile: 'test-destination' },
  shipping: { title: 'تحویل حضوری' }, note: '<script>unsafe()</script>', taxPolicy: { treatment: 'INCLUSIVE' },
  quote: { subtotal: money('9007199254740993'), discount: money('0'), shipping: money('0'), tax: money('0'), total: money('9007199254740993') },
  lines: [{ orderItemId: 'line-a', sku: 'SKU-A', title: 'کالای ثبت‌شده', quantity: 1, unitPrice: money('9007199254740993'), discount: money('0'), tax: money('0'), total: money('9007199254740993') }],
} as InvoiceDocument;
describe('immutable issued invoice views', () => {
  beforeEach(() => {
    auth.user = { userId: 'staff-a', permissions: ['invoices.read'] }; auth.isRestoring = false;
    vi.mocked(readInvoiceDocument).mockReset().mockResolvedValue(document);
    vi.mocked(prepareInvoicePrint).mockReset().mockResolvedValue(undefined);
    vi.mocked(listInvoiceDocuments).mockReset().mockResolvedValue({ items: [], count: 0, offset: 0, limit: 25 });
  });
  it('waits for session restoration and does not query without permission', async () => {
    auth.isRestoring = true; const view = render(<InvoiceDocumentPage />);
    expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی نشست');
    expect(listInvoiceDocuments).not.toHaveBeenCalled();
    auth.isRestoring = false; auth.user.permissions = []; view.rerender(<InvoiceDocumentPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('دسترسی مشاهده'); expect(listInvoiceDocuments).not.toHaveBeenCalled();
  });
  it('shows original server snapshot, exact large IRR and escaped user text without financial mutation controls', async () => {
    const view = render(<InvoiceDocumentPage id="doc-a" />);
    await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' });
    expect(screen.getByText('فروشگاه زمان صدور')).toBeVisible(); expect(screen.getByText('<script>unsafe()</script>')).toBeVisible();
    expect(view.container.querySelector('script')).toBeNull(); expect(screen.getByRole('table')).toHaveTextContent('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳');
    expect(screen.getByRole('link', { name: 'order-a' })).toHaveAttribute('href', '/orders/order-a');
    expect(screen.queryByRole('button', { name: /پرداخت|صدور|ویرایش/ })).not.toBeInTheDocument();
  });
  it('displays a sanitized network failure and recovers with a new read', async () => {
    vi.mocked(readInvoiceDocument).mockRejectedValueOnce(new ApiNetworkError('private internal response'));
    render(<InvoiceDocumentPage id="doc-a" />); await screen.findByRole('alert');
    expect(screen.queryByText('private internal response')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی فاکتور' }));
    await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' }); expect(readInvoiceDocument).toHaveBeenCalledTimes(2);
  });
  it('prints the immutable branded sheet only after its local assets are ready', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<InvoiceDocumentPage id="doc-a" />); await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' });
    expect(screen.getByRole('img', { name: 'ایرانی یراق' })).toHaveAttribute('src', '/brand/wordmark-print.png');
    fireEvent.click(screen.getByRole('button', { name: 'چاپ فاکتور A4' })); await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(prepareInvoicePrint).toHaveBeenCalledWith(screen.getByRole('article', { name: 'سند فاکتور IRY-2026-000001' }));
    expect(screen.getByRole('table')).toHaveTextContent('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳');
  });
  it('asset failure is explicit and cannot open a blank/falsely ready print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    vi.mocked(prepareInvoicePrint).mockRejectedValueOnce(new Error('private asset diagnostic'));
    render(<InvoiceDocumentPage id="doc-a" />); await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' });
    fireEvent.click(screen.getByRole('button', { name: 'چاپ فاکتور A4' })); await screen.findByText(/لوگو یا قلم چاپ دریافت نشد/);
    expect(print).not.toHaveBeenCalled(); expect(screen.queryByText('private asset diagnostic')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'چاپ فاکتور A4' })).toBeEnabled();
  });
  it('does not print a removed snapshot when a reload completes during asset preparation', async () => {
    let ready!: () => void; vi.mocked(prepareInvoicePrint).mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<InvoiceDocumentPage id="doc-a" />); await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' });
    fireEvent.click(screen.getByRole('button', { name: 'چاپ فاکتور A4' }));
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی فاکتور' }));
    await waitFor(() => expect(readInvoiceDocument).toHaveBeenCalledTimes(2)); await screen.findByRole('heading', { name: 'فاکتور IRY-2026-000001' });
    ready(); await waitFor(() => expect(screen.getByRole('button', { name: 'چاپ فاکتور A4' })).toBeEnabled()); expect(print).not.toHaveBeenCalled();
  });
  it('paginates bounded server results without client totals', async () => {
    vi.mocked(listInvoiceDocuments).mockResolvedValue({ items: [{ id: 'doc-a', number: document.number, orderId: document.orderId, customerId: 'customer-a', buyerLabel: document.buyerLabel, issuedAt: document.issuedAt, total: document.quote.total }], count: 26, offset: 0, limit: 25 });
    render(<InvoiceDocumentPage />); await screen.findByRole('link', { name: /IRY-2026-000001/ });
    expect(screen.getByRole('button', { name: 'صفحهٔ قبل' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعد' }));
    await waitFor(() => expect(listInvoiceDocuments).toHaveBeenLastCalledWith(25, expect.any(AbortSignal)));
    expect(screen.getByRole('button', { name: 'صفحهٔ بعد' })).toBeDisabled();
  });
  it('aborts outstanding reads and removes the previous identity snapshot on principal changes', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(readInvoiceDocument).mockImplementationOnce(async (_id, current) => { signal = current; return document; });
    const view = render(<InvoiceDocumentPage id="doc-a" />); await screen.findByText('فروشگاه زمان صدور');
    vi.mocked(readInvoiceDocument).mockReturnValueOnce(new Promise(() => undefined));
    auth.user = { userId: 'staff-b', permissions: ['invoices.read'] }; view.rerender(<InvoiceDocumentPage id="doc-a" />);
    expect(signal?.aborted).toBe(true); expect(screen.queryByText('فروشگاه زمان صدور')).not.toBeInTheDocument();
    view.unmount();
  });
});
