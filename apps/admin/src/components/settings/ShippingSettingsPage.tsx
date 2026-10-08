'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import type { ShippingMethodSettings, ShippingMethodSettingsUpdate } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { readShippingMethods, saveShippingMethod } from '@/lib/settings/shipping-settings-api';

function message(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'تنظیمات تغییر کرده‌اند. نسخهٔ جدید را دریافت و پیش از ذخیره، تعرفه را دوباره بررسی کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'نشست فعال است؛ رمز و کد دومرحله‌ای را تأیید کنید و سپس دوباره ذخیره کنید.';
    if (['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'].includes(error.code)) return 'نشست معتبر نیست؛ دوباره وارد پنل شوید.';
    if (error.code === 'FORBIDDEN') return 'دسترسی مدیریت تنظیمات لازم است.';
    if (['INVALID_REQUEST', 'IDEMPOTENCY_CONFLICT'].includes(error.code)) return 'نام، مبلغ ریالی و درخواست ذخیره را دوباره بررسی کنید.';
  }
  return 'عملیات تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
}

export function ShippingSettingsPage() {
  const auth = useAuth();
  if (auth.isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(auth.user)) return <Alert severity="error">دسترسی مدیریت تنظیمات لازم است.</Alert>;
  return <ShippingEditor key={auth.user?.userId} />;
}

function ShippingEditor() {
  const [methods, setMethods] = useState<ShippingMethodSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<ShippingMethodSettings | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const pending = useRef<{ code: string; body: ShippingMethodSettingsUpdate; key: string } | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    const abort = new AbortController(); requests.current.add(abort);
    try {
      const list = await readShippingMethods(abort.signal);
      if (!alive.current) return;
      setMethods(list);
      // Preserve the operator's draft; only adopt the current version for review.
      setSelected((previous) => previous ? list.find((item) => item.code === previous.code) ?? previous : null);
    } catch (cause) { if (alive.current && !(cause instanceof ApiAbortError)) setLoadError(cause); }
    finally { requests.current.delete(abort); if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    const activeRequests = requests.current;
    return () => { alive.current = false; for (const request of activeRequests) request.abort(); };
  }, []);

  function select(method: ShippingMethodSettings | null) {
    if (busy || uncertain) return;
    setSelected(method); setCode(method?.code ?? ''); setTitle(method?.title ?? ''); setAmount(method?.amount.amount ?? '');
    setIsActive(method?.isActive ?? false); setError(null); setSaved(false); pending.current = null;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const normalized = amount.trim().replace(/[۰-۹]/gu, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(code) || !title.trim() || !/^(0|[1-9][0-9]{0,18})$/u.test(normalized) || BigInt(normalized) > 9223372036854775807n) {
      setError(new ApiClientError({ code: 'INVALID_REQUEST', statusCode: 400, message: '', requestId: '' })); return;
    }
    inFlight.current = true; setBusy(true); setError(null); setSaved(false);
    pending.current ??= { code, body: { title: title.trim(), amount: { amount: normalized, currency: 'IRR' }, isActive, expectedVersion: selected?.version ?? null }, key: `shipping-${crypto.randomUUID()}` };
    const request = pending.current;
    const abort = new AbortController(); requests.current.add(abort);
    try {
      const method = await saveShippingMethod(request.code, request.body, request.key, abort.signal);
      if (!alive.current) return;
      pending.current = null; setUncertain(false); setSaved(true); setSelected(method);
      setMethods((current) => [...current.filter((item) => item.code !== method.code), method].sort((a, b) => a.code.localeCompare(b.code)));
    } catch (cause) {
      if (!alive.current) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setUncertain(ambiguous); setError(cause);
      if (!ambiguous) pending.current = null;
    } finally { requests.current.delete(abort); inFlight.current = false; if (alive.current) setBusy(false); }
  }

  return <Box>
    <PageHeader title="روش‌ها و تعرفهٔ ارسال" description="تعرفهٔ ثابت و مصوب برای نشانی‌های ایران؛ مبلغ فقط به ریال است. روش غیرفعال در خرید نمایش داده نمی‌شود." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'ارسال' }]} />
    {loading && <Typography role="status">در حال دریافت تعرفه‌ها…</Typography>}
    {Boolean(loadError) && <Alert severity="error">{message(loadError)}</Alert>}
    {!loading && !loadError && methods.length === 0 && <Alert severity="warning">هیچ روش ارسالی ثبت نشده است؛ بدون تعرفهٔ فعال، مشتری نمی‌تواند سفارش ثبت کند.</Alert>}
    <Button disabled={busy || uncertain || loading} onClick={() => void load()}>دریافت نسخهٔ جدید برای بررسی</Button>
    <Stack direction="row" gap={1} flexWrap="wrap" sx={{ my: 2 }}>
      <Button disabled={busy || uncertain} onClick={() => select(null)}>روش جدید</Button>
      {methods.map((method) => <Button key={method.code} disabled={busy || uncertain} onClick={() => select(method)}>{method.title} — {method.isActive ? 'فعال' : 'غیرفعال'}</Button>)}
    </Stack>
    <Paper component="form" onSubmit={(event) => void save(event)} sx={{ p: 3 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>تعرفه در سرور ذخیره شد؛ سفارش‌های قبلی تغییر نمی‌کنند.</Alert>}
      {Boolean(error) && <Alert severity="error" sx={{ mb: 2 }}>{uncertain ? 'نتیجه ذخیره مشخص نیست؛ داده‌ها قفل شده‌اند و تلاش دوباره با همان درخواست انجام می‌شود.' : message(error)}</Alert>}
      <Box component="fieldset" disabled={busy || uncertain} sx={{ border: 0, p: 0, m: 0 }}>
        <Stack gap={2}>
          <TextField label="کد روش ارسال (لاتین)" value={code} disabled={Boolean(selected)} onChange={(event) => setCode(event.target.value)} required inputProps={{ maxLength: 64 }} helperText="کد یکتا و ثابت، مانند post؛ پس از ایجاد تغییر نمی‌کند." />
          <TextField label="نام قابل نمایش برای مشتری" value={title} onChange={(event) => setTitle(event.target.value)} required inputProps={{ maxLength: 120 }} />
          <TextField label="هزینهٔ مصوب ارسال (ریال)" value={amount} onChange={(event) => setAmount(event.target.value)} required inputProps={{ inputMode: 'numeric' }} helperText="عدد صحیح ریالی؛ تومان یا عدد اعشاری وارد نکنید. صفر تنها برای ارسال رایگان مصوب است." />
          <FormControlLabel control={<Switch checked={isActive} onChange={(_, checked) => setIsActive(checked)} />} label="فعال در فرایند خرید مشتری" />
        </Stack>
      </Box>
      <Button type="submit" variant="contained" disabled={busy || loading || Boolean(loadError)} sx={{ mt: 3 }}>{busy ? 'در حال ذخیره…' : uncertain ? 'بررسی دوباره همین درخواست' : 'ذخیره تعرفهٔ مصوب'}</Button>
    </Paper>
  </Box>;
}
