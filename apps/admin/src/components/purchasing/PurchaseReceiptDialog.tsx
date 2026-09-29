'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { PurchaseOrder, PurchaseReceipt, PurchaseReceiptLocationOption } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { listPurchaseReceiptLocations, newPurchaseReceiptCommandKey, receivePurchaseOrder } from '@/lib/purchasing/purchase-orders-api';

type Row = { variantId: string; location: PurchaseReceiptLocationOption | null; quantity: string };
type Props = { open: boolean; order: PurchaseOrder | null; onClose: () => void; onSaved: (receipt: PurchaseReceipt) => void };
const newRow = (order: PurchaseOrder | null): Row => ({
  variantId: order?.items.find(item => item.receivedQty < item.orderedQty)?.variantId ?? '', location: null, quantity: '',
});

export function purchaseReceiptError(failure: unknown): string {
  if (failure instanceof ApiNetworkError) return 'نتیجهٔ ثبت نامشخص است. رسیدها و تعداد دریافت‌شده را نوسازی و بررسی کنید؛ ارسال کورکورانهٔ دوباره مجاز نیست.';
  if (failure instanceof ApiClientError) {
    const known: Record<string, string> = {
      VERSION_CONFLICT: 'سفارش هم‌زمان تغییر کرده است. جزئیات را نوسازی کنید.',
      PURCHASE_ORDER_STATE_CONFLICT: 'این سفارش دیگر آمادهٔ دریافت نیست.',
      RECEIPT_QUANTITY_CONFLICT: 'تعداد دریافتی از باقیماندهٔ سفارش بیشتر است.',
      DELIVERY_REFERENCE_CONFLICT: 'این شمارهٔ حواله قبلاً برای همین سفارش ثبت شده است.',
      LOCATION_INACTIVE: 'مکان انتخاب‌شده فعال یا متعلق به انبار این سفارش نیست.',
      WAREHOUSE_INACTIVE: 'انبار مقصد غیرفعال شده است.',
      INVENTORY_OVERFLOW: 'تعداد از محدودهٔ مجاز موجودی بیشتر است.',
      IDEMPOTENCY_CONFLICT: 'کلید درخواست با دادهٔ متفاوت تکرار شده است. جزئیات را بررسی کنید.',
      RETRYABLE_CONFLICT: 'هم‌زمانی رخ داده است. وضعیت سفارش و رسیدها را بررسی کنید.',
    };
    return known[failure.code] ?? failure.message;
  }
  return 'ثبت رسید خرید ناموفق بود.';
}

export function PurchaseReceiptDialog({ open, order, onClose, onSaved }: Props) {
  const [reference, setReference] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow(null)]);
  const [locations, setLocations] = useState<PurchaseReceiptLocationOption[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const commandKey = useRef(newPurchaseReceiptCommandKey());

  useEffect(() => {
    if (!open) return;
    setReference(''); setRows([newRow(order)]); setLocationSearch(''); setError(null); setUncertain(false);
    commandKey.current = newPurchaseReceiptCommandKey();
  }, [open, order]);

  useEffect(() => {
    if (!open || !order) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocationsLoading(true);
      listPurchaseReceiptLocations(order.id, locationSearch, controller.signal)
        .then(result => { setLocations(result.items); setLocationsError(null); })
        .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError)) setLocationsError('دریافت مکان‌های فعال ناموفق بود.'); })
        .finally(() => { if (!controller.signal.aborted) setLocationsLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, order, locationSearch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!order || submitting || uncertain) return;
    const externalReference = reference.trim();
    const remaining = new Map(order.items.map(item => [item.variantId, item.orderedQty - item.receivedQty]));
    const received = new Map<string, number>();
    const pairs = new Set<string>();
    let invalid = externalReference.length < 1 || externalReference.length > 120 || rows.length < 1 || rows.length > 100;
    for (const row of rows) {
      const quantity = Number(row.quantity);
      const pair = `${row.variantId}\u0000${row.location?.id ?? ''}`;
      if (!row.location || !remaining.has(row.variantId) || !/^[1-9][0-9]*$/u.test(row.quantity) ||
        !Number.isSafeInteger(quantity) || quantity > 1_000_000 || pairs.has(pair)) invalid = true;
      pairs.add(pair);
      received.set(row.variantId, (received.get(row.variantId) ?? 0) + quantity);
    }
    if ([...received].some(([variantId, quantity]) => !Number.isSafeInteger(quantity) || quantity > (remaining.get(variantId) ?? 0))) invalid = true;
    if (invalid) {
      setError('شمارهٔ حواله و ردیف‌های یکتای SKU/مکان لازم‌اند؛ تعداد هر ردیف باید صحیح و از باقیماندهٔ سفارش بیشتر نباشد.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const receipt = await receivePurchaseOrder(order.id, { expectedVersion: order.version, externalReference,
        lines: rows.map(row => ({ variantId: row.variantId, locationId: row.location!.id, quantity: Number(row.quantity) })) }, commandKey.current);
      onSaved(receipt);
    } catch (failure) {
      setError(purchaseReceiptError(failure));
      if (failure instanceof ApiNetworkError) setUncertain(true);
      else commandKey.current = newPurchaseReceiptCommandKey();
    } finally { setSubmitting(false); }
  }

  const availableItems = order?.items.filter(item => item.receivedQty < item.orderedQty) ?? [];
  return <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="po-receipt-title">
    <form onSubmit={event => void submit(event)}>
      <DialogTitle id="po-receipt-title">ثبت دریافت کالا برای {order?.number}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
        <Alert severity="info">رسید ثبت‌شده موجودی فیزیکی را افزایش می‌دهد. شمارهٔ حواله و تعداد واقعی تحویل را با کالا تطبیق دهید.</Alert>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {uncertain ? <Alert severity="warning">نتیجه نامشخص است؛ فرم را ببندید و رسیدها/سفارش را نوسازی کنید.</Alert> : null}
        <TextField label="شمارهٔ حوالهٔ تأمین‌کننده" required value={reference} inputProps={{ maxLength: 120, dir: 'ltr' }}
          onChange={event => setReference(event.target.value)} disabled={submitting || uncertain} />
        <Typography variant="subtitle1" fontWeight={700}>اقلام دریافتی</Typography>
        {rows.map((row, index) => <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'flex-start' }}>
          <TextField select required label={`SKU ردیف ${index + 1}`} value={row.variantId} disabled={submitting || uncertain} sx={{ flex: 1, minWidth: 180 }}
            onChange={event => setRows(current => current.map((entry, at) => at === index ? { ...entry, variantId: event.target.value } : entry))}>
            {availableItems.map(item => <MenuItem key={item.variantId} value={item.variantId}>{item.sku} — باقیمانده {item.orderedQty - item.receivedQty}</MenuItem>)}
          </TextField>
          <Autocomplete<PurchaseReceiptLocationOption> options={row.location && !locations.some(item => item.id === row.location?.id) ? [row.location, ...locations] : locations}
            value={row.location} disabled={submitting || uncertain} loading={locationsLoading} filterOptions={items => items}
            isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={item => `${item.code} — ${item.label}`}
            onInputChange={(_, value, reason) => { if (reason === 'input' || reason === 'clear') setLocationSearch(value); }}
            onChange={(_, value) => setRows(current => current.map((entry, at) => at === index ? { ...entry, location: value } : entry))}
            sx={{ flex: 1, minWidth: 180 }} renderInput={params => <TextField {...params} required label={`مکان انبار ردیف ${index + 1}`}
              error={Boolean(locationsError)} helperText={locationsError ?? 'مکان فعال در انبار همین سفارش'} />} />
          <TextField label="تعداد واقعی" required type="number" inputProps={{ min: 1, max: 1000000, step: 1, dir: 'ltr' }} value={row.quantity}
            disabled={submitting || uncertain} onChange={event => setRows(current => current.map((entry, at) => at === index ? { ...entry, quantity: event.target.value } : entry))}
            sx={{ width: { md: 145 } }} />
          <IconButton aria-label={`حذف ردیف ${index + 1}`} disabled={rows.length === 1 || submitting || uncertain}
            onClick={() => setRows(current => current.filter((_, at) => at !== index))}><Trash2 size={18} /></IconButton>
        </Stack>)}
        <Button startIcon={<Plus size={16} />} disabled={rows.length >= 100 || submitting || uncertain} onClick={() => setRows(current => [...current, newRow(order)])}
          sx={{ alignSelf: 'flex-start' }}>افزودن ردیف</Button>
      </Stack></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={submitting}>{uncertain ? 'بستن و بازبینی' : 'انصراف'}</Button>
        <Button type="submit" variant="contained" disabled={submitting || uncertain || availableItems.length === 0}>{submitting ? 'در حال ثبت…' : 'ثبت رسید و افزایش موجودی'}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
