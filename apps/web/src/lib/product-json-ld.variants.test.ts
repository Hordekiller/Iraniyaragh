import { describe, expect, it } from 'vitest'
import { productStructuredData, productVariantGroup } from './product-json-ld'
import { requestedCatalogVariant, validVariantQuery } from '../services/catalog/variants'
import type { CatalogProduct, CatalogVariant } from '../services/catalog/types'

const variant = (id: string, color: string, stockStatus: CatalogVariant['stockStatus']): CatalogVariant => ({
  id, sku: `SKU-${id}`, title: color, price: { amount: '9007199254740993', currency: 'IRR' }, stockStatus,
  attributes: [{ attributeCode: 'color', attributeName: 'رنگ', optionCode: color, optionLabel: color, isVariantAxis: true }, { attributeCode: 'load', attributeName: 'تحمل بار', optionCode: 'heavy', optionLabel: '۴۰ کیلوگرم', isVariantAxis: false }],
})
const product: CatalogProduct = {
  id: 'p', slug: 'p', name: 'ریل', brand: 'برند', category: null, image: '', media: [],
  variants: [variant('v1', 'سفید', 'OUT_OF_STOCK'), variant('v2', 'مشکی', 'IN_STOCK')],
  description: null, price: { amount: '9007199254740993', currency: 'IRR' }, oldPrice: null, rating: null, reviews: 0, stockStatus: 'IN_STOCK', badge: null,
}
const url = 'https://shop.example/products/p'

describe('catalog-backed product markup', () => {
  it('describes the visible default SKU and its exact entered specifications', () => {
    expect(productStructuredData(product, url, '')).toMatchObject({
      sku: 'SKU-v2', color: 'مشکی', offers: { price: '9007199254740993', priceCurrency: 'IRR', availability: 'https://schema.org/InStock' },
      additionalProperty: [{ '@type': 'PropertyValue', name: 'رنگ', value: 'مشکی' }, { '@type': 'PropertyValue', name: 'تحمل بار', value: '۴۰ کیلوگرم' }],
    })
  })
  it('does not misrepresent unknown stock or fabricate identifiers and policies', () => {
    const data = productStructuredData(product, url, '', { ...product.variants[0], stockStatus: 'UNKNOWN' })
    expect(data?.offers).not.toHaveProperty('availability')
    for (const field of ['gtin', 'mpn', 'aggregateRating', 'itemCondition']) expect(data).not.toHaveProperty(field)
    for (const field of ['shippingDetails', 'hasMerchantReturnPolicy', 'priceValidUntil']) expect(data?.offers).not.toHaveProperty(field)
  })
  it('groups distinct real variant axes and exposes working URLs for every SKU', () => {
    const group = productVariantGroup(product, url, '')
    expect(group).toMatchObject({ '@type': 'ProductGroup', productGroupID: 'p', variesBy: ['https://schema.org/color'] })
    for (const child of group!.hasVariant) {
      const query = Object.fromEntries(new URL(child!.url).searchParams)
      expect(validVariantQuery(product.variants, query)).toBe(true)
      expect(requestedCatalogVariant(product.variants, query.variant)?.sku).toBe(child!.sku)
    }
    expect(group?.hasVariant[0]?.offers.availability).toBe('https://schema.org/OutOfStock')
  })
  it('does not invent groups from duplicate SKU identifiers or missing axes', () => {
    expect(productVariantGroup({ ...product, variants: product.variants.map(item => ({ ...item, sku: 'same' })) }, url, '')).toBeNull()
    expect(productVariantGroup({ ...product, variants: product.variants.map(item => ({ ...item, attributes: [] })) }, url, '')).toBeNull()
  })
  it('uses the widest usable rendition once per photo, including client-relative product paths', () => {
    const image = { id: 'photo', kind: 'IMAGE' as const, role: 'PRIMARY' as const, alt: 'ریل', sortOrder: 0, sources: [
      { url: 'javascript:alert(1)', width: 1600, height: 1000, mime: 'image/webp' as const },
      { url: 'https://cdn.example/large.webp', width: 1200, height: 800, mime: 'image/webp' as const },
      { url: 'https://cdn.example/small.webp', width: 200, height: 100, mime: 'image/webp' as const },
    ] }
    const withMedia = { ...product, media: [image] } as unknown as CatalogProduct
    expect(productStructuredData(withMedia, url, '')?.image).toEqual(['https://cdn.example/large.webp'])
    expect(productStructuredData(withMedia, '/products/p', '')?.image).toEqual(['https://cdn.example/large.webp'])
  })
  it('rejects unknown, duplicate and extra variant query parameters', () => {
    for (const query of [{ variant: 'missing' }, { variant: ['v1', 'v2'] }, { variant: 'v1', other: 'x' }]) expect(validVariantQuery(product.variants, query)).toBe(false)
    expect(validVariantQuery(product.variants, {})).toBe(true)
  })
})
