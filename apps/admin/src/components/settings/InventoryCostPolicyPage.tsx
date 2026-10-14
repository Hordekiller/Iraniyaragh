'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { InventoryCostMethod, InventoryCostPolicyState, InventoryCostPolicyUpdate } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { inventoryCostPolicy } from '@/lib/settings/inventory-cost-policy-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { PageHeader } from '@/components/ui/PageHeader';

function methodLabel(method: InventoryCostMethod | null) {
  if (method === 'FIFO') return 'FIFO؛ مصرف از خریدهای قدیمی‌تر';
  if (method === 'MOVING_WEIGHTED_AVERAGE') return 'میانگین موزون متحرک';
  return 'هنوز انتخاب نشده';
}
function failure(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'تنظیمات تغییر کرده است؛ نسخهٔ سرور را بازخوانی و بررسی کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای این تغییر حساس، تأیید تازهٔ رمز و کد دومرحله‌ای لازم است.';
    if (error.code === 'FORBIDDEN') return 'مجوز مدیریت تنظیمات لازم است.';
    if (error.code.startsWith('AUTH_')) return 'نشست معتبر نیست؛ دوباره وارد پنل شوید.';
    if (error.code === 'VALIDATION_ERROR') return 'روش و دلیل معتبرِ بدون اطلاعات محرمانه را وارد کنید.';
    if (error.code === 'IDEMPOTENCY_CONFLICT') return 'کلید این درخواست برای دادهٔ دیگری استفاده شده؛ نتیجه را بررسی کنید.';
  }
  return 'تنظیمات تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
}

export function InventoryCostPolicyPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <CostPolicyEditor key={user?.userId} />;
}
function CostPolicyEditor() {
  const [state, setState] = useState<InventoryCostPolicyState | null>(null);
  const [method, setMethod] = useState<InventoryCostMethod | ''>('');
  const [reason, setReason] = useState(''); const [expected, setExpected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null); const [readFailed, setReadFailed] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const life = useRef({ alive: false, initialized: false, flight: false, requests: new Set<AbortController>() });
  const pending = useRef<{ body: InventoryCostPolicyUpdate; key: string } | null>(null);
  async function request(mutation?: NonNullable<typeof pending.current>) {
    const controller = new AbortController(); life.current.requests.add(controller);
    try { return await inventoryCostPolicy(controller.signal, mutation); }
    finally { life.current.requests.delete(controller); }
  }
  async function reload() {
    setLoading(true); setReadFailed(false);
    try {
      const next = await request(); if (!life.current.alive) return;
      setState(next);
      if (readFailed) setError(null);
      if (!life.current.initialized) { setMethod(next.policy?.method ?? ''); setExpected(next.policy?.version ?? null); life.current.initialized = true; }
    } catch (cause) {
      if (life.current.alive && !(cause instanceof ApiAbortError)) { setError(cause); setReadFailed(true); setState(null); }
      throw cause;
    } finally { if (life.current.alive) setLoading(false); }
  }
  useEffect(() => {
    const lifetime = life.current; lifetime.alive = true; void reload().catch(() => undefined);
    return () => { lifetime.alive = false; for (const controller of lifetime.requests) controller.abort(); };
  }, []);
  async function execute() {
    const submission = pending.current; if (!submission) return;
    try {
      const accepted = await request(submission); if (!life.current.alive) return;
      pending.current = null; setUncertain(false); setConflict(false); setError(null);
      setSaved(accepted.policy!.version); setExpected(accepted.policy!.version); setMethod(accepted.policy!.method ?? ''); setReason(''); setState(accepted);
      // Replay returns historical evidence: it must not masquerade as the current head.
      await reload().catch(() => undefined);
    } catch (cause) {
      if (!life.current.alive) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setError(cause); setUncertain(ambiguous); if (!ambiguous) pending.current = null;
      if (cause instanceof ApiClientError && cause.code === 'STALE_VERSION') setConflict(true);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (life.current.flight || locked || mismatch || conflict || pending.current) return;
    if (!reason.trim()) { setError(new ApiClientError({ code: 'VALIDATION_ERROR', message: '', requestId: '', statusCode: 400 })); return; }
    pending.current = { key: `cost-policy-${randomUuid()}`, body: { method: method || null, expectedVersion: expected, reason } };
    life.current.flight = true; setBusy(true); setError(null); setSaved(null);
    try { await execute(); } finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }
  async function retry() {
    if (life.current.flight || !pending.current) return;
    life.current.flight = true; setBusy(true);
    try { await reload(); if (life.current.alive) await execute(); }
    catch (cause) { if (life.current.alive) setError(cause); }
    finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }
  const mismatch = state !== null && (state.policy?.version ?? null) !== expected;
  const locked = loading || busy || uncertain || readFailed || state === null;
  return <Box>
    <PageHeader title="روش هزینهٔ انبار" description="انتخاب روش مصوب برای آماده‌سازی ارزش‌گذاری مالی انبار" breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'روش هزینهٔ انبار' }]} />
    <Alert severity="warning">ارزش‌گذاری مالی انبار غیرفعال است. ثبت روش آن را فعال نمی‌کند؛ فعال‌سازی به تکمیل و پذیرش دفتر هزینه وابسته است.</Alert>
    <Typography sx={{ my: 2 }}>برای موجودی اولیه یا رسیدِ بدون سند هزینه، هزینهٔ نامعلوم باقی می‌ماند؛ قیمت فعلی کالا یا صفر جایگزین آن نمی‌شود.</Typography>
    {loading && <Typography role="status">در حال دریافت روش هزینه…</Typography>}
    {Boolean(error) && <Alert severity="error">{uncertain ? 'نتیجهٔ ثبت مشخص نیست؛ فرم قفل است. ابتدا بازخوانی و سپس همان درخواست بررسی می‌شود.' : failure(error)}</Alert>}
    {state && <Paper sx={{ p: 2, my: 2 }} component="section" aria-label="روش ذخیره‌شدهٔ سرور">
      <Typography>{state.policy ? `نسخهٔ سرور: ${state.policy.version}` : 'روش هزینه هنوز ثبت نشده است.'}</Typography>
      <Typography>روش ذخیره‌شده: {methodLabel(state.policy?.method ?? null)}</Typography>
      <Typography>ارزش‌گذاری مالی: غیرفعال</Typography>
    </Paper>}
    <Button disabled={busy || loading} onClick={() => void reload().catch(() => undefined)}>بازخوانی روش هزینه</Button>
    {(conflict || mismatch) && !uncertain && <Alert severity="warning">نسخهٔ سرور را با انتخاب خود مقایسه کنید.
      <Button disabled={locked || !mismatch} onClick={() => { setExpected(state?.policy?.version ?? null); setConflict(false); setError(null); }}>نسخهٔ جدید را بررسی کردم</Button>
    </Alert>}
    <Paper component="form" onSubmit={event => void submit(event)} sx={{ p: 3, mt: 2 }}>
      {saved !== null && <Alert severity="success">نسخهٔ {saved} ثبت شد؛ ارزش‌گذاری همچنان غیرفعال است.</Alert>}
      <Box component="fieldset" disabled={locked} sx={{ border: 0, m: 0, p: 0 }}><Stack spacing={2}>
        <TextField select disabled={locked} label="روش هزینهٔ مصوب" value={method} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={event => { setMethod(event.target.value as InventoryCostMethod | ''); setSaved(null); }}>
          <MenuItem value="">هنوز انتخاب نشده</MenuItem><MenuItem value="FIFO">FIFO؛ مصرف از خریدهای قدیمی‌تر</MenuItem><MenuItem value="MOVING_WEIGHTED_AVERAGE">میانگین موزون متحرک</MenuItem>
        </TextField>
        <TextField label="دلیل انتخاب یا تغییر روش" required value={reason} onChange={event => { setReason(event.target.value); setSaved(null); }} slotProps={{ htmlInput: { maxLength: 500 } }} helperText="دلیل در تاریخچهٔ محافظت‌شده ثبت می‌شود؛ رمز یا اطلاعات مشتری وارد نکنید." />
      </Stack></Box>
      <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={locked || mismatch || conflict}>ثبت روش بدون فعال‌سازی</Button>
      {uncertain && <Button disabled={busy || loading} onClick={() => void retry()}>بازخوانی و بررسی همان درخواست</Button>}
    </Paper>
  </Box>;
}
