import { createContext, useContext } from 'react'
import type { CustomerOtpController, CustomerOtpUiState } from '../lib/auth/ui'

export type AuthContextValue = {
  state: CustomerOtpUiState
  controller: CustomerOtpController
  open: () => void
  close: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
