'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import type { Warehouse } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createWarehouse, updateWarehouse } from '@/lib/inventory/warehouses-api';

type Props = { open: boolean; warehouse: Warehouse | null; onClose: () => void; onSaved: () => void };

export function WarehouseDialog({ open, warehouse, onClose, onSaved }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(warehouse?.code ?? '');
    setName(warehouse?.name ?? '');
    setCity(warehouse?.city ?? '');
    setAddress(warehouse?.address ?? '');
    setActive(warehouse?.isActive ?? true);
    setError(null);
  }, [open, warehouse]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const normalizedCode = code.trim();
    const normalizedName = name.trim();
    if ((!warehouse && (!normalizedCode || normalizedCode.length > 64)) || !normalizedName || normalizedName.length > 200 || city.length > 100 || address.length > 400) {
      setError('کد، نام، شهر یا نشانی معتبر نیست. طول مجاز فیلدها را بررسی کنید.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (warehouse) {
        await updateWarehouse(warehouse.id, { name: normalizedName, city: city.trim(), address: address.trim(), isActive: active });
      } else {
        await createWarehouse({ code: normalizedCode, name: normalizedName, city: city.trim(), address: address.trim() });
      }
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : 'نتیجهٔ ذخیره نامشخص است. پیش از تلاش دوباره فهرست را بررسی کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="warehouse-dialog-title">
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="warehouse-dialog-title">{warehouse ? 'ویرایش انبار' : 'انبار جدید'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="کد یکتا" required inputProps={{ maxLength: 64, dir: 'ltr' }} value={code} disabled={Boolean(warehouse) || submitting} onChange={(event) => setCode(event.target.value)} />
            <TextField label="نام انبار" required inputProps={{ maxLength: 200 }} value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} />
            <TextField label="شهر" inputProps={{ maxLength: 100 }} value={city} disabled={submitting} onChange={(event) => setCity(event.target.value)} />
            <TextField label="نشانی" multiline minRows={2} inputProps={{ maxLength: 400 }} value={address} disabled={submitting} onChange={(event) => setAddress(event.target.value)} />
            {warehouse ? <FormControlLabel control={<Switch checked={active} onChange={(_, checked) => setActive(checked)} disabled={submitting} />} label="انبار فعال است" /> : null}
            {warehouse && !active ? <Alert severity="warning">غیرفعال‌سازی انبار، آن را از تخصیص‌های جدید فروش خارج می‌کند. موجودی و رزروهای باز را پیش از ذخیره بررسی کنید.</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>انصراف</Button>
          <Button type="submit" variant="contained" disabled={submitting}>{submitting ? 'در حال ذخیره…' : 'ذخیره'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
