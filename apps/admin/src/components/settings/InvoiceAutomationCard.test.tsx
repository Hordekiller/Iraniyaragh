import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceAutomationConfig } from '@iranyaragh/contracts';
import { InvoiceAutomationCard } from './InvoiceAutomationCard';
import { ApiClientError } from '@/lib/api/client';
import { readInvoiceAutomation, saveInvoiceAutomation } from '@/lib/settings/invoice-automation-api';

const auth = vi.hoisted(() => ({ user: { userId: 'owner', permissions: ['settings.manage'] as string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/invoice-automation-api', () => ({ readInvoiceAutomation: vi.fn(), saveInvoiceAutomation: vi.fn() }));

const config = (over: Partial<InvoiceAutomationConfig> = {}): InvoiceAutomationConfig => ({
  enabled: false, version: 0, updatedAt: null, authorizedById: null, policyReady: true, pendingOrders: 2, unpublishedInvoices: 0, ...over });
const failure = (code: string, statusCode: number) => new ApiClientError({ code, message: code, requestId: 'r', statusCode } as ConstructorParameters<typeof ApiClientError>[0]);
const toggle = () => screen.getByRole('switch', { name: 'صدور و انتشار خودکار فاکتور برای سفارش‌های پرداخت‌شده' });

describe('invoice automation setting', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readInvoiceAutomation).mockReset().mockResolvedValue(config());
    vi.mocked(saveInvoiceAutomation).mockReset().mockResolvedValue(config({ enabled: true, version: 1, updatedAt: '2026-11-10T10:00:00.000Z', authorizedById: 'owner' }));
  });

  it('renders nothing and reads nothing without settings.manage', () => {
    auth.user.permissions = ['invoices.read'];
    const { container } = render(<InvoiceAutomationCard />);
    expect(container).toBeEmptyDOMElement();
    expect(readInvoiceAutomation).not.toHaveBeenCalled();
  });

  it('shows the default off state with the waiting orders and saves an explicit change with its version', async () => {
    render(<InvoiceAutomationCard />);
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(screen.getByTestId('invoice-automation-pending')).toHaveTextContent('۲');
    expect(screen.getByRole('button', { name: 'ذخیره' })).toBeDisabled();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(saveInvoiceAutomation).toHaveBeenCalledWith({ expectedVersion: 0, enabled: true }));
    expect(await screen.findByText(/روشن شد/u)).toBeVisible();
    expect(toggle()).toBeChecked();
  });

  it('warns when no active invoice policy exists', async () => {
    vi.mocked(readInvoiceAutomation).mockResolvedValue(config({ policyReady: false }));
    render(<InvoiceAutomationCard />);
    expect(await screen.findByText(/تنظیمات فاکتور هنوز فعال نیست/u)).toBeVisible();
  });

  it('never reports success for a refused or unconfirmed save and reloads after a stale version', async () => {
    vi.mocked(saveInvoiceAutomation).mockRejectedValueOnce(failure('AUTH_REAUTHENTICATION_REQUIRED', 401))
      .mockRejectedValueOnce(failure('FORBIDDEN', 403)).mockRejectedValueOnce(failure('STALE_VERSION', 409)).mockRejectedValueOnce(new Error('network'));
    render(<InvoiceAutomationCard />);
    await waitFor(() => expect(toggle()).not.toBeChecked());
    fireEvent.click(toggle());
    for (const expected of [/تأیید تازهٔ رمز عبور/u, /مجوز صدور و انتشار فاکتور/u, /در این فاصله تغییر کرده/u]) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'ذخیره' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
      expect(await screen.findByText(expected)).toBeVisible();
      expect(screen.queryByText(/روشن شد/u)).toBeNull();
    }
    await waitFor(() => expect(readInvoiceAutomation).toHaveBeenCalledTimes(2));
  });
});
