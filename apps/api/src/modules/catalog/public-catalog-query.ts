import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProductListQueryDto } from './catalog.dto';

/** Full-catalog filters are applied before pagination; money stays in integer IRR. */
export function filteredCatalogSql(query: Partial<ProductListQueryDto>, categoryIds: string[] | null, includePrice = true): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'ACTIVE'`];
  if (categoryIds) conditions.push(categoryIds.length ? Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds)})` : Prisma.sql`FALSE`);
  if (query.brandId) conditions.push(Prisma.sql`p."brandId" = ${query.brandId}`);
  if (query.search?.trim()) { const term = `%${query.search.trim().replace(/[\\%_]/gu, '\\$&')}%`; conditions.push(Prisma.sql`(p.name ILIKE ${term} OR p.slug ILIKE ${term})`); }
  if (query.slugs) { const slugs = query.slugs.split(','); if (slugs.length > 40 || slugs.some(slug => !/^[\p{L}\p{N}-]{1,250}$/u.test(slug))) throw new BadRequestException('Invalid product slugs.'); conditions.push(Prisma.sql`p.slug IN (${Prisma.join(slugs)})`); }
  if (query.ids) { const ids = query.ids.split(','); if (ids.length > 24 || ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/u.test(id))) throw new BadRequestException('Invalid product selection.'); conditions.push(Prisma.sql`p.id IN (${Prisma.join(ids)})`); }
  if (query.minPrice) conditions.push(Prisma.sql`lowest."salePrice" >= ${BigInt(query.minPrice)}`);
  if (query.maxPrice) conditions.push(Prisma.sql`lowest."salePrice" <= ${BigInt(query.maxPrice)}`);
  if (query.minPrice && query.maxPrice && BigInt(query.minPrice) > BigInt(query.maxPrice)) throw new BadRequestException('Minimum price exceeds maximum price.');
  if (query.available === 'true') conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v JOIN "InventoryBalance" balance ON balance."variantId" = v.id WHERE v."productId" = p.id AND v."isActive" AND v.status = 'ACTIVE' GROUP BY v.id HAVING SUM(balance.available) > 0)`);
  if (query.discounted === 'true') conditions.push(Prisma.sql`previous."salePrice" > lowest."salePrice" AND latest."salePrice" = lowest."salePrice"`);
  if (query.attributes) {
    let attributes: unknown;
    try { attributes = JSON.parse(query.attributes); } catch { throw new BadRequestException('Invalid attribute filter.'); }
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes) || Object.keys(attributes).length > 8) throw new BadRequestException('Invalid attribute filter.');
    const options: Prisma.Sql[] = [];
    for (const [code, value] of Object.entries(attributes)) {
      if (!/^[a-z0-9-]{1,40}$/u.test(code) || typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/u.test(value)) throw new BadRequestException('Invalid attribute option.');
      options.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariantAttributeValue" av JOIN "AttributeDefinition" a ON a.id = av."attributeId" JOIN "AttributeOption" o ON o.id = av."optionId" WHERE av."variantId" = v.id AND a.status = 'ACTIVE' AND o.status = 'ACTIVE' AND a.code = ${code} AND o.code = ${value})`);
    }
    if (options.length) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v."isActive" AND v.status = 'ACTIVE' AND ${Prisma.join(options, ' AND ')})`);
  }
  const price = includePrice ? Prisma.sql`lowest."salePrice"` : Prisma.sql`NULL::bigint`;
  const priceJoins = includePrice ? Prisma.sql`
    LEFT JOIN LATERAL (SELECT v.id, v."salePrice" FROM "ProductVariant" v WHERE v."productId" = p.id AND v."isActive" AND v.status = 'ACTIVE' ORDER BY v."salePrice", v.id LIMIT 1) lowest ON TRUE
    LEFT JOIN LATERAL (SELECT r."salePrice" FROM "VariantPriceRecord" r WHERE r."variantId" = lowest.id AND r."effectiveAt" <= NOW() ORDER BY r."effectiveAt" DESC, r."createdAt" DESC, r.id DESC LIMIT 1) latest ON TRUE
    LEFT JOIN LATERAL (SELECT r."salePrice" FROM "VariantPriceRecord" r WHERE r."variantId" = lowest.id AND r."effectiveAt" <= NOW() ORDER BY r."effectiveAt" DESC, r."createdAt" DESC, r.id DESC OFFSET 1 LIMIT 1) previous ON TRUE` : Prisma.empty;
  return Prisma.sql`SELECT p.id, p.name, p."createdAt", p."updatedAt", ${price} AS price
    FROM "Product" p
    ${priceJoins}
    WHERE ${Prisma.join(conditions, ' AND ')}`;
}
