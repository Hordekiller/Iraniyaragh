import { createContext, useContext } from 'react'
import type { CustomerOtpController, CustomerOtpUiState } from '../lib/auth/ui'
import type { RequestOptions } from '../lib/auth/request'
import type { ApiSuccess } from '../lib/auth/types'

export type AuthenticatedJsonRequest = {
  <T>(path: string, options?: Omit<RequestOptions, 'accessToken'>): Promise<ApiSuccess<T>>
  /** Keep a multi-request operation under its original customer/login lifetime. */
  forCurrentPrincipal: () => AuthenticatedJsonRequest
}

export type AuthContextValue = {
  /** Changes on logout/new login, but not on a same-customer token refresh. */
  identityVersion: number
  /** Initial silent-restore attempt has finished; this is not an authentication claim. */
  restored: boolean
  state: CustomerOtpUiState
  controller: CustomerOtpController
  request: AuthenticatedJsonRequest
  open: () => void
  close: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
