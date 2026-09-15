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

  it('filters by tokenized search, category and brand', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const result = await client.listProducts({ search: 'رونیکس ۲۲۱۰', categorySlug: 'power-tools', brand: 'ronix' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].slug).toBe('ronix-2210-hammer-drill')
  })

  it('supports price and popularity ordering with stable metadata', async () => {
    const client = new CatalogFixtureClient({ delayMs: 0 })
    const ascending = await client.listProducts({ sortBy: 'price_asc' })
    const descending = await client.listProducts({ sortBy: 'price_desc' })
    const popular = await client.listProducts({ sortBy: 'popular' })
    expect(Number(ascending.items[0].price.amount)).toBeLessThanOrEqual(Number(ascending.items.at(-1)?.price.amount))
    expect(Number(descending.items[0].price.amount)).toBeGreaterThanOrEqual(Number(descending.items.at(-1)?.price.amount))
    expect(popular.items[0].reviews).toBeGreaterThanOrEqual(popular.items.at(-1)?.reviews ?? 0)
    expect(ascending.meta).toMatchObject({ page: 1, perPage: 24, total: ascending.items.length, pages: 1 })
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
