'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Plus, Trash2, X } from 'lucide-react';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { createStaffOrder } from '@/lib/orders/orders-api';
import type { StaffOrderOption } from '@iranyaragh/contracts';
import { StaffOrderOptionPicker } from './StaffOrderOptionPicker';

export type StaffOrderLineDraft = {
  key: string;
  variant: StaffOrderOption | null;
  quantity: string;
};

const PROVINCES = [
  { value: '', label: 'انتخاب استان' },
  { value: 'THR', label: 'تهران' },
  { value: 'ADL', label: 'اردبیل' },
  { value: 'EAZ', label: 'آذربایجان شرقی' },
  { value: 'WAZ', label: 'آذربایجان غربی' },
  { value: 'BHR', label: 'بوشهر' },
  { value: 'CHB', label: 'چهارمحال و بختیاری' },
  { value: 'FRS', label: 'فارس' },
  { value: 'GIL', label: 'گیلان' },
  { value: 'HDN', label: 'همدان' },
  { value: 'HRZ', label: 'هرمزگان' },
  { value: 'ILM', label: 'ایلام' },
  { value: 'ESF', label: 'اصفهان' },
  { value: 'KRB', label: 'کرمانشاه' },
  { value: 'KRN', label: 'کرمان' },
  { value: 'KRD', label: 'کردستان' },
  { value: 'KBD', label: 'کهگیلویه و بویراحمد' },
  { value: 'MKZ', label: 'مرکزی' },
  { value: 'MZN', label: 'مازندران' },
  { value: 'QOM', label: 'قم' },
  { value: 'QZV', label: 'قزوین' },
  { value: 'RKH', label: 'رومان' },
  { value: 'SMN', label: 'سمنان' },
  { value: 'SBN', label: 'سیستان و بلوچستان' },
  { value: 'SKH', label: 'سیستان' },
  { value: 'ABZ', label: 'البرز' },
  { value: 'YAZ', label: 'یزد' },
];

function newLine(): StaffOrderLineDraft {
  return { key: Math.random().toString(36).slice(2), variant: null, quantity: '1' };
}

/** A UUID keeps the retry key stable per attempt and unique per order. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `staff-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type StaffOrderDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (orderId: string) => void;
  /** Called before an uncertain submission may be retried. */
  onRefreshed: () => void | Promise<void>;
};

export function StaffOrderDialog({
  open,
  onClose,
  onCreated,
  onRefreshed,
}: StaffOrderDialogProps) {
  const [customer, setCustomer] = useState<StaffOrderOption | null>(null);
  const [lines, setLines] = useState<StaffOrderLineDraft[]>([newLine()]);
  const [note, setNote] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [city, setCity] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [recipient, setRecipient] = useState('');
  const [mobile, setMobile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The request may have reached the server even when the response never came
   * back. Blind retrying would risk a second order, so we freeze the key and
   * force the operator to refresh the order list before resubmitting.
   */
  const [uncertain, setUncertain] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const quantityValid = useMemo(
    () =>
      lines.every((line) => {
        const parsed = Number.parseInt(line.quantity, 10);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000;
      }),
    [lines],
  );

  const linesValid = lines.length > 0 && lines.every((line) => line.variant) && quantityValid;

  const addressValid =
    provinceCode !== '' &&
    city.trim() !== '' &&
    addressLine.trim() !== '' &&
    postalCode.trim() !== '' &&
    recipient.trim() !== '' &&
    mobile.trim() !== '';

  const canSubmit = Boolean(customer) && linesValid && addressValid && !submitting && !uncertain;

  function reset() {
    setCustomer(null);
    setLines([newLine()]);
    setNote('');
    setProvinceCode('');
    setCity('');
    setAddressLine('');
    setPostalCode('');
    setRecipient('');
    setMobile('');
    setError(null);
    setUncertain(false);
    setIdempotencyKey(newIdempotencyKey());
  }

  /**
   * Unblocking a retry is only honest after the operator has actually looked at
   * the current order list, so this awaits the caller's refresh before the
   * submit button comes back.
   */
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshed();
      setUncertain(false);
    } finally {
      setRefreshing(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function updateLine(key: string, patch: Partial<StaffOrderLineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createStaffOrder(
        {
          customerId: customer!.id,
          lines: lines.map((line) => ({
            variantId: line.variant!.id,
            quantity: Number.parseInt(line.quantity, 10),
          })),
          address: {
            provinceCode,
            city: city.trim(),
            address: addressLine.trim(),
            postalCode: postalCode.trim(),
            recipient: recipient.trim(),
            mobile: mobile.trim(),
          },
          ...(note.trim() !== '' ? { note: note.trim() } : {}),
        },
        idempotencyKey,
      );
      onCreated(result.order.id);
      reset();
      onClose();
    } catch (cause) {
      if (cause instanceof ApiNetworkError) {
        // The outcome is unknown: the order may exist on the server.
        setUncertain(true);
        setError(
          'نتیجهٔ درخواست نامشخص است. ابتدا فهرست سفارش‌ها را تازه کنید؛ اگر سفارش ثبت نشده بود، با همان کلید دوباره ارسال کنید.',
        );
      } else if (cause instanceof ApiClientError) {
        setError(cause.message);
      } else {
        setError('ثبت سفارش ناموفق بود.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">ثبت سفارش حضوری</Typography>
          <IconButton aria-label="بستن" onClick={handleClose} disabled={submitting}>
            <X size={20} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {uncertain ? (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? 'در حال تازه‌سازی…' : 'تازه‌سازی فهرست'}
                </Button>
              }
            >
              نتیجهٔ درخواست قبلی نامشخص است و سفارش ممکن است در سرور ثبت شده باشد. تا فهرست سفارش‌ها را
              تازه نکنید، ارسال دوباره مسدود است. تازه‌سازی با همان کلید تکرار‌پذیر است و سفارش تکراری
              نمی‌سازد.
            </Alert>
          ) : null}

          <StaffOrderOptionPicker
            kind="customer"
            label="مشتری"
            required
            value={customer}
            onChange={setCustomer}
            disabled={submitting}
            helperText="سفارش بدون مشتری ثبت نمی‌شود؛ ابتدا مشتری را در بخش مشتریان بسازید."
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              اقلام سفارش
            </Typography>
            <Stack spacing={1.5}>
              {lines.map((line) => (
                <Stack key={line.key} direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <StaffOrderOptionPicker
                      kind="variant"
                      label="تنوع کالا"
                      required
                      size="small"
                      value={line.variant}
                      onChange={(variant) => updateLine(line.key, { variant })}
                      disabled={submitting}
                    />
                  </Box>
                  <TextField
                    label="تعداد"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    required
                    size="small"
                    sx={{ width: 110 }}
                    error={!quantityValid}
                  />
                  <IconButton
                    aria-label="حذف قلم"
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    disabled={lines.length === 1 || submitting}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
            <Button
              startIcon={<Plus size={18} />}
              onClick={() => setLines((current) => [...current, newLine()])}
              disabled={lines.length >= 50 || submitting}
              sx={{ mt: 1 }}
            >
              افزودن قلم
            </Button>
            <Typography variant="caption" display="block" color="text.secondary">
              مبلغ هر قلم در سرور و از قیمت فروش کاتالوگ محاسبه می‌شود؛ ثبت تخفیف یا مبلغ از سمت ادمین ممکن نیست.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              نشانی تحویل
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                select
                label="استان"
                value={provinceCode}
                onChange={(event) => setProvinceCode(event.target.value)}
                required
                fullWidth
              >
                {PROVINCES.map((province) => (
                  <MenuItem key={province.value || 'empty'} value={province.value}>
                    {province.label}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="شهر"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="کد پستی"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  required
                  fullWidth
                />
              </Stack>
              <TextField
                label="نشانی"
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
                required
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="نام گیرنده"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="موبایل"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  required
                  fullWidth
                  type="tel"
                />
              </Stack>
            </Stack>
          </Box>

          <TextField
            label="یادداشت کارمند"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText="اختیاری، حداکثر ۵۰۰ کاراکتر."
          />

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? 'در حال ثبت…' : 'ثبت سفارش'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
