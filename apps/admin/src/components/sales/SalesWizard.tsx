'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, MenuItem, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, Trash2 } from 'lucide-react';
import type { AdminOrderSummary, StaffOrderOption } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { createStaffOrder } from '@/lib/orders/orders-api';
import { formatRial } from '@/lib/orders/orders-labels';
import { hasOrderPermission, ORDERS_MANAGE } from '@/lib/orders/orders-permissions';
import { PROVINCES } from '@/lib/orders/iran-provinces';
import {
  duplicateIds, emptyAddress, parseQuantity, toAsciiDigits, validateAddress, type AddressErrors, type SalesAddress,
} from '@/lib/orders/staff-order-input';
import { StaffOrderOptionPicker } from '@/components/orders/StaffOrderOptionPicker';
import { PageHeader } from '@/components/ui/PageHeader';

const STEPS = ['مشتری', 'اقلام', 'نشانی تحویل', 'مرور و ثبت'] as const;
type Line = { key: string; variant: StaffOrderOption | null; quantity: string };
const newLine = (): Line => ({ key: randomUuid(), variant: null, quantity: '1' });
const newKey = () => `staff-order-${randomUuid()}`;
const faNumber = new Intl.NumberFormat('fa-IR');

export function SalesWizard() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!hasOrderPermission(user, ORDERS_MANAGE)) {
    return <Alert severity="error">برای ثبت فروش جدید به مجوز «مدیریت سفارش‌ها» نیاز دارید.</Alert>;
  }
  return <Wizard />;
}

function Wizard() {
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<StaffOrderOption | null>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [address, setAddress] = useState<SalesAddress>(emptyAddress);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The request may have reached the server although no answer came back. The retry key is
  // frozen then: re-sending it replays the stored order and can never create a second one.
  const [uncertain, setUncertain] = useState(false);
  const [key, setKey] = useState(newKey);
  const [created, setCreated] = useState<AdminOrderSummary | null>(null);

  const duplicates = useMemo(() => duplicateIds(lines.map((line) => line.variant?.id ?? null)), [lines]);
  const addressErrors: AddressErrors = useMemo(() => validateAddress(address), [address]);
  const lineProblem = (line: Line): string | null => {
    if (!line.variant) return 'کالا را انتخاب کنید.';
    if (duplicates.has(line.variant.id)) return 'این کالا دو بار آمده است؛ تعداد را در یک ردیف بنویسید.';
    if (parseQuantity(line.quantity) === null) return 'تعداد باید عددی بین ۱ تا ۱۰۰۰ باشد.';
    return null;
  };
  const stepValid = [
    Boolean(customer),
    lines.length > 0 && lines.every((line) => lineProblem(line) === null),
    Object.keys(addressErrors).length === 0,
    true,
  ];
  const locked = submitting || uncertain;

  function touch<T>(set: (value: T) => void, value: T) {
    set(value);
    if (!uncertain) setKey(newKey()); // New content is a new request; an unchanged retry keeps its key.
  }
  const updateLine = (lineKey: string, patch: Partial<Line>) =>
    touch(setLines, lines.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)));
  const bump = (line: Line, delta: number) => {
    const current = parseQuantity(line.quantity) ?? 1;
    updateLine(line.key, { quantity: String(Math.min(1000, Math.max(1, current + delta))) });
  };

  function next() {
    setAttempted((previous) => ({ ...previous, [step]: true }));
    if (stepValid[step]) setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  async function submit() {
    if (!stepValid[0] || !stepValid[1] || !stepValid[2] || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createStaffOrder(
        {
          customerId: customer!.id,
          lines: lines.map((line) => ({ variantId: line.variant!.id, quantity: parseQuantity(line.quantity)! })),
          address: {
            provinceCode: address.provinceCode,
            city: address.city.trim(),
            address: address.address.trim(),
            postalCode: toAsciiDigits(address.postalCode).replace(/[\s-]/gu, ''),
            recipient: address.recipient.trim(),
            mobile: toAsciiDigits(address.mobile).replace(/[\s-]/gu, ''),
          },
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        key,
      );
      setUncertain(false);
      setCreated(result.order);
    } catch (cause) {
      if (cause instanceof ApiNetworkError) {
        setUncertain(true);
        setError('نتیجهٔ ثبت نامشخص است و ممکن است سفارش ساخته شده باشد. دوباره تلاش کنید؛ با همان کلید، سفارش تکراری ساخته نمی‌شود و اگر قبلاً ثبت شده باشد همان نمایش داده می‌شود.');
      } else if (cause instanceof ApiClientError) {
        setError(cause.code === 'DUPLICATE_LINE' ? 'یک کالا بیش از یک بار در سفارش آمده است.' : cause.message || 'ثبت سفارش پذیرفته نشد؛ اطلاعات را بررسی کنید.');
      } else {
        setError('ثبت سفارش ناموفق بود.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setStep(0); setCustomer(null); setLines([newLine()]); setAddress(emptyAddress()); setNote('');
    setAttempted({}); setError(null); setUncertain(false); setKey(newKey()); setCreated(null);
  }

  if (created) return <Done order={created} onAnother={startOver} />;

  const field = (name: keyof SalesAddress, label: string, extra: Record<string, unknown> = {}) => (
    <TextField
      label={label} value={address[name]} required fullWidth disabled={locked}
      onChange={(event) => touch(setAddress, { ...address, [name]: event.target.value })}
      error={attempted[2] && Boolean(addressErrors[name])} helperText={attempted[2] ? addressErrors[name] : undefined} {...extra}
    />
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title="فروش و فاکتور جدید"
        description="مشتری، اقلام و نشانی را ثبت کنید. سفارش با قیمت فروش کاتالوگ در سرور ساخته می‌شود؛ بعد از آن فاکتور صادر و برای مشتری منتشر می‌شود."
        breadcrumbs={[{ label: 'سفارش‌ها', href: '/orders' }, { label: 'فروش جدید' }]}
      />
      <Stepper activeStep={step} alternativeLabel aria-label="مراحل ثبت فروش">
        {STEPS.map((label, index) => (
          <Step key={label} completed={index < step}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' }, alignItems: 'start' }}>
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          {step === 0 && (
            <Stack spacing={2}>
              <Typography variant="h6">مشتری را انتخاب کنید</Typography>
              <StaffOrderOptionPicker kind="customer" label="مشتری" required value={customer} onChange={(value) => touch(setCustomer, value)} disabled={locked}
                helperText="با نام یا شمارهٔ مشتری جست‌وجو کنید. شماره فقط ناقص نمایش داده می‌شود." />
              {attempted[0] && !customer && <Alert severity="warning">برای ادامه یک مشتری انتخاب کنید.</Alert>}
              <Typography variant="body2" color="text.secondary">
                مشتری ثبت‌شده نیست؟ <Link href="/customers">ابتدا در بخش مشتریان او را بسازید</Link>؛ فاکتور و پرداخت به حساب همان مشتری وصل می‌شود.
              </Typography>
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={2}>
              <Typography variant="h6">اقلام سفارش</Typography>
              {lines.map((line, index) => {
                const problem = attempted[1] ? lineProblem(line) : null;
                return (
                  <Paper key={line.key} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle2">قلم {faNumber.format(index + 1)}</Typography>
                        <IconButton aria-label={`حذف قلم ${index + 1}`} size="small" disabled={locked || lines.length === 1}
                          onClick={() => touch(setLines, lines.filter((row) => row.key !== line.key))}><Trash2 size={18} /></IconButton>
                      </Stack>
                      <StaffOrderOptionPicker kind="variant" label="کالا" size="small" required value={line.variant} disabled={locked}
                        onChange={(variant) => updateLine(line.key, { variant })} />
                      <Stack direction="row" spacing={1} alignItems="center">
                        <IconButton aria-label="کم کردن تعداد" size="small" disabled={locked} onClick={() => bump(line, -1)}><Minus size={16} /></IconButton>
                        <TextField label="تعداد" size="small" value={line.quantity} disabled={locked} sx={{ width: 110 }} inputProps={{ inputMode: 'numeric', dir: 'ltr' }}
                          onChange={(event) => updateLine(line.key, { quantity: event.target.value })} error={Boolean(problem)} />
                        <IconButton aria-label="زیاد کردن تعداد" size="small" disabled={locked} onClick={() => bump(line, 1)}><Plus size={16} /></IconButton>
                      </Stack>
                      {problem && <Typography variant="caption" color="error" role="alert">{problem}</Typography>}
                    </Stack>
                  </Paper>
                );
              })}
              <Button startIcon={<Plus size={18} />} sx={{ alignSelf: 'start' }} disabled={locked || lines.length >= 50} onClick={() => touch(setLines, [...lines, newLine()])}>افزودن قلم</Button>
              <Typography variant="caption" color="text.secondary">قیمت هر قلم در سرور از قیمت فروش کاتالوگ محاسبه می‌شود؛ مبلغ را در این صفحه نمی‌توان تغییر داد.</Typography>
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={2}>
              <Typography variant="h6">نشانی تحویل</Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {field('provinceCode', 'استان', { select: true, children: [<MenuItem key="" value="">انتخاب استان</MenuItem>, ...PROVINCES.map((province) => <MenuItem key={province.value} value={province.value}>{province.label}</MenuItem>)] })}
                {field('city', 'شهر')}
              </Box>
              {field('address', 'نشانی کامل', { multiline: true, minRows: 2 })}
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
                {field('postalCode', 'کد پستی', { inputProps: { inputMode: 'numeric', dir: 'ltr', maxLength: 14 } })}
                {field('recipient', 'نام گیرنده')}
                {field('mobile', 'موبایل گیرنده', { inputProps: { inputMode: 'tel', dir: 'ltr' } })}
              </Box>
              <TextField label="توضیحات (اختیاری)" value={note} multiline minRows={2} fullWidth disabled={locked} inputProps={{ maxLength: 500 }}
                onChange={(event) => touch(setNote, event.target.value)} />
            </Stack>
          )}

          {step === 3 && (
            <Stack spacing={2}>
              <Typography variant="h6">مرور نهایی</Typography>
              <Review title="مشتری" onEdit={locked ? undefined : () => setStep(0)}><Typography>{customer?.label}</Typography></Review>
              <Review title="اقلام" onEdit={locked ? undefined : () => setStep(1)}>
                {lines.map((line) => (
                  <Typography key={line.key}>{line.variant?.label} <Box component="span" color="text.secondary">× {faNumber.format(parseQuantity(line.quantity) ?? 0)}</Box></Typography>
                ))}
              </Review>
              <Review title="نشانی تحویل" onEdit={locked ? undefined : () => setStep(2)}>
                <Typography>{PROVINCES.find((province) => province.value === address.provinceCode)?.label}، {address.city}</Typography>
                <Typography>{address.address}</Typography>
                <Typography color="text.secondary">{address.recipient} — {address.mobile}</Typography>
                {note.trim() && <Typography color="text.secondary">توضیحات: {note}</Typography>}
              </Review>
              <Alert severity="info">مبلغ کل را سرور هنگام ثبت حساب می‌کند و بعد از ثبت نمایش داده می‌شود. ثبت سفارش موجودی را برای مشتری رزرو می‌کند.</Alert>
            </Stack>
          )}

          <Divider sx={{ my: 3 }} />
          <Stack direction="row" justifyContent="space-between">
            <Button startIcon={<ArrowRight size={18} />} disabled={step === 0 || locked} onClick={() => setStep(step - 1)}>قبلی</Button>
            {step < STEPS.length - 1
              ? <Button variant="contained" endIcon={<ArrowLeft size={18} />} onClick={next}>بعدی</Button>
              : <Button variant="contained" disabled={submitting} onClick={() => void submit()}>{submitting ? 'در حال ثبت…' : uncertain ? 'تلاش دوباره با همان درخواست' : 'ثبت سفارش'}</Button>}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, display: { xs: 'none', md: 'block' }, position: 'sticky', top: 16 }} aria-label="خلاصهٔ سفارش">
          <Typography variant="subtitle2" gutterBottom>خلاصهٔ سفارش</Typography>
          <Stack spacing={1}>
            <Typography variant="body2">مشتری: {customer?.label ?? '—'}</Typography>
            <Typography variant="body2">اقلام: {faNumber.format(lines.filter((line) => line.variant).length)} قلم</Typography>
            <Typography variant="body2">شهر: {address.city || '—'}</Typography>
            <Chip size="small" label="مبلغ پس از ثبت، در سرور محاسبه می‌شود" />
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

function Review({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{title}</Typography>
        {onEdit && <Button size="small" onClick={onEdit}>ویرایش</Button>}
      </Stack>
      {children}
    </Paper>
  );
}

function Done({ order, onAnother }: { order: AdminOrderSummary; onAnother: () => void }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <PageHeader title="سفارش ثبت شد" breadcrumbs={[{ label: 'سفارش‌ها', href: '/orders' }, { label: 'فروش جدید' }]} />
      <Alert icon={<CheckCircle2 size={22} />} severity="success">
        سفارش {order.number} با مبلغ {formatRial(order.totals.total)} ثبت و موجودی رزرو شد. وضعیت: در انتظار پرداخت.
      </Alert>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>قدم بعدی</Typography>
        <Stack component="ol" spacing={1} sx={{ m: 0, pl: 0, pr: 3 }}>
          <Typography component="li">در صفحهٔ سفارش «ساخت پیش‌فاکتور از سفارش» را بزنید و فاکتور را صادر کنید.</Typography>
          <Typography component="li">فاکتور را برای مشتری منتشر کنید تا در حساب خودش ببیند.</Typography>
          <Typography component="li">مشتری با ورود به حساب خود از صفحهٔ سفارش پرداخت می‌کند. رزرو تا {new Date(order.reservationExpiresAt).toLocaleString('fa-IR')} معتبر است.</Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
          <Button component={Link} href={`/orders/${encodeURIComponent(order.id)}`} variant="contained">مشاهدهٔ سفارش و صدور فاکتور</Button>
          <Button onClick={onAnother}>ثبت فروش دیگر</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
