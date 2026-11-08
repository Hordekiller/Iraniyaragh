import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleFilePanel } from './SaleFilePanel';
import { listInvoiceDraftsForOrder } from '@/lib/invoices/invoice-drafts-api';
import { listInvoiceDocumentsForOrder, readInvoicePublication } from '@/lib/invoices/invoice-documents-api';

const auth = vi.hoisted(() => ({ user: { userId: 's', permissions: ['invoices.read', 'invoices.manage', 'invoices.issue', 'invoices.publish'] } as { userId: string; permissions: string[] } }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/invoices/invoice-drafts-api', () => ({ listInvoiceDraftsForOrder: vi.fn() }));
vi.mock('@/lib/invoices/invoice-documents-api', () => ({ listInvoiceDocumentsForOrder: vi.fn(), readInvoicePublication: vi.fn() }));
vi.mock('@/components/invoices/InvoiceFromOrder', () => ({ InvoiceFromOrder: () => <button type="button">ساخت پیش‌فاکتور از سفارش</button> }));

const props = { orderId: 'o1', orderVersion: 3, orderStatus: 'PAID', paymentStatus: 'PAID', fulfillmentStatus: 'PENDING' } as const;
const empty = { items: [], count: 0, offset: 0, limit: 25 };

describe('SaleFilePanel', () => {
  beforeEach(() => {
    auth.user.permissions = ['invoices.read', 'invoices.manage', 'invoices.issue', 'invoices.publish'];
    vi.mocked(listInvoiceDraftsForOrder).mockReset().mockResolvedValue(empty as never);
    vi.mocked(listInvoiceDocumentsForOrder).mockReset().mockResolvedValue(empty as never);
    vi.mocked(readInvoicePublication).mockReset();
  });

  it('asks the API for this order only and offers to create the first draft', async () => {
    render(<SaleFilePanel {...props} />);
    expect(await screen.findByRole('button', { name: 'ساخت پیش‌فاکتور از سفارش' })).toBeVisible();
    expect(listInvoiceDraftsForOrder).toHaveBeenCalledWith('o1', expect.any(AbortSignal));
    expect(listInvoiceDocumentsForOrder).toHaveBeenCalledWith('o1', expect.any(AbortSignal));
    expect(screen.getByText(/قدم بعدی:/)).toBeVisible();
  });

  it('links an open draft to its page', async () => {
    vi.mocked(listInvoiceDraftsForOrder).mockResolvedValue({ items: [{ id: 'd1', state: 'DRAFT' }], count: 1 } as never);
    render(<SaleFilePanel {...props} />);
    expect(await screen.findByRole('link', { name: 'ادامه و صدور فاکتور' })).toHaveAttribute('href', '/invoices/drafts/d1');
  });

  it('offers publication for an issued, unpublished invoice', async () => {
    vi.mocked(listInvoiceDocumentsForOrder).mockResolvedValue({ items: [{ id: 'doc1', number: 'IRY-2026-000001' }], count: 1 } as never);
    vi.mocked(readInvoicePublication).mockResolvedValue({ publication: { isPublished: false } } as never);
    render(<SaleFilePanel {...props} />);
    expect(await screen.findByRole('link', { name: 'انتشار برای مشتری' })).toHaveAttribute('href', '/invoices/documents/doc1');
  });

  it('does not claim an invoice is published when the publication read fails', async () => {
    vi.mocked(listInvoiceDocumentsForOrder).mockResolvedValue({ items: [{ id: 'doc1', number: 'N1' }], count: 1 } as never);
    vi.mocked(readInvoicePublication).mockRejectedValue(new Error('offline'));
    render(<SaleFilePanel {...props} />);
    expect(await screen.findByText(/وضعیت انتشار بارگذاری نشد/)).toBeVisible();
    expect(screen.queryByText(/منتشر شده است/)).not.toBeInTheDocument();
  });

  it('shows a warning with retry when invoices cannot be loaded and keeps the invoice step uncertain', async () => {
    vi.mocked(listInvoiceDraftsForOrder).mockRejectedValueOnce(new Error('boom'));
    render(<SaleFilePanel {...props} />);
    expect(await screen.findByText(/وضعیت فاکتور بارگذاری نشد/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'ساخت پیش‌فاکتور از سفارش' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(listInvoiceDraftsForOrder).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'ساخت پیش‌فاکتور از سفارش' })).toBeVisible();
  });

  it('makes no invoice request without the invoice read permission', () => {
    auth.user.permissions = ['orders.read'];
    render(<SaleFilePanel {...props} />);
    expect(listInvoiceDraftsForOrder).not.toHaveBeenCalled();
    expect(screen.getByText('پرداخت توسط سرور تأیید شده است.')).toBeVisible();
  });
});
