'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { createManualReservation } from '@/lib/inventory/reservations-api';

export type ReservationIdentity = { warehouseId: string; locationId: string; variantId: string; version: number };
type Props = { initial?: Partial<ReservationIdentity>; onClose: () => void; onSaved: () => void };

export function ReservationCreateDialog({ initial, onClose, onSaved }: Props) {
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? '');
  const [locationId, setLocationId] = useState(initial?.locationId ?? '');
  const [variantId, setVariantId] = useState(initial?.variantId ?? '');
  const [version, setVersion] = useState(String(initial?.version ?? 0));
  const [quantity, setQuantity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [key] = useState(() => `inventory-reserve-${randomUuid()}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const amount = Number(quantity);
    const expectedVersion = Number(version);
    const expiry = new Date(expiresAt);
    if (!warehouseId.trim() || !locationId.trim() || !variantId.trim() || !/^\d+$/u.test(quantity) || !Number.isSafeInteger(amount) || amount < 1 || amount > 2_147_483_647 || !/^\d+$/u.test(version) || !Number.isSafeInteger(expectedVersion) || expectedVersion > 2_147_483_647 || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      setError('شناسه‌ها، تعداد، نسخه و زمان انقضای آینده را به‌صورت معتبر وارد کنید.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createManualReservation({
        warehouseId: warehouseId.trim(), locationId: locationId.trim(), variantId: variantId.trim(),
        quantity: amount, expectedVersion, expiresAt: expiry.toISOString(),
      }, key);
      onSaved();
      onClose();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.code === 'INVENTORY_VERSION_CONFLICT') {
        setError('نسخهٔ مانده تغییر کرده است. مانده را نوسازی و دوباره بررسی کنید.');
      } else if (failure instanceof ApiClientError && failure.code === 'INSUFFICIENT_STOCK') {
        setError('موجودی قابل فروش برای این رزرو کافی نیست.');
      } else if (failure instanceof ApiNetworkError) {
        setError('نتیجهٔ ثبت نامشخص است. قبل از تکرار، فهرست رزروها را بررسی کنید؛ کلید این فرم ثابت می‌ماند.');
      } else {
        setError(failure instanceof ApiClientError ? failure.message : 'ثبت رزرو ناموفق بود.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="reservation-create-title">
    <form onSubmit={(event) => void submit(event)} noValidate>
      <DialogTitle id="reservation-create-title">رزرو دستی موجودی</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">این فرم فقط رزرو مستقل از سفارش می‌سازد. رزرو سفارش از Checkout و Fulfillment مدیریت می‌شود.</Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="شناسه انبار" required value={warehouseId} disabled={submitting} onChange={(event) => setWarehouseId(event.target.value)} inputProps={{ dir: 'ltr' }} />
          <TextField label="شناسه مکان" required value={locationId} disabled={submitting} onChange={(event) => setLocationId(event.target.value)} inputProps={{ dir: 'ltr' }} />
          <TextField label="شناسه SKU" required value={variantId} disabled={submitting} onChange={(event) => setVariantId(event.target.value)} inputProps={{ dir: 'ltr' }} />
          <TextField label="تعداد" required value={quantity} disabled={submitting} onChange={(event) => setQuantity(event.target.value)} inputProps={{ inputMode: 'numeric', dir: 'ltr' }} />
          <TextField label="نسخهٔ مانده" required value={version} disabled={submitting} onChange={(event) => setVersion(event.target.value)} inputProps={{ inputMode: 'numeric', dir: 'ltr' }} helperText="نسخهٔ ردیف مانده را وارد کنید؛ پس از تغییر هم‌زمان باید نوسازی شود." />
          <TextField label="انقضا" type="datetime-local" required value={expiresAt} disabled={submitting} onChange={(event) => setExpiresAt(event.target.value)} InputLabelProps={{ shrink: true }} helperText="زمان محلی آینده؛ پس از انقضا رزرو قابل مصرف دستی نیست." />
          <Typography variant="caption" color="text.secondary">در پاسخ نامشخص شبکه، پیش از هر تکرار وضعیت رزرو را بررسی کنید.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} disabled={submitting}>انصراف</Button>
        <Button type="submit" variant="contained" disabled={submitting}>{submitting ? 'در حال ثبت…' : 'ثبت رزرو'}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
