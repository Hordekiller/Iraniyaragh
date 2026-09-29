'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import type { AdminCustomerSummary } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  createCustomer,
  newCustomerCommandKey,
  updateCustomer,
} from '@/lib/customers/customers-api';

type Props = {
  open: boolean;
  customer: AdminCustomerSummary | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Accepts the shapes operators actually paste: `09…`, `989…`, `+98…`, with
 * spaces or dashes. Canonicalisation is the API's job; this only rejects
 * values that cannot possibly be a mobile so the operator gets a fast answer.
 */
const MOBILE_PATTERN = /^(?:\+98|98|0)?9\d{9}$/u;

export function normalizeCustomerMobile(raw: string): string {
  return raw.replace(/[\s()-]/gu, '');
}

export function customerFormError(failure: unknown): string {
  if (failure instanceof ApiNetworkError) {
    return 'نتیجه نامشخص است. پیش از هر اقدام دیگر، فهرست مشتریان را نوسازی و بررسی کنید.';
  }
  if (failure instanceof ApiClientError) {
    if (failure.code === 'CUSTOMER_MOBILE_CONFLICT') {
      return 'مشتری دیگری با این موبایل ثبت شده است. همان رکورد را ویرایش کنید.';
    }
    if (failure.code === 'VERSION_CONFLICT') {
      return 'نسخهٔ رکورد مشتری تغییر کرده است. جزئیات را نوسازی و دوباره تلاش کنید.';
    }
    if (failure.code === 'NOT_FOUND') return 'مشتری یافت نشد.';
    if (failure.code === 'VALIDATION_ERROR') return 'مقادیر واردشده معتبر نیستند.';
    if (failure.code === 'IDEMPOTENCY_CONFLICT') {
      return 'این کلید تکرارپذیری با دستور دیگری استفاده شده است.';
    }
    if (failure.code === 'CONFLICT') return 'دستور در حال ثبت است. کمی بعد دوباره تلاش کنید.';
    if (failure.code === 'RETRYABLE_CONFLICT') {
      return 'هم‌زمانی رخ داد؛ با همان کلید تکرارپذیری دوباره تلاش کنید.';
    }
    return failure.message;
  }
  return 'ذخیرهٔ مشتری ناموفق بود.';
}

export function CustomerDialog({ open, customer, onClose, onSaved }: Props) {
  const [mobile, setMobile] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMobile(customer?.mobile ?? '');
    setFirstName(customer?.firstName ?? '');
    setLastName(customer?.lastName ?? '');
    setError(null);
  }, [open, customer]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const normalizedMobile = normalizeCustomerMobile(mobile);
    if (!MOBILE_PATTERN.test(normalizedMobile)) {
      setError('شمارهٔ موبایل باید با ۹ شروع شود و ۱۰ رقم داشته باشد؛ نمونه: ۰۹۱۲۱۲۳۴۵۶۷.');
      return;
    }
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (trimmedFirst.length > 100 || trimmedLast.length > 100) {
      setError('نام و نام خانوادگی هر کدام حداکثر ۱۰۰ نویسه هستند.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (customer) {
        await updateCustomer(
          customer.id,
          {
            expectedVersion: customer.version,
            firstName: trimmedFirst || null,
            lastName: trimmedLast || null,
          },
          newCustomerCommandKey('update'),
        );
      } else {
        await createCustomer(
          {
            mobile: normalizedMobile,
            firstName: trimmedFirst || null,
            lastName: trimmedLast || null,
          },
          newCustomerCommandKey('create'),
        );
      }
      onSaved();
      onClose();
    } catch (failure) {
      setError(customerFormError(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="customer-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="customer-dialog-title">
          {customer ? 'ویرایش مشتری' : 'مشتری جدید'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="موبایل"
              required
              value={mobile}
              disabled={Boolean(customer) || submitting}
              onChange={(event) => setMobile(event.target.value)}
              inputProps={{ maxLength: 20, dir: 'ltr' }}
              helperText={
                customer
                  ? 'شمارهٔ موبایل شناسهٔ یکتای مشتری است و پس از ثبت قابل تغییر نیست.'
                  : 'قالب‌های ۰۹۱۲…، ۹۸۹۱۲… و ‎+۹۸۹۱۲… پذیرفته می‌شوند.'
              }
            />
            <TextField
              label="نام"
              value={firstName}
              disabled={submitting}
              onChange={(event) => setFirstName(event.target.value)}
              inputProps={{ maxLength: 100 }}
            />
            <TextField
              label="نام خانوادگی"
              value={lastName}
              disabled={submitting}
              onChange={(event) => setLastName(event.target.value)}
              inputProps={{ maxLength: 100 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
