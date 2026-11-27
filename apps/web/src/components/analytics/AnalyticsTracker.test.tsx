import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsTracker } from './AnalyticsTracker'
import { ANALYTICS_MEASUREMENT_ID, CONSENT_EVENT, CONSENT_KEY } from './analytics-policy'

const route = vi.hoisted(() => ({ pathname: '/products/hinge' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

beforeEach(() => {
  route.pathname = '/products/hinge'
  window.localStorage.clear()
  window.dataLayer = undefined
  window.gtag = undefined
  document.getElementById('iraniyaragh-ga4')?.remove()
})
afterEach(() => document.getElementById('iraniyaragh-ga4')?.remove())

describe('AnalyticsTracker consent', () => {
  it('queues Google tag commands in the supported Arguments format after consent', async () => {
    render(<AnalyticsTracker />)
    fireEvent.click(await screen.findByRole('button', { name: 'می‌پذیرم' }))
    const script = await waitFor(() => {
      const found = document.getElementById('iraniyaragh-ga4')
      expect(found).not.toBeNull()
      return found!
    })
    fireEvent.load(script)

    await waitFor(() => expect(window.dataLayer?.length).toBeGreaterThanOrEqual(4))
    const commands = window.dataLayer as IArguments[]
    expect(commands.every(command => Object.prototype.toString.call(command) === '[object Arguments]')).toBe(true)
    expect(Array.from(commands.find(command => command[0] === 'config')!)).toEqual([
      'config', ANALYTICS_MEASUREMENT_ID, expect.objectContaining({ send_page_view: false }),
    ])
    expect(Array.from(commands.find(command => command[0] === 'event')!)).toEqual([
      'event', 'page_view', expect.objectContaining({ page_path: '/products/hinge' }),
    ])
  })

  it('loads no remote tag before consent or after rejection', async () => {
    render(<AnalyticsTracker />)
    expect(await screen.findByRole('dialog', { name: 'انتخاب آمار بازدید' })).toBeInTheDocument()
    expect(document.getElementById('iraniyaragh-ga4')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'رد می‌کنم' }))
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('rejected')
    expect(document.getElementById('iraniyaragh-ga4')).toBeNull()
  })

  it('sends a public page view without query values and suppresses private routes', async () => {
    const { rerender } = render(<AnalyticsTracker />)
    fireEvent.click(await screen.findByRole('button', { name: 'می‌پذیرم' }))
    const script = await waitFor(() => {
      const found = document.getElementById('iraniyaragh-ga4')
      expect(found).not.toBeNull()
      return found!
    })
    const calls = vi.fn()
    window.gtag = calls
    fireEvent.load(script)
    await waitFor(() => expect(calls).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/products/hinge' })))
    expect(JSON.stringify(calls.mock.calls)).not.toContain('query=')

    calls.mockClear()
    route.pathname = '/checkout'
    rerender(<AnalyticsTracker />)
    await waitFor(() => expect(calls).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied' })))
    expect(calls.mock.calls.filter(call => call[1] === 'page_view')).toHaveLength(0)

    calls.mockClear()
    route.pathname = '/products/hinge'
    rerender(<AnalyticsTracker />)
    await waitFor(() => expect(calls).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/products/hinge' })))
    window.dispatchEvent(new Event(CONSENT_EVENT))
  })
})
