import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { SearchEngine } from './search-engine.service';
import { keyboardAlternative } from './search-query';

// Public hardware terminology; fixture products exist only in the guarded test database.
const fixtures = [
  ['hinge','لولا گازور آرام‌بند QRP K63','QRP-K63'],
  ['slide45','ریل ساچمه‌ای سه تکه 45','RAIL-45'],
  ['slide40','ریل ساچمه‌ای سه تکه 40','RAIL-40'],
  ['handle','دستگیره کابینت استیل','HANDLE-1'],
  ['screw','پیچ مشکی دنده درشت سرخزینه‌ای','SCREW-10'],
  ['hidden','لولا مخفی منتشرنشده','HIDDEN-1'],
] as const;

describe.sequential('Persian instant search on PostgreSQL', () => {
  const prisma = new PrismaService();
  const engine = new SearchEngine(prisma);
  const run = `search-test-${randomUUID()}`;
  const id = (key: string) => `${run}-${key}`;
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    await prisma.brand.create({data:{id:id('brand'),name:'کیو آر پی',slug:id('brand')}});
    await prisma.category.create({data:{id:id('category'),name:'یراق کابینت',slug:id('category')}});
    for (const [key,name,sku] of fixtures) {
      await prisma.product.create({data:{id:id(key),name,slug:id(key),description:key==='screw'?'لوله — TEST FIXTURE, not for sale':'TEST FIXTURE — not for sale',status:key==='hidden'?'DRAFT':'ACTIVE',brandId:id('brand'),categoryId:id('category'),variants:{create:{id:id(`${key}-v`),sku:`${sku}-${run}`,skuKey:`${sku}-${run}`,combinationSignature:'none',title:sku,salePrice:10000n,status:'ACTIVE',isActive:true}}}});
    }
    await prisma.productVariant.update({where:{id:id('screw-v')},data:{barcode:'9876543210123',lengthCm:27}});
  });
  afterAll(async () => {
    await prisma.product.deleteMany({where:{id:{startsWith:run}}});
    await prisma.brand.deleteMany({where:{id:id('brand')}});
    await prisma.category.deleteMany({where:{id:id('category')}});
    await prisma.$disconnect();
  });
  async function search(q: string) { return engine.search({search:q,sortBy:'relevance'}); }
  it('normalizes Persian/Arabic letters, digits, diacritics and ZWNJ consistently', async () => {
    const rows = await prisma.$queryRaw<{a:string;b:string;c:string}[]>`SELECT search_normalize_v1('ريل ساچمه‌اي ۴۵') AS a,search_normalize_v1('ریل ساچمه ای ٤٥') AS b,search_normalize_v1('رِیل ساچمه ای 45') AS c`;
    expect(rows[0]?.a).toBe(rows[0]?.b); expect(rows[0]?.b).toBe(rows[0]?.c);
  });
  const golden: [string,string][] = [['لو','hinge'],['لولا گاز','hinge'],['گازر','hinge'],['ارامبند','hinge'],['آرام بند','hinge'],['g,gh','hinge'],['hinge','hinge'],['دسگیره','handle'],['ريل ساچمه اي ۴۵','slide45'],['ریل ٤٠','slide40'],['پیچ مشکی','screw'],['K63','hinge'],['QRP','hinge']];
  it.each(golden)('ranks %s in top three (%s)', async (query, expected) => {
    const result = await search(query); expect(result.ids.slice(0,3)).toContain(id(expected));
  });
  it('does not silently correct model or size digits', async () => {
    expect((await search('ریل 46')).ids).toEqual([]);
    expect((await search('K64')).ids).toEqual([]);
    expect((await search('ریل 45')).ids).not.toContain(id('slide40'));
  });
  it('does not suggest a different product from a short typo in its description', async () => {
    expect((await search('لولا')).ids).not.toContain(id('screw'));
    expect((await search('گازر')).ids).toContain(id('hinge'));
  });
  it('finds verified barcode and dimensions without fuzzy number matching', async () => {
    expect((await search('9876543210123')).ids).toContain(id('screw'));
    expect((await search('27')).ids).toContain(id('screw'));
    expect((await search('28')).ids).not.toContain(id('screw'));
  });
  it('narrows results as text is typed', async () => {
    const broad = await search('ری'); const narrow = await search('ریل 45');
    expect(broad.total).toBeGreaterThan(narrow.total); expect(narrow.ids).toEqual([id('slide45')]);
  });
  it('returns a keyboard correction when it provides the match', async () => {
    const result = await search('g,gh');
    expect(result.ids[0]).toBe(id('hinge'));
    expect(result.correctedQuery).toBe('لولا');
  });
  it('keeps exact SKU first and unpublished products private', async () => {
    expect((await search(`QRP-K63-${run}`)).ids[0]).toBe(id('hinge'));
    expect((await engine.search({search:`QRP-K63-${run}`,sortBy:'popular'})).ids[0]).toBe(id('hinge'));
    expect((await search('منتشرنشده')).ids).toEqual([]);
  });
  it('synchronizes committed catalog changes and rolls projection back with failed writes', async () => {
    await prisma.product.update({where:{id:id('handle')},data:{name:'دستگیره طلایی آزمایشی'}});
    expect((await search('طلایی')).ids).toContain(id('handle'));
    await expect(prisma.$transaction(async tx=> { await tx.product.update({where:{id:id('handle')},data:{name:'نبایدبماند'}}); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect((await search('نبایدبماند')).ids).toEqual([]);
    expect((await search('طلایی')).ids).toContain(id('handle'));
  });
  it('does not rebuild search terms for price-only commerce updates', async () => {
    const documentId=id('handle-v');
    const before=await prisma.searchDocument.findUniqueOrThrow({where:{id:documentId},select:{updatedAt:true}});
    await prisma.productVariant.update({where:{id:documentId},data:{salePrice:12000n}});
    const after=await prisma.searchDocument.findUniqueOrThrow({where:{id:documentId},select:{updatedAt:true}});
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await search('طلایی')).ids).toContain(id('handle'));
  });
  it('revalidates product and variant visibility', async () => {
    await prisma.productVariant.update({where:{id:id('screw-v')},data:{status:'INACTIVE',isActive:false}});
    expect((await search('پیچ')).ids).not.toContain(id('screw'));
    await prisma.productVariant.update({where:{id:id('screw-v')},data:{status:'ACTIVE',isActive:true}});
  });
  it('applies filters before page counts and gives stable ordering', async () => {
    const all = await engine.search({search:'ریل',sortBy:'relevance',perPage:1,page:1});
    const next = await engine.search({search:'ریل',sortBy:'relevance',perPage:1,page:2});
    expect(all.total).toBe(2); expect(next.total).toBe(2); expect(next.ids).not.toEqual(all.ids);
    expect((await engine.search({search:'ریل',minPrice:'10001'})).total).toBe(0);
    expect((await engine.search({search:'ریل',categoryId:'missing'})).total).toBe(0);
    const popular = await engine.search({search:'ریل',sortBy:'popular'});
    expect(popular.total).toBe(2);
    expect(popular.degraded).toBe(false);
  });
  it('treats hostile input as data and bounds query complexity', async () => {
    expect((await search("' OR TRUE --")).total).toBe(0);
    expect((await search('%_')).total).toBe(0);
    await expect(search('x'.repeat(151))).rejects.toThrow();
    expect(keyboardAlternative('g,gh')).toBe('لولا');
  });
  it('reports warm database search latency and golden relevance without invented targets', async () => {
    const latencies: number[]=[]; let hits=0,rr=0,zero=0;
    for (const [query,expected] of golden) { const result=await search(query); const rank=result.ids.indexOf(id(expected))+1; if(rank>0 && rank<=3)hits++; if(rank>0)rr+=1/rank; if(!result.total)zero++; }
    for(let i=0;i<30;i++){const start=performance.now();await search('ریل');latencies.push(performance.now()-start);}
    latencies.sort((a,b)=>a-b);
    const syncStart = performance.now();
    await prisma.product.update({ where: { id: id('handle') }, data: { name: 'دستگیره طلایی آزمایشی' } });
    const syncCommitMs = performance.now()-syncStart;
    const sizes = await prisma.$queryRaw<{bytes:bigint}[]>`SELECT pg_total_relation_size('"SearchDocument"')+pg_total_relation_size('"SearchTerm"') AS bytes`;
    console.info(JSON.stringify({benchmark:'search-db-fixtures',samples:30,warmP95Ms:latencies[Math.ceil(latencies.length*.95)-1],top3:hits/golden.length,mrr:rr/golden.length,zeroRate:zero/golden.length,syncCommitMs,projectionBytes:Number(sizes[0]?.bytes??0)}));
  });
});
