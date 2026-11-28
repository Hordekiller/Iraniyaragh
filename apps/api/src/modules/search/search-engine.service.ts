import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { ProductListQueryDto } from '../catalog/catalog.dto';
import { filteredCatalogSql } from '../catalog/public-catalog-query';
import { keyboardAlternative, rankedSearchSql } from './search-query';

export type SearchFacet = { id: string; name: string; slug: string; count: number };
export type RankedSearch = { ids: string[]; total: number; page: number; perPage: number; correctedQuery: string | null; categories: SearchFacet[]; brands: SearchFacet[]; degraded: boolean };

@Injectable()
export class SearchEngine {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: Partial<ProductListQueryDto>): Promise<RankedSearch> {
    const raw = (query.search ?? '').trim();
    if (raw.length > 150 || raw.split(/\s+/u).length > 8) throw new BadRequestException('Search is limited to 150 characters and 8 words.');
    const page = Math.min(query.page ?? 1, 1000);
    const perPage = Math.min(query.perPage ?? 24, 24);
    const empty: RankedSearch = { ids: [], total: 0, page, perPage, correctedQuery: null, categories: [], brands: [], degraded: false };
    if (raw.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return empty;
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '1200ms'`;
        await tx.$executeRaw`SET LOCAL pg_trgm.similarity_threshold = 0.25`;
        const alternative = keyboardAlternative(raw);
        const normalized = await tx.$queryRaw<{ q: string; keyboard: string }[]>`SELECT search_normalize_v1(${raw}) AS q, search_normalize_v1(${alternative ?? ''}) AS keyboard`;
        const q = normalized[0]!.q;
        const aliases = await tx.$queryRaw<{ replacement: string }[]>`SELECT replacement FROM "SearchAlias" WHERE term=${q} OR replacement=${q} LIMIT 4`;
        const reverse = await tx.$queryRaw<{ replacement: string }[]>`SELECT term AS replacement FROM "SearchAlias" WHERE replacement=${q} LIMIT 4`;
        const queries = [...new Set([q, ...aliases.map(a => a.replacement), ...reverse.map(a => a.replacement), normalized[0]!.keyboard].filter(Boolean))].slice(0, 6);
        let categoryIds: string[] | null = null;
        if (query.categoryId) {
          const categories = await tx.$queryRaw<{ id: string }[]>`WITH RECURSIVE tree AS (SELECT id FROM "Category" WHERE id=${query.categoryId} UNION SELECT c.id FROM "Category" c JOIN tree t ON c."parentId"=t.id) SELECT id FROM tree`;
          categoryIds = categories.map(c => c.id);
        }
        const matches = rankedSearchSql(queries);
        const eligible = filteredCatalogSql({ ...query, search: undefined }, categoryIds);
        const matched = Prisma.sql`SELECT e.*, r.score FROM (${matches}) r JOIN (${eligible}) e ON e.id=r.id`;
        const sales = Prisma.sql`greatest(
          coalesce((SELECT sum(oi.quantity) FROM "OrderItem" oi JOIN "ProductVariant" v ON v.id=oi."variantId" JOIN "Order" o ON o.id=oi."orderId" WHERE v."productId"=m.id AND (o.status::text='CREDIT_APPROVED' OR (o.status::text='PAID' AND EXISTS (SELECT 1 FROM "Payment" pay WHERE pay."orderId"=o.id AND pay.status::text IN ('PAID','PARTIALLY_REFUNDED'))))),0)
          - coalesce((SELECT sum(ret.quantity) FROM "CreditSaleReturnLine" ret JOIN "OrderItem" oi ON oi.id=ret."orderItemId" JOIN "ProductVariant" v ON v.id=oi."variantId" JOIN "Order" o ON o.id=oi."orderId" AND o.status::text='CREDIT_APPROVED' WHERE v."productId"=m.id),0),0)`;
        const sort = query.sortBy === 'price' ? Prisma.sql`price ${query.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST, score DESC`
          : query.sortBy === 'createdAt' ? Prisma.sql`"createdAt" DESC, score DESC`
          : query.sortBy === 'popular' ? Prisma.sql`${sales} DESC, score DESC`
          : Prisma.sql`score DESC`;
        const order = Prisma.sql`(score >= 10000) DESC, ${sort}`;
        const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM (${matched}) m ORDER BY ${order}, id ASC LIMIT ${perPage} OFFSET ${(page-1)*perPage}`);
        const counts = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM (${matched}) m`);
        const facets = await tx.$queryRaw<{ kind: string; id: string; name: string; slug: string; count: bigint }[]>(Prisma.sql`
          WITH matches AS (${matched})
          SELECT 'category' AS kind, c.id,c.name,c.slug,count(*) AS count FROM matches m JOIN "Product" p ON p.id=m.id JOIN "Category" c ON c.id=p."categoryId" GROUP BY c.id
          UNION ALL SELECT 'brand',b.id,b.name,b.slug,count(*) FROM matches m JOIN "Product" p ON p.id=m.id JOIN "Brand" b ON b.id=p."brandId" GROUP BY b.id ORDER BY count DESC, id LIMIT 40`);
        let correctedQuery: string | null = null;
        if (queries.length > 1 && rows.length) {
          const primary = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM (${rankedSearchSql([q])}) original LIMIT 1`);
          if (!primary.length) correctedQuery = aliases[0]?.replacement ?? normalized[0]!.keyboard ?? reverse[0]?.replacement ?? null;
        }
        return { ...empty, ids: rows.map(r => r.id), total: Number(counts[0]?.total ?? 0), categories: facets.filter(f=>f.kind==='category').map(f=>({...f,count:Number(f.count)})), brands: facets.filter(f=>f.kind==='brand').map(f=>({...f,count:Number(f.count)})), correctedQuery };
      }, { timeout: 5000, maxWait: 1000 });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // A separate indexed title path keeps ordinary shopping usable if the projection fails.
      try { return await this.fallback(query, empty); }
      catch { throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Search is temporarily unavailable. Please retry.' }); }
    }
  }
  private async fallback(query: Partial<ProductListQueryDto>, empty: RankedSearch): Promise<RankedSearch> {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '500ms'`;
      const normalized=await tx.$queryRaw<{q:string}[]>`SELECT search_normalize_v1(${query.search??''}) AS q`;
      const q=normalized[0]?.q??'';
      if(q.length<2) return {...empty,degraded:true};
      let categories:string[]|null=null;
      if(query.categoryId) categories=(await tx.$queryRaw<{id:string}[]>`WITH RECURSIVE tree AS (SELECT id FROM "Category" WHERE id=${query.categoryId} UNION SELECT c.id FROM "Category" c JOIN tree ON c."parentId"=tree.id) SELECT id FROM tree`).map(r=>r.id);
      const eligible=filteredCatalogSql({...query,search:undefined},categories);
      const matched=Prisma.sql`SELECT e.* FROM (${eligible}) e JOIN "Product" p ON p.id=e.id WHERE p.status='ACTIVE' AND search_normalize_v1(p.name) LIKE ${q+'%'}`;
      const order=query.sortBy==='price'?Prisma.sql`price ${query.sortDir==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`} NULLS LAST`:Prisma.sql`"createdAt" DESC`;
      const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM (${matched}) m ORDER BY ${order},id LIMIT ${empty.perPage} OFFSET ${(empty.page-1)*empty.perPage}`);
      const counts=await tx.$queryRaw<{total:bigint}[]>(Prisma.sql`SELECT count(*) AS total FROM (${matched}) m`);
      return {...empty,ids:rows.map(r=>r.id),total:Number(counts[0]?.total??0),degraded:true};
    },{timeout:2000,maxWait:500});
  }

}
