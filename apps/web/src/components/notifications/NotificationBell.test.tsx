import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../state/auth-context'
import { NotificationBell } from './NotificationBell'

const item = { id: 'n1', kind: 'PAYMENT_VERIFIED', title: 'پرداخت تأیید شد', body: 'پرداخت شما با موفقیت تأیید شد (سفارش A-1)', href: '/orders/o1', read: false, createdAt: '2026-11-04T08:00:00.000Z' }

function renderBell(phase: 'authenticated' | 'idle', request: ReturnType<typeof vi.fn>) {
  const value = { identityVersion: 1, restored: true, state: { phase, restoring: false }, request: request as never, open: vi.fn(), close: vi.fn() } as unknown as AuthContextValue
  return render(<MemoryRouter><AuthContext.Provider value={value}><NotificationBell /></AuthContext.Provider></MemoryRouter>)
}

describe('NotificationBell', () => {
  const request = vi.fn()
  beforeEach(() => {
    request.mockReset().mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path.endsWith('/unread-count')) return { data: { unreadCount: 2 } }
      if (path.endsWith('/read')) return { data: { ...item, read: true } }
      if (options?.method === 'POST') return { data: { unreadCount: 0 } }
      return { data: { items: [item], unreadCount: 2, nextCursor: null } }
    })
  })

  it('renders nothing and makes no requests for guests', () => {
    const { container } = renderBell('idle', request)
    expect(container).toBeEmptyDOMElement()
    expect(request).not.toHaveBeenCalled()
  })

  it('shows the server unread count, opens the list lazily and marks read', async () => {
    renderBell('authenticated', request)
    const bell = await screen.findByRole('button', { name: /۲ خوانده‌نشده/ })
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/notifications/me'))).toBe(false)
    fireEvent.click(bell)
    expect(await screen.findByRole('link', { name: /پرداخت تأیید شد/ })).toHaveAttribute('href', '/orders/o1')
    fireEvent.click(screen.getByRole('button', { name: 'علامت‌گذاری به‌عنوان خوانده' }))
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).endsWith('/n1/read'))).toBe(true))
  })

  it('closes on Escape', async () => {
    renderBell('authenticated', request)
    fireEvent.click(await screen.findByRole('button', { name: /خوانده‌نشده/ }))
    await screen.findByRole('region', { name: 'اعلان‌ها' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'اعلان‌ها' })).toBeNull())
  })
})
