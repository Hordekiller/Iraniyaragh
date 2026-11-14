import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setHelperEnabled, setHelperOpen } from '../../lib/help-tour-state'
import { jsonRequest } from '../../lib/auth/request'
import { ContactLauncher } from './ContactLauncher'

vi.mock('../../lib/auth/request', () => ({ jsonRequest: vi.fn() }))
const links = [
  { id: 'ig', channel: 'instagram', label: 'اینستاگرام', value: 'https://instagram.com/iraniyaragh' },
  { id: 'wa', channel: 'whatsapp', label: 'واتس‌اپ', value: 'https://wa.me/989000000000' },
  { id: 'bale', channel: 'bale', label: 'بله', value: 'https://ble.ir/iraniyaragh' },
  { id: 'phone', channel: 'phone', label: 'تلفن', value: '02112345678' },
] as const

const mount = () => render(<MemoryRouter><ContactLauncher /></MemoryRouter>)
beforeEach(() => { setHelperEnabled(true); setHelperOpen(false); vi.mocked(jsonRequest).mockResolvedValue({ data: { links } } as never) })
afterEach(() => { setHelperEnabled(null); setHelperOpen(false); vi.clearAllMocks() })

describe('ContactLauncher', () => {
  it('shows the configured channels, uses safe link targets, and closes on Escape', async () => {
    mount()
    const trigger = await screen.findByRole('button', { name: 'راه‌های ارتباط با فروشگاه' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'اینستاگرام' })).toHaveAttribute('href', 'https://instagram.com/iraniyaragh')
    expect(screen.getByRole('link', { name: 'واتس‌اپ' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'بله' })).toHaveAttribute('href', 'https://ble.ir/iraniyaragh')
    expect(screen.getByRole('link', { name: 'تلفن' })).toHaveAttribute('href', 'tel:02112345678')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('hides unconfigured and unsafe channels and avoids the open helper', async () => {
    vi.mocked(jsonRequest).mockResolvedValueOnce({ data: { links: [{ ...links[0], value: 'javascript:alert(1)' }] } } as never)
    const { unmount } = mount()
    await waitFor(() => expect(jsonRequest).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'راه‌های ارتباط با فروشگاه' })).toBeNull()
    unmount()
    vi.mocked(jsonRequest).mockResolvedValue({ data: { links } } as never)
    setHelperOpen(true)
    mount()
    await waitFor(() => expect(jsonRequest).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'راه‌های ارتباط با فروشگاه' })).toBeNull()
  })
})
