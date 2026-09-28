'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import type { Supplier } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { createSupplier, newSupplierCommandKey, updateSupplier } from '@/lib/suppliers/suppliers-api';

type Props = { open: boolean; supplier: Supplier | null; onClose: () => void; onSaved: () => void };

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/u;

export function supplierErrorMessage(failure: unknown): string {
  if (failure instanceof ApiNetworkError) {
    return 'نتیجه نامشخص است. پیش از هر اقدام دیگر، فهرست تأمین‌کنندگان را نوسازی و بررسی کنید.';
  }
  if (failure instanceof ApiClientError) {
    if (failure.code === 'SUPPLIER_CODE_CONFLICT') return 'این کد تأمین‌کننده قبلاً ثبت شده است.';
    if (failure.code === 'VERSION_CONFLICT') return 'نسخهٔ تأمین‌کننده تغییر کرده است. جزئیات را نوسازی کنید.';
    if (failure.code === 'NOT_FOUND') return 'تأمین‌کننده یافت نشد. ممکن است حذف شده باشد.';
    if (failure.code === 'VALIDATION_ERROR') return 'حداقل یک فیلد باید تغییر کند.';
    if (failure.code === 'IDEMPOTENCY_CONFLICT') return 'این کلید تکرارپذیری با دستور دیگری استفاده شده است.';
    if (failure.code === 'CONFLICT') return 'دستور در حال ثبت است. کمی بعد دوباره تلاش کنید.';
    if (failure.code === 'RETRYABLE_CONFLICT') return 'هم‌زمانی رخ داد؛ با همان کلید تکرارپذیری دوباره تلاش کنید.';
    return failure.message;
  }
  return 'ذخیرهٔ تأمین‌کننده ناموفق بود.';
}

export function SupplierDialog({ open, supplier, onClose, onSaved }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(supplier?.code ?? '');
    setName(supplier?.name ?? '');
    setMobile(supplier?.mobile ?? '');
    setPhone(supplier?.phone ?? '');
    setEmail(supplier?.email ?? '');
    setNationalId(supplier?.nationalId ?? '');
    setEconomicCode(supplier?.economicCode ?? '');
    setActive(supplier?.isActive ?? true);
    setError(null);
  }, [open, supplier]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    if (!supplier && !CODE_PATTERN.test(normalizedCode)) {
      setError('کد تأمین‌کننده باید ۲ تا ۶۴ نویسهٔ انگلیسی بزرگ، عدد، خط تیره یا زیرخط باشد و با حرف انگلیسی بزرگ یا عدد شروع شود.');
      return;
    }
    if (!normalizedName || normalizedName.length > 200) {
      setError('نام تأمین‌کننده الزامی است و حداکثر ۲۰۰ نویسه است.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) {
      setError('قالب ایمیل معتبر نیست.');
      return;
    }
    if (mobile.length > 32 || phone.length > 32 || nationalId.length > 32 || economicCode.length > 32) {
      setError('شمارهٔ موبایل، تلفن، شناسهٔ ملی و کد اقتصادی حداکثر ۳۲ نویسه هستند.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (supplier) {
        await updateSupplier(
          supplier.id,
          {
            expectedVersion: supplier.version,
            name: normalizedName,
            mobile: mobile.trim(),
            phone: phone.trim(),
            email: email.trim(),
            nationalId: nationalId.trim(),
            economicCode: economicCode.trim(),
            isActive: active,
          },
          newSupplierCommandKey('update'),
        );
      } else {
        await createSupplier(
          {
            code: normalizedCode,
            name: normalizedName,
            mobile: mobile.trim(),
            phone: phone.trim(),
            email: email.trim(),
            nationalId: nationalId.trim(),
            economicCode: economicCode.trim(),
          },
          newSupplierCommandKey('create'),
        );
      }
      onSaved();
      onClose();
    } catch (failure) {
      setError(supplierErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="supplier-dialog-title">
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="supplier-dialog-title">{supplier ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده جدید'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="کد تأمین‌کننده" required
              inputProps={{ maxLength: 64, dir: 'ltr' }}
              value={code} disabled={Boolean(supplier) || submitting}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              helperText={supplier ? 'کد تأمین‌کننده پس از ثبت قابل تغییر نیست.' : 'فقط حروف انگلیسی بزرگ، عدد، خط تیره و زیرخط.'}
            />
            <TextField label="نام تأمین‌کننده" required inputProps={{ maxLength: 200 }} value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} />
            <TextField label="موبایل" inputProps={{ maxLength: 32, dir: 'ltr' }} value={mobile} disabled={submitting} onChange={(event) => setMobile(event.target.value)} />
            <TextField label="تلفن" inputProps={{ maxLength: 32, dir: 'ltr' }} value={phone} disabled={submitting} onChange={(event) => setPhone(event.target.value)} />
            <TextField label="ایمیل" type="email" inputProps={{ maxLength: 254, dir: 'ltr' }} value={email} disabled={submitting} onChange={(event) => setEmail(event.target.value)} />
            <TextField label="شناسهٔ ملی" inputProps={{ maxLength: 32, dir: 'ltr' }} value={nationalId} disabled={submitting} onChange={(event) => setNationalId(event.target.value)} />
            <TextField label="کد اقتصادی" inputProps={{ maxLength: 32, dir: 'ltr' }} value={economicCode} disabled={submitting} onChange={(event) => setEconomicCode(event.target.value)} />
            {supplier ? (
              <FormControlLabel
                control={<Switch checked={active} onChange={(_, checked) => setActive(checked)} disabled={submitting} />}
                label="تأمین‌کننده فعال است"
              />
            ) : null}
            {supplier && !active ? (
              <Alert severity="warning">غیرفعال‌سازی تأمین‌کننده، آن را از سفارش‌های خرید جدید خارج می‌کند و سابقهٔ آن حفظ می‌شود.</Alert>
            ) : null}
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
