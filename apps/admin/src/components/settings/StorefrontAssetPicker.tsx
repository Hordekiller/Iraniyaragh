'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import type { StorefrontAsset } from '@iranyaragh/contracts';
import { listAssets, startAsset, confirmAsset, archiveAsset } from '@/lib/settings/shop-api';
import { uploadMediaObject } from '@/lib/catalog/media-api';
import { createIdempotencyKey } from '@/lib/catalog/catalog-api';
export function StorefrontAssetPicker({ label, value, alt, disabled = false, onChange }: { label: string; value: string | null; alt: string; disabled?: boolean; onChange: (id: string | null) => void }) {
  const [items, setItems] = useState<StorefrontAsset[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const alive = useRef(false);
  const change = useRef(onChange); change.current = onChange;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function refresh() {
      try {
        const rows = await listAssets(controller.signal, page, value);
        if (controller.signal.aborted) return;
        setItems(current => page === 1 ? rows : [...current, ...rows.filter(row => !current.some(item => item.id === row.id))]);
        setHasMore(rows.length >= 100);
        if (pending) {
          const item = rows.find(row => row.id === pending);
          if (item?.state === 'READY') { change.current(item.id); setPending(null); setStatus('تصویر آمادهٔ استفاده است.'); }
          else if (item?.state === 'FAILED') { setError('پردازش تصویر ناموفق بود؛ فایل معتبر دیگری انتخاب کنید.'); setPending(null); }
          else if (++polls < 40) timer = setTimeout(() => void refresh(), 2000);
          else setStatus('پردازش هنوز پایان نیافته است؛ برای بررسی دوباره، تازه‌سازی کنید.');
        }
      } catch { if (!controller.signal.aborted) setError('دریافت کتابخانهٔ تصاویر انجام نشد.'); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pending, attempt, page, value]);
  async function upload(file: File) {
    setBusy(true); setError(''); setStatus('در حال ارسال تصویر…');
    try {
      const intent = await startAsset(file, alt.trim());
      await uploadMediaObject(intent, file, percent => { if (alive.current) setStatus(`ارسال: ${percent}٪`); });
      await confirmAsset(intent.mediaId, createIdempotencyKey('asset-confirm'));
      if (alive.current) { setPending(intent.mediaId); setStatus('تصویر در حال بررسی امنیتی و پردازش است…'); }
    } catch { if (alive.current) { setError('ارسال یا تأیید تصویر انجام نشد. کتابخانه را تازه‌سازی کنید و وضعیت را بررسی کنید.'); setStatus(''); } }
    finally { if (alive.current) setBusy(false); }
  }
  const selected = items.find(item => item.id === value);
  return <Stack gap={1}>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select label={label} value={value ?? ''} disabled={disabled || busy} onChange={event => onChange(event.target.value || null)}>
      <MenuItem value="">بدون تصویر</MenuItem>
      {value && !items.some(item => item.id === value) && <MenuItem value={value}>تصویر انتخاب‌شده ({value.slice(0, 8)})</MenuItem>}
      {items.filter(item => item.state === 'READY').map(item => <MenuItem key={item.id} value={item.id}>{item.altText || item.id}</MenuItem>)}
    </TextField>
    {selected?.image && <Box component="img" src={selected.image.url} alt={alt} sx={{ width: 180, maxWidth: '100%', height: 110, objectFit: 'contain', bgcolor: 'action.hover', borderRadius: 2 }} />}
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button component="label" disabled={disabled || busy || !alt.trim()}>آپلود / جایگزینی<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></Button>
      <Button disabled={disabled || busy} onClick={() => { setPage(1); setError(''); setAttempt(value => value + 1); }}>تازه‌سازی تصاویر</Button>
      {hasMore && <Button disabled={disabled || busy} onClick={() => setPage(current => current + 1)}>تصاویر قدیمی‌تر</Button>}
      {value && <Button disabled={disabled || busy} onClick={() => onChange(null)}>حذف از این بخش</Button>}
      {selected && <Button color="error" disabled={disabled || busy} onClick={async () => { setBusy(true); try { await archiveAsset(selected.id, selected.version); onChange(null); setAttempt(value => value + 1); } catch { setError('حذف انجام نشد؛ ابتدا ارجاع‌ها را حذف و ذخیره کنید و احراز هویت تازه داشته باشید.'); } finally { setBusy(false); } }}>بایگانی فایل بدون استفاده</Button>}
    </Stack>
    {!alt.trim() && <small>برای آپلود ابتدا متن جایگزین تصویر را وارد کنید.</small>}
    {status && <small role="status">{status}</small>}
  </Stack>;
}
