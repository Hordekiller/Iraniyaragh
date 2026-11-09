'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { ReturnHolidayView, ReturnsSettings } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { addReturnHoliday, listReturnHolidays, readReturnsSettings, removeReturnHoliday, saveReturnsSettings } from '@/lib/returns/returns-api';
import { returnErrorMessage } from '@/lib/returns/returns-ui';

const faDate = (key: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

export function ReturnHolidaysPage() {
  const auth = useAuth();
  if (auth.isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(auth.user)) return <Alert severity="error">دسترسی مدیریت تنظیمات لازم است.</Alert>;
  return (
    <Box>
      <PageHeader
        title="مهلت مرجوعی و تعطیلات رسمی"
        description="مهلت مصوب: ۲ روز کاری برای تحویل حضوری و ۱ هفته (۷ روز تقویمی) برای شهرهای دیگر، از لحظهٔ صدور فاکتور تا پایان آخرین روز به وقت تهران. جمعه همیشه تعطیل است؛ تعطیلات رسمی را اینجا ثبت کنید. تعطیلی فقط مهلت حضوریِ مرجوعی‌هایی را که پس از آن ثبت می‌شوند تغییر می‌دهد."
        breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'مرجوعی' }]}
      />
      <ReturnsSwitch key={`switch-${auth.user?.userId}`} />
      <Editor key={auth.user?.userId} />
    </Box>
  );
}

/** On/off switch for recording NEW returns. Off by default; refunds of recorded returns are never blocked by it. */
function ReturnsSwitch() {
  const [config, setConfig] = useState<ReturnsSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readReturnsSettings(controller.signal)
      .then((value) => { setConfig(value); setEnabled(value.enabled); })
      .catch((failure) => { if (!controller.signal.aborted) setMessage({ severity: 'error', text: returnErrorMessage(failure, false) }); });
    return () => controller.abort();
  }, [reload]);

  async function save() {
    if (!config || busy) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveReturnsSettings({ expectedVersion: config.version, enabled });
      setConfig(saved); setEnabled(saved.enabled);
      setMessage({ severity: 'success', text: saved.enabled ? 'ثبت مرجوعی جدید فعال شد.' : 'ثبت مرجوعی جدید غیرفعال شد. مرجوعی‌های ثبت‌شده و استرداد آن‌ها دست‌نخورده‌اند.' });
    } catch (failure) {
      setMessage({ severity: 'error', text: returnErrorMessage(failure, false) });
      // The outcome may be unknown: always re-read the real state instead of assuming.
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const dirty = config !== null && enabled !== config.enabled;
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Stack gap={2}>
        <Typography variant="h6" component="h2">فعال‌سازی مرجوعی</Typography>
        <Typography variant="body2" color="text.secondary">
          تا وقتی خاموش باشد هیچ مرجوعی جدیدی ثبت نمی‌شود و مهلت مرجوعی در «قوانین و شرایط فروش» به مشتری نمایش داده نمی‌شود. خاموش بودن، مشاهدهٔ مرجوعی‌ها و ثبت استرداد مرجوعی‌های قبلی را نمی‌بندد.
        </Typography>
        <Alert severity="warning">
          پیش از روشن‌کردن: نوع مهلت هر روش ارسال را در «تعرفهٔ ارسال» مشخص کنید (روش مشخص‌نشده مرجوعی را مسدود می‌کند)، تعطیلات رسمی را وارد کنید و مجوزهای مرجوعی را به نقش‌های مربوط بدهید.
        </Alert>
        {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
        {config === null && !message ? <Typography role="status">در حال دریافت وضعیت…</Typography> : null}
        {config ? (
          <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
            <FormControlLabel control={<Switch checked={enabled} disabled={busy} onChange={(_, checked) => setEnabled(checked)} />} label={enabled ? 'ثبت مرجوعی جدید: فعال' : 'ثبت مرجوعی جدید: غیرفعال'} />
            <Button variant="contained" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ وضعیت'}</Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

function Editor() {
  const [items, setItems] = useState<ReturnHolidayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const rows = await listReturnHolidays(signal);
      if (!signal?.aborted) setItems(rows);
    } catch (failure) {
      if (!signal?.aborted) setError(returnErrorMessage(failure, false));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await addReturnHoliday({ dateKey: dateKey.trim(), label: label.trim() });
      setDateKey(''); setLabel('');
      await load();
    } catch (failure) {
      setError(returnErrorMessage(failure, false));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: ReturnHolidayView) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await removeReturnHoliday(row.id);
      await load();
    } catch (failure) {
      setError(returnErrorMessage(failure, false));
    } finally {
      setBusy(false);
    }
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/u.test(dateKey.trim()) && label.trim().length > 0;
  return (
    <Box>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Alert severity="info" sx={{ mb: 2 }}>
        نوع مهلت هر روش ارسال (حضوری یا شهر دیگر) در «تعرفهٔ ارسال» تعیین می‌شود. روشی که طبقه‌بندی نشده باشد مرجوعی را مسدود می‌کند.
      </Alert>
      <Paper component="form" onSubmit={(event) => void add(event)} sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField label="تاریخ تعطیلی (میلادی، YYYY-MM-DD)" value={dateKey} onChange={(event) => setDateKey(event.target.value)} disabled={busy} inputProps={{ dir: 'ltr', inputMode: 'numeric', maxLength: 10 }} helperText="مثال: 2027-03-21 (تاریخ تقویم میلادی همان روز در تهران)" />
          <TextField label="عنوان تعطیلی" value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} inputProps={{ maxLength: 120 }} />
          <Button type="submit" variant="contained" disabled={!valid || busy}>افزودن تعطیلی</Button>
        </Stack>
      </Paper>
      {loading ? <Typography role="status">در حال دریافت…</Typography> : null}
      {!loading && items.length === 0 ? <Alert severity="warning">هیچ تعطیلی ثبت نشده است؛ فقط جمعه‌ها غیرکاری حساب می‌شوند.</Alert> : null}
      {items.length > 0 ? (
        <Paper variant="outlined">
          <Table size="small" aria-label="تعطیلات ثبت‌شده">
            <TableHead><TableRow>{['تاریخ', 'عنوان', ''].map((title, index) => <TableCell key={index}>{title}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><span dir="ltr">{row.dateKey}</span> — {faDate(row.dateKey)}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell><Button color="error" size="small" disabled={busy} onClick={() => void remove(row)}>حذف {row.label}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}
    </Box>
  );
}
