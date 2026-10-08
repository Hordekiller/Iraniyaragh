import { AuthApiError } from './errors'
import { jsonRequest, type RequestOptions } from './request'
import type { MemorySessionStore } from './session-store'
import type { ApiSuccess } from './types'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'

type Identity = { userId: string | null; version: number }

export function createAuthenticatedRequest(
  store: MemorySessionStore,
  refresh: () => Promise<boolean>,
  boundIdentity?: Identity,
): AuthenticatedJsonRequest {
  const currentIdentity = (): Identity => ({
    userId: store.getPrincipal()?.userId ?? null, version: store.getIdentityVersion(),
  })
  const request = async <T>(path: string, options: Omit<RequestOptions, 'accessToken'> = {}): Promise<ApiSuccess<T>> => {
    const identity = boundIdentity ?? currentIdentity()
    const assertIdentity = () => {
      if (!identity.userId || identity.userId !== store.getPrincipal()?.userId || identity.version !== store.getIdentityVersion()) {
        throw new AuthApiError({ code: 'AUTH_SESSION_INVALID', statusCode: 401,
          message: 'The customer login changed before this operation completed.' })
      }
    }
    const send = async () => {
      assertIdentity()
      const accessToken = store.getAccessToken()
      if (!accessToken) throw new AuthApiError({ code: 'AUTH_SESSION_INVALID', statusCode: 401, message: 'A live customer session is required.' })
      const result = await jsonRequest<T>(path, { ...options, accessToken })
      assertIdentity()
      return result
    }
    try {
      return await send()
    } catch (error) {
      if (!(error instanceof AuthApiError) || error.statusCode !== 401) throw error
      assertIdentity()
      if (!(await refresh())) throw error
      return send()
    }
  }
  return Object.assign(request, {
    forCurrentPrincipal: () => createAuthenticatedRequest(store, refresh, boundIdentity ?? currentIdentity()),
  })
}
