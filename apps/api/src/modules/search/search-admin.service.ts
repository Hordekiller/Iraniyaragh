import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from '../catalog/catalog-idempotency.service';
import { getRequestId } from '../../common/request-context';

export type SearchCommand = { action: 'alias' | 'keywords' | 'reindex'; term?: string; replacement?: string; productId?: string; keywords?: string; boost?: number; cursor?: string; remove?: boolean };

@Injectable()
export class SearchAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly idempotency: CatalogIdempotencyService) {}
  async read() {
    const [stats, aliases, keywords, metrics] = await Promise.all([
      this.prisma.$queryRaw<{documents:bigint;products:bigint;latest:Date|null;missing:bigint}[]>`SELECT (SELECT count(*) FROM "SearchDocument") AS documents,(SELECT count(DISTINCT "productId") FROM "SearchDocument") AS products,(SELECT max("updatedAt") FROM "SearchDocument") AS latest,(SELECT count(*) FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" LEFT JOIN "SearchDocument" d ON d.id=v.id WHERE p.status='ACTIVE' AND v.status='ACTIVE' AND v."isActive" AND d.id IS NULL) AS missing`,
      this.prisma.searchAlias.findMany({orderBy:{term:'asc'},take:200}),
      this.prisma.searchProductKeywords.findMany({orderBy:{productId:'asc'},take:100}),
      this.prisma.$queryRaw<{query:string;searches:bigint;zeroResults:bigint;clicks:bigint}[]>`SELECT query,sum(searches) AS searches,sum("zeroResults") AS "zeroResults",sum(clicks) AS clicks FROM "SearchDailyMetric" WHERE day>=CURRENT_DATE-30 GROUP BY query ORDER BY sum(searches) DESC, query LIMIT 50`,
    ]);
    const stat=stats[0]!;
    return { engine:'postgresql', normalizationVersion:1, syncMode:'transactional', documents:Number(stat.documents), products:Number(stat.products), missing:Number(stat.missing), latest:stat.latest?.toISOString()??null, aliases, keywords, metrics:metrics.map(m=>({...m,searches:Number(m.searches),zeroResults:Number(m.zeroResults),clicks:Number(m.clicks)})), conversionTracking:false };
  }
  async command(actorId:string,key:string,input:SearchCommand) {
    return this.idempotency.run({actorId,scope:'search.manage',key,payload:input,execute:async tx=>{
      let nextCursor: string|null=null;
      if(input.action==='alias') {
        const [normalized]=await tx.$queryRaw<{term:string;replacement:string}[]>`SELECT search_normalize_v1(${input.term??''}) AS term,search_normalize_v1(${input.replacement??''}) AS replacement`;
        if(!normalized || !/^[a-zء-ی ]{2,60}$/u.test(normalized.term) || (!input.remove && !/^[a-zء-ی ]{2,60}$/u.test(normalized.replacement))) throw new BadRequestException('Aliases must be words, without numeric sizes or identifiers.');
        if(input.remove) await tx.searchAlias.deleteMany({where:{term:normalized.term}});
        else {
          if(await tx.searchAlias.count()>=200 && !await tx.searchAlias.findUnique({where:{term:normalized.term}})) throw new BadRequestException('At most 200 approved aliases.');
          await tx.searchAlias.upsert({where:{term:normalized.term},create:normalized,update:{replacement:normalized.replacement,updatedAt:new Date()}});
        }
      } else if(input.action==='keywords') {
        if(!input.productId || !await tx.product.findUnique({where:{id:input.productId},select:{id:true}})) throw new BadRequestException('Product not found.');
        if((input.keywords??'').length>500 || !Number.isInteger(input.boost??0) || (input.boost??0)<0 || (input.boost??0)>10) throw new BadRequestException('Invalid keywords or tie-break boost.');
        await tx.searchProductKeywords.upsert({where:{productId:input.productId},create:{productId:input.productId,keywords:input.keywords??'',boost:input.boost??0},update:{keywords:input.keywords??'',boost:input.boost??0}});
      } else if(input.action==='reindex') {
        const rows=await tx.product.findMany({where:{id:{gt:input.cursor??''}},select:{id:true},orderBy:{id:'asc'},take:25});
        for(const row of rows) await tx.$queryRaw`SELECT refresh_product_search_v1(${row.id})`;
        nextCursor=rows.length===25?rows.at(-1)!.id:null;
      } else throw new BadRequestException('Unknown search action.');
      await this.audit.record({actorId,action:`search.${input.action}`,entityType:'Search',entityId:input.productId??'configuration',requestId:getRequestId(),after:{action:input.action,payloadSha256:createHash('sha256').update(JSON.stringify(input)).digest('hex')}},tx);
      return {response:{data:{saved:true,nextCursor}}};
    }});
  }

  async popular() {
    const rows=await this.prisma.$queryRaw<{query:string}[]>`SELECT query FROM "SearchDailyMetric" WHERE day>=CURRENT_DATE-30 AND query<>'[unrecognized]' GROUP BY query HAVING sum(searches)>=3 AND sum(searches)>sum("zeroResults") ORDER BY sum(searches) DESC,query LIMIT 6`;
    return {data:{queries:rows.map(r=>r.query)}};
  }

  /** No IP, user ID, email, phone, or arbitrary raw query is retained. */
  async metric(query:string,total:number,click=false) {
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SET LOCAL statement_timeout = '250ms'`;
      const [row]=await tx.$queryRaw<{query:string}[]>`SELECT search_normalize_v1(${query}) AS query`;
      const normalized=row?.query??'';
      const tokens=normalized.split(' ').filter(Boolean);
      const safe = tokens.length>0 && tokens.length<=8 && normalized.length<=80 && !/[0-9]/.test(normalized) && !query.includes('@');
      const known=safe?await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(DISTINCT term) AS count FROM "SearchTerm" WHERE term IN (${Prisma.join(tokens)})`):[];
      const label=Number(known[0]?.count??0)===new Set(tokens).size && safe?normalized:'[unrecognized]';
      await tx.$executeRaw`INSERT INTO "SearchDailyMetric"(day,query,searches,"zeroResults",clicks) VALUES(CURRENT_DATE,${label},${click?0:1},${!click && total===0?1:0},${click?1:0}) ON CONFLICT(day,query) DO UPDATE SET searches="SearchDailyMetric".searches+EXCLUDED.searches,"zeroResults"="SearchDailyMetric"."zeroResults"+EXCLUDED."zeroResults",clicks="SearchDailyMetric".clicks+EXCLUDED.clicks`;
      await tx.$executeRaw`DELETE FROM "SearchDailyMetric" WHERE day<CURRENT_DATE-30`;
    });
  }
}
