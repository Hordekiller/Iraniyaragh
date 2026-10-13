import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { OperationalReportService } from '../reports/operational-report.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePublicationService } from './invoice-publication.service';
import { CustomersService } from '../customers/customers.service';

describe.sequential('Immutable store invoice issuance PostgreSQL acceptance', () => {
  const prisma = new PrismaService(); const audit = new AuditLogService(prisma); const orders = new StaffOrderService(prisma, audit);
  const policies = new InvoicePolicyService(prisma, audit); const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const drafts = new InvoiceDraftService(prisma, audit, orders, shipping); const service = new InvoiceDocumentService(prisma, audit, drafts, policies);
  const access = new InvoicePublicationService(prisma, audit);
  const customers = new CustomersService(prisma, audit);
  const run = randomUUID().replaceAll('-',''); const requestId = `invoice-issue-${run}`; let sequence = 0;
  let actorId = ''; let customerUserId = ''; let foreignUserId = ''; let customerId = ''; let variantId = ''; let productId = ''; let warehouseId = ''; let locationId = ''; let connected = false;
  const key = () => `issue-${run}-${sequence++}`;
  const address = { provinceCode: 'THR', city: 'Isolated city', address: 'Isolated invoice address', postalCode: '1234567890', recipient: 'Isolated recipient', mobile: '+989120000000' };
  const code = (name: string) => expect.objectContaining({ response: expect.objectContaining({ code: name }) });
  async function clearInvoices() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision"');
  }
  async function policy(taxTreatment: 'INCLUSIVE'|'EXCLUSIVE' = 'INCLUSIVE', taxRateBps = 0) {
    const previous = await policies.current();
    return policies.update(actorId,requestId,{ expectedVersion: previous?.version ?? null, sellerName: 'Isolated seller', sellerAddress: 'Isolated seller address', sellerContact: 'Public test contact',
      taxTreatment, taxRateBps, exemptionReason: null, discountCapBps: 10000, shippingTaxable: false, isActive: true, reason: 'Isolated accepted test policy' },key());
  }
  async function fixture() {
    const created = await orders.create({ actorId, requestId: `${requestId}-${sequence++}`, idempotencyKey: key(), payload: { customerId, lines: [{ variantId, quantity: 2 }], address } });
    const order = created.data.order;
    const draft = (await drafts.fromOrder(actorId,requestId,order.id,{ expectedOrderVersion: order.version,note: null },key())).draft;
    return { order, draft, body: { expectedVersion: draft.version, expectedOrderVersion: order.version } };
  }
  const issue = (data: Awaited<ReturnType<typeof fixture>>, commandKey = key()) => service.issue(actorId,requestId,data.draft.id,data.body,commandKey);
  const stringify = (value: unknown) => JSON.stringify(value,(_key,entry) => typeof entry === 'bigint' ? entry.toString() : entry);
  async function financialEvidence() { return stringify({ orders: await prisma.order.findMany({ where: { customerId },include: { items: true,reservations: true,payments: true } }),
    stock: await prisma.inventoryBalance.findMany({ where: { variantId } }), movements: await prisma.inventoryMovement.findMany({ where: { variantId } }),
    receivables: await prisma.receivableDocument.count({ where: { account: { customerId } } }), outbox: await prisma.outboxEvent.findMany({ where: { aggregateId: { in: (await prisma.order.findMany({ where: { customerId },select: { id: true } })).map(row=>row.id) } } }) }); }
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();connected=true;await clearInvoices();
    actorId=(await prisma.user.create({ data: { email: `${run}@example.test`,status:'ACTIVE' } })).id;
    customerUserId=(await prisma.user.create({ data: { email: `buyer-${run}@example.test`,status:'ACTIVE' } })).id;
    foreignUserId=(await prisma.user.create({ data: { email: `foreign-${run}@example.test`,status:'ACTIVE' } })).id;
    customerId=(await prisma.customer.create({ data: { userId: customerUserId, mobile: `+989${(BigInt(`0x${run}`)%1000000000n).toString().padStart(9,'0')}`,firstName:'Isolated',lastName:'Buyer' } })).id;
    productId=(await prisma.product.create({ data: { name:'Isolated issue product',slug:`invoice-issue-${run}`,status:'ACTIVE' } })).id;
    const sku=`ISS-${run}`;variantId=(await prisma.productVariant.create({ data: { productId,sku,skuKey:canonicalizeSku(sku),combinationSignature:EMPTY_AXIS_SIGNATURE,salePrice:1000n,costPrice:500n,status:'ACTIVE',isActive:true } })).id;
    warehouseId=(await prisma.warehouse.create({ data: { code:`ISS-${run}`,name:'Isolated issue warehouse' } })).id;
    locationId=(await prisma.warehouseLocation.create({ data: { warehouseId,code:'ISSUE',name:'Isolated issue location' } })).id;
    await prisma.inventoryBalance.create({ data: { warehouseId,locationId,variantId,onHand:200,reserved:0,available:200 } });
  });
  afterAll(async () => {
    if(!connected)return;await clearInvoices();
    const ids=(await prisma.order.findMany({ where:{customerId},select:{id:true} })).map(row=>row.id);
    await prisma.stockReservation.deleteMany({where:{orderId:{in:ids}}});await prisma.orderTransition.deleteMany({where:{orderId:{in:ids}}});
    await prisma.staffOrderCommandRecord.deleteMany({where:{orderId:{in:ids}}});await prisma.outboxEvent.deleteMany({where:{aggregateId:{in:ids}}});
    await prisma.orderItem.deleteMany({where:{orderId:{in:ids}}});await prisma.order.deleteMany({where:{id:{in:ids}}});
    await prisma.inventoryBalance.deleteMany({where:{variantId}});await prisma.productVariant.delete({where:{id:variantId}});await prisma.product.delete({where:{id:productId}});
    await prisma.warehouseLocation.delete({where:{id:locationId}});await prisma.warehouse.delete({where:{id:warehouseId}});await prisma.customer.delete({where:{id:customerId}});
    await prisma.customerCommandRecord.deleteMany({where:{actorId}});await prisma.auditLog.deleteMany({where:{actorId}});await prisma.user.deleteMany({where:{id:{in:[actorId,customerUserId,foreignUserId]}}});await prisma.$disconnect();
  });
  it('requires an explicit approved policy and leaves no document or number after refusal', async()=>{
    const data=await fixture();const before=await financialEvidence();await expect(issue(data)).rejects.toMatchObject(code('INVOICE_POLICY_REQUIRED'));
    expect(await prisma.invoiceDocument.count()).toBe(0);expect(await prisma.invoiceSeriesCounter.count()).toBe(0);expect(await financialEvidence()).toBe(before);
  });
  it('issues the original unpaid sale privately with immutable original amounts and no commerce effects',async()=>{
    await policy();const data=await fixture();const before=await financialEvidence();const result=await issue(data);
    expect(result.document).toMatchObject({ orderId:data.order.id,customerId,series:'SALE',sequence:1,quote:{total:{amount:'2000',currency:'IRR'}},seller:{name:'Isolated seller'} });
    expect(result.document.number).toMatch(/^IRY-\d{4}-000001$/u);expect(result.document.lines[0].orderItemId).toBe((await prisma.orderItem.findFirstOrThrow({where:{orderId:data.order.id}})).id);
    expect(await drafts.read(data.draft.id)).toMatchObject({state:'ISSUED',version:data.draft.version+1});
    expect(await service.read(result.document.id)).toEqual(result.document);expect(await financialEvidence()).toBe(before);
    const events=await prisma.invoiceDocumentEvent.findMany({where:{documentId:result.document.id}});expect(events).toHaveLength(1);expect(events[0].action).toBe('ISSUED');
    const logs=stringify(await prisma.auditLog.findMany({where:{action:'invoice.document.issued',entityId:result.document.id}}));
    expect(logs).not.toContain(address.address);expect(logs).not.toContain(address.mobile);expect(logs).not.toContain('Isolated seller address');
    const report=await new OperationalReportService(prisma).summary({customerId,from:new Date(Date.now()-60000).toISOString(),toExclusive:new Date(Date.now()+60000).toISOString()});expect(report.totals.issuedInvoiceValue).toMatchObject({count:1,amount:{amount:'2000'}});expect(report.totals.providerSettlements.amount.amount).toBe('0');
  });
  it('same-key concurrent submit and service restart replay preserve the original number/document',async()=>{
    const data=await fixture();const commandKey=key();const results=await Promise.all([issue(data,commandKey),issue(data,commandKey)]);
    expect(new Set(results.map(result=>result.document.id)).size).toBe(1);expect(results.filter(result=>result.replayed)).toHaveLength(1);
    await policy('INCLUSIVE',1000);const restarted=new InvoiceDocumentService(prisma,audit,drafts,policies);
    const replay=await restarted.issue(actorId,requestId,data.draft.id,data.body,commandKey);expect(replay.document).toEqual(results[0].document);expect(replay.replayed).toBe(true);
    await expect(restarted.issue(actorId,requestId,data.draft.id,{...data.body,expectedVersion:1},commandKey)).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
  });
  it('different-key concurrent issue has exactly one original; issued draft cannot edit or cancel',async()=>{
    const data=await fixture();const results=await Promise.allSettled([issue(data),issue(data)]);expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(await prisma.invoiceDocument.count({where:{orderId:data.order.id}})).toBe(1);
    const current=await drafts.read(data.draft.id);await expect(drafts.cancel(actorId,requestId,current.id,current.version,'Cannot erase final invoice',key())).rejects.toMatchObject(code('INVOICE_DRAFT_TERMINAL'));
  });
  it('concurrent distinct sales use consecutive unique numbers without MAX+1',async()=>{
    const a=await fixture();const b=await fixture();const results=await Promise.all([issue(a),issue(b)]);
    expect(new Set(results.map(result=>result.document.number)).size).toBe(2);expect(Math.abs(results[0].document.sequence-results[1].document.sequence)).toBe(1);
  });
  it('stale draft/order and changed policy reject without consumed numbers',async()=>{
    const data=await fixture();const before=await prisma.invoiceSeriesCounter.findMany();
    await expect(service.issue(actorId,requestId,data.draft.id,{...data.body,expectedVersion:100},key())).rejects.toMatchObject(code('STALE_VERSION'));
    await expect(service.issue(actorId,requestId,data.draft.id,{...data.body,expectedOrderVersion:100},key())).rejects.toMatchObject(code('INVOICE_SOURCE_CHANGED'));
    await policy();await expect(issue(data)).rejects.toMatchObject(code('INVOICE_REQUOTE_REQUIRED'));expect(await prisma.invoiceSeriesCounter.findMany()).toEqual(before);
  });
  it('edited quantity and exclusive tax mismatch cannot alter original order or issue conflicting totals',async()=>{
    const data=await fixture();await drafts.edit(actorId,requestId,data.draft.id,{expectedVersion:0,address,lines:[{variantId,quantity:1,discount:'0'}],globalDiscount:'0',shippingMethodCode:'PICKUP',note:null},key());
    const before=await financialEvidence();await expect(service.issue(actorId,requestId,data.draft.id,{...data.body,expectedVersion:1},key())).rejects.toMatchObject(code('INVOICE_ISSUE_CONFLICT'));expect(await financialEvidence()).toBe(before);
    await policy('EXCLUSIVE',1000);const taxed=await fixture();await expect(issue(taxed)).rejects.toMatchObject(code('INVOICE_ISSUE_CONFLICT'));await policy();
  });
  it('catalog quotations cannot fabricate orders at issuance',async()=>{
    const result=await drafts.create(actorId,requestId,{customerId,address,lines:[{variantId,quantity:1,discount:'0'}],globalDiscount:'0',shippingMethodCode:'PICKUP',note:null},key());
    const before=await financialEvidence();await expect(service.issue(actorId,requestId,result.draft.id,{expectedVersion:0,expectedOrderVersion:0},key())).rejects.toMatchObject(code('INVOICE_ISSUE_CONFLICT'));expect(await financialEvidence()).toBe(before);
  });
  it('audit failure rolls back document, counter, sealed draft and command evidence together',async()=>{
    const data=await fixture();const before=await prisma.invoiceSeriesCounter.findMany();const fail=vi.spyOn(audit,'record').mockRejectedValueOnce(new Error('private buyer evidence must not leak'));
    await expect(issue(data)).rejects.toMatchObject(code('INVOICE_ISSUE_UNAVAILABLE'));fail.mockRestore();
    expect(await prisma.invoiceDocument.count({where:{orderId:data.order.id}})).toBe(0);expect(await prisma.invoiceSeriesCounter.findMany()).toEqual(before);expect((await drafts.read(data.draft.id)).state).toBe('DRAFT');
    await issue(data);
  });
  it('SQL protects final documents/lines/events/numbers and rejects later line insertion',async()=>{
    const data=await fixture();const issued=await issue(data);const documentId=issued.document.id;
    for(const sql of [
      prisma.$executeRaw`UPDATE "InvoiceDocument" SET "grandTotal" = 1 WHERE "id" = ${documentId}`,
      prisma.$executeRaw`DELETE FROM "InvoiceDocument" WHERE "id" = ${documentId}`,
      prisma.$executeRaw`UPDATE "InvoiceDocumentLine" SET "quantity" = 1 WHERE "documentId" = ${documentId}`,
      prisma.$executeRaw`DELETE FROM "InvoiceDocumentEvent" WHERE "documentId" = ${documentId}`,
      prisma.$executeRaw`UPDATE "InvoiceSeriesCounter" SET "lastNumber" = 1 WHERE "series" = 'SALE'`,
    ]) await expect(sql).rejects.toBeDefined();
    const original=await prisma.invoiceDocumentLine.findFirstOrThrow({where:{documentId}});const {id: originalId,...line}=original;expect(originalId).toBeTruthy();
    await expect(prisma.invoiceDocumentLine.create({data:{...line,ordinal:49}})).rejects.toBeDefined();
    expect(await service.read(documentId)).toEqual(issued.document);
  });
  it('publication joins the authenticated owner and strips staff/internal evidence from customer output',async()=>{
    const data=await fixture();
    const edited=await drafts.edit(actorId,requestId,data.draft.id,{expectedVersion:0,address,lines:[{variantId,quantity:2,discount:'0'}],globalDiscount:'0',shippingMethodCode:'PICKUP',note:'Private staff invoice note'},key());
    data.body.expectedVersion=edited.draft.version;
    const issued=await issue(data);const id=issued.document.id;const before=await financialEvidence();
    expect((await access.read(id)).publication).toMatchObject({version:0,isPublished:false});
    await expect(access.customerRead(customerUserId,id)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    const changed=await access.change(actorId,requestId,id,{expectedVersion:0,isPublished:true,reason:'Private operator publication evidence'},key());
    expect(changed.publication).toMatchObject({version:1,isPublished:true});
    const customer=await access.customerRead(customerUserId,id);expect(customer.number).toBe(issued.document.number);expect(customer.quote.total).toEqual(issued.document.quote.total);
    for(const field of ['note','customerId','draftId','draftVersion','policyVersion','orderVersion','pricePolicyRevision'])expect(customer).not.toHaveProperty(field);
    expect(customer.lines[0]).not.toHaveProperty('orderItemId');expect(customer.lines[0]).not.toHaveProperty('variantId');expect(customer.quote).not.toHaveProperty('lines');
    expect(stringify(customer)).not.toContain('Private');
    await expect(access.customerRead(foreignUserId,id)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    expect((await access.customerList(foreignUserId)).count).toBe(0);expect((await access.customerList(customerUserId)).items.some(row=>row.id===id)).toBe(true);
    expect(await financialEvidence()).toBe(before);expect(await service.read(id)).toEqual(issued.document);
  });
  it('revoke blocks subsequent customer reads and restart replay cannot resurrect visibility',async()=>{
    const data=await fixture();const {document}=await issue(data);const initialKey=key();const body={expectedVersion:0,isPublished:true,reason:'Initial private reason'};
    await access.change(actorId,requestId,document.id,body,initialKey);
    await access.change(actorId,requestId,document.id,{expectedVersion:1,isPublished:false,reason:'Withdraw customer access'},key());
    const restarted=new InvoicePublicationService(prisma,audit);const replay=await restarted.change(actorId,requestId,document.id,body,initialKey);
    expect(replay).toMatchObject({publication:{version:1,isPublished:true},replayed:true});
    expect((await access.read(document.id)).publication).toMatchObject({version:2,isPublished:false});
    await expect(restarted.customerRead(customerUserId,document.id)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    expect((await restarted.customerList(customerUserId)).items.some(row=>row.id===document.id)).toBe(false);
    await expect(restarted.change(actorId,requestId,document.id,{...body,reason:'Changed'},initialKey)).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
  });
  it('duplicate and concurrent visibility commands preserve exactly one contiguous transition',async()=>{
    const {document}=await issue(await fixture());const body={expectedVersion:0,isPublished:true,reason:'Approved publication'};const sharedKey=key();
    const duplicate=await Promise.all([access.change(actorId,requestId,document.id,body,sharedKey),access.change(actorId,requestId,document.id,body,sharedKey)]);
    expect(duplicate.filter(row=>row.replayed)).toHaveLength(1);expect(await prisma.invoicePublicationEvent.count({where:{documentId:document.id}})).toBe(1);
    const results=await Promise.allSettled([access.change(actorId,requestId,document.id,{expectedVersion:1,isPublished:false,reason:'Revocation A'},key()),access.change(actorId,requestId,document.id,{expectedVersion:1,isPublished:false,reason:'Revocation B'},key())]);
    expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect(await prisma.invoicePublicationEvent.count({where:{documentId:document.id}})).toBe(2);
    await expect(access.change(actorId,requestId,document.id,{expectedVersion:2,isPublished:false,reason:'No-op'},key())).rejects.toMatchObject(code('INVOICE_PUBLICATION_CONFLICT'));
  });
  it('inactive customers lose access without destroying history and cannot be newly published',async()=>{
    const {document}=await issue(await fixture());await access.change(actorId,requestId,document.id,{expectedVersion:0,isPublished:true,reason:'Approved'},key());
    const customer = await prisma.customer.findUniqueOrThrow({where:{id:customerId}});
    await customers.replaceAddresses(customerId,{expectedVersion:customer.version,addresses:[],status:'INACTIVE'},{actorId,requestId,idempotencyKey:key()});
    try {
      await expect(access.customerRead(customerUserId,document.id)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));expect((await access.customerList(customerUserId)).count).toBe(0);
      await access.change(actorId,requestId,document.id,{expectedVersion:1,isPublished:false,reason:'Customer suspended'},key());
      await expect(access.change(actorId,requestId,document.id,{expectedVersion:2,isPublished:true,reason:'Not eligible'},key())).rejects.toMatchObject(code('INVOICE_PUBLICATION_CONFLICT'));
    } finally { const customer = await prisma.customer.findUniqueOrThrow({where:{id:customerId}});await customers.replaceAddresses(customerId,{expectedVersion:customer.version,addresses:[],status:'ACTIVE'},{actorId,requestId,idempotencyKey:key()}); }
    expect(await service.read(document.id)).toEqual(document);
  });
  it('audit failure rolls back publication, event and replay record without a false success',async()=>{
    const {document}=await issue(await fixture());const fail=vi.spyOn(audit,'record').mockRejectedValueOnce(new Error('private destination evidence'));
    await expect(access.change(actorId,requestId,document.id,{expectedVersion:0,isPublished:true,reason:'Private reason'},key())).rejects.toMatchObject(code('INVOICE_PUBLICATION_UNAVAILABLE'));fail.mockRestore();
    expect((await access.read(document.id)).publication).toMatchObject({version:0,isPublished:false});expect(await prisma.invoicePublicationEvent.count({where:{documentId:document.id}})).toBe(0);
    expect(await prisma.invoicePublicationCommand.count({where:{documentId:document.id}})).toBe(0);
    expect(stringify(await prisma.auditLog.findMany({where:{action:{startsWith:'invoice.access.'}}}))).not.toContain('Private');
  });
  it('SQL forbids erasing evidence or changing visibility without its contiguous command/event',async()=>{
    const {document}=await issue(await fixture());await access.change(actorId,requestId,document.id,{expectedVersion:0,isPublished:true,reason:'Approved'},key());
    for(const query of [prisma.$executeRaw`DELETE FROM "InvoicePublication" WHERE "documentId"=${document.id}`,
      prisma.$executeRaw`UPDATE "InvoicePublication" SET "version"=2,"isPublished"=false WHERE "documentId"=${document.id}`,
      prisma.$executeRaw`UPDATE "InvoicePublicationEvent" SET "reason"='Rewrite' WHERE "documentId"=${document.id}`,
      prisma.$executeRaw`DELETE FROM "InvoicePublicationCommand" WHERE "documentId"=${document.id}`])await expect(query).rejects.toBeDefined();
    expect((await access.read(document.id)).publication).toMatchObject({version:1,isPublished:true});
    expect((await access.read(document.id,0,1)).history).toHaveLength(1);
  });
});
