import { act, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../state/auth-context'
import { CartContext, type CartContextValue } from '../../state/cart-context'
import { setHelperCompact, setHelperEnabled, setHelperOpen, startTour, stopTour } from '../../lib/help-tour-state'
import { guideForPath, LOGIN_GUIDES, PAGE_GUIDES } from '../../lib/help-pages'
import { ROUTES, ROUTE_PATHS } from '../../lib/routes'
import { HelpHint } from './HelpHint'
import { PageHelper } from './PageHelper'

const auth = (phase: string) => ({ state: { phase } }) as unknown as AuthContextValue
const cart = (quantity: number) => ({ state: { cart: { lines: quantity ? [{ quantity }] : [] } } }) as unknown as CartContextValue

function Where() { return <output data-testid="where">{useLocation().pathname}</output> }

function mount(path: string, phase = 'anonymous', quantity = 0) {
  return render(<AuthContext.Provider value={auth(phase)}><CartContext.Provider value={cart(quantity)}><MemoryRouter initialEntries={[path]}><PageHelper /><Where /></MemoryRouter></CartContext.Provider></AuthContext.Provider>)
}

function visible(attr: string, value: string, tag = 'button') {
  const el = document.createElement(tag)
  el.setAttribute(attr, value)
  el.getBoundingClientRect = () => ({ top: 100, left: 50, width: 40, height: 40, right: 90, bottom: 140, x: 50, y: 100, toJSON: () => ({}) })
  el.getClientRects = () => [el.getBoundingClientRect()] as unknown as DOMRectList
  document.body.append(el)
  return el
}

beforeEach(() => { setHelperEnabled(true); window.sessionStorage.clear(); Element.prototype.scrollIntoView = vi.fn(); act(() => { setHelperOpen(false); setHelperCompact(false) }) })
afterEach(() => { act(() => { setHelperEnabled(null); setHelperOpen(false); setHelperCompact(false); stopTour() }); document.body.innerHTML = '' })

describe('PageHelper', () => {
  it('offers a floating button on every page and opens the panel for the current page', () => {
    mount('/cart')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    expect(screen.getByRole('region', { name: 'راهنمای این صفحه' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'سبد خرید' })).toBeInTheDocument()
    expect(screen.getByText(/سبد شما خالی است/)).toBeInTheDocument()
  })

  it('shows the purchase stage and highlights the real button when it is on screen', async () => {
    visible('data-help', 'add-to-cart')
    mount('/products/door-handle')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }))
    expect(screen.getByText(/افزودن به سبد خرید/)).toBeInTheDocument()
    expect(await screen.findByTestId('helper-spotlight')).toBeInTheDocument()
    expect(screen.getByText('صفحهٔ کالا', { selector: 'li' })).toHaveAttribute('aria-current', 'step')
  })

  it('tells the truth when a button is not shown instead of pretending', () => {
    mount('/products/door-handle')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }))
    expect(screen.getByText(/اگر به جای این دکمه کنترل تعداد/)).toBeInTheDocument()
    expect(screen.queryByTestId('helper-spotlight')).toBeNull()
  })

  it('explains the next stage and can take the customer there', () => {
    visible('data-help', 'cart-continue', 'a')
    mount('/cart', 'authenticated', 2)
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }))
    expect(screen.getByText(/به مرحلهٔ نشانی و ارسال می‌برد/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /مرحلهٔ بعد: نشانی و ارسال/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/checkout')
    expect(screen.getByRole('heading', { name: 'نشانی و روش ارسال' })).toBeInTheDocument()
  })

  it('guides the sign-in dialog while it is open and reads guest-only wording', async () => {
    visible('id', 'login-mobile', 'input').id = 'login-mobile'
    mount('/cart', 'anonymous', 1)
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    expect(await screen.findByRole('heading', { name: 'ورود با موبایل' })).toBeInTheDocument()
  })

  it('stays closed state across a re-render and can be dismissed', () => {
    mount('/')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    fireEvent.click(screen.getByRole('button', { name: 'بستن راهنما' }))
    expect(screen.queryByRole('region', { name: 'راهنمای این صفحه' })).toBeNull()
    expect(screen.getByRole('button', { name: 'راهنمای این صفحه' })).toBeInTheDocument()
  })
})

describe('admin switch', () => {
  it.each<boolean | null>([false, null])('shows nothing interactive when the switch is %s (off / unknown fails closed)', (value) => {
    act(() => setHelperEnabled(value))
    render(<AuthContext.Provider value={auth('anonymous')}><CartContext.Provider value={cart(0)}><MemoryRouter initialEntries={['/cart']}><PageHelper /><HelpHint target="door-height" label="ارتفاع" /></MemoryRouter></CartContext.Provider></AuthContext.Provider>)
    expect(screen.queryByRole('button', { name: 'راهنمای این صفحه' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'راهنما: ارتفاع' })).toBeNull()
  })

  it('hides a panel that is already open and any running tour as soon as the switch turns off', () => {
    mount('/cart')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    expect(screen.getByRole('region', { name: 'راهنمای این صفحه' })).toBeInTheDocument()
    act(() => setHelperEnabled(false))
    expect(screen.queryByRole('region', { name: 'راهنمای این صفحه' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'راهنمای این صفحه' })).toBeNull()
    act(() => startTour('login'))
    expect(screen.queryByRole('region', { name: 'راهنمای تعاملی' })).toBeNull()
  })
})

describe('quiet access', () => {
  it('shrinks to a slim bar that still moves through the page and can be enlarged again', () => {
    mount('/products/door-handle')
    fireEvent.click(screen.getByRole('button', { name: 'راهنمای این صفحه' }))
    fireEvent.click(screen.getByRole('button', { name: 'کوچک کردن راهنما' }))
    expect(screen.getByTestId('helper-compact')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'صفحهٔ کالا' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }))
    expect(screen.getByTestId('helper-compact')).toHaveTextContent('افزودن به سبد خرید')
    fireEvent.click(screen.getByRole('button', { name: 'بزرگ کردن راهنما' }))
    expect(screen.getByRole('heading', { name: 'صفحهٔ کالا' })).toBeInTheDocument()
  })

  it('opens on the exact field when its "?" hint is pressed, even from the closed state', () => {
    render(<AuthContext.Provider value={auth('anonymous')}><CartContext.Provider value={cart(0)}><MemoryRouter initialEntries={['/custom-doors']}><PageHelper /><HelpHint target="door-height" label="ارتفاع" /></MemoryRouter></CartContext.Provider></AuthContext.Provider>)
    expect(screen.queryByRole('region', { name: 'راهنمای این صفحه' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'راهنما: ارتفاع' }))
    expect(screen.getByRole('region', { name: 'راهنمای این صفحه' })).toHaveTextContent('ارتفاع (میلی‌متر)')
  })
})

describe('page guide coverage', () => {
  it('gives every storefront route its own guide', () => {
    const concrete = (path: string) => path.replace(':slug', 'x').replace(':id', 'x')
    for (const path of Object.values(ROUTE_PATHS)) expect(guideForPath(concrete(path)).id, path).not.toBe('generic')
    expect(guideForPath(ROUTES.paymentResult('x')).id).toBe('payment')
  })

  it('only points at hooks that exist in the storefront source', () => {
    const files: string[] = []
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) files.push(full) } }
    walk(join(__dirname, '..', '..'))
    const source = files.map(file => readFileSync(file, 'utf8')).join('\n')
    const guides = [...PAGE_GUIDES, LOGIN_GUIDES.mobile, LOGIN_GUIDES.code]
    let checked = 0
    for (const guide of guides) for (const item of guide.items) {
      for (const match of item.target?.matchAll(/data-help="([^"]+)"/g) ?? []) {
        checked++
        const dynamic = ['door-width', 'door-height', 'door-quantity'].includes(match[1])
        expect(dynamic ? source.includes('data-help={`door-${key}`}') : source.includes(`data-help="${match[1]}"`), match[1]).toBe(true)
      }
      for (const id of item.target?.matchAll(/#([\w-]+)/g) ?? []) expect(new RegExp(`id=["']${id[1]}["']`).test(source), id[1]).toBe(true)
    }
    expect(checked).toBeGreaterThan(25)
  })
})
