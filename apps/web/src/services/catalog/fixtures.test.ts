import { describe, expect, it } from 'vitest'
import { CatalogError } from './errors'
import { CatalogFixtureClient } from './fixtures'

describe('CatalogFixtureClient', () => {
  it('returns defensive category copies', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const categories = await client.listCategories()
    expect(categories.length).toBeGreaterThan(0)
    categories[0].name = 'mutated'
    expect((await client.listCategories())[0].name).not.toBe('mutated')
  })

  it('lists the distinct brands present in the fixture catalog', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const brands = await client.listBrands()
    expect(brands.length).toBeGreaterThan(0)
    expect(brands.some(brand => brand.name === 'Ronix')).toBe(true)
    expect(new Set(brands.map(brand => brand.name)).size).toBe(brands.length)
  })

  it('filters by tokenized search, category and brand', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const result = await client.listProducts({ search: 'رونیکس ۲۲۱۰', categorySlug: 'power-tools', brand: 'ronix' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].slug).toBe('ronix-2210-hammer-drill')
  })

  it('orders by name in both directions with stable metadata', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const ascending = await client.listProducts({ sortBy: 'name' })
    const descending = await client.listProducts({ sortBy: 'name_desc' })
    const names = ascending.items.map(item => item.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fa')))
    expect(descending.items.map(item => item.name)).toEqual([...names].reverse())
    expect(ascending.meta).toMatchObject({ page: 1, perPage: 24, total: ascending.items.length, pages: 1 })
  })

  it('applies no hidden ranking when no sort is requested', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    // The public catalog contract has no sales ranking, so an unfiltered request
    // must be byte-for-byte the newest order rather than review counts in disguise.
    const implicit = await client.listProducts()
    const explicit = await client.listProducts({ sortBy: 'newest' })
    expect(implicit.items.map(item => item.id)).toEqual(explicit.items.map(item => item.id))
  })

  it('pages with real slices, consistent totals and a clamped out-of-range page', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const all = await client.listProducts({ perPage: 3 })
    const first = await client.listProducts({ perPage: 3, page: 1 })
    const second = await client.listProducts({ perPage: 3, page: 2 })
    expect(all.meta.total).toBe(first.meta.total)
    expect(first.items).toHaveLength(3)
    expect(first.meta.pages).toBe(Math.ceil(first.meta.total / 3))
    // Pages must be disjoint and cover the catalog without overlap.
    const ids = new Set([...first.items, ...second.items].map(item => item.id))
    expect(ids.size).toBe(first.items.length + second.items.length)
    expect(ids.size).toBeLessThanOrEqual(first.meta.total)

    const overflow = await client.listProducts({ perPage: 3, page: 9_999 })
    expect(overflow.meta.page).toBe(first.meta.pages)
    expect(overflow.items.length).toBeLessThanOrEqual(3)
  })

  it('treats newest as stable insertion order and trims blank searches', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const all = await client.listProducts({ sortBy: 'newest', search: '   ' })
    expect(all.items.length).toBeGreaterThan(1)
    expect(all.items[0].slug).toBe('ronix-2210-hammer-drill')
  })

  it('returns a product and raises a typed not-found error for unknown slugs', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    await expect(client.getProductBySlug('ronix-2210-hammer-drill')).resolves.toMatchObject({ id: 'p-101' })
    await expect(client.getProductBySlug('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 } satisfies Partial<CatalogError>)
  })
})
