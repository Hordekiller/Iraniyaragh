import { createContext, useContext } from 'react'
import type { CustomerOtpController, CustomerOtpUiState } from '../lib/auth/ui'
import type { RequestOptions } from '../lib/auth/request'
import type { ApiSuccess } from '../lib/auth/types'

export type AuthenticatedJsonRequest = <T>(
  path: string,
  options?: Omit<RequestOptions, 'accessToken'>,
) => Promise<ApiSuccess<T>>

export type AuthContextValue = {
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
