import { describe, expect, it } from 'vitest';
import { filteredCatalogSql } from './public-catalog-query';

describe('filteredCatalogSql', () => {
  it('applies shop filters before pagination with bound values', () => {
    const query = filteredCatalogSql({
      brandId: 'brand-1', search: '  50%_  ', slugs: 'drill-a,drill-b', ids: 'id-1,id-2',
      minPrice: '1000', maxPrice: '9000', available: 'true', discounted: 'true',
      attributes: '{"color":"black","size":"small"}',
    }, ['category-1', 'category-2']);
    expect(query.sql).toContain('lowest."salePrice" >=');
    expect(query.sql).toContain('previous."salePrice" > lowest."salePrice"');
    expect(query.sql).toContain('SUM(balance.available) > 0');
    expect(query.sql).toContain('a.code =');
    expect(query.values).toContain('%50\\%\\_%');
    expect(query.values).toContain(1000n);
    expect(query.values).toContain(9000n);
    expect(query.values).toContain('category-1');
  });

  it('makes an empty category selection match no products', () => {
    expect(filteredCatalogSql({}, []).sql).toContain('FALSE');
    expect(filteredCatalogSql({}, null).sql).not.toContain('FALSE');
  });

  it('omits price history joins when a relevance search does not use price', () => {
    const query = filteredCatalogSql({ brandId: 'brand-1', available: 'true' }, null, false);
    expect(query.sql).not.toContain('VariantPriceRecord');
    expect(query.sql).toContain('NULL::bigint AS price');
    expect(query.sql).toContain('SUM(balance.available) > 0');
  });

  it('rejects invalid selections and reversed price bounds', () => {
    expect(() => filteredCatalogSql({ slugs: 'bad slug' }, null)).toThrow();
    expect(() => filteredCatalogSql({ ids: 'bad/id' }, null)).toThrow();
    expect(() => filteredCatalogSql({ ids: Array.from({ length: 25 }, (_, i) => `id-${i}`).join(',') }, null)).toThrow();
    expect(() => filteredCatalogSql({ minPrice: '9000', maxPrice: '1000' }, null)).toThrow();
  });

  it('rejects malformed and unsafe attribute filters', () => {
    expect(() => filteredCatalogSql({ attributes: '{' }, null)).toThrow();
    expect(() => filteredCatalogSql({ attributes: '[]' }, null)).toThrow();
    expect(() => filteredCatalogSql({ attributes: '{"unsafe.code":"x"}' }, null)).toThrow();
    expect(() => filteredCatalogSql({ attributes: '{"color":"unsafe value"}' }, null)).toThrow();
    expect(filteredCatalogSql({ attributes: '{}' }, null).sql).toContain('p.status');
  });
});
