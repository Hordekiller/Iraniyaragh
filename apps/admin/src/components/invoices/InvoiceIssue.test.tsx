import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDraft, InvoiceDocument } from '@iranyaragh/contracts';
import { InvoiceIssue, issueBlockers } from './InvoiceIssue';
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
    await screen.findByText(/سفارش مبنا پس از ساخت پیش‌فاکتور تغییر کرده/);expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.queryByRole('link',{name:'مشاهدهٔ سند نهایی'})).not.toBeInTheDocument();
  });
  it('offers only a proforma for an unpaid custom-door sale',()=>{
    const unpaid={...draft,doorPayment:{status:'UNPAID',customerAccepted:false,finalInvoiceAllowed:false}} as InvoiceDraft;
    expect(issueBlockers(unpaid,true).join(' ')).toContain('فقط پیش‌فاکتور');
    expect(issueBlockers({...draft,doorPayment:{status:'FULLY_PAID',customerAccepted:true,finalInvoiceAllowed:true}} as InvoiceDraft,true).join(' ')).not.toContain('فقط پیش‌فاکتور');
  });
  it('keeps the form usable after a fresh-authentication refusal',async()=>{
    vi.mocked(issueInvoiceDocument).mockRejectedValueOnce(new ApiClientError({code:'AUTH_REAUTHENTICATION_REQUIRED',statusCode:401,message:'x',requestId:'test'}));view();confirm();submit();
    await screen.findByText(/تأیید تازهٔ رمز/);expect(screen.getByRole('checkbox')).not.toBeDisabled();expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'})).not.toBeDisabled();
    submit();await screen.findByRole('link',{name:'مشاهدهٔ سند نهایی'});expect(issueInvoiceDocument).toHaveBeenCalledTimes(2);
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
describe('issueBlockers tells the operator why issuing is unavailable',()=>{
  it('is empty for a current, matching order draft of an authorized issuer',()=>{expect(issueBlockers(draft,true)).toEqual([]);});
  it('reports a missing permission and a catalog quotation',()=>{
    expect(issueBlockers(draft,false).join(' ')).toContain('invoices.issue');
    expect(issueBlockers({...draft,source:'CATALOG',sourceTermsMatch:null,sourceOrderId:null,quote:{} as InvoiceDraft['quote']},true).join(' ')).toContain('ساخت پیش‌فاکتور از سفارش');
  });
  it('explains the EXCLUSIVE-tax total mismatch that makes issuing always refuse',()=>{
    const reasons=issueBlockers({...draft,sourceTermsMatch:false,quote:{} as InvoiceDraft['quote']},true);
    expect(reasons).toHaveLength(1);expect(reasons[0]).toContain('EXCLUSIVE');
  });
  it('asks for requote on policy or price changes and a fresh draft when the order changed',()=>{
    expect(issueBlockers({...draft,quotationStatus:'POLICY_CHANGED'},true).join(' ')).toContain('بازقیمت‌گذاری');
    expect(issueBlockers({...draft,quotationStatus:'PRICE_EXPIRED'},true).join(' ')).toContain('بازقیمت‌گذاری');
    expect(issueBlockers({...draft,quotationStatus:'SOURCE_CHANGED'},true).join(' ')).toContain('پیش‌فاکتور تازه');
    expect(issueBlockers({...draft,quotationStatus:'POLICY_REQUIRED',quote:null},true).join(' ')).toContain('سیاست فاکتور');
  });
  it('shows nothing for drafts that are already issued, and only the cancellation for cancelled ones',()=>{
    expect(issueBlockers({...draft,state:'ISSUED'},true)).toEqual([]);
    expect(issueBlockers({...draft,state:'CANCELLED'},true)).toEqual(['این پیش‌فاکتور لغو شده است.']);
  });
  it('renders the reasons next to the disabled issue button',()=>{
    view({...draft,sourceTermsMatch:false,quote:{} as InvoiceDraft['quote']});
    expect(screen.getByTestId('issue-blockers')).toHaveTextContent('EXCLUSIVE');
    expect(screen.getByRole('button',{name:'صدور سند نهایی با شمارهٔ یکتا'})).toBeDisabled();
  });
});
