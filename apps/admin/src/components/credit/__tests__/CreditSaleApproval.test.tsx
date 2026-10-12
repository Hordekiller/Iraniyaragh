import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { CreditSaleApproval } from '../CreditSaleApproval';
const mocks = vi.hoisted(() => ({ permissions: ['credit.read', 'credit.approve', 'orders.manage'] as string[], statement: vi.fn(), approve: vi.fn(), saved: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { permissions: mocks.permissions } }) }));
vi.mock('@/lib/credit/credit-api', () => ({ getCreditStatement: mocks.statement, approveCreditSale: mocks.approve }));
const money = (amount: string) => ({ amount, currency: 'IRR' });
const account = { id: 'own-account', customerId: 'own-customer', version: 7, status: 'ACTIVE', outstanding: money('1000'), availableCredit: money('3000'), overdue: money('0'), termsDays: 30 };
const statement = { account, documents: [], total: 0, offset: 0, limit: 25 };
const mount = (total = '2000') => render(<CreditSaleApproval customerId="own-customer" orderId="staff-order" orderVersion={4} orderTotal={total} onApproved={mocks.saved} />);
const confirm = () => screen.findByRole('button', { name: 'تأیید فروش نسیه و ثبت بدهی' });
beforeEach(() => { vi.clearAllMocks(); mocks.statement.mockReset(); mocks.approve.mockReset(); mocks.saved.mockReset(); mocks.permissions = ['credit.read', 'credit.approve', 'orders.manage']; mocks.statement.mockResolvedValue(statement); mocks.approve.mockResolvedValue({ account, order: { id: 'staff-order', status: 'CREDIT_APPROVED', version: 5 } }); mocks.saved.mockResolvedValue(undefined); });
describe('Staff credit approval with authoritative versions and ambiguous replay', () => {
  it('does not fetch financial data without all UI permissions', () => {
    mocks.permissions = ['orders.manage']; mount(); expect(mocks.statement).not.toHaveBeenCalled(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it.each([null, { ...account, status: 'SUSPENDED' }, { ...account, overdue: money('1') }, { ...account, availableCredit: money('1999') }])('disables approval for missing/inactive/overdue/insufficient credit', async current => {
    mocks.statement.mockResolvedValue({ ...statement, account: current }); mount();
    await waitFor(() => expect(screen.queryByText('در حال بررسی اعتبار…')).not.toBeInTheDocument());
    expect(await confirm()).toBeDisabled(); expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('posts only the authoritative versions and freezes repeated submits until confirmation', async () => {
    let resolve!: (value: unknown) => void; mocks.approve.mockReturnValue(new Promise(done => { resolve = done; })); mount();
    const button = await confirm(); await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.approve).toHaveBeenCalledWith('own-customer', 'staff-order', { expectedVersion: 7, expectedOrderVersion: 4 }, expect.stringMatching(/^credit-/));
    resolve({ account }); await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
  });
  it('uses the same captured versions and key after an ambiguous response even if refreshed policy changes', async () => {
    mocks.approve.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce({ account }); mount();
    const button = await confirm(); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    const retry = await screen.findByRole('button', { name: 'بررسی و تکرار همان تأیید' });
    const original = mocks.approve.mock.calls[0]; mocks.statement.mockResolvedValue({ ...statement, account: { ...account, version: 100 } });
    fireEvent.click(retry); await waitFor(() => expect(mocks.approve).toHaveBeenCalledTimes(2));
    expect(mocks.approve.mock.calls[1]).toEqual(original); expect(mocks.saved).toHaveBeenCalledTimes(1);
  });
  it('never retries an ambiguous approval if reconciliation itself fails', async () => {
    mocks.approve.mockRejectedValue(new ApiNetworkError('offline')); mount();
    const button = await confirm(); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    const retry = await screen.findByRole('button', { name: 'بررسی و تکرار همان تأیید' }); mocks.statement.mockRejectedValue(new ApiNetworkError('offline'));
    fireEvent.click(retry); await waitFor(() => expect(mocks.statement).toHaveBeenCalledTimes(2)); expect(mocks.approve).toHaveBeenCalledTimes(1); expect(mocks.saved).not.toHaveBeenCalled();
  });
  it('displays sanitized deterministic provider-independent failure and no false saved state', async () => {
    mocks.approve.mockRejectedValue(new ApiClientError({ code: 'CREDIT_PAYMENT_CONFLICT', statusCode: 409, message: 'raw-private-diagnostic', requestId: 'safe-request' })); mount();
    const button = await confirm(); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(await screen.findByText(/تلاش پرداخت ثبت شده/)).toBeInTheDocument(); expect(screen.queryByText('raw-private-diagnostic')).not.toBeInTheDocument(); expect(mocks.saved).not.toHaveBeenCalled();
  });
});
