import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditAccountSummary, CreditCommandResult, CreditLedgerPage, CreditStatement } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { CreditAccountView } from '../CreditAccountView';
const mocks = vi.hoisted(() => ({ permissions: ['credit.read', 'credit.manage', 'credit.opening', 'credit.receive', 'credit.adjust'] as string[], statement: vi.fn(), ledger: vi.fn(), policy: vi.fn(), opening: vi.fn(), receipt: vi.fn(), adjust: vi.fn(), reverse: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { permissions: mocks.permissions } }) }));
vi.mock('@/lib/credit/credit-api', () => ({ getCreditStatement: mocks.statement, getCreditLedger: mocks.ledger, saveCreditPolicy: mocks.policy, recordCreditOpening: mocks.opening, recordCreditReceipt: mocks.receipt, adjustCreditDocument: mocks.adjust, reverseCreditReceipt: mocks.reverse }));
const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const account: CreditAccountSummary = { id: 'account', customerId: 'customer', status: 'ACTIVE', version: 1, creditLimit: money('5000'), termsDays: 30, outstanding: money('1000'), availableCredit: money('4000'), overdue: money('0'), overLimit: false, openingRecorded: true, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const statement: CreditStatement = { account, documents: [{ id: 'doc-1', kind: 'OPENING_BALANCE', orderId: null, originalAmount: money('1000'), effectivePrincipal: money('1000'), outstanding: money('1000'), status: 'UNPAID', termsDays: 30, issuedAt: '2026-10-01T10:00:00Z', dueAt: '2026-10-31T10:00:00Z' }], total: 1, offset: 0, limit: 25 };
const ledger: CreditLedgerPage = { items: [], total: 0, offset: 0, limit: 25 };
const result: CreditCommandResult = { account: { ...account, version: 2, outstanding: money('500') }, receiptId: 'receipt', entryIds: ['entry'] };
const failure = (code: string, statusCode = 409) => new ApiClientError({ code, statusCode, message: 'private provider detail must not render', requestId: 'safe-request' });
beforeEach(() => {
  vi.clearAllMocks(); for (const fn of [mocks.statement, mocks.ledger, mocks.policy, mocks.opening, mocks.receipt, mocks.adjust, mocks.reverse]) fn.mockReset();
  mocks.permissions = ['credit.read', 'credit.manage', 'credit.opening', 'credit.receive', 'credit.adjust'];
  mocks.statement.mockResolvedValue(statement); mocks.ledger.mockResolvedValue(ledger);
});
async function fillReceipt(amount = '500') {
  fireEvent.click(await screen.findByRole('button', { name: 'ثبت دریافت واقعی' }));
  const dialog = screen.getByRole('dialog', { name: 'ثبت دریافت واقعی' });
  fireEvent.change(within(dialog).getByLabelText('مبلغ دریافت (ریال)', { exact: false }), { target: { value: amount } });
  fireEvent.change(within(dialog).getByLabelText('شناسهٔ سند مرجع', { exact: false }), { target: { value: 'isolated-receipt-reference' } });
  fireEvent.change(within(dialog).getByLabelText(/تخصیص به/), { target: { value: amount } });
  return dialog;
}
describe('Credit operator workflow and ambiguous outcome recovery', () => {
  it('does not fetch private data without the read permission', () => {
    mocks.permissions = []; render(<CreditAccountView customerId="customer" />);
    expect(screen.getByText('مجوز مشاهدهٔ اعتبار مشتری را ندارید.')).toBeInTheDocument(); expect(mocks.statement).not.toHaveBeenCalled();
  });
  it('renders an empty account and offers explicit policy configuration rather than an invented balance', async () => {
    mocks.statement.mockResolvedValue({ account: null, documents: [], total: 0, offset: 0, limit: 25 });
    render(<CreditAccountView customerId="customer" />);
    expect(await screen.findByText('برای این مشتری هنوز حساب اعتباری ثبت نشده است.')).toBeInTheDocument();
    expect(mocks.ledger).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'ثبت دریافت واقعی' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تنظیم اعتبار' }));
    const dialog = screen.getByRole('dialog', { name: 'تنظیم اعتبار مشتری' });
    expect(within(dialog).getByLabelText('سقف اعتبار (ریال)', { exact: false })).toHaveValue('0');
  });
  it('read-only staff see the ledger without mutation actions', async () => {
    mocks.permissions = ['credit.read']; render(<CreditAccountView customerId="customer" />);
    expect(await screen.findByText(/بدهی باز:/)).toHaveTextContent('۱٬۰۰۰ ریال');
    for (const name of ['تنظیم اعتبار', 'ثبت دریافت واقعی', 'اصلاح سند']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
  it('validates integer IRR before submission and converts Persian digits without floating-point math', async () => {
    render(<CreditAccountView customerId="customer" />);
    const dialog = await fillReceipt('1.5');
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید و ثبت' }));
    expect(await within(dialog).findByText(/مبلغ دریافت و تخصیص هر سند باید ریال صحیح/)).toBeInTheDocument(); expect(mocks.receipt).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('مبلغ دریافت (ریال)', { exact: false }), { target: { value: '۵۰۰' } });
    fireEvent.change(within(dialog).getByLabelText(/تخصیص به/), { target: { value: '۵۰۰' } });
    mocks.receipt.mockResolvedValue(result);
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید و ثبت' }));
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledWith('customer', expect.objectContaining({ expectedVersion: 1, amount: '500', allocations: [{ documentId: 'doc-1', amount: '500' }] }), expect.stringMatching(/^credit-/)));
  });
  it('keeps the exact payload/key after a timeout and prevents a second command until replay resolves', async () => {
    mocks.receipt.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce(result);
    render(<CreditAccountView customerId="customer" />);
    const dialog = await fillReceipt();
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید و ثبت' }));
    const retry = await within(dialog).findByRole('button', { name: 'بازخوانی و بررسی همان دستور' });
    expect(within(dialog).getByRole('button', { name: 'تأیید و ثبت' })).toBeDisabled();
    const original = mocks.receipt.mock.calls[0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalledTimes(2));
    expect(mocks.receipt.mock.calls[1]).toEqual(original);
    expect(await screen.findByText('دستور روی دفترکل ثبت شد.')).toBeInTheDocument();
  });
  it('does not replay an ambiguous write if reconciliation itself fails', async () => {
    mocks.receipt.mockRejectedValue(new ApiNetworkError('offline'));
    render(<CreditAccountView customerId="customer" />); const dialog = await fillReceipt();
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید و ثبت' }));
    const retry = await within(dialog).findByRole('button', { name: 'بازخوانی و بررسی همان دستور' });
    mocks.statement.mockRejectedValue(new ApiNetworkError('offline'));
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.statement).toHaveBeenCalledTimes(2));
    expect(mocks.receipt).toHaveBeenCalledTimes(1); expect(within(dialog).getByRole('button', { name: 'تأیید و ثبت' })).toBeDisabled();
  });
  it('shows version conflict safely, retains the draft and requires review instead of reporting success', async () => {
    mocks.receipt.mockRejectedValue(failure('CREDIT_VERSION_CONFLICT'));
    render(<CreditAccountView customerId="customer" />); const dialog = await fillReceipt();
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید و ثبت' }));
    expect(await within(dialog).findByText(/حساب هم‌زمان تغییر کرده/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('مبلغ دریافت (ریال)', { exact: false })).toHaveValue('500');
    expect(screen.queryByText('دستور روی دفترکل ثبت شد.')).not.toBeInTheDocument();
    expect(screen.queryByText(/private provider detail/)).not.toBeInTheDocument();
  });
  it('shows retry for a failed initial read', async () => {
    mocks.statement.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce(statement);
    render(<CreditAccountView customerId="customer" />);
    fireEvent.click(await screen.findByRole('button', { name: 'بازخوانی' }));
    expect(await screen.findByTestId('credit-outstanding')).toHaveTextContent('۱٬۰۰۰ ریال');
  });
});
