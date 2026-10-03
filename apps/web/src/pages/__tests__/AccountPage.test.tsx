import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/Toast'
import { AccountAddressesPage } from '../AccountAddressesPage'
import { AccountPage } from '../AccountPage'
import { AccountSecurityPage } from '../AccountSecurityPage'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  open: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../../state/auth-context', () => ({
  useAuth: () => ({
    state: { phase: 'authenticated', principal: { userId: 'user_opaque' } },
    controller: { open: mocks.open, logout: mocks.logout },
    request: mocks.request,
    open: mocks.open,
    close: vi.fn(),
  }),
}))

const account = {
  id: 'customer-id', mobile: '+989121234567', firstName: 'آوا', lastName: 'رضایی', version: 3,
  addresses: [],
}

function renderAccount() {
  return render(<MemoryRouter><ToastProvider><AccountPage /></ToastProvider></MemoryRouter>)
}

describe('AccountPage', () => {
  afterEach(() => { vi.clearAllMocks() })

  it('loads the signed-in customer profile and exposes account destinations', async () => {
    mocks.request.mockResolvedValue({ data: { account } })
    renderAccount()

    expect(await screen.findByDisplayValue('آوا')).toBeInTheDocument()
    expect(screen.getByDisplayValue('رضایی')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+989121234567')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /سفارش‌های من/ })).toHaveAttribute('href', '/orders')
    expect(screen.getByRole('link', { name: /دفتر نشانی‌ها/ })).toHaveAttribute('href', '/account/addresses')
    expect(screen.getByRole('link', { name: /امنیت و نشست‌ها/ })).toHaveAttribute('href', '/account/security')
  })

  it('saves profile fields with optimistic version and an idempotency key', async () => {
    mocks.request.mockResolvedValueOnce({ data: { account } }).mockResolvedValueOnce({ data: { account: { ...account, firstName: 'نیکا', version: 4 } } })
    renderAccount()
    fireEvent.change(await screen.findByLabelText('نام'), { target: { value: 'نیکا' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    expect(mocks.request).toHaveBeenLastCalledWith('/api/v1/customers/me', expect.objectContaining({
      method: 'PATCH', json: { expectedVersion: 3, firstName: 'نیکا', lastName: 'رضایی' },
      headers: { 'Idempotency-Key': expect.stringMatching(/^customer-profile-/u) },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('اطلاعات پروفایل ذخیره شد.')
  })

  it('keeps failed profile requests visible and offers retry', async () => {
    mocks.request.mockRejectedValue(new Error('offline'))
    renderAccount()
    expect(await screen.findByRole('alert')).toHaveTextContent('اطلاعات حساب دریافت نشد')
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toBeInTheDocument()
  })

  it('creates a customer address through the self-service contract', async () => {
    mocks.request.mockResolvedValueOnce({ data: { account: { ...account, addresses: [] } } }).mockResolvedValueOnce({
      data: { account: { ...account, version: 4, addresses: [{ id: 'address-1', label: 'خانه', receiverName: 'آوا رضایی', mobile: '09121234567', provinceCode: 'THR', city: 'تهران', addressLine: 'خیابان نمونه', postalCode: null, isDefault: true, createdAt: '', updatedAt: '' }] } },
    })
    render(<MemoryRouter><AccountAddressesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /افزودن نشانی/ }))
    fireEvent.change(screen.getByLabelText('عنوان نشانی'), { target: { value: 'خانه' } })
    fireEvent.change(screen.getByLabelText('نام تحویل‌گیرنده'), { target: { value: 'آوا رضایی' } })
    fireEvent.change(screen.getByLabelText('موبایل تحویل‌گیرنده'), { target: { value: '09121234567' } })
    fireEvent.change(screen.getByLabelText('استان'), { target: { value: 'تهران' } })
    fireEvent.change(screen.getByLabelText('شهر'), { target: { value: 'تهران' } })
    fireEvent.change(screen.getByLabelText('نشانی کامل'), { target: { value: 'خیابان نمونه' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره نشانی‌ها' }))

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    expect(mocks.request).toHaveBeenLastCalledWith('/api/v1/customers/me/addresses', expect.objectContaining({
      method: 'PUT', json: { expectedVersion: 3, addresses: [expect.objectContaining({ label: 'خانه', city: 'تهران', isDefault: true })] },
      headers: { 'Idempotency-Key': expect.stringMatching(/^customer-addresses-/u) },
    }))
  })

  it('loads and revokes only listed customer sessions through the versioned auth API', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.request.mockResolvedValueOnce({ data: { sessions: [{
      sessionId: 'session-12345678', current: false, deviceName: 'مرورگر', authenticationLevel: 'CUSTOMER_OTP',
      createdAt: '2026-01-01T00:00:00.000Z', lastUsedAt: null, expiresAt: '2026-01-02T00:00:00.000Z',
    }] } }).mockResolvedValueOnce({ data: {} })
    render(<MemoryRouter><AccountSecurityPage /></MemoryRouter>)

    expect(await screen.findByText('مرورگر')).toBeInTheDocument()
    expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/sessions')
    fireEvent.click(screen.getByRole('button', { name: 'بستن نشست' }))
    await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith('/api/v1/auth/sessions/session-12345678', { method: 'DELETE' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.queryByText('مرورگر')).not.toBeInTheDocument()
    confirm.mockRestore()
  })
})
