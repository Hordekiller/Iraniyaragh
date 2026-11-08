import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { BlogNavProvider } from '../../lib/blog-nav'
import { HomeBlogSection } from '../content/HomeBlogSection'
import { SiteHeader } from './SiteHeader'
import { SiteNavigationDrawer } from './SiteNavigationDrawer'

const { api } = vi.hoisted(() => ({ api: { listCategories: vi.fn(async () => []) } }))
vi.mock('../../state/catalog-context', () => ({ useCatalogApi: () => api }))
vi.mock('../../state/cart-context', () => ({ useCart: () => ({ state: { cart: { lines: [] } } }) }))
vi.mock('../notifications/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('../auth/AccountMenu', () => ({ AccountMenu: () => null }))

const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } })
})
afterAll(() => {
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

const header = <SiteHeader searchQuery="" onSearchChange={() => {}} showSearch={false} onToggleSearch={() => {}} onOpenLogin={() => {}} />

describe('published blog discovery', () => {
  it.each([false, true])('uses the shared publication state in the header: %s', hasBlog => {
    render(<MemoryRouter initialEntries={['/blog/guide']}><BlogNavProvider hasBlog={hasBlog}>{header}</BlogNavProvider></MemoryRouter>)
    const link = screen.queryByRole('link', { name: 'مقالات و راهنماها' })
    if (hasBlog) {
      expect(link).toHaveAttribute('href', '/blog')
      expect(link).toHaveAttribute('aria-current', 'page')
    } else expect(link).not.toBeInTheDocument()
  })

  it.each([false, true])('uses the same publication state in the drawer: %s', async hasBlog => {
    const onClose = vi.fn()
    render(<MemoryRouter><BlogNavProvider hasBlog={hasBlog}><SiteNavigationDrawer onClose={onClose} /></BlogNavProvider></MemoryRouter>)
    await screen.findByText('هنوز دسته‌بندی منتشرشده‌ای وجود ندارد.')
    const link = screen.queryByRole('link', { name: /مقالات و راهنماها/ })
    if (hasBlog) {
      expect(link).toHaveAttribute('href', '/blog')
      fireEvent.click(link!)
      expect(onClose).toHaveBeenCalledTimes(1)
    } else expect(link).not.toBeInTheDocument()
  })

  it.each([false, true])('shows the homepage content section only for a live blog: %s', hasBlog => {
    render(<MemoryRouter><BlogNavProvider hasBlog={hasBlog}><HomeBlogSection /></BlogNavProvider></MemoryRouter>)
    const section = screen.queryByRole('region', { name: 'محتوا و راهنماها' })
    if (hasBlog) {
      expect(section).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'مشاهدهٔ مقالات و راهنماها' })).toHaveAttribute('href', '/blog')
    } else expect(section).not.toBeInTheDocument()
  })

  it('renders the homepage link in initial server HTML', () => {
    const html = renderToStaticMarkup(<MemoryRouter><BlogNavProvider hasBlog><HomeBlogSection /></BlogNavProvider></MemoryRouter>)
    expect(html).toContain('href="/blog"')
    expect(html).toContain('<h2')
    expect(html).not.toContain('<h1')
  })
})
