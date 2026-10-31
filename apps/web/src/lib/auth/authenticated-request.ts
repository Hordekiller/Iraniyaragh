import { createDiagnosticId, diagnosticId, logClientFailure } from '@iranyaragh/contracts'
import { AuthApiError, authApiErrorFromResponse } from './errors'
import { jsonRequest, type RequestOptions } from './request'
import type { MemorySessionStore } from './session-store'
import type { ApiSuccess } from './types'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'

function correlatedHeaders(input: Record<string, string> = {}): Record<string, string> {
  const correlationId = diagnosticId(new Headers(input).get('x-correlation-id')) ?? createDiagnosticId()
  const result = { ...input }
  for (const key of Object.keys(result)) if (key.toLowerCase() === 'x-correlation-id') delete result[key]
  return { ...result, 'X-Correlation-ID': correlationId }
}

type Identity = { userId: string | null; version: number }
type RefreshState = { pending: Promise<boolean> | null; version: number | null }

export function createAuthenticatedRequest(
  store: MemorySessionStore,
  refresh: () => Promise<boolean>,
  boundIdentity?: Identity,
  sharedRefresh: RefreshState = { pending: null, version: null },
): AuthenticatedJsonRequest {
  const currentIdentity = (): Identity => ({
    userId: store.getPrincipal()?.userId ?? null, version: store.getIdentityVersion(),
  })
  const refreshOnce = (identity: Identity): Promise<boolean> => {
    if (sharedRefresh.pending && sharedRefresh.version === identity.version) return sharedRefresh.pending
    const pending = refresh().finally(() => {
      if (sharedRefresh.pending === pending) {
        sharedRefresh.pending = null
        sharedRefresh.version = null
      }
    })
    sharedRefresh.pending = pending
    sharedRefresh.version = identity.version
    return pending
  }
  const request = async <T>(path: string, options: Omit<RequestOptions, 'accessToken'> = {}): Promise<ApiSuccess<T>> => {
    const headers = correlatedHeaders(options.headers)
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
      const result = await jsonRequest<T>(path, { ...options, headers, accessToken })
      assertIdentity()
      return result
    }
    try {
      return await send()
    } catch (error) {
      if (!(error instanceof AuthApiError) || error.statusCode !== 401) throw error
      assertIdentity()
      if (!(await refreshOnce(identity))) throw error
      return send()
    }
  }
  /** Same authorization lifetime for non-JSON artifact payloads. */
  const response = async (path: string, options: Omit<RequestOptions, 'accessToken'> = {}): Promise<Response> => {
    const headers = correlatedHeaders(options.headers)
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
      const requestId = diagnosticId(new Headers(headers).get('x-request-id')) ?? createDiagnosticId()
      const binaryHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, ...headers }
      for (const key of Object.keys(binaryHeaders)) if (key.toLowerCase() === 'x-request-id') delete binaryHeaders[key]
      binaryHeaders['X-Request-ID'] = requestId
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
      try {
        const result = await fetch(`${options.baseUrl ?? ''}${path}`, {
          credentials: options.credentials ?? 'same-origin',
          signal: controller.signal,
          headers: binaryHeaders,
        })
        if (!result.ok) {
          const failure = await authApiErrorFromResponse(result, undefined, requestId)
          logClientFailure('storefront', failure.requestId ?? requestId, 'http', result.status)
          throw failure
        }
        assertIdentity()
        return result
      } catch (error) {
        if (error instanceof AuthApiError) throw error
        const kind = controller.signal.aborted ? 'timeout' : 'network'
        logClientFailure('storefront', requestId, kind)
        throw new AuthApiError({ code: kind === 'timeout' ? 'TIMEOUT' : 'NETWORK_ERROR', statusCode: 0, requestId, message: 'The body response could not be retrieved.' })
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      return await send()
    } catch (error) {
      if (!(error instanceof AuthApiError) || error.statusCode !== 401) throw error
      assertIdentity()
      if (!(await refreshOnce(identity))) throw error
      return send()
    }
  }
  return Object.assign(request, {
    forCurrentPrincipal: () => createAuthenticatedRequest(store, refresh, boundIdentity ?? currentIdentity(), sharedRefresh),
    response,
  })
}
