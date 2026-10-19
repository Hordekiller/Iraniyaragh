'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import type { CategorySummary, HomepageCollectionSection, HomepageCollectionsConfig, HomepageCollectionsUpdate } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canManageSettings } from '@/lib/settings/settings-permissions';
import { readHomepageCollections, saveHomepageCollections } from '@/lib/settings/homepage-collections-api';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'STALE_VERSION') return 'تنظیمات صفحه اصلی تغییر کرده است؛ نسخهٔ جدید را دریافت و تغییرات را دوباره بررسی کنید.';
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') return 'برای ذخیره، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است.';
    if (error.code === 'FORBIDDEN') return 'دسترسی مدیریت تنظیمات لازم است.';
    if (error.code === 'INVALID_CATEGORY' || error.code === 'INVALID_REQUEST') return 'دسته‌بندی انتخاب‌شده معتبر نیست یا تعداد/ترتیب بخش‌ها قابل قبول نیست.';
  }
  return 'تنظیمات تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
}

function categoryLabel(category: CategorySummary, categories: CategorySummary[]) {
  const names = [category.name];
  let parentId = category.parentId;
  while (parentId) {
    const parent = categories.find(item => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(' ← ');
}

export function HomepageCollectionsPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(user)) return <Alert severity="error">مجوز مدیریت تنظیمات لازم است.</Alert>;
  return <HomepageCollectionsEditor key={user?.userId} />;
}

function HomepageCollectionsEditor() {
  const [config, setConfig] = useState<HomepageCollectionsConfig | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [sections, setSections] = useState<HomepageCollectionSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const life = useRef({ alive: false, flight: false, requests: new Set<AbortController>() });
  const pending = useRef<{ body: HomepageCollectionsUpdate; key: string } | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    const request = new AbortController(); life.current.requests.add(request);
    try {
      const result = await readHomepageCollections(request.signal);
      if (!life.current.alive) return;
      setConfig(result.config); setCategories(result.categories);
      if (!pending.current) setSections(result.config.sections);
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

  function replaceSection(index: number, patch: Partial<HomepageCollectionSection>) {
    setSections(current => current.map((section, currentIndex) => currentIndex === index ? { ...section, ...patch } : section));
    setSaved(false); setError(null); pending.current = null;
  }

  function addSection() {
    if (sections.length >= 8) return;
    const category = categories.find(item => !sections.some(section => section.categoryId === item.id));
    if (!category) return;
    setSections(current => [...current, { categoryId: category.id, sortBy: 'NEWEST' }]);
    setSaved(false); setError(null); pending.current = null;
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    setSections(current => { const next = [...current]; [next[index], next[target]] = [next[target]!, next[index]!]; return next; });
    setSaved(false); pending.current = null;
  }

  function remove(index: number) {
    setSections(current => current.filter((_, currentIndex) => currentIndex !== index));
    setSaved(false); setError(null); pending.current = null;
  }

  async function execute() {
    const request = pending.current; if (!request) return;
    try {
      const result = await saveHomepageCollections(request.body, request.key);
      if (!life.current.alive) return;
      pending.current = null; setConfig(result); setSections(result.sections); setUncertain(false); setStale(false); setSaved(true); setError(null);
      void load();
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
    if (sections.length > 8 || new Set(sections.map(section => section.categoryId)).size !== sections.length) {
      setError(new ApiClientError({ code: 'INVALID_REQUEST', statusCode: 400, message: '', requestId: '' })); return;
    }
    pending.current = { body: { expectedVersion: config.version, sections }, key: `homepage-collections-${randomUuid()}` };
    life.current.flight = true; setBusy(true); setError(null); setSaved(false);
    try { await execute(); } finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }

  async function retry() {
    if (life.current.flight || !pending.current) return;
    life.current.flight = true; setBusy(true);
    try { await execute(); } finally { life.current.flight = false; if (life.current.alive) setBusy(false); }
  }

  const locked = loading || busy || uncertain || stale || !config || Boolean(loadError);
  const selected = new Set(sections.map(section => section.categoryId));
  return <Box>
    <PageHeader title="چیدمان کاروسل صفحهٔ اصلی" description="دسته‌بندی‌های قابل نمایش را انتخاب و ترتیب و معیار هر کاروسل را تعیین کنید." breadcrumbs={[{ label: 'تنظیمات', href: '/settings' }, { label: 'صفحهٔ اصلی' }]} />
    <Stack gap={2}>
      <Alert severity="info">مرتب‌سازی «پرفروش» بر پایهٔ تعداد اقلام فروش قطعی در سفارش‌های پرداخت‌شده یا نسیهٔ تأییدشده است؛ لغوها و مرجوعی ثبت‌شده از رتبه کم می‌شوند. مرتب‌سازی «جدیدترین» بر پایهٔ زمان انتشار کالا است.</Alert>
      {loading && <Typography role="status">در حال دریافت تنظیمات…</Typography>}
      {Boolean(loadError) && <Alert severity="error">{errorText(loadError)} <Button onClick={() => void load()}>تلاش دوباره</Button></Alert>}
      {stale && <Alert severity="warning">{errorText(error)} <Button onClick={() => void load()}>دریافت نسخهٔ جدید</Button></Alert>}
      {uncertain && <Alert severity="warning">نتیجهٔ ذخیره مشخص نیست. برای جلوگیری از ثبت دوباره، همین درخواست با همان کلید تکرار می‌شود.</Alert>}
      {Boolean(error) && !stale && !uncertain && <Alert severity="error">{errorText(error)}</Alert>}
      {saved && <Alert severity="success">چیدمان صفحهٔ اصلی ذخیره شد.</Alert>}
      <Paper component="form" onSubmit={event => void submit(event)} sx={{ p: { xs: 2, md: 3 } }}>
        <Stack gap={2}>
          {sections.length === 0 && !loading && <Alert severity="warning">هنوز کاروسلی انتخاب نشده؛ برای جلوگیری از شلوغی، فهرست گستردهٔ کالاها نمایش داده نمی‌شود.</Alert>}
          {sections.map((section, index) => (
            <Paper key={`${section.categoryId}-${index}`} variant="outlined" sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} gap={1.5}>
                <Typography sx={{ minWidth: 70, fontWeight: 700 }}>بخش {index + 1}</Typography>
                <FormControl fullWidth size="small">
                  <InputLabel id={`homepage-category-${index}`}>دسته‌بندی</InputLabel>
                  <Select labelId={`homepage-category-${index}`} label="دسته‌بندی" value={section.categoryId} disabled={locked} onChange={event => replaceSection(index, { categoryId: event.target.value })}>
                    {categories.map(category => <MenuItem key={category.id} value={category.id} disabled={selected.has(category.id) && category.id !== section.categoryId}>{categoryLabel(category, categories)}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel id={`homepage-sort-${index}`}>ترتیب نمایش</InputLabel>
                  <Select labelId={`homepage-sort-${index}`} label="ترتیب نمایش" value={section.sortBy} disabled={locked} onChange={event => replaceSection(index, { sortBy: event.target.value as HomepageCollectionSection['sortBy'] })}>
                    <MenuItem value="NEWEST">جدیدترین</MenuItem>
                    <MenuItem value="BESTSELLING">پرفروش</MenuItem>
                  </Select>
                </FormControl>
                <Stack direction="row" gap={0.5}>
                  <Button type="button" aria-label="انتقال به بالا" disabled={locked || index === 0} onClick={() => move(index, -1)}>↑</Button>
                  <Button type="button" aria-label="انتقال به پایین" disabled={locked || index === sections.length - 1} onClick={() => move(index, 1)}>↓</Button>
                  <Button type="button" color="error" disabled={locked} onClick={() => remove(index)}>حذف</Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button type="button" variant="outlined" disabled={locked || sections.length >= 8 || categories.every(category => selected.has(category.id))} onClick={addSection}>افزودن دسته‌بندی</Button>
            {uncertain && <Button type="button" variant="outlined" onClick={() => void retry()}>بررسی و تکرار همان ذخیره</Button>}
            <Button type="submit" variant="contained" disabled={locked || categories.length === 0}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ چیدمان'}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">حداکثر ۸ کاروسل؛ ترتیب این فهرست، ترتیب نمایش در فروشگاه است. تنظیمات بعد از تأیید تازهٔ ورود ذخیره می‌شود.</Typography>
        </Stack>
      </Paper>
    </Stack>
  </Box>;
}
