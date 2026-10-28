import { afterEach, describe, expect, it, vi } from 'vitest'
import { metadataFor, publicOrigin, pageNumber, hasNonPageQuery, validSlug, entityPath } from './policy'
import { breadcrumb, plainDescription, productJsonLd, JsonLd } from './structured-data'
import { categoryAncestors } from './category-ancestors'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CatalogProduct, CatalogCategory } from '../services/catalog/types'

afterEach(() => vi.unstubAllEnvs())
const origin = 'https://iraniyaragh.com'
const setup = () => { vi.stubEnv('PUBLIC_WEB_ORIGIN', origin); vi.stubEnv('APP_ENVIRONMENT', 'production') }
const item: CatalogProduct = { id: 'isolated-test', slug: 'test-hinge', name: 'لولای آزمایشی', brand: 'برند آزمایشی', category: null, image: '', media: [], variants: [{ id: 'v', sku: 'TEST-HINGE', title: null, attributes: [], price: { amount: '9007199254740993', currency: 'IRR' }, stockStatus: 'UNKNOWN' }], description: '<h2>راهنمای نصب</h2><p>فقط آزمایشی</p>', price: { amount: '9007199254740993', currency: 'IRR' }, oldPrice: null, stockStatus: 'UNKNOWN', rating: null, reviews: 0, badge: null }

describe('public URL and indexing policy', () => {
  it('accepts only the configured HTTPS apex origin in production', () => {
    expect(publicOrigin({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: origin })).toBe(origin)
    for (const value of [undefined, 'http://iraniyaragh.com', 'https://www.iraniyaragh.com', origin+'/', origin+'/admin', origin+'?host=evil.test', 'https://user:password@iraniyaragh.com', 'https://iraniyaragh.com:444', 'javascript:alert(1)', 'https://127.0.0.1', 'https://foo.internal']) expect(() => publicOrigin({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: value })).toThrow()
  })
  it('has self canonicals for pagination while filtered or nonproduction pages cannot index', () => {
    setup()
    expect(metadataFor({ title: 'ابزار', description: 'تست', path: '/catalog?page=2' })).toMatchObject({ alternates: { canonical: origin+'/catalog?page=2' }, robots: { index: true, follow: true } })
    expect(metadataFor({ title: 'ابزار', description: 'تست', path: '/catalog', indexable: false }).robots).toEqual({ index: false, follow: true })
    vi.stubEnv('APP_ENVIRONMENT', 'staging')
    expect(metadataFor({ title: 'ابزار', description: 'تست', path: '/catalog' }).robots).toEqual({ index: false, follow: false })
    expect(pageNumber({})).toBe(1); expect(pageNumber({ page: '2' })).toBe(2)
    for (const page of ['0', '-1', '01', '1.2', '9999999', ['1','2']]) expect(pageNumber({ page })).toBeNull()
    expect(hasNonPageQuery({ page: '2' })).toBe(false); expect(hasNonPageQuery({ sort: 'price' })).toBe(true)
  })
  it('preserves valid Persian slugs and rejects ambiguous path injection', () => {
    expect(entityPath('products', 'لولای-کابینت')).toBe('/products/'+encodeURIComponent('لولای-کابینت'))
    expect(validSlug('لولای-کابینت')).toBe(true); expect(validSlug('a'.repeat(250))).toBe(true)
    for (const value of ['a'.repeat(251), '', '../cart', '%2fadmin', 'a/b', 'a?b', '-a', 'a--b']) expect(validSlug(value)).toBe(false)
  })
})
describe('truthful server structured data', () => {
  it('keeps integer IRR precision and omits unknown inventory and invented review evidence', () => {
    setup(); const schema = productJsonLd(item)
    expect(schema).toMatchObject({ name: item.name, sku: 'TEST-HINGE', url: origin+'/products/test-hinge', offers: { price: '9007199254740993', priceCurrency: 'IRR' } })
    expect(schema.offers).not.toHaveProperty('availability'); expect(schema).not.toHaveProperty('aggregateRating'); expect(schema).not.toHaveProperty('review')
    expect(productJsonLd({ ...item, variants: [item.variants[0], { ...item.variants[0], id: 'v2' }] })).not.toHaveProperty('offers')
    const outOfStock = productJsonLd({ ...item, variants: [{ ...item.variants[0], stockStatus: 'OUT_OF_STOCK' }] })
    expect(outOfStock.offers).toMatchObject({ availability: 'https://schema.org/OutOfStock' })
  })
  it('embeds customer-controlled text without executable script boundaries', () => {
    setup(); const attack = '</script><img src=x onerror=alert(1)>'
    const html = renderToStaticMarkup(JsonLd({ data: { name: attack } }))
    expect(html.match(/<script/g)).toHaveLength(1); expect(html).not.toContain('<img')
    expect(JSON.parse(html.replace(/^.*?>/, '').replace(/<\/script>$/, '')).name).toBe(attack)
    expect(plainDescription('<style>bad</style><h2>راهنما &amp; نصب</h2><script>bad()</script><p>۱ &lt; ۲</p>')).toBe('راهنما & نصب ۱ < ۲')
  })
  it('publishes ordered hierarchy and stops malformed cycles', () => {
    setup()
    const make = (id: string, parentId: string | null): CatalogCategory => ({ id, parentId, slug: id, name: id, productCount: 1, image: '' })
    const nodes = [make('root', null), make('parent', 'root'), make('leaf', 'parent')]
    expect(categoryAncestors(nodes, 'leaf').map(node => node.id)).toEqual(['root', 'parent'])
    expect(categoryAncestors([make('root','leaf'), ...nodes.slice(1)], 'leaf').map(node => node.id)).toEqual(['root','parent'])
    expect(breadcrumb([{ name: 'خانه', path: '/' }, { name: 'کالا', path: '/products/test-hinge' }])).toMatchObject({ itemListElement: [{ position: 1, item: origin+'/' }, { position: 2, item: origin+'/products/test-hinge' }] })
  })
})
