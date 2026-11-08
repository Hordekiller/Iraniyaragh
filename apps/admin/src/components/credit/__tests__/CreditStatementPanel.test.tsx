import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditEntryKind, CreditLedgerItem } from '@iranyaragh/contracts';
import { CreditStatementPanel } from '../CreditStatementPanel';
import { getCreditLedgerPage, getCreditStatementPage } from '@/lib/credit/credit-api';

vi.mock('@/lib/credit/credit-api', () => ({ getCreditLedgerPage: vi.fn(), getCreditStatementPage: vi.fn() }));

const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const item = (id: string, kind: CreditEntryKind, amount: string, day: string): CreditLedgerItem => ({
  id, documentId: 'd1', receiptId: null, reversalOfId: null, kind, amount: money(amount), effectiveAt: `${day}T08:00:00.000Z`, createdAt: `${day}T08:00:00.000Z`,
});
const account = (outstanding: string) => ({ id: 'a', customerId: 'c', outstanding: money(outstanding) });
const documents = [{ id: 'd1', orderId: 'order-1', kind: 'SALE' }];

function serve(items: CreditLedgerItem[], outstanding: string) {
  vi.mocked(getCreditStatementPage).mockResolvedValue({ account: account(outstanding), documents, total: 1, offset: 0, limit: 100 } as never);
  vi.mocked(getCreditLedgerPage).mockImplementation((async (_c: string, offset: number, limit: number) => ({ items: [...items].reverse().slice(offset, offset + limit), total: items.length, offset, limit })) as never);
}
const load = async () => { render(<CreditStatementPanel customerId="c1" />); fireEvent.click(screen.getByRole('button', { name: 'دریافت صورت‌حساب' })); };

describe('CreditStatementPanel', () => {
  beforeEach(() => { vi.mocked(getCreditLedgerPage).mockReset(); vi.mocked(getCreditStatementPage).mockReset(); });

  it('loads nothing until the operator asks for the statement', () => {
    render(<CreditStatementPanel customerId="c1" />);
    expect(screen.getByRole('button', { name: 'دریافت صورت‌حساب' })).toBeVisible();
    expect(getCreditLedgerPage).not.toHaveBeenCalled();
  });

  it('shows debit, credit and a running balance that matches the server outstanding', async () => {
    serve([item('e1', 'SALE', '1000', '2026-10-01'), item('e2', 'RECEIPT', '-300', '2026-10-05')], '700');
    await load();
    const table = await screen.findByRole('table', { name: 'گردش حساب' });
    expect(within(table).getByText(/۷۰۰ ریال بدهکار/, { selector: 'td' })).toBeVisible();
    expect(screen.getByText(/برابر است/)).toBeVisible();
    expect(within(table).getByRole('link', { name: 'فروش نسیه' })).toHaveAttribute('href', '/orders/order-1');
    expect(screen.getByRole('button', { name: 'خروجی CSV' })).toBeEnabled();
  });

  it('refuses to present balances and disables export when the ledger does not add up', async () => {
    serve([item('e1', 'SALE', '1000', '2026-10-01')], '999');
    await load();
    expect(await screen.findByText(/برابر نیست/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'خروجی CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeDisabled();
  });

  it('shows an opening balance and only the chosen period', async () => {
    serve([item('e1', 'SALE', '1000', '2026-10-01'), item('e2', 'RECEIPT', '-300', '2026-10-05')], '700');
    await load();
    await screen.findByRole('table', { name: 'گردش حساب' });
    fireEvent.change(screen.getByLabelText('از تاریخ'), { target: { value: '2026-10-03' } });
    const table = screen.getByRole('table', { name: 'گردش حساب' });
    expect(within(table).getByText('مانده ابتدای دوره')).toBeVisible();
    expect(within(table).queryByRole('link', { name: 'فروش نسیه' })).not.toBeInTheDocument();
    expect(within(table).getByText('دریافت وجه')).toBeVisible();
  });

  it('flags an invalid period instead of silently showing nothing', async () => {
    serve([item('e1', 'SALE', '1000', '2026-10-01')], '1000');
    await load();
    await screen.findByRole('table', { name: 'گردش حساب' });
    fireEvent.change(screen.getByLabelText('از تاریخ'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('تا تاریخ'), { target: { value: '2026-10-01' } });
    expect(screen.getByText('تاریخ پایان قبل از آغاز است.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeDisabled();
  });

  it('exports the CSV of exactly what is shown', async () => {
    serve([item('e1', 'SALE', '1000', '2026-10-01')], '1000');
    const createObjectURL = vi.fn(() => 'blob:test');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    await load();
    fireEvent.click(await screen.findByRole('button', { name: 'خروجی CSV' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toContain('text/csv');
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(text).toContain(',1000,0,1000');
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('says it could not load, with a retry, and never shows a partial statement', async () => {
    vi.mocked(getCreditStatementPage).mockRejectedValueOnce(new Error('offline'));
    await load();
    expect(await screen.findByRole('alert')).toBeVisible();
    serve([item('e1', 'SALE', '5', '2026-10-01')], '5');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'گردش حساب' })).toBeVisible());
  });

  it('explains when the customer has no credit account', async () => {
    vi.mocked(getCreditStatementPage).mockResolvedValue({ account: null, documents: [], total: 0, offset: 0, limit: 100 } as never);
    await load();
    expect(await screen.findByText(/حساب اعتباری ثبت نشده/)).toBeVisible();
  });
});
