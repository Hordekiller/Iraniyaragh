import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionsPanel } from './AccountSessionsPanel'
import { AuthHttpClient } from '../../lib/auth/api'
import { CrossTabSessionBus, LocalRefreshCoordinator, MemorySessionStore } from '../../lib/auth/session-store'
import { ToastProvider } from '../feedback/Toast'
import { AuthProvider } from '../../state/AuthProvider'
import type { AccessTokenData, SessionSummary } from '../../lib/auth/types'

const accessData: AccessTokenData = {
  accessToken: 'access-token-must-never-be-rendered',
  tokenType: 'Bearer',
  expiresInSeconds: 600,
  principal: {
    userId: 'user-1',
    sessionId: 'session-current',
    authenticationLevel: 'CUSTOMER_OTP',
    permissions: [],
    authenticatedAt: '2026-09-01T00:00:00.000Z',
    accessExpiresAt: '2026-09-01T00:10:00.000Z',
  },
}

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    sessionId: 'session-1',
    current: false,
    deviceName: 'Chrome on Linux',
    authenticationLevel: 'CUSTOMER_OTP',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastUsedAt: '2026-09-01T00:05:00.000Z',
    expiresAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

type Route = (url: string, init?: RequestInit) => Response

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function renderPanel(
  route: Route,
  { store = new MemorySessionStore() }: { store?: MemorySessionStore } = {},
) {
  // AuthProvider attempts a silent restore on mount; without a valid refresh
  // answer it expires the session and the panel would render signed-out.
  store.setAuthenticated(accessData)
  const api = new AuthHttpClient({ store, getCsrfToken: () => 'csrf-proof' })
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
  fetchMock.mockImplementation(async (input, init) =>
    String(input).endsWith('/auth/refresh') ? okJson(accessData) : route(String(input), init),
  )
  // The client binds the global at call time, so the transport double has to be
  // installed before the panel issues its first request.
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <AuthProvider
      api={api}
      store={store}
      bus={new CrossTabSessionBus()}
      refreshCoordinator={new LocalRefreshCoordinator()}
    >
      <ToastProvider>
        <AccountSessionsPanel />
      </ToastProvider>
    </AuthProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountSessionsPanel', () => {
  it('lists the sessions the API reports and marks the current one', async () => {
    renderPanel(url => {
      if (url.endsWith('/auth/sessions')) {
        return okJson({
          sessions: [
            session({ sessionId: 'session-current', current: true, deviceName: 'Firefox on Android' }),
            session({ sessionId: 'session-old', deviceName: 'Chrome on Windows' }),
          ],
        })
      }
      return okJson({})
    })

    expect(await screen.findByText('Firefox on Android')).toBeInTheDocument()
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('همین دستگاه')).toBeInTheDocument()
    expect(screen.getByText(/۲ نشست فعال/)).toBeInTheDocument()
  })

  it('never renders a token, a session id or a raw device fingerprint', async () => {
    const { container } = renderPanel(() =>
      okJson({ sessions: [session({ sessionId: 'super-secret-session-id' })] }),
    )

    await screen.findByText('Chrome on Linux')
    const text = container.textContent ?? ''
    expect(text).not.toContain(accessData.accessToken)
    expect(text).not.toContain('super-secret-session-id')
    expect(text).not.toContain('user-1')
    expect(text).not.toContain('session-current')
  })

  it('states the authentication level instead of inventing a device name', async () => {
    renderPanel(() => okJson({ sessions: [session({ deviceName: null })] }))

    expect(await screen.findByText('این دستگاه')).toBeInTheDocument()
  })

  it('requires an explicit confirmation before revoking another device', async () => {
    const calls: string[] = []
    renderPanel((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/auth/sessions/session-old') && init?.method === 'DELETE') return okJson({})
      return okJson({ sessions: [session({ sessionId: 'session-old' })] })
    })

    const revoke = await screen.findByRole('button', { name: 'خروج آن دستگاه' })
    fireEvent.click(revoke)
    expect(calls.some(call => call.includes('DELETE'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'بله، خارج کن' }))
    await waitFor(() =>
      expect(calls.some(call => call === 'DELETE /api/v1/auth/sessions/session-old')).toBe(true),
    )
  })

  it('moves focus into the revocation prompt and hands it back on Escape', async () => {
    const calls: string[] = []
    renderPanel((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return okJson({ sessions: [session({ sessionId: 'session-old' })] })
    })

    const revoke = await screen.findByRole('button', { name: 'خروج آن دستگاه' })
    fireEvent.click(revoke)

    // The trigger is hidden while the prompt is open, so without this the focus
    // would sit on a display:none element and the prompt would be unreachable.
    expect(revoke.closest('span')).toHaveStyle({ display: 'none' })
    expect(screen.getByRole('button', { name: 'بله، خارج کن' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(revoke).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls.some(call => call.startsWith('DELETE'))).toBe(false)
  })

  it('can cancel a pending revocation without calling the API', async () => {
    const calls: string[] = []
    renderPanel((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return okJson({ sessions: [session({ sessionId: 'session-old' })] })
    })

    fireEvent.click(await screen.findByRole('button', { name: 'خروج آن دستگاه' }))
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))

    expect(screen.queryByRole('button', { name: 'بله، خارج کن' })).not.toBeInTheDocument()
    expect(calls.some(call => call.startsWith('DELETE'))).toBe(false)
  })

  it('confirms before signing out of every device', async () => {
    const calls: string[] = []
    renderPanel((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/auth/logout-all') && init?.method === 'POST') return okJson({})
      return okJson({ sessions: [session({})] })
    })

    fireEvent.click(await screen.findByRole('button', { name: /خروج از همهٔ دستگاه‌ها/ }))
    expect(calls.some(call => call.includes('logout-all'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /بله، از همه خارج شو/ }))
    await waitFor(() => expect(calls).toContain('POST /api/v1/auth/logout-all'))
  })

  it('asks for a fresh OTP instead of retrying when logout-all needs re-authentication', async () => {
    const calls: string[] = []
    renderPanel((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/auth/logout-all') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            code: 'AUTH_REAUTHENTICATION_REQUIRED',
            message: 'Re-authentication is required before this action.',
            requestId: 'req-1',
            statusCode: 401,
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        )
      }
      return okJson({ sessions: [session({})] })
    })

    fireEvent.click(await screen.findByRole('button', { name: /خروج از همهٔ دستگاه‌ها/ }))
    fireEvent.click(screen.getByRole('button', { name: /بله، از همه خارج شو/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/ورود دوباره لازم است/)).toBeInTheDocument()
    // Exactly one attempt: the API must not be hammered with a blind retry.
    expect(calls.filter(call => call.includes('logout-all'))).toHaveLength(1)
  })

  it('offers a retry when the session list cannot be loaded', async () => {
    let attempt = 0
    renderPanel(() => {
      attempt += 1
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ code: 'UPSTREAM_UNAVAILABLE', message: 'boom', requestId: 'r', statusCode: 503 }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        )
      }
      return okJson({ sessions: [session({ deviceName: 'Recovered device' })] })
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByText('Recovered device')).toBeInTheDocument()
  })

  it('says so plainly when no session is reported', async () => {
    renderPanel(() => okJson({ sessions: [] }))

    expect(await screen.findByText(/هیچ دستگاه فعالی/)).toBeInTheDocument()
  })
})
