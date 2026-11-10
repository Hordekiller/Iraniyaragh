'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material';
import type { InvoiceAutomationConfig } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readInvoiceAutomation, saveInvoiceAutomation } from '@/lib/settings/invoice-automation-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';

const count = (value: number) => new Intl.NumberFormat('fa-IR').format(value);

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'این تنظیم در این فاصله تغییر کرده است؛ وضعیت جدید دریافت شد، دوباره بررسی و ذخیره کنید.';
    if (error.code === 'FORBIDDEN') return 'برای روشن‌کردن، خودِ شما باید مجوز صدور و انتشار فاکتور و مدیریت تنظیمات را داشته باشید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای این تغییر، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است؛ پس از تأیید دوباره «ذخیره» را بزنید.';
  }
  return 'تنظیم تأیید نشد؛ اتصال را بررسی و صفحه را بازخوانی کنید. تا زمان تأیید، وضعیت قبلی را تغییرنکرده فرض نکنید.';
}

/** Switch for issuing and publishing the invoice of every paid order without a per-invoice staff command. */
export function InvoiceAutomationCard() {
  const { user, isRestoring } = useAuth();
  if (isRestoring || !canManageSettings(user)) return null;
  return <Editor key={user?.userId} />;
}

function Editor() {
  const [config, setConfig] = useState<InvoiceAutomationConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readInvoiceAutomation(controller.signal)
      .then(value => { setConfig(value); setEnabled(value.enabled); })
      .catch(error => { if (!(error instanceof ApiAbortError)) setMessage({ severity: 'error', text: errorText(error) }); });
    return () => controller.abort();
  }, [reload]);

  async function save() {
    if (!config || busy) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveInvoiceAutomation({ expectedVersion: config.version, enabled });
      setConfig(saved); setEnabled(saved.enabled);
      setMessage({ severity: 'success', text: saved.enabled
        ? 'صدور و انتشار خودکار فاکتور روشن شد؛ فاکتور سفارش‌های پرداخت‌شده تا حدود یک دقیقهٔ دیگر صادر می‌شود.'
        : 'صدور و انتشار خودکار فاکتور خاموش شد. فاکتورهای صادرشدهٔ قبلی تغییری نمی‌کنند.' });
    } catch (error) {
      setMessage({ severity: 'error', text: errorText(error) });
      if (error instanceof ApiClientError && error.code === 'STALE_VERSION') setReload(value => value + 1);
    } finally { setBusy(false); }
  }

  const dirty = config !== null && enabled !== config.enabled;
  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }} component="section" aria-label="صدور خودکار فاکتور">
      <Stack gap={2}>
        <Typography variant="h6" component="h2">صدور و انتشار خودکار فاکتور پس از پرداخت</Typography>
        <Typography variant="body2" color="text.secondary">
          با روشن‌بودن این گزینه، برای هر سفارشِ پرداخت‌شده‌ای که فاکتور ندارد (فروش‌های قبلی و سفارش‌های جدید) یک فاکتور با همین تنظیمات فروشنده صادر و در حساب کاربری همان مشتری منتشر می‌شود.
          مبلغ فاکتور همان مبلغ سفارش است و سفارش، پرداخت و موجودی تغییری نمی‌کنند. این فاکتورها با مسئولیت و به نام کاربری صادر می‌شوند که این گزینه را روشن کرده است.
        </Typography>
        {config === null && !message && <Typography role="status">در حال دریافت تنظیم…</Typography>}
        {config !== null && <>
          {!config.policyReady && <Alert severity="warning">تنظیمات فاکتور هنوز فعال نیست؛ تا وقتی نسخهٔ مصوب و فعالِ تنظیمات فاکتور ثبت نشود، فاکتوری صادر نمی‌شود.</Alert>}
          <FormControlLabel
            control={<Switch checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />}
            label="صدور و انتشار خودکار فاکتور برای سفارش‌های پرداخت‌شده"
          />
          <Typography variant="body2" color="text.secondary">
            {config.version === 0 ? 'هنوز ذخیره نشده است؛ پیش‌فرض: خاموش.' : `وضعیت فعلی: ${config.enabled ? 'روشن' : 'خاموش'} · آخرین تغییر: ${config.updatedAt ? new Date(config.updatedAt).toLocaleString('fa-IR') : '—'}`}
          </Typography>
          <Typography variant="body2" data-testid="invoice-automation-pending">
            سفارش‌های پرداخت‌شدهٔ بدون فاکتور: {count(config.pendingOrders)} · فاکتورهای خودکارِ منتشرنشده: {count(config.unpublishedInvoices)}
          </Typography>
          <Stack direction="row" gap={2}>
            <Button variant="contained" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</Button>
            <Button variant="outlined" disabled={busy} onClick={() => { setMessage(null); setReload(value => value + 1); }}>بازخوانی وضعیت</Button>
          </Stack>
        </>}
        {message && <Alert severity={message.severity}>{message.text}</Alert>}
      </Stack>
    </Paper>
  );
}
