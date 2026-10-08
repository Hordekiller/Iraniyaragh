import { describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '../lib/auth/errors'
import type { AuthenticatedJsonRequest } from '../state/auth-context'
import { getCustomerAccount } from './customer-account'

describe('customer account initialization', () => {
  it('initializes only after an authoritative missing-account response', async () => {
    const account = { id: 'new-account', firstName: null, lastName: null, addresses: [], version: 0 }
    const request = vi.fn().mockRejectedValueOnce(new AuthApiError({ code: 'NOT_FOUND', statusCode: 404, message: 'missing' }))
      .mockResolvedValueOnce({ data: { account } })
    Object.assign(request, { forCurrentPrincipal: () => request })
    expect(await getCustomerAccount(request as unknown as AuthenticatedJsonRequest)).toEqual(account)
    expect(request.mock.calls).toEqual([
      ['/api/v1/customers/me'],
      ['/api/v1/customers/me', { method: 'PUT' }],
    ])
  })

  it.each(['AUTH_SESSION_INVALID', 'NETWORK_ERROR', 'FORBIDDEN'] as const)('does not initialize on %s', async code => {
    const failure = new AuthApiError({ code, message: 'failed' })
    const request = vi.fn().mockRejectedValue(failure)
    Object.assign(request, { forCurrentPrincipal: () => request })
    await expect(getCustomerAccount(request as unknown as AuthenticatedJsonRequest)).rejects.toBe(failure)
    expect(request).toHaveBeenCalledOnce()
  })
})
