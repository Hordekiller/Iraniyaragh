'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material';
import type { StorefrontHelperAdminConfig } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readStorefrontHelper, saveStorefrontHelper } from '@/lib/settings/storefront-helper-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'تنظیم در این فاصله تغییر کرده است؛ نسخهٔ جدید دریافت شد، دوباره بررسی و ذخیره کنید.';
    if (error.code === 'FORBIDDEN') return 'دسترسی مدیریت تنظیمات لازم است.';
  }
  return 'تنظیم تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید. وضعیت قبلی تغییر نکرده فرض نشود؛ صفحه را بازخوانی کنید.';
}

export function CustomerHelperSettingsPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <CustomerHelperEditor key={user?.userId} />;
}

function CustomerHelperEditor() {
  const [config, setConfig] = useState<StorefrontHelperAdminConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readStorefrontHelper(controller.signal)
      .then(value => { setConfig(value); setEnabled(value.enabled); })
      .catch(error => { if (!(error instanceof ApiAbortError)) setMessage({ severity: 'error', text: errorText(error) }); });
    return () => controller.abort();
  }, [reload]);

  async function save() {
    if (!config) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveStorefrontHelper({ expectedVersion: config.version, enabled });
      setConfig(saved); setEnabled(saved.enabled);
      setMessage({ severity: 'success', text: saved.enabled ? 'راهنمای مشتری برای کاربران روشن شد.' : 'راهنمای مشتری برای کاربران خاموش شد.' });
    } catch (error) {
      setMessage({ severity: 'error', text: errorText(error) });
      if (error instanceof ApiClientError && error.code === 'STALE_VERSION') setReload(value => value + 1);
    } finally { setBusy(false); }
  }

  const dirty = config !== null && enabled !== config.enabled;
  return (
    <Stack gap={3}>
      <PageHeader title="راهنمای تعاملی مشتری" description="نمایش دکمهٔ «راهنمای این صفحه»، راهنمای مرحله‌به‌مرحلهٔ روی دکمه‌ها و دکمه‌های «؟» برای کاربران فروشگاه." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'راهنمای مشتری' }]} />
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack gap={2}>
          {config === null && !message && <Typography role="status">در حال دریافت تنظیم…</Typography>}
          {config !== null && <>
            <FormControlLabel
              control={<Switch checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />}
              label="نمایش راهنمای تعاملی برای کاربران"
            />
            <Typography variant="body2" color="text.secondary">
              {config.version === 0 ? 'هنوز ذخیره نشده است؛ پیش‌فرض: روشن.' : `نسخهٔ ${config.version} · آخرین تغییر: ${config.updatedAt ? new Date(config.updatedAt).toLocaleString('fa-IR') : '—'}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              با خاموش کردن، دکمهٔ شناور، راهنمای روی صفحه و دکمه‌های «؟» برای همه پنهان می‌شود (حداکثر تا چند ثانیه پس از ذخیره). صفحه‌های نوشتاری «مرکز راهنمای مشتری» (/help) همچنان در دسترس هستند. تغییرات در گزارش ممیزی ثبت می‌شود.
            </Typography>
            <Stack direction="row"><Button variant="contained" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</Button></Stack>
          </>}
          {message && <Alert severity={message.severity}>{message.text}</Alert>}
        </Stack>
      </Paper>
    </Stack>
  );
}
