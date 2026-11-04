'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import type { HomepageBannerAdmin, HomepageBannerInput, HomepageBannerMediaOption, HomepageBannersAdminConfig, HomepageBannersUpdate } from '@iranyaragh/contracts';
import { HOMEPAGE_BANNER_SLOTS } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readHomepageBanners, saveHomepageBanners } from '@/lib/settings/homepage-banners-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';

const SUGGESTIONS = ['لولا کابینت', 'ریل کشو', 'دستگیره کابینت', 'درب‌های سفارشی فرملکس و دکوفیکس'];

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'بنرها تغییر کرده‌اند؛ نسخهٔ جدید را دریافت و دوباره بررسی کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای ذخیره، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است.';
    if (error.code === 'FORBIDDEN') return 'دسترسی مدیریت تنظیمات لازم است.';
    if (error.code === 'INVALID_MEDIA') return 'تصویر انتخاب‌شده آماده یا معتبر نیست.';
    if (error.code === 'INVALID_REQUEST') return 'فیلدها ناقص‌اند، پیوند باید مسیر داخلی (با «/») یا نشانی امن (https) باشد و بازهٔ انتشار باید معتبر باشد.';
  }
  return 'تنظیمات تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
}

const toInput = (banner: HomepageBannerAdmin): HomepageBannerInput => ({
  id: banner.id, title: banner.title, subtitle: banner.subtitle, ctaLabel: banner.ctaLabel, href: banner.href, desktopMediaId: banner.desktopMediaId,
  mobileMediaId: banner.mobileMediaId, imageAlt: banner.imageAlt, enabled: banner.enabled, publishAt: banner.publishAt, unpublishAt: banner.unpublishAt,
});
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : null);

export function HomepageBannersPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <HomepageBannersEditor key={user?.userId} />;
}

function MediaSelect({ label, value, options, optional, disabled, onChange }: { label: string; value: string | null; options: HomepageBannerMediaOption[]; optional?: boolean; disabled: boolean; onChange: (id: string | null) => void }) {
  return (
    <TextField select size="small" fullWidth label={label} value={value ?? ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
      {optional && <MenuItem value="">بدون تصویر موبایل (استفاده از تصویر دسکتاپ)</MenuItem>}
      {value && !options.some(option => option.id === value) && <MenuItem value={value}>تصویر فعلی ({value.slice(0, 8)})</MenuItem>}
      {options.map(option => (
        <MenuItem key={option.id} value={option.id}>
          <Stack direction="row" gap={1} alignItems="center">
            <Box component="img" src={option.url} alt="" sx={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 0.5 }} />
            <span>{option.productName}{option.alt ? ` — ${option.alt}` : ''}</span>
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}

function Preview({ banner, media }: { banner: HomepageBannerInput; media: HomepageBannerMediaOption[] }) {
  const urlOf = (id: string | null) => media.find(option => option.id === id)?.url;
  const desktop = urlOf(banner.desktopMediaId);
  const mobile = urlOf(banner.mobileMediaId) ?? desktop;
  const card = (src: string | undefined, width: number, ratio: string, caption: string) => (
    <Box sx={{ width: { xs: '100%', md: width }, maxWidth: '100%' }}>
      <Typography variant="caption" color="text.secondary">{caption}</Typography>
      <Box sx={{ position: 'relative', aspectRatio: ratio, bgcolor: 'action.hover', borderRadius: 2, overflow: 'hidden' }}>
        {src && <Box component="img" src={src} alt={banner.imageAlt} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <Box sx={{ position: 'absolute', insetInline: 0, bottom: 0, p: 1.5, color: '#fff', background: 'linear-gradient(to top, rgba(0,0,0,.75), transparent)' }}>
          <Typography fontWeight={900} variant="body2">{banner.title || 'عنوان بنر'}</Typography>
          {banner.subtitle && <Typography variant="caption">{banner.subtitle}</Typography>}
          <Box><Box component="span" sx={{ display: 'inline-block', mt: 0.5, px: 1.25, py: 0.25, borderRadius: 4, bgcolor: '#FF4D00', fontSize: 12, fontWeight: 700 }}>{banner.ctaLabel || 'دکمه'}</Box></Box>
        </Box>
      </Box>
    </Box>
  );
  return <Stack direction={{ xs: 'column', md: 'row' }} gap={2} aria-label="پیش‌نمایش زنده">{card(desktop, 360, '2 / 1', 'پیش‌نمایش دسکتاپ')}{card(mobile, 240, '16 / 9', 'پیش‌نمایش موبایل')}</Stack>;
}

function HomepageBannersEditor() {
  const [config, setConfig] = useState<HomepageBannersAdminConfig | null>(null);
  const [media, setMedia] = useState<HomepageBannerMediaOption[]>([]);
  const [banners, setBanners] = useState<HomepageBannerInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const life = useRef({ alive: false, flight: false, requests: new Set<AbortController>() });
  const pending = useRef<{ body: HomepageBannersUpdate; key: string } | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    const request = new AbortController(); life.current.requests.add(request);
    try {
      const result = await readHomepageBanners(request.signal);
      if (!life.current.alive) return;
      setConfig(result.config); setMedia(result.media);
      if (!pending.current) setBanners(result.config.banners.map(toInput));
      setStale(false);
    } catch (cause) {
      if (life.current.alive && !(cause instanceof ApiAbortError)) setLoadError(cause);
    } finally {
      life.current.requests.delete(request);
      if (life.current.alive) setLoading(false);
    }
  }

  useEffect(() => {
    life.current.alive = true; void load();
    const current = life.current;
    return () => { current.alive = false; for (const request of current.requests) request.abort(); };
  }, []);

  const touch = () => { setSaved(false); setError(null); pending.current = null; };
  const patch = (index: number, change: Partial<HomepageBannerInput>) => { setBanners(current => current.map((banner, i) => (i === index ? { ...banner, ...change } : banner))); touch(); };
  const add = () => {
    if (banners.length >= HOMEPAGE_BANNER_SLOTS || media.length === 0) return;
    setBanners(current => [...current, { id: randomUuid(), title: '', subtitle: null, ctaLabel: 'مشاهده محصولات', href: '/', desktopMediaId: media[0]!.id, mobileMediaId: null, imageAlt: '', enabled: false, publishAt: null, unpublishAt: null }]);
    touch();
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= banners.length) return;
    setBanners(current => { const next = [...current]; [next[index], next[target]] = [next[target]!, next[index]!]; return next; }); touch();
  };
  const remove = (index: number) => { setBanners(current => current.filter((_, i) => i !== index)); touch(); };

  async function execute() {
    const request = pending.current; if (!request) return;
    try {
      const result = await saveHomepageBanners(request.body, request.key);
      if (!life.current.alive) return;
      pending.current = null; setConfig(result); setBanners(result.banners.map(toInput));
      setUncertain(false); setStale(false); setSaved(true); setError(null);
    } catch (cause) {
      if (!life.current.alive) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setUncertain(ambiguous); setError(cause);
      if (cause instanceof ApiClientError && cause.code === 'STALE_VERSION') setStale(true);
      if (!ambiguous) pending.current = null;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (life.current.flight || !config || loading || Boolean(loadError) || stale || uncertain) return;
    pending.current = { body: { expectedVersion: config.version, banners }, key: `homepage-banners-${randomUuid()}` };
    life.current.flight = true; setBusy(true); setError(null); setSaved(false);
    try { await execute(); } finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }

  async function retry() {
    if (life.current.flight || !pending.current) return;
    life.current.flight = true; setBusy(true);
    try { await execute(); } finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }

  const locked = loading || busy || uncertain || stale || !config || Boolean(loadError);
  return <Box>
    <PageHeader title="بنرهای تبلیغاتی صفحهٔ اصلی" description="حداکثر چهار بنر زیر کاروسل ویژه؛ ترتیب، تصویر، پیوند و زمان‌بندی را مدیریت کنید." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'بنرها' }]} />
    <Stack gap={2}>
      <Alert severity="info">تصویر بنر از میان تصاویر آمادهٔ رسانهٔ کالاها انتخاب می‌شود. برای تصویر جدید یا جایگزین، ابتدا آن را در بخش رسانهٔ یک کالا بارگذاری کنید و پس از «آماده» شدن، اینجا انتخاب کنید. بنرِ غیرفعال، خارج از بازهٔ انتشار یا بدون تصویر آماده در فروشگاه نمایش داده نمی‌شود.</Alert>
      {loading && <Typography role="status">در حال دریافت تنظیمات…</Typography>}
      {Boolean(loadError) && <Alert severity="error">{errorText(loadError)} <Button onClick={() => void load()}>تلاش دوباره</Button></Alert>}
      {stale && <Alert severity="warning">{errorText(error)} <Button onClick={() => void load()}>دریافت نسخهٔ جدید</Button></Alert>}
      {uncertain && <Alert severity="warning">نتیجهٔ ذخیره مشخص نیست. همین درخواست با همان کلید تکرار می‌شود تا دوباره ثبت نشود.</Alert>}
      {Boolean(error) && !stale && !uncertain && <Alert severity="error">{errorText(error)}</Alert>}
      {saved && <Alert severity="success">بنرها ذخیره شدند.</Alert>}
      {!loading && !loadError && media.length === 0 && <Alert severity="warning">هنوز تصویر آماده‌ای در رسانهٔ کالاها وجود ندارد.</Alert>}
      <Paper component="form" onSubmit={event => void submit(event)} sx={{ p: { xs: 2, md: 3 } }}>
        <Stack gap={2}>
          {banners.length === 0 && !loading && <Alert severity="warning">بنری تعریف نشده؛ بخش بنر در فروشگاه نمایش داده نمی‌شود.</Alert>}
          {banners.map((banner, index) => (
            <Paper key={banner.id} variant="outlined" sx={{ p: 2 }} component="fieldset" aria-label={`بنر ${index + 1}`}>
              <Stack gap={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Typography fontWeight={800}>بنر {index + 1}</Typography>
                  <Stack direction="row" gap={0.5} alignItems="center">
                    <FormControlLabel control={<Switch checked={banner.enabled} disabled={locked} onChange={event => patch(index, { enabled: event.target.checked })} />} label="فعال" />
                    <Button type="button" aria-label="انتقال به بالا" disabled={locked || index === 0} onClick={() => move(index, -1)}>↑</Button>
                    <Button type="button" aria-label="انتقال به پایین" disabled={locked || index === banners.length - 1} onClick={() => move(index, 1)}>↓</Button>
                    <Button type="button" color="error" disabled={locked} onClick={() => remove(index)}>حذف</Button>
                  </Stack>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
                  <TextField size="small" fullWidth required label="عنوان" value={banner.title} disabled={locked} placeholder={SUGGESTIONS[index]} inputProps={{ maxLength: 80 }} onChange={event => patch(index, { title: event.target.value })} />
                  <TextField size="small" fullWidth label="زیرعنوان" value={banner.subtitle ?? ''} disabled={locked} inputProps={{ maxLength: 160 }} onChange={event => patch(index, { subtitle: event.target.value || null })} />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
                  <TextField size="small" fullWidth required label="متن دکمه" value={banner.ctaLabel} disabled={locked} inputProps={{ maxLength: 40 }} onChange={event => patch(index, { ctaLabel: event.target.value })} />
                  <TextField size="small" fullWidth required label="مقصد (مثلاً /categories/…)" value={banner.href} disabled={locked} inputProps={{ dir: 'ltr', maxLength: 500 }} onChange={event => patch(index, { href: event.target.value })} />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
                  <MediaSelect label="تصویر دسکتاپ" value={banner.desktopMediaId} options={media} disabled={locked} onChange={id => id && patch(index, { desktopMediaId: id })} />
                  <MediaSelect label="تصویر موبایل (اختیاری)" value={banner.mobileMediaId} options={media} optional disabled={locked} onChange={id => patch(index, { mobileMediaId: id })} />
                </Stack>
                <TextField size="small" fullWidth required label="متن جایگزین تصویر" value={banner.imageAlt} disabled={locked} inputProps={{ maxLength: 200 }} onChange={event => patch(index, { imageAlt: event.target.value })} />
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
                  <TextField size="small" fullWidth type="datetime-local" label="شروع انتشار (اختیاری)" InputLabelProps={{ shrink: true }} value={toLocal(banner.publishAt)} disabled={locked} onChange={event => patch(index, { publishAt: fromLocal(event.target.value) })} />
                  <TextField size="small" fullWidth type="datetime-local" label="پایان انتشار (اختیاری)" InputLabelProps={{ shrink: true }} value={toLocal(banner.unpublishAt)} disabled={locked} onChange={event => patch(index, { unpublishAt: fromLocal(event.target.value) })} />
                </Stack>
                <Preview banner={banner} media={media} />
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button type="button" variant="outlined" disabled={locked || banners.length >= HOMEPAGE_BANNER_SLOTS || media.length === 0} onClick={add}>افزودن بنر</Button>
            {uncertain && <Button type="button" variant="outlined" onClick={() => void retry()}>بررسی و تکرار همان ذخیره</Button>}
            <Button type="submit" variant="contained" disabled={locked}>{busy ? 'در حال ذخیره…' : 'ذخیره و انتشار'}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">پیش‌نمایش بالا با داده‌های همین فرم ساخته می‌شود و تا ذخیره نکنید در فروشگاه اعمال نمی‌شود. ذخیره نیازمند تأیید تازهٔ ورود است.</Typography>
        </Stack>
      </Paper>
    </Stack>
  </Box>;
}
