import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/Toast'
import { AccountAddressesPage } from '../AccountAddressesPage'
import { AccountPage } from '../AccountPage'
import { AuthApiError } from '../../lib/auth/errors'
import { AccountSecurityPage } from '../AccountSecurityPage'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  open: vi.fn(),
  logout: vi.fn(),
  state: { phase: 'authenticated', restoring: false, principal: { userId: 'user_opaque' } },
}))

vi.mock('../../state/auth-context', () => ({
  useAuth: () => ({
    restored: true,
    state: mocks.state,
    controller: { open: mocks.open, logout: mocks.logout },
    request: Object.assign(mocks.request, { forCurrentPrincipal: () => mocks.request }),
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
  afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); mocks.state.phase = 'authenticated'; mocks.state.restoring = false; mocks.state.principal.userId = 'user_opaque' })

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

  it('offers a retry when the address book cannot be loaded', async () => {
    mocks.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { account } })
    render(<MemoryRouter><AccountAddressesPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('دفتر نشانی دریافت نشد')
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByText(/نشانی‌های ذخیره‌شده برای سفارش‌های بعدی/)).toBeInTheDocument()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
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
  it('keeps account navigation available when profile loading fails', async () => {
    mocks.request.mockRejectedValue(new Error('offline'))
    renderAccount()
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'دفتر نشانی‌ها' })).toHaveAttribute('href', '/account/addresses')
    expect(screen.getByRole('link', { name: 'سبد خرید' })).toHaveAttribute('href', '/cart')
  })

  it('waits for actual session restoration instead of showing a login wall', () => {
    mocks.state.phase = 'idle'
    mocks.state.restoring = true
    renderAccount()
    expect(screen.getByRole('status')).toHaveTextContent('در حال بازیابی نشست')
    expect(screen.queryByRole('button', { name: 'ورود / ثبت‌نام' })).not.toBeInTheDocument()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('rebases a version conflict only on explicit refresh and preserves the profile draft', async () => {
    mocks.request.mockResolvedValueOnce({ data: { account } })
      .mockRejectedValueOnce(new AuthApiError({ code: 'STALE_VERSION', statusCode: 409, message: 'changed' }))
      .mockResolvedValueOnce({ data: { account: { ...account, firstName: 'نام سرور', version: 7 } } })
      .mockResolvedValueOnce({ data: { account: { ...account, firstName: 'نیکا', version: 8 } } })
    renderAccount()
    fireEvent.change(await screen.findByLabelText('نام'), { target: { value: 'نیکا' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('در نشست دیگری')
    expect(screen.getByRole('button', { name: 'ذخیره پروفایل' })).toBeDisabled()
    const firstKey = mocks.request.mock.calls[1][1].headers['Idempotency-Key']
    fireEvent.click(screen.getByRole('button', { name: 'دریافت نسخه جدید با حفظ تغییرها' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'ذخیره پروفایل' })).toBeEnabled())
    expect(screen.getByLabelText('نام')).toHaveValue('نیکا')
    expect(mocks.request).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(4))
    expect(mocks.request.mock.calls[3][1].json).toEqual({ expectedVersion: 7, firstName: 'نیکا', lastName: 'رضایی' })
    expect(mocks.request.mock.calls[3][1].headers['Idempotency-Key']).not.toBe(firstKey)
  })

  it('locks edits and repeated submits, then replays the exact uncertain mutation', async () => {
    let reject!: (cause: Error) => void
    mocks.request.mockResolvedValueOnce({ data: { account } })
      .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
      .mockResolvedValueOnce({ data: { account: { ...account, firstName: 'نیکا', version: 4 } } })
    renderAccount()
    fireEvent.change(await screen.findByLabelText('نام'), { target: { value: 'نیکا' } })
    const form = screen.getByRole('button', { name: 'ذخیره پروفایل' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('نام')).toBeDisabled()
    await act(async () => reject(new Error('response lost')))
    expect(await screen.findByRole('alert')).toHaveTextContent('نتیجه ذخیره مشخص نیست')
    expect(screen.queryByText('اطلاعات پروفایل ذخیره شد.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('نام')).toBeDisabled()
    fireEvent.submit(form)
    await screen.findByText('اطلاعات پروفایل ذخیره شد.')
    expect(mocks.request.mock.calls[2]).toEqual(mocks.request.mock.calls[1])
  })

  it('discards another principal’s profile rather than rendering stale customer information', async () => {
    mocks.request.mockResolvedValueOnce({ data: { account } })
      .mockImplementationOnce(() => new Promise(() => undefined))
    const view = renderAccount()
    await screen.findByDisplayValue('+989121234567')
    mocks.state.principal.userId = 'different-user'
    view.rerender(<MemoryRouter><ToastProvider><AccountPage /></ToastProvider></MemoryRouter>)
    expect(screen.queryByDisplayValue('+989121234567')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت اطلاعات')
  })

  for (const deleted of [0, 1]) {
    it(`preserves exactly one default address when removing ${deleted === 0 ? 'a nondefault address' : 'the default address'}`, async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const addresses = [0, 1, 2].map((index) => ({
        id: `address-${index}`, label: `نشانی ${index}`, receiverName: 'مشتری آزمایشی', mobile: '+989121234567',
        provinceCode: 'TEH', city: 'تهران', addressLine: 'خیابان نمونه آزمایشی', postalCode: '1234567890',
        isDefault: index === 1, createdAt: '', updatedAt: '',
      }))
      mocks.request.mockResolvedValueOnce({ data: { account: { ...account, addresses } } })
        .mockResolvedValueOnce({ data: { account: { ...account, version: 4, addresses: [] } } })
      render(<MemoryRouter><AccountAddressesPage /></MemoryRouter>)
      const groups = await screen.findAllByRole('group')
      fireEvent.click(within(groups[deleted]).getByRole('button', { name: 'حذف نشانی' }))
      fireEvent.click(screen.getByRole('button', { name: 'ذخیره نشانی‌ها' }))
      await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
      const submitted = mocks.request.mock.calls[1][1].json.addresses
      expect(submitted).toHaveLength(2)
      expect(submitted.filter((item: { isDefault: boolean }) => item.isDefault)).toHaveLength(1)
      expect(submitted.find((item: { isDefault: boolean }) => item.isDefault).label).toBe(deleted === 0 ? 'نشانی 1' : 'نشانی 0')
      expect(submitted.every((item: Record<string, unknown>) => !('id' in item))).toBe(true)
      expect(submitted[0].mobile).toBe('09121234567')
    })
  }

  for (const statusCode of [400, 429]) {
    it(`keeps a ${statusCode} rejection editable without displaying raw API diagnostics`, async () => {
      mocks.request.mockResolvedValueOnce({ data: { account } })
        .mockRejectedValueOnce(new AuthApiError({ code: statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR', statusCode, message: 'sensitive-provider-detail', details: { private: 'do-not-display' } }))
      renderAccount()
      fireEvent.change(await screen.findByLabelText('نام'), { target: { value: 'نیکا' } })
      fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))
      const alert = await screen.findByRole('alert')
      expect(alert).not.toHaveTextContent('sensitive-provider-detail')
      expect(alert).not.toHaveTextContent('do-not-display')
      expect(screen.getByLabelText('نام')).toBeEnabled()
      expect(screen.getByLabelText('نام')).toHaveValue('نیکا')
      expect(screen.queryByText('اطلاعات پروفایل ذخیره شد.')).not.toBeInTheDocument()
    })
  }

})
