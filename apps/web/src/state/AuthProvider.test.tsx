import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus } from '../lib/auth/session-store'
import type { AuthApi } from '../lib/auth/api'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

function Probe() {
  const { state } = useAuth()
  return (
    <output data-testid="phase" data-phase={state.phase}>
      {state.phase}
    </output>
  )
}

async function signIn(store: MemorySessionStore) {
  const controller = new CustomerOtpController(new AuthFixtureClient({ store }), store, () => Date.now())
  controller.open()
  controller.setMobile('09123456789')
  await controller.requestOtp()
  controller.setCode('123456')
  await controller.verifyOtp()
}

describe('AuthProvider', () => {
  it('silently restores a pre-existing session on mount (single-flight, real default remains HTTP)', async () => {
    const store = new MemorySessionStore()
    const bus = new CrossTabSessionBus()
    await signIn(store)

    render(
      <AuthProvider api={new AuthFixtureClient({ store })} store={store} bus={bus}>
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByTestId('phase')).toHaveAttribute('data-phase', 'authenticated')
  })

  it('stays anonymously idle on mount when no in-memory session exists', async () => {
    const store = new MemorySessionStore()
    render(
      <AuthProvider
        api={new AuthFixtureClient({ store }) as unknown as AuthApi}
        store={store}
        bus={new CrossTabSessionBus()}
      >
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByTestId('phase')).toHaveAttribute('data-phase', 'idle')
  })
})