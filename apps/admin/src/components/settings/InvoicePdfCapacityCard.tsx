'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { INVOICE_PDF_CAPACITY_LIMITS as LIMITS, type InvoicePdfCapacityConfig } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readInvoicePdfCapacity, saveInvoicePdfCapacity } from '@/lib/settings/invoice-pdf-capacity-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';

const count = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
const megabytes = (bytes: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
/** Suggested starting values; nothing is approved until the operator saves. */
const SUGGESTED = { budgetMegabytes: '64', maxArtifacts: '500', maxPendingJobs: '3' };

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'این تنظیم در این فاصله تغییر کرده است؛ وضعیت جدید دریافت شد، دوباره بررسی و ذخیره کنید.';
    if (error.code === 'CAPACITY_BELOW_USAGE') return 'ظرفیت نمی‌تواند کمتر از مقدار ذخیره‌شده یا درخواست‌های در صف باشد.';
    if (error.code === 'VALIDATION_ERROR') return 'مقدارها معتبر نیستند؛ عددهای صحیح در بازهٔ مجاز وارد کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای این تغییر، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است؛ پس از تأیید دوباره «ذخیره» را بزنید.';
  }
  return 'تنظیم تأیید نشد؛ اتصال را بررسی و صفحه را بازخوانی کنید. تا زمان تأیید، وضعیت قبلی را تغییرنکرده فرض نکنید.';
}
const whole = (text: string, range: { min: number; max: number }) => {
  const value = Number(text);
  return /^\d+$/.test(text.trim()) && value >= range.min && value <= range.max ? value : null;
};

/** Operator approval of the private invoice PDF store; without it no invoice PDF is produced. */
export function InvoicePdfCapacityCard() {
  const { user, isRestoring } = useAuth();
  if (isRestoring || !canManageSettings(user)) return null;
  return <Editor key={user?.userId} />;
}

function Editor() {
  const [config, setConfig] = useState<InvoicePdfCapacityConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [form, setForm] = useState(SUGGESTED);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  function adopt(value: InvoicePdfCapacityConfig) {
    setConfig(value); setEnabled(value.enabled);
    setForm(value.configured ? { budgetMegabytes: String(value.budgetMegabytes), maxArtifacts: String(value.maxArtifacts), maxPendingJobs: String(value.maxPendingJobs) } : SUGGESTED);
  }
  useEffect(() => {
    const controller = new AbortController();
    readInvoicePdfCapacity(controller.signal).then(adopt)
      .catch(error => { if (!(error instanceof ApiAbortError)) setMessage({ severity: 'error', text: errorText(error) }); });
    return () => controller.abort();
  }, [reload]);

  const budget = whole(form.budgetMegabytes, LIMITS.budgetMegabytes);
  const artifacts = whole(form.maxArtifacts, LIMITS.maxArtifacts);
  const pending = whole(form.maxPendingJobs, LIMITS.maxPendingJobs);
  const valid = budget !== null && artifacts !== null && pending !== null;
  const dirty = config !== null && (!config.configured ? enabled : enabled !== config.enabled || budget !== config.budgetMegabytes || artifacts !== config.maxArtifacts || pending !== config.maxPendingJobs);

  async function save() {
    if (!config || busy || budget === null || artifacts === null || pending === null) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveInvoicePdfCapacity({ expectedVersion: config.version, enabled, budgetMegabytes: budget, maxArtifacts: artifacts, maxPendingJobs: pending });
      adopt(saved);
      setMessage({ severity: 'success', text: saved.enabled ? 'ظرفیت فایل PDF فاکتور تأیید و فعال شد.' : 'ساخت فایل PDF فاکتور غیرفعال شد؛ فایل‌های قبلی همچنان قابل دریافت‌اند.' });
    } catch (error) {
      setMessage({ severity: 'error', text: errorText(error) });
      if (error instanceof ApiClientError && error.code === 'STALE_VERSION') setReload(value => value + 1);
    } finally { setBusy(false); }
  }
  const field = (name: keyof typeof SUGGESTED, label: string, range: { min: number; max: number }, value: number | null) => (
    <TextField label={label} value={form[name]} disabled={busy} error={value === null} inputMode="numeric" size="small"
      helperText={`عدد صحیح بین ${count(range.min)} و ${count(range.max)}`}
      onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} />
  );

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }} component="section" aria-label="ظرفیت فایل PDF فاکتور">
      <Stack gap={2}>
        <Typography variant="h6" component="h2">فایل PDF فاکتور</Typography>
        <Typography variant="body2" color="text.secondary">
          فایل PDF هر فاکتور یک بار ساخته و به‌صورت خصوصی در پایگاه داده نگه‌داری می‌شود. تا وقتی این ظرفیت تأیید و فعال نشود، دکمهٔ دریافت PDF برای مشتری و کارمند کار نمی‌کند.
          ظرفیت را متناسب با فضای دیسک سرور تعیین کنید؛ هر فایل معمولاً کمتر از ۰٫۲ مگابایت است.
        </Typography>
        {config === null && !message && <Typography role="status">در حال دریافت تنظیم…</Typography>}
        {config !== null && <>
          {!config.configured && <Alert severity="warning">ظرفیت فایل PDF هنوز تأیید نشده است؛ مقدارهای زیر فقط پیشنهادند و تا ذخیره‌نشدن اعمال نمی‌شوند.</Alert>}
          <FormControlLabel
            control={<Switch checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />}
            label="ساخت و دریافت فایل PDF فاکتور فعال باشد"
          />
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            {field('budgetMegabytes', 'سقف فضای ذخیره (مگابایت)', LIMITS.budgetMegabytes, budget)}
            {field('maxArtifacts', 'سقف تعداد فایل', LIMITS.maxArtifacts, artifacts)}
            {field('maxPendingJobs', 'سقف درخواست هم‌زمان در صف', LIMITS.maxPendingJobs, pending)}
          </Stack>
          <Typography variant="body2" data-testid="invoice-pdf-capacity-usage">
            {config.configured
              ? `وضعیت فعلی: ${config.enabled ? 'فعال' : 'غیرفعال'} · استفاده‌شده: ${megabytes(config.storedBytes)} از ${count(config.budgetMegabytes)} مگابایت · فایل‌ها: ${count(config.artifactCount)} از ${count(config.maxArtifacts)} · در صف: ${count(config.pendingJobCount)}`
              : 'وضعیت فعلی: تأییدنشده و غیرفعال.'}
          </Typography>
          <Stack direction="row" gap={2}>
            <Button variant="contained" disabled={!dirty || !valid || busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</Button>
            <Button variant="outlined" disabled={busy} onClick={() => { setMessage(null); setReload(value => value + 1); }}>بازخوانی وضعیت</Button>
          </Stack>
        </>}
        {message && <Alert severity={message.severity}>{message.text}</Alert>}
      </Stack>
    </Paper>
  );
}
