import { act, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../state/auth-context'
import { setHelperEnabled, startTour, stopTour } from '../../lib/help-tour-state'
import { TOURS } from '../../lib/help-tours'
import { GuidedTour } from './GuidedTour'

const auth = (phase: string) => ({ state: { phase } }) as unknown as AuthContextValue

function mount(phase = 'anonymous', path = '/', body?: () => void) {
  body?.()
  return render(<AuthContext.Provider value={auth(phase)}><MemoryRouter initialEntries={[path]}><GuidedTour /></MemoryRouter></AuthContext.Provider>)
}

function visibleButton(name: string, attr = 'data-help') {
  const button = document.createElement('button')
  button.setAttribute(attr, name)
  button.getBoundingClientRect = () => ({ top: 100, left: 50, width: 40, height: 40, right: 90, bottom: 140, x: 50, y: 100, toJSON: () => ({}) })
  button.getClientRects = () => [button.getBoundingClientRect()] as unknown as DOMRectList
  document.body.append(button)
  return button
}

beforeEach(() => { setHelperEnabled(true); window.sessionStorage.clear(); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { act(() => { setHelperEnabled(null); stopTour() }); document.body.innerHTML = '' })

describe('GuidedTour', () => {
  it('renders nothing until a tour is started', () => {
    mount()
    expect(screen.queryByRole('region', { name: 'راهنمای تعاملی' })).toBeNull()
  })

  it('highlights the real button of the step and explains it', async () => {
    visibleButton('account-button')
    mount()
    act(() => startTour('login'))
    expect(await screen.findByRole('heading', { name: 'دکمهٔ ورود' })).toBeInTheDocument()
    expect(await screen.findByTestId('tour-spotlight')).toBeInTheDocument()
  })

  it('moves on by itself when the customer clicks the highlighted button', async () => {
    const button = visibleButton('account-button')
    mount()
    act(() => startTour('login'))
    await screen.findByTestId('tour-spotlight')
    vi.useFakeTimers()
    fireEvent.click(button)
    act(() => { vi.advanceTimersByTime(300) })
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { name: 'شمارهٔ موبایل' })).toBeInTheDocument()
  })

  it('says honestly when the element is not on screen instead of pretending', async () => {
    mount()
    act(() => startTour('login'))
    expect(await screen.findByText(/این دکمه در نوار بالای صفحه است/)).toBeInTheDocument()
    expect(screen.queryByTestId('tour-spotlight')).toBeNull()
  })

  it('offers navigation when the step belongs to another page', () => {
    mount('authenticated', '/')
    act(() => startTour('checkout'))
    expect(screen.getByRole('button', { name: 'رفتن به سبد خرید' })).toBeInTheDocument()
  })

  it('skips guest-only steps for a signed-in customer', () => {
    mount('authenticated')
    act(() => startTour('login'))
    expect(screen.getByRole('heading', { name: 'شما وارد شده‌اید' })).toBeInTheDocument()
    expect(screen.getByText(/مرحلهٔ ۱ از ۱/)).toBeInTheDocument()
  })

  it('closes with the close button and with the final step', () => {
    mount('authenticated')
    act(() => startTour('login'))
    fireEvent.click(screen.getByRole('button', { name: 'پایان' }))
    expect(screen.queryByRole('region', { name: 'راهنمای تعاملی' })).toBeNull()
    act(() => startTour('login'))
    fireEvent.click(screen.getByRole('button', { name: 'بستن راهنما' }))
    expect(screen.queryByRole('region', { name: 'راهنمای تعاملی' })).toBeNull()
  })
})

describe('tour targets exist in the storefront source', () => {
  const files: string[] = []
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) files.push(full) } }
  walk(join(__dirname, '..', '..'))
  const source = files.map(file => readFileSync(file, 'utf8')).join('\n')

  it('has a data-help hook for every named target', () => {
    const names = new Set<string>()
    for (const tour of TOURS) for (const step of tour.steps) for (const match of step.target?.matchAll(/data-help="([^"]+)"/g) ?? []) names.add(match[1])
    expect(names.size).toBeGreaterThan(10)
    for (const name of names) {
      const dynamic = name.startsWith('door-') && ['door-width', 'door-height', 'door-quantity'].includes(name)
      expect(dynamic ? source.includes('data-help={`door-${key}`}') : source.includes(`data-help="${name}"`), name).toBe(true)
    }
  })

  it('has valid ids/hrefs and regexes for the remaining selectors', () => {
    for (const tour of TOURS) for (const step of tour.steps) {
      if (step.onRoute) expect(() => new RegExp(step.onRoute!, 'u')).not.toThrow()
      for (const id of step.target?.matchAll(/#([\w-]+)/g) ?? []) expect(/id=["']/.test(source) && new RegExp(`id=["']${id[1]}["']`).test(source), id[1]).toBe(true)
    }
  })
})
