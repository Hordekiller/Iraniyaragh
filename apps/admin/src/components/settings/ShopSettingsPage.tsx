'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import type { BrandSummary, CategorySummary, HomepageBannerInput, ShopAdminConfig, ShopSection, ShopUpdate, StorefrontAsset } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { apiFetch, ApiClientError } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import { listBrands, listCategories, createIdempotencyKey } from '@/lib/catalog/catalog-api';
import { listAssets, readShop, saveShop } from '@/lib/settings/shop-api';
import { StorefrontAssetPicker } from './StorefrontAssetPicker';
import { PageHeader } from '@/components/ui/PageHeader';
const kinds: Record<ShopSection['kind'], string> = { categories: 'دسته‌بندی‌ها', brands: 'برندها', offers: 'کاهش قیمت واقعی', newest: 'جدیدترین کالاها', bestsellers: 'پرفروش‌ها', manual: 'انتخاب دستی', category: 'کالاهای یک دسته', campaigns: 'جشنواره‌ها', recent: 'بازدیدهای اخیر' };
export function ShopSettingsPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <ShopEditor key={user?.userId} />;
}
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item!); return result;
}
function ProductSelection({ ids, disabled, onChange }: { ids: string[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void apiFetch<{ items: Array<{ id: string; name: string }> }>(`/catalog/products?perPage=20&search=${encodeURIComponent(search)}`, { token: getAccessToken(), signal: controller.signal }).then(result => { setItems(result.data.items); setError(false); }, () => { if (!controller.signal.aborted) setError(true); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);
  return <Stack gap={1}><TextField label="جستجوی کالای منتشرشده" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} />{error && <Alert severity="error">دریافت کالاها انجام نشد؛ جستجو را دوباره وارد کنید.</Alert>}<Stack direction="row" flexWrap="wrap" gap={1}>{ids.map(id => <Chip key={id} label={items.find(item => item.id === id)?.name ?? id} disabled={disabled} onDelete={() => onChange(ids.filter(value => value !== id))} />)}</Stack><TextField select label="افزودن کالا" value="" disabled={disabled || ids.length >= 24} onChange={event => onChange([...ids, event.target.value])}><MenuItem value="">انتخاب کنید</MenuItem>{items.filter(item => !ids.includes(item.id)).map(item => <MenuItem value={item.id} key={item.id}>{item.name}</MenuItem>)}</TextField></Stack>;
}
const toLocal = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
function BannerEditor({ value, disabled, assets, onChange }: { value: HomepageBannerInput; disabled: boolean; assets: StorefrontAsset[]; onChange: (value: HomepageBannerInput) => void }) {
  const patch = (update: Partial<HomepageBannerInput>) => onChange({ ...value, ...update });
  return <Stack gap={2}>
    {(['title', 'subtitle', 'ctaLabel', 'href', 'imageAlt'] as const).map((key, index) => <TextField key={key} label={['عنوان', 'توضیح', 'متن دکمه', 'مقصد دکمه', 'متن جایگزین تصویر'][index]} value={value[key] ?? ''} disabled={disabled} onChange={event => patch({ [key]: event.target.value })} />)}
    <StorefrontAssetPicker label="تصویر دسکتاپ" alt={value.imageAlt} value={value.desktopMediaId || null} disabled={disabled} onChange={id => patch({ desktopMediaId: id ?? '' })} />
    <StorefrontAssetPicker label="تصویر موبایل (اختیاری)" alt={value.imageAlt} value={value.mobileMediaId} disabled={disabled} onChange={id => patch({ mobileMediaId: id })} />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>{(['publishAt', 'unpublishAt'] as const).map(key => <TextField key={key} type="datetime-local" label={key === 'publishAt' ? 'شروع انتشار' : 'پایان انتشار'} value={toLocal(value[key])} disabled={disabled} slotProps={{ inputLabel: { shrink: true } }} onChange={event => patch({ [key]: event.target.value ? new Date(event.target.value).toISOString() : null })} />)}</Stack>
    <FormControlLabel label="انتشار فعال" control={<Switch checked={value.enabled} disabled={disabled} onChange={(_, enabled) => patch({ enabled })} />} />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>{[false, true].map(mobile => { const image = assets.find(item => item.id === (mobile ? value.mobileMediaId || value.desktopMediaId : value.desktopMediaId))?.image; return <Box key={String(mobile)} sx={{ width: mobile ? 240 : 400, maxWidth: '100%' }}><Typography variant="caption">{mobile ? 'پیش‌نمایش موبایل' : 'پیش‌نمایش دسکتاپ'}</Typography><Box sx={{ position: 'relative', aspectRatio: mobile ? '16/9' : '2/1', borderRadius: 2, bgcolor: 'grey.900', overflow: 'hidden' }}>{image && <Box component="img" src={image.url} alt={value.imageAlt} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />}<Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'end', p: 2, color: 'white', background: 'linear-gradient(transparent, #000b)' }}><strong>{value.title}</strong><small>{value.subtitle}</small><span>{value.ctaLabel}</span></Box></Box></Box>; })}</Stack>
  </Stack>;
}
function ShopEditor() {
  const [config, setConfig] = useState<ShopAdminConfig | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [assets, setAssets] = useState<StorefrontAsset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ body: ShopUpdate; key: string } | null>(null);
  const flight = useRef(false);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([readShop(controller.signal), listCategories(controller.signal), listBrands(controller.signal), listAssets(controller.signal)]).then(([next, cats, brandItems, media]) => { if (!controller.signal.aborted) { setConfig(next); setCategories(cats); setBrands(brandItems); setAssets(media); setError(''); } }, () => { if (!controller.signal.aborted) setError('دریافت تنظیمات انجام نشد.'); });
    return () => controller.abort();
  }, [attempt]);
  const locked = busy || uncertain;
  const change = (next: ShopAdminConfig) => { if (locked) return; setConfig(next); setSaved(false); pending.current = null; };
  async function save() {
    if (!config || flight.current) return;
    flight.current = true; setBusy(true); setError(''); setSaved(false);
    pending.current ??= { body: { hero: config.hero, banners: config.banners, categoryIds: config.categoryIds, brandIds: config.brandIds, sections: config.sections, expectedVersion: config.version }, key: createIdempotencyKey('shop-save') };
    try { const result = await saveShop(pending.current.body, pending.current.key); setConfig(result); pending.current = null; setUncertain(false); setSaved(true); }
    catch (cause) {
      const rejected = cause instanceof ApiClientError && cause.statusCode < 500;
      setUncertain(!rejected);
      if (rejected) pending.current = null;
      setError(cause instanceof ApiClientError && cause.code === 'STALE_VERSION' ? 'نسخه تغییر کرده است؛ تنظیمات تازه را دریافت و تغییرات را دوباره بررسی کنید.' : cause instanceof ApiClientError && cause.code === 'AUTH_REAUTHENTICATION_REQUIRED' ? 'برای ذخیره، احراز هویت تازه لازم است.' : 'ذخیره تأیید نشد. فیلدها و اتصال را بررسی کنید؛ در حالت نامطمئن، تلاش دوباره همان درخواست را پیگیری می‌کند.');
    } finally { flight.current = false; setBusy(false); }
  }
  return <Stack gap={3}><PageHeader title="مدیریت فروشگاه" description="اسلایدر، تصاویر و مجموعه‌های مستقل صفحهٔ فروشگاه" />
    {error && <Alert severity="error">{error}</Alert>}{saved && <Alert severity="success">تنظیمات فروشگاه ذخیره شد.</Alert>}
    <Stack direction="row" gap={1}><Button disabled={locked} onClick={() => setAttempt(value => value + 1)}>دریافت دوبارهٔ تنظیمات</Button><Button disabled={busy || !config} variant="contained" onClick={() => void save()}>{uncertain ? 'پیگیری ذخیرهٔ قبلی' : 'ذخیره و انتشار'}</Button></Stack>
    {!config ? <Typography role="status">در انتظار دریافت تنظیمات…</Typography> : <>
      <Alert severity="info">بخش‌های بدون کالا پنهان می‌شوند. انتخاب خالی دسته‌ها و برندها از ترتیب و انتخاب‌های ثبت‌شده در کاتالوگ استفاده می‌کند. تغییرات تصویر را پیش از بایگانی فایل ذخیره کنید.</Alert>
      {(['categoryIds', 'brandIds'] as const).map(key => <TextField key={key} select label={key === 'categoryIds' ? 'دسته‌های منتخب (شامل زیردسته‌ها)' : 'برندهای منتخب'} value={config[key]} disabled={locked} slotProps={{ select: { multiple: true } }} onChange={event => { const value = event.target.value; change({ ...config, [key]: typeof value === 'string' ? value.split(',') : value }); }}>{(key === 'categoryIds' ? categories : brands).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>)}
      {(['hero', 'banners'] as const).map(group => <Paper key={group} variant="outlined" sx={{ p: 3 }}><Stack gap={3}><Typography variant="h6">{group === 'hero' ? 'اسلایدر فروشگاه' : 'بنرهای تبلیغاتی فروشگاه'}</Typography>{config[group].map((banner, index) => <Paper key={banner.id} variant="outlined" sx={{ p: 2 }}><Stack gap={2}><BannerEditor value={banner} assets={assets} disabled={locked} onChange={next => change({ ...config, [group]: config[group].map(item => item.id === next.id ? next : item) })} /><Stack direction="row" gap={1}><Button disabled={locked || index === 0} onClick={() => change({ ...config, [group]: moveItem(config[group], index, index - 1) })}>بالا</Button><Button disabled={locked || index === config[group].length - 1} onClick={() => change({ ...config, [group]: moveItem(config[group], index, index + 1) })}>پایین</Button><Button disabled={locked} color="error" onClick={() => change({ ...config, [group]: config[group].filter(item => item.id !== banner.id) })}>حذف بخش</Button></Stack></Stack></Paper>)}<Button disabled={locked || config[group].length >= 4} onClick={() => change({ ...config, [group]: [...config[group], { id: createIdempotencyKey('slide'), title: '', subtitle: '', ctaLabel: 'مشاهده کالاها', href: '/catalog', imageAlt: '', desktopMediaId: '', mobileMediaId: null, enabled: false, publishAt: null, unpublishAt: null }] })}>افزودن {group === 'hero' ? 'اسلاید' : 'بنر'}</Button><Button onClick={() => void listAssets().then(setAssets, () => setError('تازه‌سازی پیش‌نمایش انجام نشد.'))}>تازه‌سازی پیش‌نمایش تصاویر</Button></Stack></Paper>)}
      <Typography variant="h6">ترتیب و محتوای بخش‌ها</Typography>
      {config.sections.map((section, index) => { const update = (patch: Partial<ShopSection>) => change({ ...config, sections: config.sections.map(item => item.id === section.id ? { ...item, ...patch } : item) }); return <Paper key={section.id} variant="outlined" sx={{ p: 3 }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!locked && drag.current !== null) change({ ...config, sections: moveItem(config.sections, drag.current, index) }); drag.current = null; }}><Stack gap={2}>
        <Button draggable={!locked} disabled={locked} onDragStart={() => { drag.current = index; }} onDragEnd={() => { drag.current = null; }} aria-label={`جابه‌جایی ${section.title}`}>⠿ {index + 1} — {section.title}</Button>
        <Stack direction="row" gap={1}><Button disabled={locked || index === 0} onClick={() => change({ ...config, sections: moveItem(config.sections, index, index - 1) })}>انتقال به بالا</Button><Button disabled={locked || index === config.sections.length - 1} onClick={() => change({ ...config, sections: moveItem(config.sections, index, index + 1) })}>انتقال به پایین</Button><Button disabled={locked} color="error" onClick={() => change({ ...config, sections: config.sections.filter(item => item.id !== section.id) })}>حذف</Button></Stack>
        <TextField select label="نوع بخش" value={section.kind} disabled={locked} onChange={event => update({ kind: event.target.value as ShopSection['kind'], categoryId: null, productIds: [] })}>{Object.entries(kinds).map(([key, title]) => <MenuItem key={key} value={key}>{title}</MenuItem>)}</TextField>
        <TextField label="عنوان بخش" value={section.title} disabled={locked} onChange={event => update({ title: event.target.value })} /><TextField label="توضیح بخش" value={section.description} disabled={locked} onChange={event => update({ description: event.target.value })} />
        <TextField label="تعداد نمایش" type="number" value={section.limit} disabled={locked} slotProps={{ htmlInput: { min: 1, max: 24 } }} onChange={event => update({ limit: Number(event.target.value) })} />
        <FormControlLabel label="نمایش بخش" control={<Switch checked={section.enabled} disabled={locked} onChange={(_, enabled) => update({ enabled })} />} />
        {section.kind === 'category' && <TextField select label="دستهٔ کالا" value={section.categoryId ?? ''} disabled={locked} onChange={event => update({ categoryId: event.target.value })}><MenuItem value="">انتخاب کنید</MenuItem>{categories.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>}
        {section.kind === 'manual' && <ProductSelection ids={section.productIds} disabled={locked} onChange={productIds => update({ productIds })} />}
      </Stack></Paper>; })}
      <Button disabled={locked || config.sections.length >= 12} onClick={() => change({ ...config, sections: [...config.sections, { id: createIdempotencyKey('section'), kind: 'manual', title: 'منتخب فروشگاه', description: '', limit: 8, enabled: true, categoryId: null, productIds: [] }] })}>افزودن مجموعه</Button>
    </>}
  </Stack>;
}
