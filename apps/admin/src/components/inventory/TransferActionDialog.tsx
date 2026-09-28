'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { StockTransfer, TransferStatus } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { getTransfer, transitionTransfer, type TransferAction } from '@/lib/inventory/transfers-api';

type Props = { transfer: StockTransfer; action: TransferAction; onClose: () => void; onSaved: (updated: StockTransfer) => void };
const actions: Record<TransferAction, { label: string; from: TransferStatus[]; to: TransferStatus }> = {
  request: { label: 'درخواست تأیید', from: ['DRAFT'], to: 'REQUESTED' },
  approve: { label: 'تأیید', from: ['REQUESTED'], to: 'APPROVED' },
  dispatch: { label: 'ارسال فیزیکی', from: ['APPROVED'], to: 'IN_TRANSIT' },
  receive: { label: 'دریافت فیزیکی', from: ['IN_TRANSIT'], to: 'RECEIVED' },
  cancel: { label: 'لغو', from: ['DRAFT', 'REQUESTED', 'APPROVED'], to: 'CANCELLED' },
};

export function TransferActionDialog({ transfer, action, onClose, onSaved }: Props) {
  const [fresh, setFresh] = useState<StockTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => `inventory-transfer-${action}-${randomUuid()}`);
  const config = actions[action];

  useEffect(() => {
    const controller = new AbortController();
    getTransfer(transfer.id, controller.signal)
      .then((current) => {
        if (current.version !== transfer.version || current.status !== transfer.status) {
          setError('انتقال هم‌زمان تغییر کرده است. جزئیات را نوسازی و دوباره بررسی کنید.');
        } else if (!config.from.includes(current.status)) {
          setError('این عملیات در وضعیت فعلی مجاز نیست.');
        } else if (action === 'dispatch' && current.items.some((item) => !item.sourceLocationId)) {
          setError('برای ارسال، مکان مبدأ همهٔ ردیف‌ها لازم است.');
        } else if (action === 'receive' && current.items.some((item) => !item.targetLocationId)) {
          setError('برای دریافت، مکان مقصد همهٔ ردیف‌ها لازم است.');
        } else setFresh(current);
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(failure instanceof Error ? failure.message : 'دریافت جزئیات انتقال ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [transfer, action, config.from]);

  async function submit() {
    if (!fresh || submitting || uncertain) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await transitionTransfer(fresh.id, action, { expectedVersion: fresh.version }, key);
      if (result.status !== config.to) {
        setError('نتیجه با وضعیت مورد انتظار سازگار نیست. انتقال و دفترکل را بررسی کنید.');
        return;
      }
      onSaved(result);
      onClose();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.code === 'TRANSFER_VERSION_CONFLICT') {
        setError('نسخهٔ انتقال تغییر کرده است. جزئیات را نوسازی کنید.');
      } else if (failure instanceof ApiClientError && failure.code === 'TRANSFER_STATE_CONFLICT') {
        setError('انتقال دیگر در وضعیت مجاز برای این عملیات نیست.');
      } else if (failure instanceof ApiClientError && failure.code === 'INSUFFICIENT_STOCK') {
        setError('موجودی آزاد مبدأ برای ارسال کافی نیست.');
      } else if (failure instanceof ApiNetworkError) {
        setUncertain(true);
        setError('نتیجه نامشخص است. قبل از هر اقدام دیگر، انتقال، مانده و دفترکل را نوسازی و بررسی کنید.');
      } else {
        setError(failure instanceof ApiClientError ? failure.message : 'عملیات انتقال ناموفق بود.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="transfer-action-title">
    <DialogTitle id="transfer-action-title">{config.label} انتقال</DialogTitle>
    <DialogContent><Stack spacing={1.5} sx={{ mt: 1 }}>
      <Alert severity={action === 'dispatch' || action === 'receive' ? 'warning' : 'info'}>
        {action === 'dispatch' ? 'ارسال، گردش خروجی و کاهش موجودی مبدأ را ثبت می‌کند.' : action === 'receive' ? 'دریافت، گردش ورودی و افزایش موجودی مقصد را ثبت می‌کند.' : 'این فرمان فقط از مسیر state machine و ممیزی API ثبت می‌شود.'}
      </Alert>
      <Typography>کد: {transfer.code}</Typography>
      <Typography>ردیف‌ها: {transfer.items.length.toLocaleString('fa-IR')}</Typography>
      {loading ? <Typography>دریافت نسخهٔ فعلی…</Typography> : null}
      {fresh ? <Typography>نسخهٔ تأییدشده: {fresh.version.toLocaleString('fa-IR')}</Typography> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={submitting}>انصراف</Button>
      <Button variant="contained" color={action === 'cancel' || action === 'dispatch' ? 'warning' : 'primary'} disabled={loading || !fresh || submitting || uncertain || Boolean(error)} onClick={() => void submit()}>{submitting ? 'در حال ثبت…' : `تأیید ${config.label}`}</Button>
    </DialogActions>
  </Dialog>;
}
