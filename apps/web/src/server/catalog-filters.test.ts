import { describe, expect, it } from 'vitest'
import { catalogFilters, listingHref } from './catalog-filters'
describe('URL catalog filters', () => {
  it('keeps integer IRR, attributes and sort in the server query', () => {
    expect(catalogFilters({ sort: 'price_desc', minPrice: '100', maxPrice: '999999999999999', available: 'true', discounted: 'true', 'attr.color': 'black' })).toMatchObject({ sortBy: 'price_desc', minPrice: '100', maxPrice: '999999999999999', available: true, discounted: true, attributes: { color: 'black' } })
  })
  it.each([{ sort: 'bad' }, { minPrice: '-1' }, { minPrice: '100', maxPrice: '99' }, { available: 'yes' }, { ids: 'a,b;drop' }])('rejects malformed query %j', query => { expect(catalogFilters(query)).toBeNull() })
  it('keeps filters in pagination and omits empty form controls', () => {
    expect(listingHref('/catalog', { page: '2', sort: 'popular', discounted: 'true', minPrice: '' }, 3)).toBe('/catalog?sort=popular&discounted=true&page=3')
    expect(catalogFilters({ minPrice: '', maxPrice: '', 'attr.color': '' })).toMatchObject({ attributes: {} })
  })
})
