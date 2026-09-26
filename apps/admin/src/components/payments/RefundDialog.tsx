'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AdminRefundRequest } from '@iranyaragh/contracts';
import { newRefundIdempotencyKey, refundPayment } from '@/lib/payments/payments-api';
import { formatRial } from '@/lib/orders/orders-labels';

const reasons = [
  { value: 'CANCELLED_SHIPMENT', label: 'لغو یا مرجوعی ارسال' },
  { value: 'CUSTOMER_REQUEST', label: 'درخواست مشتری' },
  { value: 'DUPLICATE_PAYMENT', label: 'پرداخت تکراری' },
  { value: 'DUPLICATE_ORDER', label: 'سفارش تکراری' },
  { value: 'OTHER', label: 'سایر (در یادداشت توضیح دهید)' },
] as const;

export type RefundDialogProps = {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  /** Server-decided remaining refundable total; the form never recomputes it. */
  remaining: { amount: string; currency: string };
  onRecorded: () => void | Promise<void>;
};

/**
 * Records a refund that the staff member already performed in the gateway panel.
 * The server is the only authority for the amount cap and the payment state, so
 * this form only collects the evidence and never decides the outcome.
 */
export function RefundDialog({ open, onClose, paymentId, remaining, onRecorded }: RefundDialogProps) {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState<string>(reasons[0].value);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newRefundIdempotencyKey());

  const amountError = amount.length > 0 && !/^[1-9][0-9]*$/u.test(amount.trim())
    ? 'مبلغ باید عدد صحیح مثبت به ریال باشد.'
    : null;
  const referenceError = reference.length > 0 && reference !== reference.trim()
    ? 'شمارهٔ مرجع نباید فاصلهٔ ابتدا یا انتها داشته باشد.'
    : null;
  const canSubmit = amount.trim().length > 0 && reference.trim().length > 0
    && !amountError && !referenceError && !submitting;

  function reset() {
    setAmount('');
    setReference('');
    setReason(reasons[0].value);
    setNote('');
    setError(null);
    // A new form needs a new key; a retry of the same form must keep it.
    setIdempotencyKey(newRefundIdempotencyKey());
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await refundPayment(
        paymentId,
        {
          amountMinorUnits: amount.trim(),
          gatewayReferenceId: reference.trim(),
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
        } satisfies AdminRefundRequest,
        idempotencyKey,
      );
      reset();
      onClose();
      await onRecorded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت استرداد انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>ثبت استرداد</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            این فرم هیچ پولی جابه‌جا نمی‌کند. ابتدا مبلغ را در پنل درگاه به مشتری برگردانده‌اید و سپس شمارهٔ مرجع آن تراکنش را اینجا ثبت کنید.
          </Alert>
          <Typography variant="body2">
            حداکثر مبلغ قابل ثبت برای این پرداخت: {formatRial({ amount: remaining.amount, currency: 'IRR' })}
          </Typography>
          <TextField
            label="مبلغ استرداد (ریال)"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={Boolean(amountError)}
            helperText={amountError ?? 'عدد صحیح وارد کنید؛ مبلغ کسری از باقی‌مانده بیشتر نمی‌شود.'}
            inputProps={{ inputMode: 'numeric', maxLength: 18 }}
            fullWidth
          />
          <TextField
            label="شمارهٔ مرجع تراکنش در پنل درگاه"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            error={Boolean(referenceError)}
            helperText={referenceError ?? 'اجباری است و فقط یک‌بار قابل استفاده است.'}
            inputProps={{ maxLength: 128 }}
            fullWidth
          />
          <TextField select label="دلیل" value={reason} onChange={(event) => setReason(event.target.value)} fullWidth>
            {reasons.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <TextField
            label="یادداشت داخلی (اختیاری)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            inputProps={{ maxLength: 500 }}
            multiline
            minRows={2}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>انصراف</Button>
        <Button variant="contained" color="error" onClick={submit} disabled={!canSubmit}>
          {submitting ? 'در حال ثبت…' : 'ثبت استرداد'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
