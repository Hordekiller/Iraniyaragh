import { useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { CustomerOtpController } from '../lib/auth/ui'
import type { AuthApi } from '../lib/auth/api'
import { AuthContext } from './auth-context'

/**
 * React shell around the CustomerOtpController.
 *
 * Defaults to the contract fixture client so the storefront can run/demo the
 * OTP flow before the auth backend endpoints land on `main` (parallel-work
 * model, AUTH_CONTRACT §17). Pass `api`/`store` overrides (e.g. the real
 * `AuthHttpClient`) when wiring against a deployed backend.
 */
export type AuthProviderProps = {
  children: ReactNode
  api?: AuthApi
  store?: MemorySessionStore
}

export function AuthProvider({ children, api, store }: AuthProviderProps) {
  const value = useMemo(() => {
    const sessionStore = store ?? new MemorySessionStore()
    const client = api ?? new AuthFixtureClient({ store: sessionStore })
    const controller = new CustomerOtpController(client, sessionStore)
    return {
      state: controller.getState(),
      controller,
      open: () => controller.open(),
      close: () => controller.close(),
    }
    // api/store are intentionally considered stable; components re-create the
    // controller only when the provider remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapshots = useSyncExternalStore(
    value.controller.subscribe.bind(value.controller),
    () => value.controller.getState(),
    () => value.controller.getState(),
  )

  const contextValue = useMemo(
    () => ({ ...value, state: snapshots }),
    [value, snapshots],
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}
