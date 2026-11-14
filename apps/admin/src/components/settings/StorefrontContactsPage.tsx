'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { ContactChannel, StorefrontContactLink, StorefrontContactsAdmin } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readStorefrontContacts, saveStorefrontContacts } from '@/lib/settings/storefront-contacts-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';

const CHANNELS: { value: ContactChannel; label: string }[] = [
  { value: 'instagram', label: 'اینستاگرام' }, { value: 'whatsapp', label: 'واتس‌اپ' },
  { value: 'bale', label: 'بله' }, { value: 'phone', label: 'شماره تماس' }, { value: 'other', label: 'پیوند دیگر' },
];
const defaultLabel = (channel: ContactChannel) => CHANNELS.find(item => item.value === channel)?.label ?? '';

export function StorefrontContactsPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <ContactsEditor key={user?.userId} />;
}

function ContactsEditor() {
  const [config, setConfig] = useState<StorefrontContactsAdmin | null>(null);
  const [links, setLinks] = useState<StorefrontContactLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readStorefrontContacts(controller.signal)
      .then(value => { setConfig(value); setLinks(value.links); })
      .catch(error => { if (!(error instanceof ApiAbortError)) setMessage({ severity: 'error', text: 'دریافت تنظیمات ارتباطی انجام نشد. دوباره تلاش کنید.' }); });
    return () => controller.abort();
  }, [reload]);

  const change = (id: string, patch: Partial<StorefrontContactLink>) => {
    setLinks(current => current.map(item => item.id === id ? { ...item, ...patch } : item)); setMessage(null);
  };
  const add = () => { setLinks(current => [...current, { id: randomUuid(), channel: 'instagram', label: 'اینستاگرام', value: '' }]); setMessage(null); };
  const remove = (id: string) => { setLinks(current => current.filter(item => item.id !== id)); setMessage(null); };
  async function save() {
    if (!config || busy) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveStorefrontContacts({ expectedVersion: config.version, links });
      setConfig(saved); setLinks(saved.links); setMessage({ severity: 'success', text: 'راه‌های ارتباطی ذخیره و منتشر شدند.' });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'STALE_VERSION') {
        setMessage({ severity: 'error', text: 'این تنظیمات هم‌زمان تغییر کرده‌اند؛ نسخهٔ جدید دریافت شد. دوباره بررسی کنید.' }); setReload(value => value + 1);
      } else setMessage({ severity: 'error', text: error instanceof ApiClientError && error.code === 'INVALID_CONTACTS' ? 'عنوان یا نشانی یکی از راه‌های ارتباطی معتبر نیست. برای پیوندها از https و برای تماس از شماره استفاده کنید.' : 'نتیجهٔ ذخیره مشخص نیست؛ پیش از تلاش دوباره صفحه را بازخوانی کنید.' });
    } finally { setBusy(false); }
  }

  const dirty = config !== null && JSON.stringify(links) !== JSON.stringify(config.links);
  return <Stack gap={3}>
    <PageHeader title="راه‌های ارتباطی شناور" description="پیوندهای دکمهٔ ارتباط بالای راهنمای صفحه را مدیریت کنید. هر مورد را می‌توانید اضافه، ویرایش یا حذف کنید." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'راه‌های ارتباطی' }]} />
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack gap={2}>
        {!config && <Typography role="status">در حال دریافت تنظیمات…</Typography>}
        {config && <>
          <Alert severity="info">فقط موارد ذخیره‌شده نمایش داده می‌شوند. برای اینستاگرام، واتس‌اپ، بله و پیوندهای دیگر، نشانی کامل https وارد کنید؛ برای تماس، شماره را بنویسید. حداکثر ۱۲ مورد.</Alert>
          {links.length === 0 && <Typography color="text.secondary">هنوز راه ارتباطی ثبت نشده است؛ دکمهٔ ارتباط در فروشگاه دیده نمی‌شود.</Typography>}
          {links.map((link, index) => <Paper key={link.id} variant="outlined" sx={{ p: 2 }} component="fieldset" aria-label={`راه ارتباطی ${index + 1}`}>
            <Stack gap={1.5}>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
                <TextField select label="نوع" size="small" value={link.channel} disabled={busy} sx={{ minWidth: 160 }} onChange={event => { const channel = event.target.value as ContactChannel; change(link.id, { channel, label: defaultLabel(channel), value: '' }); }}>
                  {CHANNELS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </TextField>
                <TextField label="عنوان نمایشی" size="small" fullWidth value={link.label} disabled={busy} inputProps={{ maxLength: 40 }} onChange={event => change(link.id, { label: event.target.value })} />
                <TextField label={link.channel === 'phone' ? 'شماره تماس' : 'نشانی کامل https'} size="small" fullWidth value={link.value} disabled={busy} inputProps={{ dir: 'ltr', maxLength: 500 }} placeholder={link.channel === 'phone' ? '+9821…' : 'نشانی کامل پیوند'} onChange={event => change(link.id, { value: event.target.value })} />
              </Stack>
              <Stack direction="row" gap={1}><Button color="error" type="button" disabled={busy} onClick={() => remove(link.id)}>حذف</Button></Stack>
            </Stack>
          </Paper>)}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="outlined" disabled={busy || links.length >= 12} onClick={add}>افزودن راه ارتباطی</Button>
            <Button variant="contained" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره و انتشار'}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">نسخهٔ {config.version} · آخرین تغییر: {config.updatedAt ? new Date(config.updatedAt).toLocaleString('fa-IR') : 'هنوز ذخیره نشده'}</Typography>
        </>}
        {message && <Alert severity={message.severity}>{message.text}</Alert>}
        {!config && message?.severity === 'error' && <Button onClick={() => setReload(value => value + 1)}>تلاش دوباره</Button>}
      </Stack>
    </Paper>
  </Stack>;
}
