import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoicePublication } from './InvoicePublication';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  readInvoicePublication,
  changeInvoicePublication,
} from '@/lib/invoices/invoice-documents-api';
const auth = vi.hoisted(() => ({
  user: {
    userId: 'staff-a',
    permissions: ['invoices.read', 'invoices.publish'],
  },
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/invoices/invoice-documents-api', () => ({
  readInvoicePublication: vi.fn(),
  changeInvoicePublication: vi.fn(),
}));
const base = {
  publication: {
    documentId: 'doc-a',
    version: 0,
    isPublished: false,
    updatedAt: null,
  },
  history: [],
  count: 0,
  offset: 0,
  limit: 25,
};
const published = {
  ...base,
  publication: {
    ...base.publication,
    version: 1,
    isPublished: true,
    updatedAt: '2026-10-13T12:00:00Z',
  },
};
const fill = () => {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'دلیل تغییر دسترسی فاکتور' }),
    { target: { value: 'Private operator decision' } },
  );
  fireEvent.click(screen.getByRole('checkbox'));
};
const submit = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'انتشار فاکتور در پنل مشتری' }),
  );
describe('Invoice publication explicit commands and authoritative recovery', () => {
  beforeEach(() => {
    auth.user = {
      userId: 'staff-a',
      permissions: ['invoices.read', 'invoices.publish'],
    };
    vi.mocked(readInvoicePublication)
      .mockReset()
      .mockResolvedValueOnce(base)
      .mockResolvedValue(published);
    vi.mocked(changeInvoicePublication)
      .mockReset()
      .mockResolvedValue({
        publication: published.publication,
        replayed: false,
      });
  });
  it('unauthorized users do not query private status; readers have no mutation controls', async () => {
    auth.user.permissions = [];
    const view = render(<InvoicePublication id="doc-a" />);
    expect(readInvoicePublication).not.toHaveBeenCalled();
    auth.user.permissions = ['invoices.read'];
    view.rerender(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    expect(
      screen.queryByRole('button', { name: 'انتشار فاکتور در پنل مشتری' }),
    ).not.toBeInTheDocument();
  });
  it('requires an explicit reason and review, sends only versions/visibility and reads the current head', async () => {
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    expect(
      screen.getByRole('button', { name: 'انتشار فاکتور در پنل مشتری' }),
    ).toBeDisabled();
    fill();
    submit();
    await screen.findByText('دسترسی مشتری: منتشرشده — نسخهٔ 1');
    expect(changeInvoicePublication).toHaveBeenCalledWith(
      'doc-a',
      {
        expectedVersion: 0,
        isPublished: true,
        reason: 'Private operator decision',
      },
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(screen.getByText('/account/invoices/doc-a')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /پرداخت|تسویه/ }),
    ).not.toBeInTheDocument();
  });
  it('unknown result locks the original decision and retries the same key only after a successful read', async () => {
    vi.mocked(changeInvoicePublication).mockRejectedValueOnce(
      new ApiNetworkError('private response'),
    );
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText(/نتیجهٔ فرمان نامشخص است/);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByText('private response')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'بازخوانی و بررسی همان فرمان دسترسی',
      }),
    );
    await screen.findByText('دسترسی مشتری: منتشرشده — نسخهٔ 1');
    const calls = vi.mocked(changeInvoicePublication).mock.calls;
    expect(calls[1].slice(0, 3)).toEqual(calls[0].slice(0, 3));
    expect(readInvoicePublication).toHaveBeenCalledTimes(3);
  });
  it('failed reconciliation does not resend an uncertain write', async () => {
    vi.mocked(changeInvoicePublication).mockRejectedValueOnce(
      new ApiNetworkError('lost'),
    );
    vi.mocked(readInvoicePublication)
      .mockReset()
      .mockResolvedValueOnce(base)
      .mockRejectedValue(new ApiNetworkError('offline'));
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText(/نتیجهٔ فرمان نامشخص است/);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'بازخوانی و بررسی همان فرمان دسترسی',
      }),
    );
    await waitFor(() =>
      expect(readInvoicePublication).toHaveBeenCalledTimes(2),
    );
    expect(changeInvoicePublication).toHaveBeenCalledTimes(1);
  });
  it('replayed older publication never overrides the current revoked visibility', async () => {
    const revoked = {
      ...base,
      publication: { ...published.publication, version: 2, isPublished: false },
    };
    vi.mocked(readInvoicePublication)
      .mockReset()
      .mockResolvedValueOnce(base)
      .mockResolvedValue(revoked);
    vi.mocked(changeInvoicePublication).mockResolvedValue({
      publication: published.publication,
      replayed: true,
    });
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 2');
    expect(
      screen.queryByText('/account/invoices/doc-a'),
    ).not.toBeInTheDocument();
  });
  it('version refusal clears confirmation and requires a fresh read/review', async () => {
    vi.mocked(changeInvoicePublication).mockRejectedValueOnce(
      new ApiClientError({
        code: 'INVOICE_PUBLICATION_CONFLICT',
        statusCode: 409,
        message: 'private diagnostic',
        requestId: 'test',
      }),
    );
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText(/نسخهٔ پیش‌فاکتور، سفارش مبنا/);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'انتشار فاکتور در پنل مشتری' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'بازخوانی دسترسی فاکتور' }),
    );
    await screen.findByText('دسترسی مشتری: منتشرشده — نسخهٔ 1');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('authoritative success survives follow-up read failure without showing stale visibility', async () => {
    vi.mocked(readInvoicePublication)
      .mockReset()
      .mockResolvedValueOnce(base)
      .mockRejectedValueOnce(new ApiNetworkError('offline'));
    render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText(
      'فرمان دسترسی ثبت شد. وضعیت دسترسی را از سرور بازخوانی کنید.',
    );
    await screen.findByText(/نتیجه تأیید نشد/);
    expect(
      screen.queryByText('دسترسی مشتری: خصوصی — نسخهٔ 0'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'بازخوانی و بررسی همان فرمان دسترسی',
      }),
    ).not.toBeInTheDocument();
  });
  it('unmount during reconciliation prevents delayed replay for a different identity', async () => {
    let release!: (value: typeof base) => void;
    vi.mocked(readInvoicePublication)
      .mockReset()
      .mockResolvedValueOnce(base)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
    vi.mocked(changeInvoicePublication).mockRejectedValueOnce(
      new ApiNetworkError('lost'),
    );
    const view = render(<InvoicePublication id="doc-a" />);
    await screen.findByText('دسترسی مشتری: خصوصی — نسخهٔ 0');
    fill();
    submit();
    await screen.findByText(/نتیجهٔ فرمان نامشخص است/);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'بازخوانی و بررسی همان فرمان دسترسی',
      }),
    );
    await waitFor(() =>
      expect(readInvoicePublication).toHaveBeenCalledTimes(2),
    );
    view.unmount();
    await act(async () => release(base));
    expect(changeInvoicePublication).toHaveBeenCalledTimes(1);
  });
});
