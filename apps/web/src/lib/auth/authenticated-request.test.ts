import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedRequest } from './authenticated-request'
import { MemorySessionStore } from './session-store'
import type { AccessTokenData } from './types'
import { CommerceHttpClient } from '../../services/commerce/http'
import { getCustomerAccount } from '../../services/customer-account'

const login = (userId: string, token = `test-token-${userId}`): AccessTokenData => ({
  accessToken: token, tokenType: 'Bearer', expiresInSeconds: 600,
  principal: { userId, sessionId: `test-session-${userId}`,
    authenticationLevel: 'CUSTOMER_OTP', permissions: [], authenticatedAt: '2026-10-08T00:00:00.000Z', accessExpiresAt: '2026-10-08T00:10:00.000Z' },
})
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
const rejected = (code: string, status: number) => response({ code, statusCode: status, message: 'test failure', requestId: 'test-request' }, status)

describe('customer request identity boundaries', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['different-customer', 'same-customer-new-login'])('does not replay a cart mutation after %s during onboarding', async boundary => {
    const store = new MemorySessionStore()
    store.setAuthenticated(login('customer-a'))
    let complete!: (value: Response) => void
    const fetcher = vi.fn().mockResolvedValueOnce(rejected('CUSTOMER_ACCOUNT_REQUIRED', 409))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const refresh = vi.fn()
    const client = new CommerceHttpClient(createAuthenticatedRequest(store, refresh))
    const operation = client.addLine('customer', 'test-variant', 1, 'original-idempotency-key')
    const outcome = expect(operation).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    store.clear()
    store.setAuthenticated(login(boundary === 'different-customer' ? 'customer-b' : 'customer-a', 'new-login-token'))
    complete(response({ data: { account: { id: 'test-own-account' } } }))
    await outcome
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(refresh).not.toHaveBeenCalled()
    expect(store.getAccessToken()).toBe('new-login-token')
  })

  it('does not initialize B after a delayed missing-profile response for A', async () => {
    const store = new MemorySessionStore()
    store.setAuthenticated(login('customer-a'))
    let complete!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { complete = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const operation = getCustomerAccount(createAuthenticatedRequest(store, vi.fn()))
    const outcome = expect(operation).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    store.clear()
    store.setAuthenticated(login('customer-b'))
    complete(rejected('NOT_FOUND', 404))
    await outcome
    expect(fetcher).toHaveBeenCalledOnce()
    expect(store.getPrincipal()?.userId).toBe('customer-b')
  })

  it('keeps normal same-customer refresh and the original mutation key/body', async () => {
    const store = new MemorySessionStore()
    store.setAuthenticated(login('customer-a', 'expired-test-token'))
    const version = store.getIdentityVersion()
    const fetcher = vi.fn().mockResolvedValueOnce(rejected('AUTH_SESSION_INVALID', 401))
      .mockResolvedValueOnce(response({ data: { saved: true } }))
    vi.stubGlobal('fetch', fetcher)
    const refresh = vi.fn(async () => { store.setAuthenticated(login('customer-a', 'refreshed-test-token')); return true })
    const request = createAuthenticatedRequest(store, refresh).forCurrentPrincipal()
    const options = { method: 'PATCH' as const, json: { expectedVersion: 1 }, headers: { 'Idempotency-Key': 'original-key' } }
    expect(await request('/api/v1/customers/me', options)).toEqual({ data: { saved: true } })
    expect(refresh).toHaveBeenCalledOnce()
    expect(store.getIdentityVersion()).toBe(version)
    const first = fetcher.mock.calls[0][1] as RequestInit
    const second = fetcher.mock.calls[1][1] as RequestInit
    expect(second.body).toBe(first.body)
    expect(second.headers).toMatchObject({ Authorization: 'Bearer refreshed-test-token', 'Idempotency-Key': 'original-key' })
  })

  it('does not refresh B because an old A request returned 401', async () => {
    const store = new MemorySessionStore()
    store.setAuthenticated(login('customer-a'))
    let complete!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { complete = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const refresh = vi.fn()
    const operation = createAuthenticatedRequest(store, refresh)('/api/v1/customers/me')
    const outcome = expect(operation).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    store.clear(); store.setAuthenticated(login('customer-b'))
    complete(rejected('AUTH_SESSION_INVALID', 401))
    await outcome
    expect(refresh).not.toHaveBeenCalled()
    expect(store.getPrincipal()?.userId).toBe('customer-b')
  })

  it('cannot rebind an existing operation after switching principal', async () => {
    const store = new MemorySessionStore()
    store.setAuthenticated(login('customer-a'))
    const bound = createAuthenticatedRequest(store, vi.fn()).forCurrentPrincipal()
    store.clear(); store.setAuthenticated(login('customer-b'))
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(bound.forCurrentPrincipal()('/api/v1/customers/me')).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never sends an anonymous protected request or implicitly restores it', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const refresh = vi.fn()
    await expect(createAuthenticatedRequest(new MemorySessionStore(), refresh)('/api/v1/customers/me')).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    expect(fetcher).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled()
  })
})
