import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoicePdfCapacityConfig } from '@iranyaragh/contracts';
import { InvoicePdfCapacityCard } from './InvoicePdfCapacityCard';
import { ApiClientError } from '@/lib/api/client';
import { readInvoicePdfCapacity, saveInvoicePdfCapacity } from '@/lib/settings/invoice-pdf-capacity-api';

const auth = vi.hoisted(() => ({ user: { userId: 'owner', permissions: ['settings.manage'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/invoice-pdf-capacity-api', () => ({ readInvoicePdfCapacity: vi.fn(), saveInvoicePdfCapacity: vi.fn() }));

const none: InvoicePdfCapacityConfig = { configured: false, enabled: false, version: 0, budgetMegabytes: 0, maxArtifacts: 0, maxPendingJobs: 0, storedBytes: 0, artifactCount: 0, pendingJobCount: 0 };
const approved = (over: Partial<InvoicePdfCapacityConfig> = {}): InvoicePdfCapacityConfig => ({
  configured: true, enabled: true, version: 1, budgetMegabytes: 64, maxArtifacts: 500, maxPendingJobs: 3, storedBytes: 2 * 1024 * 1024, artifactCount: 7, pendingJobCount: 1, ...over });
const failure = (code: string, statusCode: number) => new ApiClientError({ code, message: code, requestId: 'r', statusCode } as ConstructorParameters<typeof ApiClientError>[0]);
const toggle = () => screen.getByRole('switch', { name: 'ساخت و دریافت فایل PDF فاکتور فعال باشد' });
const save = () => screen.getByRole('button', { name: 'ذخیره' });

describe('invoice PDF capacity setting', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readInvoicePdfCapacity).mockReset().mockResolvedValue(none);
    vi.mocked(saveInvoicePdfCapacity).mockReset().mockResolvedValue(approved({ storedBytes: 0, artifactCount: 0, pendingJobCount: 0 }));
  });

  it('renders nothing and reads nothing without settings.manage', () => {
    auth.user.permissions = ['invoices.read'];
    const { container } = render(<InvoicePdfCapacityCard />);
    expect(container).toBeEmptyDOMElement();
    expect(readInvoicePdfCapacity).not.toHaveBeenCalled();
  });

  it('shows an unapproved store as off with suggestions and approves it only on an explicit save', async () => {
    render(<InvoicePdfCapacityCard />);
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(screen.getByText(/هنوز تأیید نشده است/u)).toBeVisible();
    expect(screen.getByTestId('invoice-pdf-capacity-usage')).toHaveTextContent('تأییدنشده');
    expect(save()).toBeDisabled();
    fireEvent.click(toggle());
    fireEvent.click(save());
    await waitFor(() => expect(saveInvoicePdfCapacity).toHaveBeenCalledWith({ expectedVersion: 0, enabled: true, budgetMegabytes: 64, maxArtifacts: 500, maxPendingJobs: 3 }));
    expect(await screen.findByText(/تأیید و فعال شد/u)).toBeVisible();
    expect(toggle()).toBeChecked();
  });

  it('shows approved usage and blocks saving invalid numbers', async () => {
    vi.mocked(readInvoicePdfCapacity).mockResolvedValue(approved());
    render(<InvoicePdfCapacityCard />);
    await waitFor(() => expect(toggle()).toBeChecked());
    expect(screen.getByTestId('invoice-pdf-capacity-usage')).toHaveTextContent('۲ از ۶۴ مگابایت');
    expect(screen.getByTestId('invoice-pdf-capacity-usage')).toHaveTextContent('۷ از ۵۰۰');
    const budget = screen.getByRole('textbox', { name: 'سقف فضای ذخیره (مگابایت)' });
    for (const bad of ['0', '2000', '1.5', 'abc', '']) {
      fireEvent.change(budget, { target: { value: bad } });
      expect(save(), bad).toBeDisabled();
    }
    fireEvent.change(budget, { target: { value: '128' } });
    fireEvent.click(save());
    await waitFor(() => expect(saveInvoicePdfCapacity).toHaveBeenCalledWith({ expectedVersion: 1, enabled: true, budgetMegabytes: 128, maxArtifacts: 500, maxPendingJobs: 3 }));
  });

  it('never reports success for a refused or unconfirmed save and reloads after a stale version', async () => {
    vi.mocked(saveInvoicePdfCapacity).mockRejectedValueOnce(failure('AUTH_REAUTHENTICATION_REQUIRED', 401))
      .mockRejectedValueOnce(failure('CAPACITY_BELOW_USAGE', 409)).mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(failure('STALE_VERSION', 409));
    render(<InvoicePdfCapacityCard />);
    await waitFor(() => expect(toggle()).not.toBeChecked());
    for (const expected of [/تأیید تازهٔ رمز عبور/u, /کمتر از مقدار ذخیره‌شده/u, /تنظیم تأیید نشد/u, /در این فاصله تغییر کرده/u]) {
      if (!(toggle() as HTMLInputElement).checked) fireEvent.click(toggle());
      await waitFor(() => expect(save()).toBeEnabled());
      fireEvent.click(save());
      expect(await screen.findByText(expected)).toBeVisible();
      expect(screen.queryByText(/تأیید و فعال شد/u)).toBeNull();
    }
    await waitFor(() => expect(readInvoicePdfCapacity).toHaveBeenCalledTimes(2));
  });
});
