import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyPage } from '../PrivacyPage'
import { TermsPage } from '../TermsPage'

const returns = vi.hoisted(() => ({ answer: (): Promise<unknown> => Promise.resolve({ data: { enabled: false } }) }))
vi.mock('../../lib/auth/request', () => ({ jsonRequest: vi.fn(() => returns.answer()) }))

describe('restored legal pages', () => {
  beforeEach(() => { returns.answer = () => Promise.resolve({ data: { enabled: false } }) })
  it('describes server-held guest carts and actual customer self-service without invented contacts', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'حریم خصوصی' })).toBeInTheDocument()
    expect(screen.getByText(/سبد مهمان در سامانهٔ فروشگاه نگهداری/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'حساب کاربری' })).toHaveAttribute('href', '/account')
    expect(screen.getByText(/بستن دائمی حساب در حال حاضر فراهم نیست/)).toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
    expect(screen.getByText(/اطلاعات تماس تأییدشدهٔ فروشگاه هنوز منتشر نشده/)).toBeInTheDocument()
  })
  it('publishes exactly the announced return window and manual refund only while returns are switched on', async () => {
    returns.answer = () => Promise.resolve({ data: { enabled: true } })
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(await screen.findByText(/برای سفارشی که حضوری تحویل می‌گیرید ۲ روز کاری/)).toBeInTheDocument()
    expect(screen.getByText(/۱ هفته \(۷ روز\)/)).toBeInTheDocument()
    expect(screen.getByText(/مهلت از زمان صدور فاکتور سفارش آغاز می‌شود/)).toBeInTheDocument()
    expect(screen.getByText(/استرداد وجه پس از ثبت مرجوعی توسط فروشگاه و به‌صورت دستی انجام می‌شود/)).toBeInTheDocument()
    expect(screen.getByText(/کالای ساخت سفارشی \(درب سفارشی\) مشمول این روند مرجوعی نیست/)).toBeInTheDocument()
    // Not announced by the seller yet: no invented conditions for cancellation, item condition or warranty.
    expect(screen.getByText(/شرایط لغو سفارش پس از پرداخت، شرایط وضعیت کالای مرجوعی و خدمات پس از فروش/)).toBeInTheDocument()
  })
  it.each([
    ['switched off', () => Promise.resolve({ data: { enabled: false } })],
    ['unreachable', () => Promise.reject(new Error('offline'))],
    ['malformed', () => Promise.resolve({ data: { enabled: 'yes' } })],
  ])('does not advertise a return window when returns are %s', async (_name, answer) => {
    returns.answer = answer as () => Promise<unknown>
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/مهلت و شرایط مرجوعی کالا، و خدمات پس از فروش/)).toBeInTheDocument())
    expect(screen.queryByText(/۲ روز کاری/)).not.toBeInTheDocument()
    expect(screen.queryByText(/۱ هفته/)).not.toBeInTheDocument()
  })
  it('keeps unapproved return policies explicit and never promises payment-provider availability', () => {
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(screen.getByText(/در صورت فعال بودن درگاه/)).toBeInTheDocument()
    expect(screen.getByText(/ثبت سفارش به معنی پرداخت نیست/)).toBeInTheDocument()
    expect(screen.getAllByText(/در انتظار اعلام فروشنده/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'حریم خصوصی' })).toHaveAttribute('href', '/policies/privacy')
  })
})
