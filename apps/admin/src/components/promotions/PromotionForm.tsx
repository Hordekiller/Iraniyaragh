'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import type { PromotionAdmin, PromotionInput, PromotionKind, PromotionMode, PromotionTarget, PromotionTargetType } from '@iranyaragh/contracts';
import { getProduct, listBrands, listCategories, listProducts } from '@/lib/catalog/catalog-api';
import { KIND_LABELS, MODE_LABELS, toLatinDigits } from '@/lib/promotions/promotion-labels';

type Option = { id: string; label: string };
const TYPE_LABELS: Record<PromotionTargetType, string> = { PRODUCT: 'کالا', VARIANT: 'SKU', CATEGORY: 'دسته‌بندی', BRAND: 'برند' };

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const money = (v: string) => {
  const n = toLatinDigits(v.trim());
  return n === '' ? null : n;
};
const intOrNull = (v: string) => {
  const n = toLatinDigits(v.trim());
  return n === '' ? null : Number(n);
};

export type PromotionFormProps = {
  initial: PromotionAdmin | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: PromotionInput) => void;
  onCancel: () => void;
};

export function PromotionForm({ initial, busy, error, onSubmit, onCancel }: PromotionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [badgeText, setBadgeText] = useState(initial?.badgeText ?? '');
  const [kind, setKind] = useState<PromotionKind>(initial?.kind ?? 'PERCENTAGE');
  const [mode, setMode] = useState<PromotionMode>(initial?.mode ?? 'COUPON');
  const [percent, setPercent] = useState(initial?.percentBp ? String(initial.percentBp / 100) : '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [maxDiscount, setMaxDiscount] = useState(initial?.maxDiscount ?? '');
  const [minOrder, setMinOrder] = useState(initial?.minOrder ?? '');
  const [maxOrder, setMaxOrder] = useState(initial?.maxOrder ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [maxRedemptions, setMaxRedemptions] = useState(initial?.maxRedemptions?.toString() ?? '');
  const [perCustomer, setPerCustomer] = useState(initial?.perCustomerLimit?.toString() ?? '');
  const [firstPurchaseOnly, setFirstPurchaseOnly] = useState(initial?.firstPurchaseOnly ?? false);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [stackable, setStackable] = useState(initial?.stackable ?? false);
  const [priority, setPriority] = useState(String(initial?.priority ?? 100));
  const [targets, setTargets] = useState<PromotionTarget[]>(initial?.targets ?? []);
  const [localError, setLocalError] = useState<string | null>(null);

  const [brands, setBrands] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [variants, setVariants] = useState<Option[]>([]);
  const [targetType, setTargetType] = useState<PromotionTargetType>('CATEGORY');
  const [exclude, setExclude] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [skuProduct, setSkuProduct] = useState<Option | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    void listBrands(abort.signal).then((r) => setBrands(r.map((b) => ({ id: b.id, label: b.name })))).catch(() => undefined);
    void listCategories(abort.signal).then((r) => setCategories(r.map((c) => ({ id: c.id, label: c.name })))).catch(() => undefined);
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!['PRODUCT', 'VARIANT'].includes(targetType) || productQuery.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void listProducts({ search: productQuery.trim(), perPage: 20 }, abort.signal)
        .then((r) => setProducts(r.items.map((p) => ({ id: p.id, label: p.name }))))
        .catch(() => undefined);
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [productQuery, targetType]);
  useEffect(() => {
    if (targetType !== 'VARIANT' || !skuProduct) { setVariants([]); return; }
    const abort = new AbortController();
    void getProduct(skuProduct.id, abort.signal)
      .then((r) => setVariants(r.product.variants.map((v) => ({ id: v.id, label: `${v.sku}${v.title ? ` — ${v.title}` : ''}` }))))
      .catch(() => undefined);
    return () => abort.abort();
  }, [skuProduct, targetType]);

  const labels = new Map<string, string>();
  for (const o of [...brands, ...categories, ...products, ...variants]) labels.set(o.id, o.label);
  const options = targetType === 'BRAND' ? brands : targetType === 'CATEGORY' ? categories : targetType === 'PRODUCT' ? products : variants;

  function addTarget(option: Option | null) {
    if (!option) return;
    if (targets.some((t) => t.type === targetType && t.targetId === option.id && t.exclude === exclude)) return;
    setTargets([...targets, { type: targetType, targetId: option.id, exclude, label: option.label }]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!name.trim()) { setLocalError('نام کمپین را وارد کنید.'); return; }
    let percentBp: number | null = null;
    if (kind === 'PERCENTAGE') {
      const p = Number(toLatinDigits(percent.trim()));
      if (!Number.isFinite(p) || p <= 0 || p > 100 || Math.round(p * 100) !== p * 100) { setLocalError('درصد تخفیف باید بین ۰٫۰۱ تا ۱۰۰ باشد.'); return; }
      percentBp = Math.round(p * 100);
    }
    if ((kind === 'FIXED_CART' || kind === 'FIXED_ITEM') && !money(amount)) { setLocalError('مبلغ تخفیف (ریال) را وارد کنید.'); return; }
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) { setLocalError('پایان کمپین باید بعد از شروع آن باشد.'); return; }
    onSubmit({
      name: name.trim(), description: description.trim() || null, badgeText: badgeText.trim() || null, kind, mode,
      percentBp, amount: kind === 'FIXED_CART' || kind === 'FIXED_ITEM' ? money(amount) : null,
      maxDiscount: money(maxDiscount), minOrder: money(minOrder), maxOrder: money(maxOrder),
      startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt),
      maxRedemptions: intOrNull(maxRedemptions), perCustomerLimit: intOrNull(perCustomer),
      firstPurchaseOnly, customerId: customerId.trim() || null, stackable, priority: intOrNull(priority) ?? 100,
      targets: targets.map(({ type, targetId, exclude: ex }) => ({ type, targetId, exclude: ex })),
    });
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0 }}>
        <Stack gap={2}>
          {(localError ?? error) && <Alert severity="error">{localError ?? error}</Alert>}
          <TextField label="نام کمپین" value={name} onChange={(e) => setName(e.target.value)} required inputProps={{ maxLength: 160 }} />
          <TextField label="توضیح داخلی" value={description} onChange={(e) => setDescription(e.target.value)} inputProps={{ maxLength: 500 }} />
          <TextField label="متن نشان در فروشگاه (اختیاری)" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} inputProps={{ maxLength: 40 }} helperText="فقط برای کمپین‌های خودکار نمایش داده می‌شود؛ درصد واقعی از قانون کمپین محاسبه می‌شود." />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField select fullWidth label="نوع استفاده" value={mode} disabled={Boolean(initial)} onChange={(e) => setMode(e.target.value as PromotionMode)}>
              {(Object.keys(MODE_LABELS) as PromotionMode[]).map((m) => <MenuItem key={m} value={m}>{MODE_LABELS[m]}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="نوع تخفیف" value={kind} onChange={(e) => setKind(e.target.value as PromotionKind)}>
              {(Object.keys(KIND_LABELS) as PromotionKind[]).map((k) => <MenuItem key={k} value={k}>{KIND_LABELS[k]}</MenuItem>)}
            </TextField>
          </Stack>
          {kind === 'PERCENTAGE' && <TextField label="درصد تخفیف" value={percent} onChange={(e) => setPercent(e.target.value)} inputProps={{ inputMode: 'decimal' }} required />}
          {(kind === 'FIXED_CART' || kind === 'FIXED_ITEM') && <TextField label="مبلغ تخفیف (ریال)" value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ inputMode: 'numeric' }} required helperText="عدد صحیح ریالی." />}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField fullWidth label="سقف مبلغ تخفیف (ریال)" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
            <TextField fullWidth label="حداقل مبلغ سبد (ریال)" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
            <TextField fullWidth label="حداکثر مبلغ سبد (ریال)" value={maxOrder} onChange={(e) => setMaxOrder(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField fullWidth type="datetime-local" label="شروع" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} InputLabelProps={{ shrink: true }} helperText="خالی = بلافاصله. بر اساس ساعت سرور اعمال می‌شود." />
            <TextField fullWidth type="datetime-local" label="پایان" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} InputLabelProps={{ shrink: true }} helperText="خالی = بدون پایان." />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField fullWidth label="سقف کل استفاده" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} inputProps={{ inputMode: 'numeric' }} helperText="خالی = نامحدود" />
            <TextField fullWidth label="سقف استفاده برای هر مشتری" value={perCustomer} onChange={(e) => setPerCustomer(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
            <TextField fullWidth label="اولویت (کمتر = زودتر)" value={priority} onChange={(e) => setPriority(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
          </Stack>
          <TextField label="شناسهٔ مشتری مجاز (اختیاری)" value={customerId} onChange={(e) => setCustomerId(e.target.value)} helperText="فقط همین مشتری می‌تواند از کمپین استفاده کند." />
          <FormControlLabel control={<Switch checked={firstPurchaseOnly} onChange={(_, c) => setFirstPurchaseOnly(c)} />} label="فقط برای اولین خرید مشتری" />
          <FormControlLabel control={<Switch checked={stackable} onChange={(_, c) => setStackable(c)} />} label="قابل ترکیب با کمپین‌های ترکیب‌پذیر دیگر (در غیر این صورت انحصاری است و بهترین تخفیف اعمال می‌شود)" />

          <Box>
            <Typography variant="subtitle2" gutterBottom>دامنهٔ شمول (خالی = کل فروشگاه)</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
              <TextField select size="small" label="نوع" value={targetType} onChange={(e) => { setTargetType(e.target.value as PromotionTargetType); setSkuProduct(null); }} sx={{ minWidth: 140 }}>
                {(Object.keys(TYPE_LABELS) as PromotionTargetType[]).map((t) => <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="حالت" value={exclude ? 'x' : 'i'} onChange={(e) => setExclude(e.target.value === 'x')} sx={{ minWidth: 140 }}>
                <MenuItem value="i">شامل</MenuItem><MenuItem value="x">مستثنی</MenuItem>
              </TextField>
              {targetType === 'VARIANT' && (
                <Autocomplete size="small" sx={{ minWidth: 220 }} options={products} value={skuProduct} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.id === b.id}
                  onInputChange={(_, v) => setProductQuery(v)} onChange={(_, v) => setSkuProduct(v)} noOptionsText="کالا را جستجو کنید" renderInput={(p) => <TextField {...p} label="ابتدا کالا" />} />
              )}
              <Autocomplete size="small" sx={{ flex: 1, minWidth: 220 }} options={options} value={null} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.id === b.id}
                onInputChange={(_, v) => { if (targetType === 'PRODUCT') setProductQuery(v); }} onChange={(_, v) => addTarget(v)} noOptionsText="موردی یافت نشد"
                renderInput={(p) => <TextField {...p} label={`افزودن ${TYPE_LABELS[targetType]}`} />} />
            </Stack>
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
              {targets.map((t) => (
                <Chip key={`${t.type}:${t.targetId}:${t.exclude}`} color={t.exclude ? 'warning' : 'default'}
                  label={`${t.exclude ? 'مستثنی' : 'شامل'} ${TYPE_LABELS[t.type]}: ${t.label ?? labels.get(t.targetId) ?? t.targetId}`}
                  onDelete={() => setTargets(targets.filter((x) => x !== t))} />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Box>
      <Stack direction="row" gap={1} sx={{ mt: 3 }}>
        <Button type="submit" variant="contained" disabled={busy}>{busy ? 'در حال ذخیره…' : initial ? 'ذخیرهٔ تغییرات' : 'ایجاد کمپین'}</Button>
        <Button onClick={onCancel} disabled={busy}>انصراف</Button>
      </Stack>
    </Box>
  );
}
