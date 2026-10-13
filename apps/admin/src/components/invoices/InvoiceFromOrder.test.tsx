import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceFromOrder } from './InvoiceFromOrder';
import { executeInvoiceDraft, listInvoiceDrafts } from '@/lib/invoices/invoice-drafts-api';
import { ApiNetworkError } from '@/lib/api/client';
const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['invoices.read','invoices.manage'] } }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/invoices/invoice-drafts-api', () => ({ executeInvoiceDraft: vi.fn(), listInvoiceDrafts: vi.fn() }));
describe('Invoice from authoritative source order safe submission', () => {
  beforeEach(() => { auth.user.permissions = ['invoices.read','invoices.manage']; vi.mocked(executeInvoiceDraft).mockReset(); router.push.mockReset();
    vi.mocked(listInvoiceDrafts).mockReset().mockResolvedValue({ items: [], count: 0, offset: 0, limit: 25 }); });
  it('hides the action without both current permissions', () => { auth.user.permissions = ['invoices.read']; render(<InvoiceFromOrder orderId="order-test" version={1} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(executeInvoiceDraft).not.toHaveBeenCalled(); });
  it('preserves captured order version/key through a newer order render and never retries after a failed read', async () => {
    vi.mocked(executeInvoiceDraft).mockRejectedValueOnce(new ApiNetworkError('lost response'));
    const view = render(<InvoiceFromOrder orderId="order-test" version={1} />); fireEvent.click(screen.getByRole('button'));
    await screen.findByText(/نتیجهٔ ساخت پیش‌نویس نامشخص/); view.rerender(<InvoiceFromOrder orderId="order-test" version={2} />);
    vi.mocked(listInvoiceDrafts).mockRejectedValueOnce(new ApiNetworkError('offline')); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(listInvoiceDrafts).toHaveBeenCalledTimes(1)); expect(executeInvoiceDraft).toHaveBeenCalledTimes(1);
    vi.mocked(executeInvoiceDraft).mockResolvedValueOnce({ draft: { id: 'draft-test' } } as Awaited<ReturnType<typeof executeInvoiceDraft>>);
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled()); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/invoices/drafts/draft-test'));
    expect(vi.mocked(executeInvoiceDraft).mock.calls[1].slice(0,2)).toEqual(vi.mocked(executeInvoiceDraft).mock.calls[0].slice(0,2));
    expect(vi.mocked(executeInvoiceDraft).mock.calls[1][0]).toMatchObject({ body: { expectedOrderVersion: 1 } });
  });
});
