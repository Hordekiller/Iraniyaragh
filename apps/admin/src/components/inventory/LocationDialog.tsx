'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import type { WarehouseLocation } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createLocation, updateLocation } from '@/lib/inventory/warehouses-api';

type Props = { open: boolean; warehouseId: string; location: WarehouseLocation | null; onClose: () => void; onSaved: () => void };
type Field = 'name' | 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin';
const FIELD_LABELS: Record<Field, string> = { name: 'نام', zone: 'زون', aisle: 'راهرو', rack: 'قفسه', shelf: 'طبقه', bin: 'خانه' };
const FIELDS: Field[] = ['name', 'zone', 'aisle', 'rack', 'shelf', 'bin'];

export function LocationDialog({ open, warehouseId, location, onClose, onSaved }: Props) {
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<Record<Field, string>>({ name: '', zone: '', aisle: '', rack: '', shelf: '', bin: '' });
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(location?.code ?? '');
    setFields(Object.fromEntries(FIELDS.map((field) => [field, location?.[field] ?? ''])) as Record<Field, string>);
    setActive(location?.isActive ?? true);
    setError(null);
  }, [open, location]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const normalizedCode = code.trim();
    if ((!location && (!normalizedCode || normalizedCode.length > 64)) || fields.name.length > 200 || FIELDS.slice(1).some((field) => fields[field].length > 64)) {
      setError('کد یا مشخصات مکان معتبر نیست. طول مجاز فیلدها را بررسی کنید.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const details = Object.fromEntries(FIELDS.map((field) => [field, fields[field].trim()])) as Record<Field, string>;
      if (location) await updateLocation(location.id, { ...details, isActive: active });
      else await createLocation(warehouseId, { code: normalizedCode, ...details });
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : 'نتیجهٔ ذخیره نامشخص است. پیش از تلاش دوباره فهرست را بررسی کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="location-dialog-title">
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="location-dialog-title">{location ? 'ویرایش مکان انبار' : 'مکان جدید'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="کد مکان در انبار" required inputProps={{ maxLength: 64, dir: 'ltr' }} value={code} disabled={Boolean(location) || submitting} onChange={(event) => setCode(event.target.value)} />
            {FIELDS.map((field) => <TextField key={field} label={FIELD_LABELS[field]} inputProps={{ maxLength: field === 'name' ? 200 : 64 }} value={fields[field]} disabled={submitting} onChange={(event) => setFields((current) => ({ ...current, [field]: event.target.value }))} />)}
            {location ? <FormControlLabel control={<Switch checked={active} onChange={(_, checked) => setActive(checked)} disabled={submitting} />} label="مکان فعال است" /> : null}
            {location && !active ? <Alert severity="warning">مکان غیرفعال برای تخصیص جدید موجودی استفاده نمی‌شود؛ ابتدا رزرو و موجودی آن را بررسی کنید.</Alert> : null}
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
