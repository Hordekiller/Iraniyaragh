import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrderDetail } from '@iranyaragh/contracts';
import { ApiNetworkError } from '@/lib/api/client';
import { CreditSaleCompensation } from '../CreditSaleCompensation';
const mocks = vi.hoisted(() => ({ permissions: ['credit.read','credit.adjust','orders.manage','inventory.adjust'], statement: vi.fn(), returns: vi.fn(), cancel: vi.fn(), receive: vi.fn(), payout: vi.fn(), changed: vi.fn(), warehouses: vi.fn(), locations: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff', permissions: mocks.permissions } }) }));
vi.mock('@/lib/credit/credit-api', () => ({ getCreditStatement: mocks.statement, getCreditReturns: mocks.returns, cancelCreditSale: mocks.cancel, receiveCreditReturn: mocks.receive, recordCreditRefundPayout: mocks.payout }));
vi.mock('@/lib/inventory/warehouses-api', () => ({ listWarehouses: mocks.warehouses, listLocations: mocks.locations }));
const money = (amount: string) => ({ amount,currency: 'IRR' });
const account = { id:'account',customerId:'customer',version:3,status:'ACTIVE',outstanding:money('1500') };
const order = { id:'credit-order',version:7,status:'CREDIT_APPROVED',customer:{id:'customer'},shipment:null,fulfillment:{status:'PENDING'},items:[{sku:'ACTUAL-SKU',quantity:2,unitPrice:money('1000')}] } as unknown as AdminOrderDetail;
const mount = (current = order) => render(<CreditSaleCompensation order={current} picks={{ fulfillment:{id:'fulfillment',status:'PENDING'},items:[{orderItemId:'actual-line',sku:'ACTUAL-SKU',productTitle:'Actual test goods',variantTitle:null,quantity:2,pick:null}] }} onChanged={mocks.changed} />);
async function fill() {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('شماره سند مرجع واقعی'),{target:{value:'actual-evidence'}});
  fireEvent.change(screen.getByLabelText('دلیل عملیات'),{target:{value:'Actual test reason'}});
  fireEvent.click(screen.getByRole('checkbox'));
}
beforeEach(() => { vi.clearAllMocks(); mocks.permissions = ['credit.read','credit.adjust','orders.manage','inventory.adjust']; mocks.statement.mockResolvedValue({account,documents:[]}); mocks.returns.mockResolvedValue({items:[]}); mocks.cancel.mockResolvedValue({account,returnId:'accepted-return'}); mocks.changed.mockResolvedValue(undefined); });
describe('Credit-sale cancellation and real refund UI', () => {
  it('does not read private credit information without permission', () => { mocks.permissions=[]; mount(); expect(mocks.statement).not.toHaveBeenCalled(); expect(mocks.returns).not.toHaveBeenCalled(); });
  it('requires evidence/confirmation and submits captured versions without invented financial amounts', async () => {
    mount(); const button = await screen.findByRole('button',{name:'لغو پیش از ارسال و بازگرداندن کالا به محل اصلی'}); expect(button).toBeDisabled(); await fill(); expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce());
    expect(mocks.cancel).toHaveBeenCalledWith('customer','credit-order',{expectedVersion:3,expectedOrderVersion:7,evidenceReference:'actual-evidence',reason:'Actual test reason'},expect.stringMatching(/^credit-/));
    expect(await screen.findByText(/فرمان ثبت شد/)).toBeInTheDocument(); expect(button).toBeDisabled();
  });
  it('freezes ambiguous payload/key and checks reads before identical replay', async () => {
    mocks.cancel.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce({account}); mount(); await fill(); fireEvent.click(screen.getByRole('button',{name:'لغو پیش از ارسال و بازگرداندن کالا به محل اصلی'}));
    const retry = await screen.findByRole('button',{name:'بررسی و تکرار همان فرمان'}); const original=mocks.cancel.mock.calls[0];
    expect(screen.getByLabelText('شماره سند مرجع واقعی')).toBeDisabled(); mocks.statement.mockResolvedValue({account:{...account,version:10},documents:[]}); fireEvent.click(retry);
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(2)); expect(mocks.cancel.mock.calls[1]).toEqual(original);
  });
  it('does not retry a write when reconciliation read fails', async () => {
    mocks.cancel.mockRejectedValue(new ApiNetworkError('offline')); mount(); await fill(); fireEvent.click(screen.getByRole('button',{name:'لغو پیش از ارسال و بازگرداندن کالا به محل اصلی'}));
    const retry=await screen.findByRole('button',{name:'بررسی و تکرار همان فرمان'}); mocks.returns.mockRejectedValue(new ApiNetworkError('offline')); fireEvent.click(retry);
    await waitFor(() => expect(mocks.returns).toHaveBeenCalledTimes(2)); expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.changed).not.toHaveBeenCalled();
  });
  it('shows a refund liability distinctly from actual completed payout without claiming transfer success', async () => {
    mocks.returns.mockResolvedValue({items:[{id:'return',kind:'CANCEL',createdAt:'2026-10-13T00:00:00Z',amount:money('2000'),debtCredit:money('1500'),refundDue:money('500'),refunded:money('0'),refundRemaining:money('500')}]});
    mocks.permissions.push('credit.receive'); mount();
    expect(await screen.findByRole('table',{name:'اسناد برگشت فروش نسیه'})).toHaveTextContent('۵۰۰ ریال');
    expect(screen.getByText(/این دکمه انتقال بانکی انجام نمی‌دهد/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'ثبت سند بازپرداخت انجام‌شده'})).toBeDisabled(); expect(mocks.payout).not.toHaveBeenCalled();
  });
});
