'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderOption, PurchaseOrderOptionKind } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { createPurchaseOrder, listPurchaseOrderOptions, newPurchaseOrderCommandKey, updatePurchaseOrder } from '@/lib/purchasing/purchase-orders-api';

type Row = { option: PurchaseOrderOption | null; qty: string; cost: string };
type Props = { open: boolean; order: PurchaseOrder | null; onClose: () => void; onSaved: (order: PurchaseOrder) => void };

export function purchaseOrderError(failure: unknown): string {
  if (failure instanceof ApiNetworkError) return 'نتیجهٔ دستور نامشخص است. پیش از تلاش دوباره، فهرست سفارش‌ها را نوسازی و بررسی کنید.';
  if (failure instanceof ApiClientError) {
    const known: Record<string, string> = {
      VERSION_CONFLICT: 'سفارش هم‌زمان تغییر کرده است. جزئیات را نوسازی کنید.',
      PURCHASE_ORDER_STATE_CONFLICT: 'این عملیات در وضعیت فعلی سفارش مجاز نیست.',
      SUPPLIER_INACTIVE: 'تأمین‌کننده غیرفعال شده است.',
      WAREHOUSE_INACTIVE: 'انبار غیرفعال شده است.',
      VARIANT_INACTIVE: 'یک یا چند SKU غیرفعال شده‌اند.',
      FRESH_AUTH_REQUIRED: 'برای تأیید، ورود دومرحله‌ای تازه لازم است.',
      RETRYABLE_CONFLICT: 'هم‌زمانی رخ داد؛ با همان کلید دوباره تلاش کنید.',
    };
    return known[failure.code] ?? failure.message;
  }
  return 'ثبت سفارش خرید ناموفق بود.';
}

function OptionPicker({ kind, label, value, onChange, disabled }: {
  kind: PurchaseOrderOptionKind; label: string; value: PurchaseOrderOption | null;
  onChange: (value: PurchaseOrderOption | null) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<PurchaseOrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      listPurchaseOrderOptions(kind, search, controller.signal)
        .then(result => { setOptions(result.items); setError(null); })
        .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError)) setError('دریافت گزینه‌ها ناموفق بود.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, search, disabled]);
  const available = value && !options.some(option => option.id === value.id) ? [value, ...options] : options;
  return <Autocomplete
    options={available} value={value} disabled={disabled} loading={loading}
    filterOptions={items => items} isOptionEqualToValue={(a, b) => a.id === b.id}
    getOptionLabel={option => `${option.code} — ${option.label}`}
    onInputChange={(_, input, reason) => { if (reason === 'input' || reason === 'clear') setSearch(input); }}
    onChange={(_, next) => onChange(next)}
    renderInput={params => <TextField {...params} required label={label} error={Boolean(error)} helperText={error ?? 'برای جست‌وجو کد یا نام را بنویسید.'} />}
  />;
}

const initialRow = (): Row => ({ option: null, qty: '1', cost: '' });
const costPattern = /^[1-9][0-9]{0,18}$/u;

export function PurchaseOrderFormDialog({ open, order, onClose, onSaved }: Props) {
  const [supplier, setSupplier] = useState<PurchaseOrderOption | null>(null);
  const [warehouse, setWarehouse] = useState<PurchaseOrderOption | null>(null);
  const [rows, setRows] = useState<Row[]>([initialRow()]);
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const commandKey = useRef(newPurchaseOrderCommandKey());
  useEffect(() => {
    if (!open) return;
    setSupplier(null); setWarehouse(null);
    setRows(order ? order.items.map(item => ({ option: { id: item.variantId, code: item.sku, label: item.sku }, qty: String(item.orderedQty), cost: item.unitCost })) : [initialRow()]);
    setExpectedAt(order?.expectedAt ? order.expectedAt.slice(0, 16) : '');
    setNotes(order?.notes ?? ''); setError(null); setUncertain(false);
    commandKey.current = newPurchaseOrderCommandKey();
  }, [open, order]);

  const total = rows.reduce((sum, row) => costPattern.test(row.cost) && /^[1-9][0-9]*$/u.test(row.qty)
    ? sum + BigInt(row.cost) * BigInt(row.qty) : sum, 0n);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || uncertain) return;
    if ((!order && (!supplier || !warehouse)) || rows.length < 1 || rows.length > 100 ||
      rows.some(row => !row.option || !/^[1-9][0-9]*$/u.test(row.qty) || Number(row.qty) > 1_000_000 || !costPattern.test(row.cost)) ||
      new Set(rows.map(row => row.option?.id)).size !== rows.length || total > 9_223_372_036_854_775_807n) {
      setError('تأمین‌کننده، انبار و حداقل یک SKU یکتا با تعداد ۱ تا ۱٬۰۰۰٬۰۰۰ و بهای صحیح ریالی معتبر لازم است.'); return;
    }
    setSubmitting(true); setError(null);
    const items = rows.map(row => ({ variantId: row.option!.id, orderedQty: Number(row.qty), unitCost: row.cost }));
    try {
      const result = order
        ? await updatePurchaseOrder(order.id, { expectedVersion: order.version, expectedAt: expectedAt ? new Date(expectedAt).toISOString() : null, notes: notes.trim() || null, items }, commandKey.current)
        : await createPurchaseOrder({ supplierId: supplier!.id, warehouseId: warehouse!.id, expectedAt: expectedAt ? new Date(expectedAt).toISOString() : null, notes: notes.trim() || null, items }, commandKey.current);
      onSaved(result);
    } catch (failure) {
      setError(purchaseOrderError(failure));
      if (failure instanceof ApiNetworkError) setUncertain(true);
    } finally { setSubmitting(false); }
  }

  return <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="po-form-title">
    <form onSubmit={event => void submit(event)}>
      <DialogTitle id="po-form-title">{order ? `ویرایش پیش‌نویس ${order.number}` : 'سفارش خرید جدید'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {order ? <Alert severity="info">تأمین‌کننده و انبار پس از ایجاد ثابت‌اند. تغییر خطوط فقط در پیش‌نویس مجاز است.</Alert> : <>
          <OptionPicker kind="supplier" label="تأمین‌کننده" value={supplier} onChange={setSupplier} />
          <OptionPicker kind="warehouse" label="انبار مقصد" value={warehouse} onChange={setWarehouse} />
        </>}
        <Typography variant="subtitle1" fontWeight={700}>اقلام سفارش</Typography>
        {rows.map((row, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
          <Stack flex={1} minWidth={180}><OptionPicker kind="variant" label={`SKU ردیف ${index + 1}`} value={row.option} onChange={value => setRows(current => current.map((entry, at) => at === index ? { ...entry, option: value } : entry))} /></Stack>
          <TextField label="تعداد" required type="number" inputProps={{ min: 1, max: 1000000, step: 1, dir: 'ltr' }} value={row.qty} onChange={event => setRows(current => current.map((entry, at) => at === index ? { ...entry, qty: event.target.value } : entry))} sx={{ width: { sm: 130 } }} />
          <TextField label="بهای واحد (ریال)" required inputProps={{ inputMode: 'numeric', dir: 'ltr' }} value={row.cost} onChange={event => setRows(current => current.map((entry, at) => at === index ? { ...entry, cost: event.target.value } : entry))} sx={{ width: { sm: 190 } }} />
          <IconButton aria-label={`حذف ردیف ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, at) => at !== index))}><Trash2 size={18} /></IconButton>
        </Stack>)}
        <Button startIcon={<Plus size={16} />} disabled={rows.length >= 100} onClick={() => setRows(current => [...current, initialRow()])} sx={{ alignSelf: 'flex-start' }}>افزودن قلم</Button>
        <Typography>جمع سفارش: {new Intl.NumberFormat('fa-IR').format(total)} ریال</Typography>
        <TextField label="زمان مورد انتظار" type="datetime-local" value={expectedAt} onChange={event => setExpectedAt(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="یادداشت" multiline minRows={2} inputProps={{ maxLength: 1000 }} value={notes} onChange={event => setNotes(event.target.value)} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose} disabled={submitting}>بستن</Button><Button type="submit" variant="contained" disabled={submitting || uncertain}>{submitting ? 'در حال ثبت…' : order ? 'ذخیره پیش‌نویس' : 'ایجاد پیش‌نویس'}</Button></DialogActions>
    </form>
  </Dialog>;
}
