import { createContext, useContext } from 'react'
import type { CustomerOtpController, CustomerOtpUiState } from '../lib/auth/ui'
import type { MemorySessionStore } from '../lib/auth/session-store'
import type { AuthApi } from '../lib/auth/api'

export type AuthContextValue = {
  state: CustomerOtpUiState
  controller: CustomerOtpController
  /** Typed auth client (session list/revoke, logout-all) for account security UI. */
  api: AuthApi
  /** Token vault, exposed so commerce API clients can read the bearer token. */
  store: MemorySessionStore
  open: () => void
  close: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
