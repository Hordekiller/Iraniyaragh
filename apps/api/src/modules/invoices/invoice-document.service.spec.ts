import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { InvoiceDraft, InvoicePolicy } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { RedactedLogger } from '../../common/redacted-logger';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoiceDocumentService, storeInvoicePeriod } from './invoice-document.service';
const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const code = (name: string) => expect.objectContaining({ response: expect.objectContaining({ code: name }) });
function harness() {
  const row = { id: 'draft-a', version: 0, state: 'DRAFT', source: 'ORDER', customerId: 'customer-a', buyerLabel: 'Isolated buyer', sourceOrderId: 'order-a', sourceOrderVersion: 1,
    sourceOrderHash: 'a'.repeat(64), addressSnapshot: { provinceCode: 'THR', city: 'Test', address: 'Private address', postalCode: '1234567890', recipient: 'Test', mobile: '+989120000000' },
    note: 'Private invoice note', globalDiscount: 0n, shippingCode: 'PICKUP', shippingTitle: 'Pickup', shippingAmount: 0n, shippingPolicyRevision: 'staff-pickup-v1',
    pricePolicyRevision: 'catalog-sale-price-v1', quoteExpiresAt: null, policyRevisionId: 'policy-a',
    lines: [{ variantId: 'sku-a', ordinal: 0, sku: 'SKU', title: 'Title', quantity: 2, unitPrice: 1000n, discount: 0n }] };
  const policy: InvoicePolicy = { id:'policy-a',version:1,sellerName:'Test seller',sellerAddress:'Public address',sellerContact:'Public contact',taxTreatment:'INCLUSIVE',taxRateBps:0,
    exemptionReason:null,discountCapBps:10000,shippingTaxable:false,isActive:true,createdAt:'2026-01-01T00:00:00Z' };
  const draft: InvoiceDraft = { id:row.id,version:0,state:'DRAFT',source:'ORDER',customerId:row.customerId,buyerLabel:row.buyerLabel,sourceOrderId:row.sourceOrderId,sourceOrderVersion:1,
    sourceTermsMatch:true,address:row.addressSnapshot,note:row.note,lines:[{variantId:'sku-a',sku:'SKU',title:'Title',quantity:2,unitPrice:money('1000'),discount:money('0'),subtotal:money('2000')}],
    globalDiscount:money('0'),shipping:{code:'PICKUP',title:'Pickup',amount:money('0'),policyRevision:'staff-pickup-v1'},pricePolicyRevision:row.pricePolicyRevision,
    quoteExpiresAt:null,policyVersion:1,quotationStatus:'CURRENT',createdAt:policy.createdAt,updatedAt:policy.createdAt,
    quote:{lines:[{id:'sku-a',subtotal:money('2000'),discount:money('0'),netAmount:money('2000'),tax:money('0'),total:money('2000')}],subtotal:money('2000'),discount:money('0'),shipping:money('0'),netAmount:money('2000'),tax:money('0'),total:money('2000')} };
  const order = { id:'order-a',customerId:'customer-a',version:1,status:'PENDING_PAYMENT',grandTotal:2000n,customer:{status:'ACTIVE'},items:[{id:'item-a'}] };
  const stored = { id:'document-a',number:'IRY-2026-000001',orderId:'order-a',customerId:'customer-a',issuedAt:new Date('2026-01-01T00:00:00Z'),grandTotal:2000n,
    snapshot:{id:'document-a',buyerLabel:'Isolated buyer',quote:{total:money('2000')}} };
  const tx = { $executeRaw:vi.fn(async()=>0),$queryRaw:vi.fn(async()=>[]),
    invoiceIssueCommand:{findUnique:vi.fn(async():Promise<{payloadHash:string;committedVersion:number;document:typeof stored}|null>=>null),create:vi.fn(async()=>({}))},
    invoiceDraft:{findUnique:vi.fn(async()=>row),update:vi.fn(async()=>({...row,state:'ISSUED',version:1}))},
    order:{findUnique:vi.fn(async()=>order)},invoiceSeriesCounter:{upsert:vi.fn(async()=>({lastNumber:1}))},
    invoiceDocument:{findUnique:vi.fn(async():Promise<typeof stored|null>=>null),create:vi.fn(async(args:{data:Record<string,unknown>})=>args.data),findMany:vi.fn(async()=>[stored]),count:vi.fn(async()=>1)},
    invoiceDraftRevision:{create:vi.fn(async()=>({}))},invoiceDocumentEvent:{create:vi.fn(async()=>({}))} };
  const prisma={...tx,$transaction:vi.fn(async(run:(tx:Prisma.TransactionClient)=>Promise<unknown>)=>run(tx as unknown as Prisma.TransactionClient))};
  const audit={record:vi.fn(async()=>undefined)};const drafts={inspectIn:vi.fn(async()=>draft)};const policies={requireActive:vi.fn(async()=>policy)};
  const service=new InvoiceDocumentService(prisma as unknown as PrismaService,audit as unknown as AuditLogService,drafts as unknown as InvoiceDraftService,policies as unknown as InvoicePolicyService);
  return {service,tx,row,order,policy,draft,stored,prisma,audit,drafts};
}
describe('Store invoice service financial and replay decision boundary',()=>{
  let h:ReturnType<typeof harness>;beforeEach(()=>{h=harness();});
  const issue=()=>h.service.issue('operator','request','draft-a',{expectedVersion:0,expectedOrderVersion:1},'stable-key');
  it('uses the Tehran Gregorian year boundary, including local New Year before UTC midnight',()=>{
    expect(storeInvoicePeriod(new Date('2025-12-31T21:00:00Z'))).toBe(2026);expect(storeInvoicePeriod(new Date('2025-12-31T20:00:00Z'))).toBe(2025);
  });
  it('bounded list preserves exact integer IRR, stable paging and only safe summary fields',async()=>{
    const result=await h.service.list(25,25);expect(result.items[0]).toEqual({id:'document-a',number:'IRY-2026-000001',orderId:'order-a',customerId:'customer-a',buyerLabel:'Isolated buyer',issuedAt:'2026-01-01T00:00:00.000Z',total:money('2000')});
    expect(h.tx.invoiceDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({skip:25,take:25,orderBy:[{issuedAt:'desc'},{id:'desc'}]}));
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead'});
    await expect(h.service.list(-1,25)).rejects.toMatchObject(code('VALIDATION_ERROR'));await expect(h.service.list(0,101)).rejects.toMatchObject(code('VALIDATION_ERROR'));
  });
  it('reads an immutable stored snapshot rather than rebuilding from mutable catalog/policy',async()=>{
    h.tx.invoiceDocument.findUnique.mockResolvedValueOnce(h.stored);expect(await h.service.read('document-a')).toEqual(h.stored.snapshot);expect(h.drafts.inspectIn).not.toHaveBeenCalled();
    h.tx.invoiceDocument.findUnique.mockResolvedValueOnce(h.stored);expect(await h.service.fromDraft('draft-a')).toEqual(h.stored.snapshot);
    await expect(h.service.read('missing')).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
  });
  it.each(['terminal','draftVersion','catalog','owner','inactive','state','orderVersion','policy','quote','existing'])('rejects invalid %s before assigning a number',async failure=>{
    if(failure==='terminal')h.row.state='ISSUED';if(failure==='draftVersion')h.row.version=2;if(failure==='catalog')h.row.source='CATALOG';
    if(failure==='owner')h.order.customerId='foreign';if(failure==='inactive')h.order.customer.status='INACTIVE';if(failure==='state')h.order.status='CANCELLED';
    if(failure==='orderVersion')h.order.version=2;if(failure==='policy')h.policy.id='new-policy';if(failure==='quote')h.draft.sourceTermsMatch=false;
    if(failure==='existing')h.tx.invoiceDocument.findUnique.mockResolvedValueOnce(h.stored);
    await expect(issue()).rejects.toBeDefined();expect(h.tx.invoiceSeriesCounter.upsert).not.toHaveBeenCalled();expect(h.tx.invoiceDocument.create).not.toHaveBeenCalled();
  });
  it('issues a private original snapshot and seals all evidence without payment/order/stock writes',async()=>{
    const result=await issue();expect(result.document.quote.total.amount).toBe('2000');expect(result.document.lines[0].orderItemId).toBe('item-a');expect(result.committedVersion).toBe(1);
    expect(result.document.number).toMatch(/^IRY-\d{4}-000001$/u);expect(h.tx.invoiceDocument.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({grandTotal:2000n,orderVersion:1,draftVersion:1})}));
    expect(h.tx.invoiceDocumentEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'ISSUED',actorId:'operator'})}));
    const logs=JSON.stringify(h.audit.record.mock.calls);expect(logs).not.toContain('Private address');expect(logs).not.toContain('Private invoice note');expect(logs).not.toContain('+989');
  });
  it('replay returns its original document even when the editable source or current policy has changed',async()=>{
    const first=await issue();const command=h.tx.invoiceIssueCommand.create.mock.calls[0];expect(command).toBeDefined();
    const payloadHash=(h.tx.invoiceIssueCommand.create.mock.calls as unknown as [{data:{payloadHash:string}}][])[0][0].data.payloadHash;
    h.tx.invoiceIssueCommand.findUnique.mockResolvedValueOnce({payloadHash,committedVersion:1,document:{...h.stored,snapshot:first.document as unknown as typeof h.stored.snapshot}});
    h.row.state='CANCELLED';h.policy.id='changed';const result=await issue();expect(result.replayed).toBe(true);expect(result.document).toEqual(first.document);expect(h.tx.invoiceDocument.create).toHaveBeenCalledTimes(1);
    h.tx.invoiceIssueCommand.findUnique.mockResolvedValueOnce({payloadHash:'different',committedVersion:1,document:h.stored});await expect(issue()).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
  });
  it('refuses number overflow and sanitizes uncertain storage diagnostics without success',async()=>{
    h.tx.invoiceSeriesCounter.upsert.mockResolvedValueOnce({lastNumber:1000000000});await expect(issue()).rejects.toMatchObject(code('INVOICE_ISSUE_CONFLICT'));
    const log=vi.spyOn(RedactedLogger.prototype,'event').mockImplementation(()=>undefined);
    h.tx.invoiceDocument.create.mockRejectedValueOnce(new Error('Private invoice note and address'));
    await expect(issue()).rejects.toMatchObject(code('INVOICE_ISSUE_UNAVAILABLE'));expect(JSON.stringify(log.mock.calls)).not.toContain('Private invoice');expect(h.tx.invoiceDocumentEvent.create).not.toHaveBeenCalled();
  });
});
