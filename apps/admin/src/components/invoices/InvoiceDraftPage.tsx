'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { CheckoutAddress, InvoiceDraft, InvoiceDraftListResponse, StaffOrderOption } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { executeInvoiceDraft, invoiceDraftHistory, listInvoiceDrafts, readInvoiceDraft, searchInvoiceOptions, type DraftCommand } from '@/lib/invoices/invoice-drafts-api';
import { StaffOrderOptionPicker } from '@/components/orders/StaffOrderOptionPicker';
import { PageHeader } from '@/components/ui/PageHeader';
const errorMessage = (cause: unknown) => {
  if (cause instanceof ApiClientError) {
    if (cause.code === 'STALE_VERSION') return 'نسخهٔ پیش‌فاکتور تغییر کرده؛ نسخهٔ سرور را بازخوانی و دوباره بررسی کنید.';
    if (cause.code === 'INVOICE_REQUOTE_REQUIRED') return 'قیمت، تعرفه یا سیاست مالی تغییر کرده است؛ بازقیمت‌گذاری را تأیید کنید.';
    if (cause.code === 'FORBIDDEN') return 'دسترسی لازم برای این عملیات وجود ندارد.';
    if (cause.code.startsWith('AUTH_')) return 'نشست معتبر نیست؛ دوباره وارد شوید.';
    if (cause.statusCode < 500) return 'اطلاعات مشتری، نشانی، کالا، تخفیف و وضعیت پیش‌فاکتور را بررسی کنید.';
  }
  return 'نتیجهٔ عملیات تأیید نشد؛ اتصال را بررسی و وضعیت سرور را بازخوانی کنید.';
};
const emptyAddress: CheckoutAddress = { provinceCode: '', city: '', address: '', postalCode: '', recipient: '', mobile: '' };
const canonical = (raw: string) => raw.trim().replace(/[۰-۹]/gu, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/gu, d => String(d.charCodeAt(0) - 1632));
function irr(raw: string) { const value = canonical(raw); return /^(0|[1-9][0-9]{0,18})$/u.test(value) && BigInt(value) <= 9223372036854775807n ? value : null; }
const quoteLabels = { CURRENT: 'قیمت‌گذاری ثبت‌شده', POLICY_REQUIRED: 'سیاست مالی فعال لازم است', POLICY_CHANGED: 'سیاست مالی تغییر کرده', PRICE_EXPIRED: 'قیمت‌گذاری منقضی شده', SOURCE_CHANGED: 'سفارش مبنا تغییر کرده' };
const line = () => ({ key: randomUuid(), variant: null as StaffOrderOption | null, quantity: '1', discount: '0' });
type Form = { customer: StaffOrderOption | null; address: CheckoutAddress; lines: ReturnType<typeof line>[]; globalDiscount: string; shippingMethodCode: string; note: string };
function form(draft?: InvoiceDraft): Form { return draft ? { customer: { id: draft.customerId, label: draft.buyerLabel, detail: null }, address: draft.address,
  lines: draft.lines.map(item => ({ key: randomUuid(), variant: { id: item.variantId, label: item.title, detail: item.sku }, quantity: String(item.quantity), discount: item.discount.amount })),
  globalDiscount: draft.globalDiscount.amount, shippingMethodCode: draft.shipping.code, note: draft.note ?? '' } :
  { customer: null, address: { ...emptyAddress }, lines: [line()], globalDiscount: '0', shippingMethodCode: '', note: '' }; }
export function InvoiceDraftPage({ id }: { id?: string }) {
  const auth = useAuth();
  if (auth.isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!hasPermission(auth.user, 'invoices.read')) return <Alert severity="error">دسترسی مشاهدهٔ فاکتور لازم است.</Alert>;
  return <DraftWorkspace key={`${auth.user?.userId}:${id ?? 'new'}`} id={id} manage={hasPermission(auth.user, 'invoices.manage')} />;
}
function DraftWorkspace({ id, manage }: { id?: string; manage: boolean }) {
  const router = useRouter(); const [draft, setDraft] = useState<InvoiceDraft>(); const [fields, setFields] = useState<Form>(() => form());
  const [list, setList] = useState<InvoiceDraftListResponse['data']>(); const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof invoiceDraftHistory>>>(); const [historyOffset, setHistoryOffset] = useState(0);
  const [shipping, setShipping] = useState<StaffOrderOption[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [needsReview, setNeedsReview] = useState(false); const [serverChanged, setServerChanged] = useState(false);
  const [saved, setSaved] = useState<number>(); const [cancelReason, setCancelReason] = useState('');
  const initialized = useRef(false); const [readReady, setReadReady] = useState(false);
  const alive = useRef(false); const requests = useRef(new Set<AbortController>()); const flight = useRef(false);
  const pending = useRef<{ command: DraftCommand; key: string } | null>(null);
  async function load(adopt = false) {
    const controller = new AbortController(); requests.current.add(controller); setLoading(true); setReadReady(false); setError(undefined);
    try {
      if (id) {
        const result = await readInvoiceDraft(id, controller.signal);
        if (!alive.current) return;
        setDraft(result); if (adopt) { initialized.current = true; setFields(form(result)); setNeedsReview(false); setServerChanged(false); }
        else if (result.version !== draft?.version) setServerChanged(true);
        const history = await invoiceDraftHistory(id, historyOffset, controller.signal); if (alive.current) setHistory(history);
      } else { const result = await listInvoiceDrafts(offset, controller.signal); if (alive.current) setList(result); }
      if (manage) { const result = await searchInvoiceOptions({ kind: 'shipping', signal: controller.signal }); if (alive.current) setShipping(result.items); }
      if (alive.current) setReadReady(true);
    } catch (cause) { if (alive.current && !(cause instanceof ApiAbortError)) setError(cause); throw cause; }
    finally { requests.current.delete(controller); if (alive.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; void load(!initialized.current).catch(() => undefined); const active = requests.current;
    return () => { alive.current = false; for (const controller of active) controller.abort(); };
  // Selection changes create a new identity-scoped workspace; paging only changes read data.
  }, [offset, historyOffset]);
  function patch<K extends keyof Form>(key: K, value: Form[K]) { setFields(previous => ({ ...previous, [key]: value })); setSaved(undefined); }
  async function execute(request: NonNullable<typeof pending.current>) {
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const result = await executeInvoiceDraft(request.command, request.key, controller.signal);
      if (!alive.current) return;
      pending.current = null; setUncertain(false); setNeedsReview(false); setServerChanged(false); setSaved(result.committedVersion);
      if (!id) { router.push(`/invoices/drafts/${encodeURIComponent(result.draft.id)}`); return; }
      setDraft(result.draft); setFields(form(result.draft));
      const history = await invoiceDraftHistory(id, historyOffset, controller.signal); if (alive.current) setHistory(history);
    } catch (cause) {
      if (!alive.current) return;
      if (!pending.current) { setError(cause); return; } // Read failure after authoritative success is not an ambiguous write.
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setUncertain(ambiguous); setError(cause); if (!ambiguous) pending.current = null;
      if (cause instanceof ApiClientError && ['STALE_VERSION','INVOICE_REQUOTE_REQUIRED'].includes(cause.code)) setNeedsReview(true);
    } finally { requests.current.delete(controller); }
  }
  async function run(command: DraftCommand) {
    if (flight.current || pending.current || !manage || loading) return;
    const request = { command, key: `invoice-draft-${randomUuid()}` }; pending.current = request; flight.current = true; setBusy(true); setError(undefined); setSaved(undefined);
    try { await execute(request); } finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  async function retry() {
    if (flight.current || !pending.current) return;
    flight.current = true; setBusy(true); setError(undefined);
    try { await load(false); if (alive.current && pending.current) await execute(pending.current); } catch { /* Failed reconciliation never resends. */ }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (needsReview || serverChanged) return;
    const globalDiscount = irr(fields.globalDiscount); const lines = fields.lines.map(item => ({ variantId: item.variant?.id ?? '', quantity: Number(canonical(item.quantity)), discount: irr(item.discount) }));
    if (!fields.customer || !fields.shippingMethodCode || globalDiscount === null || lines.some(item => !item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000 || item.discount === null) ||
      new Set(lines.map(item => item.variantId)).size !== lines.length || Object.values(fields.address).some(value => !value.trim())) {
      setError(new ApiClientError({ code: 'VALIDATION_ERROR', message: '', requestId: '', statusCode: 400 })); return;
    }
    const body = { address: fields.address, lines: lines.map(item => ({ ...item, discount: item.discount! })), globalDiscount, shippingMethodCode: fields.shippingMethodCode, note: fields.note.trim() || null };
    await run(draft ? { kind: 'edit', id: draft.id, body: { ...body, expectedVersion: draft.version } } : { kind: 'create', body: { ...body, customerId: fields.customer.id } });
  }
  const locked = busy || loading || !readReady || uncertain || !manage || draft?.state === 'CANCELLED';
  const addressLabels = { provinceCode: 'کد استان', city: 'شهر', address: 'نشانی صورتحساب', postalCode: 'کد پستی', recipient: 'گیرنده', mobile: 'تلفن گیرنده' };
  return <Stack spacing={3}>
    <PageHeader title={id ? 'پیش‌فاکتور فروشگاهی' : 'پیش‌فاکتورها'} description="پیش‌نویس مستقل؛ ثبت و ویرایش آن پرداخت، سفارش و موجودی را تغییر نمی‌دهد." />
    <Button component={Link} href="/invoices" sx={{ alignSelf: 'start' }}>فهرست پیش‌فاکتورها</Button>
    {loading && <Typography role="status">در حال دریافت…</Typography>}
    {error !== undefined && <Alert severity="error">{errorMessage(error)}</Alert>}
    {saved !== undefined && <Alert severity="success">نسخهٔ {saved} روی سرور ثبت شد.</Alert>}
    {uncertain && <Alert severity="warning">نتیجهٔ ثبت نامشخص است؛ دادهٔ درخواست تا تأیید نتیجه قفل است.<Button disabled={busy} onClick={() => void retry()}>بازخوانی و تلاش با همان درخواست</Button></Alert>}
    {!uncertain && <Button disabled={busy || loading} onClick={() => void load(false).catch(() => undefined)}>بازخوانی وضعیت سرور</Button>}
    {(needsReview || serverChanged) && !uncertain && <Alert severity="warning">نسخهٔ تازهٔ سرور را بررسی کنید؛ متن فرم فعلی هنوز جایگزین نشده است.
      <Button disabled={busy || loading} onClick={() => void load(true).catch(() => undefined)}>پذیرش نسخهٔ سرور برای ویرایش</Button></Alert>}
    {draft && <Paper sx={{ p: 2 }}><Stack spacing={1}>
      <Typography>وضعیت: {draft.state === 'DRAFT' ? 'پیش‌نویس' : 'لغوشده'} — نسخهٔ {draft.version}</Typography>
      <Typography>{quoteLabels[draft.quotationStatus]}</Typography>
      {draft.sourceOrderId && <Typography>سفارش مبنا: <Link href={`/orders/${encodeURIComponent(draft.sourceOrderId)}`}>{draft.sourceOrderId}</Link> — تطابق مالی: {draft.sourceTermsMatch ? 'بله' : 'خیر؛ نیازمند بررسی پیش از صدور'}</Typography>}
      {draft.quote ? <Box aria-label="مبالغ ثبت‌شدهٔ سرور"><Typography>جمع اقلام: {draft.quote.subtotal.amount} ریال</Typography><Typography>تخفیف: {draft.quote.discount.amount} ریال</Typography>
        <Typography>ارسال: {draft.quote.shipping.amount} ریال</Typography><Typography>مالیات: {draft.quote.tax.amount} ریال</Typography><Typography>مبلغ نهایی: {draft.quote.total.amount} ریال</Typography></Box> :
        <Alert severity="warning">برای محاسبه و صدور، سیاست فروشنده و مالیات را در تنظیمات فاکتور تأیید کنید. این پیش‌نویس مبلغ نهایی ندارد.</Alert>}
      {draft.quoteExpiresAt && <Typography>انقضای قیمت‌گذاری: {new Date(draft.quoteExpiresAt).toLocaleString('fa-IR')}</Typography>}
      {manage && draft.state === 'DRAFT' && <Button disabled={locked || serverChanged} onClick={() => void run({ kind: 'requote', id: draft.id, body: { expectedVersion: draft.version } })}>تأیید بازقیمت‌گذاری با قیمت و سیاست فعلی</Button>}
    </Stack></Paper>}
    {(manage || draft) && <Paper component="form" onSubmit={submit} sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h6">{draft ? 'ویرایش پیش‌نویس' : 'پیش‌فاکتور جدید'}</Typography>
      <StaffOrderOptionPicker searchOptions={searchInvoiceOptions} kind="customer" label="مشتری" value={fields.customer} onChange={value => patch('customer', value)} disabled={locked || Boolean(draft)} required />
      {fields.lines.map((item, index) => <Stack key={item.key} spacing={1}><StaffOrderOptionPicker searchOptions={searchInvoiceOptions} kind="variant" label={`کالای ${index + 1}`} value={item.variant}
        onChange={value => patch('lines', fields.lines.map((row, i) => i === index ? { ...row, variant: value } : row))} disabled={locked || draft?.source === 'ORDER'} required />
        <TextField label={`تعداد ${index + 1}`} required value={item.quantity} disabled={locked} onChange={event => patch('lines', fields.lines.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} />
        <TextField label={`تخفیف قلم ${index + 1} (ریال)`} required value={item.discount} disabled={locked} onChange={event => patch('lines', fields.lines.map((row, i) => i === index ? { ...row, discount: event.target.value } : row))} />
        <Button disabled={locked || fields.lines.length <= 1} onClick={() => patch('lines', fields.lines.filter((_, i) => i !== index))}>حذف قلم {index + 1}</Button></Stack>)}
      <Button disabled={locked || fields.lines.length >= 50 || draft?.source === 'ORDER'} onClick={() => patch('lines', [...fields.lines, line()])}>افزودن قلم</Button>
      {(Object.keys(addressLabels) as (keyof CheckoutAddress)[]).map(key => <TextField key={key} label={addressLabels[key]} required value={fields.address[key]} disabled={locked}
        onChange={event => patch('address', { ...fields.address, [key]: event.target.value })} />)}
      <TextField select label="روش تحویل" required value={fields.shippingMethodCode} disabled={locked} onChange={event => patch('shippingMethodCode', event.target.value)}>
        <MenuItem value="">انتخاب روش</MenuItem>{draft && !shipping.some(item => item.id === draft.shipping.code) && <MenuItem value={draft.shipping.code}>{draft.shipping.title} (ثبت‌شده)</MenuItem>}
        {shipping.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>
      <TextField label="تخفیف کلی (ریال)" required value={fields.globalDiscount} disabled={locked} onChange={event => patch('globalDiscount', event.target.value)} />
      <TextField label="توضیحات فاکتور" multiline value={fields.note} disabled={locked} onChange={event => patch('note', event.target.value)} inputProps={{ maxLength: 500 }} />
      {manage && <Button type="submit" variant="contained" disabled={locked || needsReview || serverChanged}>{draft ? 'ثبت ویرایش پیش‌فاکتور' : 'ایجاد پیش‌فاکتور'}</Button>}
    </Stack></Paper>}
    {draft && <Paper sx={{ p: 2 }}><Typography variant="h6">تاریخچهٔ نسخه‌ها</Typography>{history?.items.map(item => <Typography key={item.version}>نسخهٔ {item.version} — {item.action} — {item.actorId} — {new Date(item.createdAt).toLocaleString('fa-IR')}</Typography>)}
      <Button disabled={historyOffset === 0 || loading} onClick={() => setHistoryOffset(value => Math.max(0, value - 25))}>تاریخچهٔ جدیدتر</Button>
      <Button disabled={loading || !history || historyOffset + 25 >= history.count} onClick={() => setHistoryOffset(value => value + 25)}>تاریخچهٔ قدیمی‌تر</Button></Paper>}
    {draft?.state === 'DRAFT' && manage && <Paper sx={{ p: 2 }}><TextField label="دلیل لغو پیش‌نویس" value={cancelReason} disabled={locked} onChange={event => setCancelReason(event.target.value)} />
      <Button color="error" disabled={locked || !cancelReason.trim() || serverChanged} onClick={() => void run({ kind: 'cancel', id: draft.id, body: { expectedVersion: draft.version, reason: cancelReason } })}>لغو پیش‌نویس</Button></Paper>}
    {!id && <Paper sx={{ p: 2 }}><Typography variant="h6">پیش‌فاکتورهای ثبت‌شده</Typography>{!loading && list?.count === 0 && <Typography>هنوز پیش‌فاکتوری ثبت نشده است.</Typography>}
      {list?.items.map(item => <Box key={item.id} sx={{ py: 1 }}><Link href={`/invoices/drafts/${encodeURIComponent(item.id)}`}>{item.buyerLabel} — نسخهٔ {item.version} — {item.state === 'DRAFT' ? 'پیش‌نویس' : 'لغوشده'}</Link></Box>)}
      <Button disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 25))}>صفحهٔ قبل</Button>
      <Button disabled={loading || !list || offset + 25 >= list.count} onClick={() => setOffset(value => value + 25)}>صفحهٔ بعد</Button></Paper>}
  </Stack>;
}
