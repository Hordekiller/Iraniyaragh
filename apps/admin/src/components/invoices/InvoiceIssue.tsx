'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertTitle, Button, Checkbox, FormControlLabel, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import type { InvoiceDocument, InvoiceDraft, InvoiceIssueRequest } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, onFreshAuthentication } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { documentFromDraft, issueInvoiceDocument } from '@/lib/invoices/invoice-documents-api';
import { readInvoiceDraft } from '@/lib/invoices/invoice-drafts-api';
import { formatRial } from '@/lib/orders/orders-labels';
export function invoiceDocumentError(cause: unknown) {
  if (cause instanceof ApiClientError) {
    if (cause.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای صدور سند، تأیید تازهٔ رمز و کد دومرحله‌ای لازم است.';
    if (cause.code.startsWith('AUTH_')) return 'نشست معتبر نیست؛ دوباره وارد شوید.';
    if (cause.code === 'FORBIDDEN') return 'دسترسی لازم برای فاکتور وجود ندارد.';
    if (cause.code === 'INVOICE_DOCUMENT_NOT_FOUND') return 'سند صادرشده پیدا نشد؛ وضعیت پیش‌فاکتور را بازخوانی کنید.';
    if (cause.code === 'INVOICE_POLICY_REQUIRED') return 'سیاست فاکتور (مشخصات فروشنده و مالیات) تنظیم یا فعال نشده است؛ از تنظیمات › فاکتور آن را تأیید کنید.';
    if (cause.code === 'INVOICE_REQUOTE_REQUIRED') return 'سیاست مالی تغییر کرده است؛ ابتدا «تأیید بازقیمت‌گذاری» را بزنید.';
    if (cause.code === 'INVOICE_SOURCE_CHANGED') return 'سفارش مبنا پس از ساخت پیش‌فاکتور تغییر کرده است؛ بازقیمت‌گذاری کنید یا از سفارش، پیش‌فاکتور تازه بسازید.';
    if (cause.code === 'STALE_VERSION') return 'نسخهٔ پیش‌فاکتور تغییر کرده است؛ وضعیت را بازخوانی کنید.';
    if (cause.code === 'IDEMPOTENCY_CONFLICT') return 'درخواست تکراری با محتوای متفاوت است؛ صفحه را بازخوانی کنید.';
    if (cause.code === 'INVOICE_ISSUE_CONFLICT') return 'صدور مجاز نیست: سفارش باید در وضعیت «در انتظار پرداخت»، «پرداخت‌شده» یا «اعتبار تأییدشده» و مشتری فعال باشد، پیش‌فاکتور باید از سفارش ساخته شده باشد و برای این سفارش قبلاً فاکتور صادر نشده باشد.';
    if (cause.statusCode < 500) return 'نسخهٔ پیش‌فاکتور، سفارش مبنا و سیاست مالی را بازخوانی و دوباره بررسی کنید.';
  }
  return 'نتیجه تأیید نشد؛ اتصال و وضعیت سرور را بررسی کنید.';
}
export function issueBlockers(draft: InvoiceDraft, mayIssue: boolean): string[] {
  const list: string[] = [];
  if (!mayIssue) list.push('دسترسی «صدور فاکتور» (invoices.issue) برای حساب شما فعال نیست.');
  if (draft.state === 'CANCELLED') list.push('این پیش‌فاکتور لغو شده است.');
  if (draft.state !== 'DRAFT') return list;
  if (draft.source === 'CATALOG') list.push('پیش‌فاکتور از کاتالوگ ساخته شده؛ برای صدور باید از صفحهٔ سفارش «ساخت پیش‌فاکتور از سفارش» را بزنید.');
  if (draft.quotationStatus === 'POLICY_REQUIRED') list.push('سیاست فاکتور (فروشنده و مالیات) در تنظیمات فعال نیست یا به پیش‌فاکتور وصل نشده است.');
  if (draft.quotationStatus === 'POLICY_CHANGED') list.push('سیاست مالی بعد از ساخت پیش‌فاکتور تغییر کرده؛ «تأیید بازقیمت‌گذاری» را بزنید.');
  if (draft.quotationStatus === 'PRICE_EXPIRED') list.push('قیمت‌گذاری منقضی شده؛ «تأیید بازقیمت‌گذاری» را بزنید.');
  if (draft.quotationStatus === 'SOURCE_CHANGED') list.push('سفارش مبنا تغییر کرده یا لغو شده؛ از سفارش، پیش‌فاکتور تازه بسازید.');
  if (draft.source === 'ORDER' && draft.sourceTermsMatch === false && draft.quotationStatus === 'CURRENT') list.push('مبلغ نهایی پیش‌فاکتور با مبلغ سفارش یکسان نیست. اگر مبنای مالیات در تنظیمات «مالیات افزوده به مبلغ پس از تخفیف» (EXCLUSIVE) با نرخ بیشتر از صفر باشد، مالیات روی مبلغ سفارش اضافه می‌شود و صدور همیشه رد می‌شود؛ مبنا را «شامل مالیات» یا «معاف» تنظیم کنید یا نرخ را صفر کنید.');
  if (draft.quote === null && draft.quotationStatus !== 'POLICY_REQUIRED') list.push('مبلغ نهایی محاسبه نشده است.');
  return list;
}
export function InvoiceIssue({ draft, locked, onIssued, onLockChange }: { draft: InvoiceDraft; locked: boolean; onIssued: () => Promise<void>; onLockChange: (locked: boolean) => void }) {
  const { user } = useAuth();
  if (!hasPermission(user,'invoices.read')) return null;
  return <Issue key={`${user?.userId}:${draft.id}`} draft={draft} locked={locked} onIssued={onIssued} onLockChange={onLockChange} mayIssue={hasPermission(user,'invoices.issue')} />;
}
function Issue({ draft, locked, onIssued, onLockChange, mayIssue }: { draft: InvoiceDraft; locked: boolean; onIssued: () => Promise<void>; onLockChange: (locked: boolean) => void; mayIssue: boolean }) {
  const [confirmed,setConfirmed]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState<unknown>();
  const [uncertain,setUncertain]=useState(false); const [document,setDocument]=useState<InvoiceDocument>(); const [needsReview,setNeedsReview]=useState(false);
  const alive=useRef(false); const aborts=useRef(new Set<AbortController>()); const flight=useRef(false);
  const pending=useRef<{body:InvoiceIssueRequest;key:string}|null>(null);
  useEffect(()=>{alive.current=true;const active=aborts.current;
    if(draft.state==='ISSUED'){const controller=new AbortController();active.add(controller);
      void documentFromDraft(draft.id,controller.signal).then(result=>{if(alive.current)setDocument(result);}).catch(cause=>{if(alive.current&&!(cause instanceof ApiAbortError))setError(cause);}).finally(()=>active.delete(controller));}
    return()=>{alive.current=false;for(const controller of active)controller.abort();};
  },[draft.id,draft.state]);
  useEffect(()=>onFreshAuthentication(()=>{if(alive.current)setError(undefined);}),[]);
  async function run() {
    if(flight.current||!mayIssue||(!pending.current&&(locked||!confirmed||needsReview||draft.state!=='DRAFT'||!draft.sourceTermsMatch||draft.quotationStatus!=='CURRENT'||draft.sourceOrderVersion===null)))return;
    const retry=pending.current!==null;
    if(!pending.current)pending.current={body:{expectedVersion:draft.version,expectedOrderVersion:draft.sourceOrderVersion!},key:`invoice-issue-${randomUuid()}`};
    const captured=pending.current;flight.current=true;onLockChange(true);setBusy(true);setError(undefined);const controller=new AbortController();aborts.current.add(controller);
    try {
      if(retry)await readInvoiceDraft(draft.id,controller.signal); // A failed reconciliation never resends the write.
      if(!alive.current)return;
      const result=await issueInvoiceDocument(draft.id,captured.body,captured.key,controller.signal);
      if(!alive.current)return;pending.current=null;setUncertain(false);setDocument(result.document);await onIssued();
    } catch(cause) {
      if(!alive.current)return;setError(cause);
      if(!pending.current)return; // Refresh failure cannot undo an authoritative successful issuance.
      const ambiguous=!(cause instanceof ApiClientError)||cause.statusCode>=500;setUncertain(ambiguous);
      if(!ambiguous){pending.current=null;
        // Missing/expired fresh authentication is not a stale draft: keep the form usable so the operator can retry right after the fresh-login dialog.
        if(!(cause instanceof ApiClientError&&(cause.code==='AUTH_REAUTHENTICATION_REQUIRED'||cause.code.startsWith('AUTH_')))){setNeedsReview(true);setConfirmed(false);}}
    } finally {aborts.current.delete(controller);flight.current=false;if(alive.current){setBusy(false);onLockChange(pending.current!==null);}}
  }
  async function reload() {
    if(flight.current)return;setBusy(true);setError(undefined);const controller=new AbortController();aborts.current.add(controller);
    try {if(draft.state==='ISSUED'){const result=await documentFromDraft(draft.id,controller.signal);if(alive.current)setDocument(result);}
      if(alive.current){await onIssued();if(alive.current){setNeedsReview(false);setConfirmed(false);}}}
    catch(cause){if(alive.current)setError(cause);}finally{aborts.current.delete(controller);if(alive.current)setBusy(false);}
  }
  return <Paper sx={{p:2}}><Stack spacing={2}>
    <Typography variant="h6">صدور فاکتور فروشگاهی</Typography>
    <Alert severity="info">صدور فاکتور، وضعیت پرداخت و موجودی سفارش را تغییر نمی‌دهد. سند نهایی تغییرناپذیر است و صورتحساب مالیاتی محسوب نمی‌شود.</Alert>
    {!document&&draft.state!=='ISSUED'&&issueBlockers(draft,mayIssue).length>0&&<Alert severity="warning" data-testid="issue-blockers"><AlertTitle>صدور فعلاً ممکن نیست</AlertTitle><List dense disablePadding sx={{listStyleType:'disc',pl:0,pr:2.5}}>{issueBlockers(draft,mayIssue).map(reason=><ListItem key={reason} disableGutters sx={{display:'list-item',py:0.25}}><ListItemText primary={reason} slotProps={{primary:{variant:'body2'}}}/></ListItem>)}</List></Alert>}
    {error!==undefined&&<Alert severity="error">{invoiceDocumentError(error)}</Alert>}
    {document?<Alert severity="success">فاکتور {document.number} با مبلغ {formatRial(document.quote.total)} ثبت شده است. <Link href={`/invoices/documents/${encodeURIComponent(document.id)}`}>مشاهدهٔ سند نهایی</Link></Alert>:draft.state==='ISSUED'?<Typography role="status">در حال دریافت سند صادرشده…</Typography>:null}
    {!document&&draft.state==='DRAFT'&&mayIssue?<>
      {draft.source==='CATALOG'?<Alert severity="warning">برای صدور نهایی، پیش‌فاکتور باید از سفارش واقعی ساخته شود؛ این پیش‌نویس کاتالوگ، سفارش ایجاد نمی‌کند.</Alert>:!draft.sourceTermsMatch||draft.quotationStatus!=='CURRENT'?<Alert severity="warning">صدور نیازمند تطابق دقیق مبلغ و اقلام با سفارش و سیاست مالی فعلی است.</Alert>:null}
      <FormControlLabel label="مبلغ، اقلام، مشخصات فروشنده و سفارش مبنا را برای صدور نهایی بررسی کردم" control={<Checkbox checked={confirmed} disabled={locked||busy||uncertain||needsReview} onChange={event=>setConfirmed(event.target.checked)}/>} />
      <Button variant="contained" disabled={locked||busy||uncertain||needsReview||!confirmed||!draft.sourceTermsMatch||draft.quotationStatus!=='CURRENT'} onClick={()=>void run()}>صدور سند نهایی با شمارهٔ یکتا</Button>
    </>:null}
    {uncertain?<Alert severity="warning">نتیجهٔ صدور نامشخص است؛ درخواست اولیه حفظ شده است.<Button disabled={busy} onClick={()=>void run()}>بازخوانی و تکرار همان درخواست صدور</Button></Alert>:
      <Button disabled={busy||locked} onClick={()=>void reload()}>بازخوانی وضعیت صدور</Button>}
  </Stack></Paper>;
}
