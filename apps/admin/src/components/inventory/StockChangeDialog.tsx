'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { InventoryBalanceSnapshot, InventoryChangeType } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { changeStock } from '@/lib/inventory/ledger-api';

type StockIdentity = Pick<InventoryBalanceSnapshot, 'warehouseId' | 'locationId' | 'variantId' | 'version'>;
type Props = { initial?: Partial<StockIdentity>; onClose: () => void; onSaved: () => void };

export function StockChangeDialog({ initial, onClose, onSaved }: Props) {
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? '');
  const [locationId, setLocationId] = useState(initial?.locationId ?? '');
  const [variantId, setVariantId] = useState(initial?.variantId ?? '');
  const [version, setVersion] = useState(String(initial?.version ?? 0));
  const [type, setType] = useState<InventoryChangeType>('RECEIPT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [key] = useState(() => `inventory-change-${randomUuid()}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const amount = Number(quantity);
    const expectedVersion = Number(version);
    if (!warehouseId.trim() || !locationId.trim() || !variantId.trim() || !/^\d+$/u.test(quantity) || !Number.isSafeInteger(amount) || amount < 1 || amount > 2_147_483_647 || !/^\d+$/u.test(version) || !Number.isSafeInteger(expectedVersion) || expectedVersion > 2_147_483_647 || reason.length > 500) {
      setError('شناسه‌ها، تعداد مثبت و نسخهٔ مانده را به‌صورت معتبر وارد کنید.');
      return;
    }
    if (type !== 'RECEIPT' && !reason.trim()) {
      setError('برای تعدیل دستی، دلیل الزامی است.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await changeStock({
        warehouseId: warehouseId.trim(), locationId: locationId.trim(), variantId: variantId.trim(),
        type, delta: type === 'ADJUSTMENT_OUT' ? -amount : amount,
        expectedVersion, ...(reason.trim() ? { reason: reason.trim() } : {}),
      }, key);
      onSaved();
      onClose();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.code === 'INVENTORY_VERSION_CONFLICT') {
        setError('نسخهٔ مانده تغییر کرده است. فهرست را نوسازی و مقدار جدید را بررسی کنید.');
      } else if (failure instanceof ApiClientError && failure.code === 'INSUFFICIENT_STOCK') {
        setError('موجودی آزاد برای این برداشت کافی نیست.');
      } else if (failure instanceof ApiNetworkError) {
        setError('نتیجهٔ ثبت نامشخص است. پیش از هر اقدام دوباره، مانده و گردش را بررسی کنید؛ همین فرم کلید درخواست را حفظ می‌کند.');
      } else {
        setError(failure instanceof ApiClientError ? failure.message : 'ثبت تغییر موجودی ناموفق بود. نتیجه را در گردش موجودی بررسی کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="stock-change-title">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="stock-change-title">ثبت رسید یا تعدیل موجودی</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">این فرمان فقط از مسیر دفترکل ثبت می‌شود. شناسهٔ SKU، انبار و مکان را از صفحه‌های مربوط بررسی کنید؛ مقدار فعلی مستقیماً قابل ویرایش نیست.</Alert>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="شناسه انبار" required value={warehouseId} disabled={submitting} onChange={(event) => setWarehouseId(event.target.value)} inputProps={{ dir: 'ltr' }} />
            <TextField label="شناسه مکان" required value={locationId} disabled={submitting} onChange={(event) => setLocationId(event.target.value)} inputProps={{ dir: 'ltr' }} />
            <TextField label="شناسه SKU" required value={variantId} disabled={submitting} onChange={(event) => setVariantId(event.target.value)} inputProps={{ dir: 'ltr' }} />
            <TextField select label="نوع تغییر" value={type} disabled={submitting} onChange={(event) => setType(event.target.value as InventoryChangeType)}>
              <MenuItem value="RECEIPT">رسید کالا (+)</MenuItem>
              <MenuItem value="ADJUSTMENT_IN">تعدیل افزایشی (+)</MenuItem>
              <MenuItem value="ADJUSTMENT_OUT">تعدیل کاهشی (−)</MenuItem>
            </TextField>
            <TextField label="تعداد" required value={quantity} disabled={submitting} onChange={(event) => setQuantity(event.target.value)} inputProps={{ inputMode: 'numeric', dir: 'ltr' }} helperText="عدد صحیح مثبت؛ جهت تغییر از نوع عملیات تعیین می‌شود." />
            <TextField label="نسخهٔ مانده" required value={version} disabled={submitting} onChange={(event) => setVersion(event.target.value)} inputProps={{ inputMode: 'numeric', dir: 'ltr' }} helperText="برای ماندهٔ جدید ۰؛ برای ماندهٔ موجود از نسخهٔ ردیف استفاده کنید." />
            <TextField label="دلیل" required={type !== 'RECEIPT'} multiline minRows={2} value={reason} disabled={submitting} onChange={(event) => setReason(event.target.value)} inputProps={{ maxLength: 500 }} />
            <Typography variant="caption" color="text.secondary">اگر پاسخ شبکه نامشخص بود، عملیات را بدون بررسی گردش تکرار نکنید.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>انصراف</Button>
          <Button type="submit" variant="contained" disabled={submitting}>{submitting ? 'در حال ثبت…' : 'ثبت تغییر'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
