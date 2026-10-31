import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogCategory } from '../services/catalog/types'
import { CategoriesPage } from './CategoriesPage'

const categories: CatalogCategory[] = [
  { id: 'root', parentId: null, name: 'ابزار برقی', slug: 'power', productCount: 0, image: '' },
  { id: 'child', parentId: 'root', name: 'دریل', slug: 'drills', productCount: 0, image: '' },
  { id: 'grandchild', parentId: 'child', name: 'دریل شارژی', slug: 'cordless', productCount: 0, image: '' },
]

function renderPage(listCategories: CatalogApi['listCategories'] = async () => categories) {
  const api: CatalogApi = {
    listCategories,
    getHomepageCollections: vi.fn(),
    listProducts: vi.fn(),
    getProductBySlug: vi.fn(),
  }
  render(<MemoryRouter><CatalogProvider api={api}><CategoriesPage /></CatalogProvider></MemoryRouter>)
  return api
}

describe('CategoriesPage', () => {
  it('shows root groups and direct children, and searches nested categories with their path', async () => {
    const api = renderPage()
    expect(await screen.findByRole('link', { name: 'ابزار برقی' })).toHaveAttribute('href', '/category/power')
    expect(screen.getByRole('link', { name: 'دریل' })).toHaveAttribute('href', '/category/drills')
    expect(screen.queryByRole('link', { name: 'دریل شارژی' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'شارژي' } })
    expect(screen.getByRole('link', { name: 'دریل شارژی' })).toHaveAttribute('href', '/category/cordless')
    expect(screen.getByText('ابزار برقی / دریل')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ابزار برقی' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'بی‌نتیجه' } })
    expect(screen.getByRole('status')).toHaveTextContent('دسته‌ای با این نام پیدا نشد')
    fireEvent.click(screen.getByRole('button', { name: 'نمایش همه دسته‌ها' }))
    expect(screen.getByRole('link', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(api.listProducts).not.toHaveBeenCalled()
  })

  it('keeps failed loading explicit and retries without fixture fallback', async () => {
    const listCategories = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(categories)
    renderPage(listCategories)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('دسته‌بندی‌ها دریافت نشدند')
    expect(screen.queryByRole('link', { name: 'ابزار برقی' })).not.toBeInTheDocument()
    fireEvent.click(within(alert).getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('link', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(listCategories).toHaveBeenCalledTimes(2)
  })

  it('explains an empty published catalog', async () => {
    renderPage(async () => [])
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('هنوز دسته‌بندی منتشرشده‌ای وجود ندارد'))
  })
})
