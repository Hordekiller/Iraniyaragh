import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountCreditPage } from '../AccountCreditPage'
const mocks = vi.hoisted(() => ({ request: vi.fn(), open: vi.fn(), identityVersion: 1, restored: true, state: { phase: 'authenticated', restoring: false, principal: { userId: 'own-user' } } }))
vi.mock('../../state/auth-context', () => ({ useAuth: () => ({ ...mocks, request: Object.assign(mocks.request, { forCurrentPrincipal: () => mocks.request }) }) }))
const money = (amount: string) => ({ amount, currency: 'IRR' })
const statement = { account: { id: 'own-account', customerId: 'own-customer', status: 'ACTIVE', outstanding: money('9007199254740993'), overdue: money('0'), availableCredit: money('100') }, documents: [{ id: 'own-document', kind: 'OPENING_BALANCE', originalAmount: money('9007199254740993'), effectivePrincipal: money('9007199254740993'), outstanding: money('9007199254740993'), dueAt: '2026-10-31T12:00:00Z', status: 'UNPAID' }], total: 1, offset: 0, limit: 25 }
const component = () => <MemoryRouter><AccountCreditPage /></MemoryRouter>
afterEach(() => { vi.resetAllMocks(); mocks.state.phase = 'authenticated'; mocks.state.restoring = false; mocks.state.principal.userId = 'own-user'; mocks.restored = true; mocks.identityVersion = 1 })
describe('Customer owned receivable statement', () => {
  it('requires login and never loads a staff/admin/customer-ID endpoint', () => {
    mocks.state.phase = 'anonymous'; render(component())
    expect(screen.getByText('برای مشاهدهٔ صورتحساب وارد شوید')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ورود / ثبت‌نام' })); expect(mocks.open).toHaveBeenCalledOnce(); expect(mocks.request).not.toHaveBeenCalled()
  })
  it('waits for session restoration before fetching private financial data', () => {
    mocks.state.phase = 'anonymous'; mocks.restored = false; render(component())
    expect(screen.getByRole('status')).toHaveTextContent('در حال بازیابی نشست'); expect(mocks.request).not.toHaveBeenCalled()
  })
  it('renders exact large IRR from the self contract without showing operator evidence or any mutation action', async () => {
    mocks.request.mockResolvedValue({ data: statement }); render(component())
    expect(await screen.findByText(/بدهی باز:/)).toHaveTextContent('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ ریال')
    expect(mocks.request).toHaveBeenCalledWith('/api/v1/customers/me/credit?offset=0&limit=25')
    expect(screen.getByRole('table', { name: 'اسناد بدهی شما' })).toHaveTextContent('پرداخت‌نشده')
    expect(screen.queryByRole('button', { name: /ثبت|اصلاح|برگشت/ })).not.toBeInTheDocument()
  })
  it('shows an honest empty state without fabricating an account', async () => {
    mocks.request.mockResolvedValue({ data: { account: null, documents: [], total: 0 } }); render(component())
    expect(await screen.findByText('حساب اعتباری برای شما ثبت نشده است.')).toBeInTheDocument()
    expect(screen.getByText('سند بدهی ثبت‌شده‌ای ندارید.')).toBeInTheDocument()
  })
  it('shows network failure and retries the same owned read', async () => {
    mocks.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: statement }); render(component())
    expect(await screen.findByRole('alert')).toHaveTextContent('صورتحساب دریافت نشد')
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByText(/بدهی باز:/)).toBeInTheDocument(); expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it('discards an old customer response after logout/new login', async () => {
    let resolve!: (value: unknown) => void
    mocks.request.mockImplementationOnce(() => new Promise(done => { resolve = done })); const view = render(component())
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    mocks.state.principal.userId = 'new-user'; mocks.identityVersion = 2
    mocks.request.mockResolvedValue({ data: { account: null, documents: [], total: 0 } }); view.rerender(component())
    expect(await screen.findByText('حساب اعتباری برای شما ثبت نشده است.')).toBeInTheDocument()
    await act(async () => { resolve({ data: statement }) })
    expect(screen.queryByText(/۹٬۰۰۷٬۱۹۹/)).not.toBeInTheDocument()
  })
  it('pages using only bounded offset, never a customer ownership parameter', async () => {
    mocks.request.mockResolvedValueOnce({ data: { ...statement, total: 26 } }).mockResolvedValueOnce({ data: { ...statement, documents: [], offset: 25, total: 26 } })
    render(component()); fireEvent.click(await screen.findByRole('button', { name: 'صفحهٔ بعد' }))
    await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith('/api/v1/customers/me/credit?offset=25&limit=25'))
    expect(await screen.findByText('سند بدهی ثبت‌شده‌ای ندارید.')).toBeInTheDocument()
  })
})
