'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import type { InvoicePolicy, InvoicePolicyUpdate, InvoiceTaxTreatment } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readInvoicePolicy, saveInvoicePolicy } from '@/lib/settings/invoice-policy-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { PageHeader } from '@/components/ui/PageHeader';

type Draft = { sellerName: string; sellerAddress: string; sellerContact: string; taxTreatment: InvoiceTaxTreatment | ''; taxRate: string;
  exemptionReason: string; discountCap: string; shippingTaxable: '' | 'yes' | 'no'; isActive: boolean; reason: string };
const empty: Draft = { sellerName: '', sellerAddress: '', sellerContact: '', taxTreatment: '', taxRate: '', exemptionReason: '', discountCap: '', shippingTaxable: '', isActive: false, reason: '' };
function form(policy: InvoicePolicy | null): Draft {
  return policy ? { sellerName: policy.sellerName, sellerAddress: policy.sellerAddress, sellerContact: policy.sellerContact,
    taxTreatment: policy.taxTreatment, taxRate: String(policy.taxRateBps), exemptionReason: policy.exemptionReason ?? '',
    discountCap: String(policy.discountCapBps), shippingTaxable: policy.shippingTaxable ? 'yes' : 'no', isActive: policy.isActive, reason: '' } : { ...empty };
}
function bps(raw: string): number | null {
  const value = raw.trim().replace(/[۰-۹]/gu, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/gu, d => String(d.charCodeAt(0) - 1632));
  return /^(0|[1-9][0-9]{0,4})$/u.test(value) && Number(value) <= 10000 ? Number(value) : null;
}
function message(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'تنظیمات هم‌زمان تغییر کرده‌اند؛ نسخهٔ سرور را بازخوانی و پیش از ثبت دوباره بررسی کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'نشست فعال است؛ برای این تغییر حساس رمز و کد دومرحله‌ای را دوباره تأیید کنید.';
    if (error.code.startsWith('AUTH_')) return 'نشست معتبر نیست؛ دوباره وارد پنل شوید.';
    if (error.code === 'FORBIDDEN') return 'دسترسی مدیریت تنظیمات لازم است.';
    if (error.code === 'VALIDATION_ERROR') return 'مشخصات فروشنده، مبنای مالیات، نرخ صحیح، معافیت و دلیل تغییر را بررسی کنید.';
    if (error.code === 'IDEMPOTENCY_CONFLICT') return 'درخواست ثبت با دادهٔ دیگری استفاده شده؛ نتیجهٔ قبلی را بررسی کنید.';
  }
  return 'دریافت یا تأیید تنظیمات ناموفق بود؛ اتصال را بررسی کنید.';
}

export function InvoicePolicyPage() {
  const auth = useAuth();
  if (auth.isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(auth.user)) return <Alert severity="error">دسترسی مدیریت تنظیمات لازم است.</Alert>;
  return <InvoicePolicyEditor key={auth.user?.userId} />;
}
function InvoicePolicyEditor() {
  const [current, setCurrent] = useState<InvoicePolicy | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...empty });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null); const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false); const [conflict, setConflict] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const alive = useRef(false); const initialized = useRef(false); const flight = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const pending = useRef<{ body: InvoicePolicyUpdate; key: string } | null>(null);
  async function load() {
    setLoading(true); setLoadError(null);
    const abort = new AbortController(); requests.current.add(abort);
    try {
      const result = await readInvoicePolicy(abort.signal);
      if (!alive.current) return;
      setCurrent(result);
      if (!initialized.current) { setDraft(form(result)); setExpected(result?.version ?? null); initialized.current = true; }
      return result;
    } catch (cause) { if (alive.current && !(cause instanceof ApiAbortError)) setLoadError(cause); throw cause; }
    finally { requests.current.delete(abort); if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void load().catch(() => undefined);
    const active = requests.current;
    return () => { alive.current = false; for (const controller of active) controller.abort(); };
  }, []);
  function patch<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(row => ({ ...row, [key]: value })); setSavedVersion(null); }
  async function execute(request: NonNullable<typeof pending.current>) {
    const abort = new AbortController(); requests.current.add(abort);
    try {
      const result = await saveInvoicePolicy(request.body, request.key, abort.signal);
      if (!alive.current) return;
      pending.current = null; setUncertain(false); setConflict(false); setSavedVersion(result.version); setExpected(result.version);
      setCurrent(result); setDraft(form(result));
      // A replay can return an older immutable revision; read the actual current configuration.
      await load().catch(() => undefined);
    } catch (cause) {
      if (!alive.current) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setUncertain(ambiguous); setError(cause);
      if (!ambiguous) pending.current = null;
      if (cause instanceof ApiClientError && cause.code === 'STALE_VERSION') setConflict(true);
    } finally { requests.current.delete(abort); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (flight.current || pending.current || loading || loadError || conflict || (current?.version ?? null) !== expected) return;
    const rate = bps(draft.taxRate); const cap = bps(draft.discountCap);
    if (rate === null || cap === null || !draft.taxTreatment || !draft.shippingTaxable || !draft.sellerName.trim() || !draft.sellerAddress.trim() || !draft.sellerContact.trim() || !draft.reason.trim() ||
      (draft.taxTreatment === 'EXEMPT' && (rate !== 0 || !draft.exemptionReason.trim()))) {
      setError(new ApiClientError({ code: 'VALIDATION_ERROR', message: '', requestId: '', statusCode: 400 })); return;
    }
    const body: InvoicePolicyUpdate = { sellerName: draft.sellerName, sellerAddress: draft.sellerAddress, sellerContact: draft.sellerContact,
      taxTreatment: draft.taxTreatment, taxRateBps: rate, exemptionReason: draft.taxTreatment === 'EXEMPT' ? draft.exemptionReason : null,
      discountCapBps: cap, shippingTaxable: draft.shippingTaxable === 'yes', isActive: draft.isActive, expectedVersion: expected, reason: draft.reason };
    pending.current = { body, key: `invoice-policy-${randomUuid()}` };
    flight.current = true; setBusy(true); setError(null); setSavedVersion(null);
    try { await execute(pending.current); } finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  async function retry() {
    if (flight.current || !pending.current) return;
    flight.current = true; setBusy(true); setError(null);
    try { await load(); if (pending.current && alive.current) await execute(pending.current); }
    catch (cause) { if (alive.current) setError(cause); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  const locked = busy || loading || uncertain || Boolean(loadError);
  return <Box>
    <PageHeader title="تنظیمات فاکتور فروشگاهی" description="مشخصات فروشنده و سیاست مصوب محاسبهٔ فاکتور؛ هر تغییر یک نسخهٔ مستقل ثبت می‌کند." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'فاکتور' }]} />
    <Alert severity="info" sx={{ mb: 2 }}>تنظیمات این بخش برای فاکتور فروشگاهی است؛ صورتحساب رسمی مالیاتی در مرحلهٔ جدا انجام می‌شود.</Alert>
    {loading && <Typography role="status">در حال دریافت تنظیمات…</Typography>}
    {Boolean(loadError) && <Alert severity="error">{message(loadError)}</Alert>}
    {!loading && !loadError && !current && <Alert severity="warning">تنظیمات فاکتور ثبت نشده است؛ تا تکمیل و فعال‌سازی، صدور نهایی مجاز نیست.</Alert>}
    {current && <Paper component="section" aria-label="تنظیمات فعلی سرور" sx={{ p: 2, my: 2 }}>
      <Typography>نسخهٔ سرور: {current.version} — {current.isActive ? 'فعال' : 'غیرفعال'}</Typography>
      <Typography>{current.sellerName} — {current.sellerAddress} — {current.sellerContact}</Typography>
      <Typography>مبنای مالیات: {current.taxTreatment} · نرخ: {current.taxRateBps} واحد پایه · سقف تخفیف: {current.discountCapBps} واحد پایه · مالیات ارسال: {current.shippingTaxable ? 'بله' : 'خیر'}</Typography>
      {current.exemptionReason && <Typography>دلیل معافیت: {current.exemptionReason}</Typography>}
    </Paper>}
    <Button disabled={busy || loading} onClick={() => void load().catch(() => undefined)}>بازخوانی تنظیمات سرور</Button>
    {(conflict || (current?.version ?? null) !== expected) && !uncertain && <Alert severity="warning" sx={{ my: 2 }}>نسخهٔ سرور با فرم متفاوت است. مشخصات فعلی بالا را با فرم خود مقایسه کنید.
      <Button disabled={locked || (current?.version ?? null) === expected} onClick={() => { setExpected(current?.version ?? null); setConflict(false); setError(null); }}>نسخهٔ جدید را بررسی کردم؛ ادامهٔ ویرایش</Button>
    </Alert>}
    <Paper component="form" onSubmit={event => void save(event)} sx={{ p: 3, mt: 2 }}>
      {savedVersion !== null && <Alert severity="success">نسخهٔ {savedVersion} در سرور ثبت شد؛ اسناد قبلی تغییر نمی‌کنند.</Alert>}
      {Boolean(error) && <Alert severity="error" sx={{ mb: 2 }}>{uncertain ? 'نتیجهٔ ثبت مشخص نیست؛ فرم قفل شده است. پس از بازخوانی فقط همان درخواست دوباره بررسی می‌شود.' : message(error)}</Alert>}
      <Box component="fieldset" disabled={locked} sx={{ border: 0, p: 0, m: 0 }}><Stack spacing={2}>
        <TextField label="نام فروشنده / فروشگاه" value={draft.sellerName} onChange={e => patch('sellerName', e.target.value)} required inputProps={{ maxLength: 200 }} />
        <TextField label="نشانی عمومی فروشنده" value={draft.sellerAddress} onChange={e => patch('sellerAddress', e.target.value)} required inputProps={{ maxLength: 1000 }} helperText="نشانی قابل چاپ روی سند؛ اطلاعات محرمانه وارد نکنید." />
        <TextField label="اطلاعات تماس عمومی فروشنده" value={draft.sellerContact} onChange={e => patch('sellerContact', e.target.value)} required inputProps={{ maxLength: 200 }} />
        <TextField select label="مبنای مالیات مصوب" value={draft.taxTreatment} onChange={e => patch('taxTreatment', e.target.value as InvoiceTaxTreatment)} required>
          <MenuItem value="EXCLUSIVE">مالیات افزوده به مبلغ پس از تخفیف</MenuItem><MenuItem value="INCLUSIVE">مالیات داخل مبلغ پس از تخفیف</MenuItem><MenuItem value="EXEMPT">معاف با دلیل مصوب</MenuItem>
        </TextField>
        <TextField label="نرخ مالیات (واحد پایه)" value={draft.taxRate} onChange={e => patch('taxRate', e.target.value)} required inputProps={{ inputMode: 'numeric' }} helperText="عدد صحیح بین ۰ و ۱۰۰۰۰؛ ۱۰۰ واحد پایه برابر ۱٪ است. نرخ را طبق سیاست مصوب خود وارد کنید؛ پیش‌فرضی وجود ندارد." />
        {draft.taxTreatment === 'EXEMPT' && <TextField label="دلیل مصوب معافیت" value={draft.exemptionReason} onChange={e => patch('exemptionReason', e.target.value)} required inputProps={{ maxLength: 500 }} />}
        <TextField label="سقف تخفیف (واحد پایه)" value={draft.discountCap} onChange={e => patch('discountCap', e.target.value)} required inputProps={{ inputMode: 'numeric' }} helperText="عدد صحیح بین ۰ و ۱۰۰۰۰؛ ۰ یعنی تخفیف مجاز نیست. سقف مجموع تخفیف‌ها روی مبلغ اقلام پیش از مالیات است." />
        <TextField select label="مالیات هزینهٔ ارسال" value={draft.shippingTaxable} onChange={e => patch('shippingTaxable', e.target.value as Draft['shippingTaxable'])} required><MenuItem value="yes">مشمول همین مبنای مالیات</MenuItem><MenuItem value="no">بدون مالیات ارسال</MenuItem></TextField>
        <FormControlLabel control={<Switch checked={draft.isActive} onChange={(_, value) => patch('isActive', value)} />} label="فعال برای صدور فاکتور پس از تأیید سیاست" />
        <TextField label="دلیل ثبت نسخهٔ جدید" value={draft.reason} onChange={e => patch('reason', e.target.value)} required inputProps={{ maxLength: 500 }} helperText="دلیل در تاریخچهٔ محافظت‌شده نگه داشته می‌شود؛ رمز یا اطلاعات مشتری وارد نکنید." />
      </Stack></Box>
      <Button type="submit" variant="contained" sx={{ mt: 3 }} disabled={locked || conflict || (current?.version ?? null) !== expected}>ثبت نسخهٔ مصوب</Button>
      {uncertain && <Button disabled={busy || loading} sx={{ mt: 3 }} onClick={() => void retry()}>بازخوانی و بررسی همان درخواست</Button>}
    </Paper>
  </Box>;
}
