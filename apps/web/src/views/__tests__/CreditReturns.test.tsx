import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditReturns } from '../../components/account/CreditReturns'
const mocks=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../state/auth-context',()=>({useAuth:()=>({request:Object.assign(mocks.request,{forCurrentPrincipal:()=>mocks.request})})}))
const money=(amount:string)=>({amount,currency:'IRR'})
beforeEach(()=>vi.resetAllMocks())
describe('Owned customer credit-return projection',()=>{
 it('fetches only on demand through customer-self and distinguishes liability from payout',async()=>{
  mocks.request.mockResolvedValue({data:{items:[{id:'return',kind:'CANCEL',amount:money('2000'),debtCredit:money('1500'),refundDue:money('500'),refunded:money('0'),refundRemaining:money('500')}]}})
  render(<CreditReturns orderId="owned-order"/>);expect(mocks.request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button'))
  expect(await screen.findByText('بازپرداخت باقی‌مانده: ۵۰۰ ریال')).toBeInTheDocument()
  expect(screen.getByText('بازپرداخت ثبت‌شده: ۰ ریال')).toBeInTheDocument()
  expect(mocks.request).toHaveBeenCalledWith('/api/v1/customers/me/credit/orders/owned-order/returns')
 })
 it('shows an honest network failure and retries the same owned read',async()=>{
  mocks.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{items:[]}})
  render(<CreditReturns orderId="owned-order"/>);fireEvent.click(screen.getByRole('button'));expect(await screen.findByRole('alert')).toHaveTextContent('اسناد برگشت دریافت نشد')
  fireEvent.click(screen.getByRole('button'));expect(await screen.findByText('برای این فروش سند برگشت ثبت نشده است.')).toBeInTheDocument()
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(2))
 })
})
