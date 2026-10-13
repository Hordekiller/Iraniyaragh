import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDraft, InvoiceDocument } from '@iranyaragh/contracts';
import { InvoiceIssue } from './InvoiceIssue';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { documentFromDraft, issueInvoiceDocument } from '@/lib/invoices/invoice-documents-api';
import { readInvoiceDraft } from '@/lib/invoices/invoice-drafts-api';
const auth=vi.hoisted(()=>({user:{userId:'operator',permissions:['invoices.read','invoices.issue']}}));
vi.mock('@/lib/auth/AuthProvider',()=>({useAuth:()=>auth}));
vi.mock('@/lib/invoices/invoice-documents-api',()=>({documentFromDraft:vi.fn(),issueInvoiceDocument:vi.fn()}));
vi.mock('@/lib/invoices/invoice-drafts-api',()=>({readInvoiceDraft:vi.fn()}));
const m=(amount:string)=>({amount,currency:'IRR' as const});
const draft={id:'draft-a',version:2,state:'DRAFT',source:'ORDER',sourceOrderId:'order-a',sourceOrderVersion:5,sourceTermsMatch:true,quotationStatus:'CURRENT'} as InvoiceDraft;
const document={id:'document-a',number:'IRY-2026-000001',quote:{total:m('9007199254740993')}} as InvoiceDocument;
const changed=vi.fn(async()=>undefined);const lock=vi.fn();
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'}));
const confirm=()=>fireEvent.click(screen.getByRole('checkbox'));
function view(value=draft){return render(<InvoiceIssue draft={value} locked={false} onIssued={changed} onLockChange={lock}/>);}
describe('Invoice issue UI authoritative result and ambiguity recovery',()=>{
  beforeEach(()=>{auth.user.permissions=['invoices.read','invoices.issue'];changed.mockClear();lock.mockClear();vi.mocked(issueInvoiceDocument).mockReset().mockResolvedValue({document,committedVersion:3,replayed:false});
    vi.mocked(readInvoiceDraft).mockReset().mockResolvedValue(draft);vi.mocked(documentFromDraft).mockReset().mockResolvedValue(document);});
  it('hides actions for unauthorized readers and blocks nonmatching/catalog quotations',()=>{
    auth.user.permissions=['invoices.read'];const current=view();expect(screen.queryByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'})).not.toBeInTheDocument();
    auth.user.permissions=['invoices.read','invoices.issue'];current.rerender(<InvoiceIssue draft={{...draft,source:'CATALOG',sourceTermsMatch:null}} locked={false} onIssued={changed} onLockChange={lock}/>);
    confirm();expect(screen.getByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'})).toBeDisabled();expect(issueInvoiceDocument).not.toHaveBeenCalled();
  });
  it('requires explicit review, sends only source versions/key, and displays exact server-issued amount',async()=>{
    view();expect(screen.getByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'})).toBeDisabled();confirm();submit();
    await screen.findByRole('link',{name:'مشاهدهٔ سند نهایی'});expect(issueInvoiceDocument).toHaveBeenCalledWith('draft-a',{expectedVersion:2,expectedOrderVersion:5},expect.any(String),expect.any(AbortSignal));
    expect(changed).toHaveBeenCalledTimes(1);expect(screen.getByText(/فاکتور IRY-2026-000001/).closest('[role=alert]')).not.toBeNull();expect(screen.getByText(/IRY-2026-000001/)).toBeVisible();
    expect(JSON.stringify(vi.mocked(issueInvoiceDocument).mock.calls[0][1])).not.toMatch(/amount|number|customer|state/);expect(lock).toHaveBeenLastCalledWith(false);
  });
  it('locks an ambiguous command and reconciles before replaying the identical payload and key',async()=>{
    vi.mocked(issueInvoiceDocument).mockRejectedValueOnce(new ApiNetworkError('private internal detail'));view();confirm();submit();
    await screen.findByText(/نتیجهٔ صدور نامشخص است/);expect(screen.getByRole('checkbox')).toBeDisabled();expect(lock).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button',{name:'بازخوانی و تکرار همان درخواست صدور'}));await screen.findByRole('link',{name:'مشاهدهٔ سند نهایی'});
    const calls=vi.mocked(issueInvoiceDocument).mock.calls;expect(calls[1].slice(0,3)).toEqual(calls[0].slice(0,3));expect(readInvoiceDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('private internal detail')).not.toBeInTheDocument();
  });
  it('does not resend after a failed reconciliation read',async()=>{
    vi.mocked(issueInvoiceDocument).mockRejectedValueOnce(new ApiNetworkError('lost'));vi.mocked(readInvoiceDraft).mockRejectedValueOnce(new ApiNetworkError('offline'));view();confirm();submit();
    await screen.findByText(/نتیجهٔ صدور نامشخص است/);fireEvent.click(screen.getByRole('button',{name:'بازخوانی و تکرار همان درخواست صدور'}));
    await waitFor(()=>expect(readInvoiceDraft).toHaveBeenCalledTimes(1));expect(issueInvoiceDocument).toHaveBeenCalledTimes(1);expect(changed).not.toHaveBeenCalled();
  });
  it('stale source refusal requires fresh review and does not pretend a session expired',async()=>{
    vi.mocked(issueInvoiceDocument).mockRejectedValueOnce(new ApiClientError({code:'INVOICE_SOURCE_CHANGED',statusCode:409,message:'private detail',requestId:'test'}));view();confirm();submit();
    await screen.findByText(/نسخهٔ پیش‌فاکتور، سفارش مبنا/);expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.queryByRole('link',{name:'مشاهدهٔ سند نهایی'})).not.toBeInTheDocument();
  });
  it('loads the same issued document after reload and permits recovery from a failed document read',async()=>{
    vi.mocked(documentFromDraft).mockRejectedValueOnce(new ApiNetworkError('offline'));view({...draft,state:'ISSUED'});
    await screen.findByText(/نتیجه تأیید نشد/);fireEvent.click(screen.getByRole('button',{name:'بازخوانی وضعیت صدور'}));await screen.findByRole('link',{name:'مشاهدهٔ سند نهایی'});
    expect(documentFromDraft).toHaveBeenCalledWith('draft-a',expect.any(AbortSignal));expect(issueInvoiceDocument).not.toHaveBeenCalled();
  });
  it('identity unmount during reconciliation prevents delayed command replay',async()=>{
    vi.mocked(issueInvoiceDocument).mockRejectedValueOnce(new ApiNetworkError('lost'));let release!:(value:InvoiceDraft)=>void;vi.mocked(readInvoiceDraft).mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
    const current=view();confirm();submit();await screen.findByText(/نتیجهٔ صدور نامشخص است/);fireEvent.click(screen.getByRole('button',{name:'بازخوانی و تکرار همان درخواست صدور'}));
    await waitFor(()=>expect(readInvoiceDraft).toHaveBeenCalledTimes(1));current.unmount();release(draft);await Promise.resolve();expect(issueInvoiceDocument).toHaveBeenCalledTimes(1);expect(changed).not.toHaveBeenCalled();
  });
});
