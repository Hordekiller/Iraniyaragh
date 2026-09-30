import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import { buildCategoryTree } from '../lib/category-tree'
import type { CatalogApi, CatalogCategory, CatalogListResult } from '../services/catalog/types'
import { CategoriesPage } from './CategoriesPage'

const CATEGORIES: CatalogCategory[] = [
  { id: 'c-power', name: 'ابزار برقی', slug: 'power-tools', parentId: null, productCount: 320, image: '' },
  { id: 'c-hand', name: 'ابزار دستی', slug: 'hand-tools', parentId: null, productCount: 12, image: '' },
  { id: 'c-drill', name: 'دریل', slug: 'drill', parentId: 'c-power', productCount: 8, image: '' },
]

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => CATEGORIES),
    listBrands: vi.fn(async () => []),
    listProducts: vi.fn(async (): Promise<CatalogListResult> => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
    getProductBySlug: vi.fn(async () => { throw new Error('not found') }),
    ...overrides,
  }
}

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter>
      <CatalogProvider api={api}>
        <CategoriesPage />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('buildCategoryTree', () => {
  it('nests children under their live parent', () => {
    const tree = buildCategoryTree(CATEGORIES)
    expect(tree.map(node => node.category.slug)).toEqual(['power-tools', 'hand-tools'])
    expect(tree[0].children.map(node => node.category.slug)).toEqual(['drill'])
  })

  it('treats a category whose parent is absent as a root so it is never dropped', () => {
    const tree = buildCategoryTree([
      { id: 'c-orphan', name: 'یتیم', slug: 'orphan', parentId: 'missing', productCount: 1, image: '' },
    ])
    expect(tree.map(node => node.category.slug)).toEqual(['orphan'])
  })

  it('terminates and keeps every category when the data is cyclic', () => {
    const tree = buildCategoryTree([
      { id: 'a', name: 'الف', slug: 'a', parentId: 'b', productCount: 1, image: '' },
      { id: 'b', name: 'ب', slug: 'b', parentId: 'a', productCount: 1, image: '' },
    ])
    // Neither category resolves to a root, so the list must not render empty.
    expect(tree).toHaveLength(2)
    // The real invariant: no category repeats on a single descent path, so the
    // recursion terminates no matter how corrupt the data is.
    const repeatsOnPath = (nodes: ReturnType<typeof buildCategoryTree>, seen: string[] = []): boolean =>
      nodes.some(node =>
        seen.includes(node.category.id) || repeatsOnPath(node.children, [...seen, node.category.id]),
      )
    expect(repeatsOnPath(tree)).toBe(false)
  })
})

describe('CategoriesPage', () => {
  it('lists every category the API returns with its live count', async () => {
    renderPage(stubCatalog())

    expect(screen.getByText('در حال بارگذاری دسته‌بندی‌ها...')).toBeInTheDocument()

    expect(await screen.findByRole('link', { name: /ابزار برقی/ })).toHaveAttribute('href', '/category/power-tools')
    expect(screen.getByRole('link', { name: /ابزار دستی/ })).toHaveAttribute('href', '/category/hand-tools')
    // A child category is reachable from the directory too.
    expect(screen.getByRole('link', { name: /دریل/ })).toHaveAttribute('href', '/category/drill')
    expect(screen.getByText('۳۲۰ کالا')).toBeInTheDocument()
    expect(screen.getByText('۳ دسته‌بندی در فروشگاه ثبت شده است.')).toBeInTheDocument()
  })

  it('shows a Persian error alert when the request fails', async () => {
    renderPage(stubCatalog({ listCategories: vi.fn(async () => { throw new Error('down') }) }))

    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری دسته‌بندی‌ها با خطا مواجه شد.')
  })

  it('shows an empty state, not an error, when the store has no categories', async () => {
    renderPage(stubCatalog({ listCategories: vi.fn(async () => []) }))

    expect(await screen.findByText('هنوز دسته‌بندی‌ای در فروشگاه ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers a retry that refetches and clears the failure', async () => {
    const listCategories = vi
      .fn<CatalogApi['listCategories']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(CATEGORIES)
    renderPage(stubCatalog({ listCategories }))

    expect(await screen.findByText('بارگذاری دسته‌بندی‌ها ممکن نشد')).toBeInTheDocument()
    expect(screen.queryByText('ابزار برقی')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))

    // The error must not linger next to the retry's own loading state.
    await waitFor(() => expect(screen.queryByText('بارگذاری دسته‌بندی‌ها ممکن نشد')).not.toBeInTheDocument())
    expect(await screen.findByText('ابزار برقی')).toBeInTheDocument()
    expect(listCategories).toHaveBeenCalledTimes(2)
  })

  it('keeps offering a retry when the second attempt fails too', async () => {
    const listCategories = vi.fn<CatalogApi['listCategories']>().mockRejectedValue(new Error('boom'))
    renderPage(stubCatalog({ listCategories }))

    expect(await screen.findByText('بارگذاری دسته‌بندی‌ها ممکن نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('بارگذاری دسته‌بندی‌ها ممکن نشد')).toBeInTheDocument()
  })
})
