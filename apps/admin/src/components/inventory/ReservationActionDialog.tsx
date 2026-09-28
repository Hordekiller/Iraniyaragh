'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { InventoryBalanceSnapshot, Reservation } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { listBalances } from '@/lib/inventory/ledger-api';
import { transitionManualReservation } from '@/lib/inventory/reservations-api';

type Action = 'release' | 'consume';
type Props = { reservation: Reservation; action: Action; onClose: () => void; onSaved: () => void };
const verb: Record<Action, string> = { release: 'آزادسازی', consume: 'مصرف' };

export function ReservationActionDialog({ reservation, action, onClose, onSaved }: Props) {
  const [balance, setBalance] = useState<InventoryBalanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listBalances({ warehouseId: reservation.warehouseId, locationId: reservation.locationId, variantId: reservation.variantId, limit: 1 }, controller.signal)
      .then((result) => {
        const exact = result.items.find((item) => item.warehouseId === reservation.warehouseId && item.locationId === reservation.locationId && item.variantId === reservation.variantId);
        if (!exact) setError('ماندهٔ متناظر یافت نشد؛ عملیات متوقف شد.');
        else setBalance(exact);
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(failure instanceof Error ? failure.message : 'دریافت نسخهٔ مانده ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reservation]);

  async function submit() {
    if (!balance || submitting) return;
    if (reservation.orderId || reservation.status !== 'ACTIVE' || new Date(reservation.expiresAt).getTime() <= Date.now()) {
      setError('این رزرو برای عملیات دستی فعال نیست؛ فهرست را نوسازی کنید.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await transitionManualReservation(reservation.id, action, { expectedVersion: balance.version });
      const expectedStatus = action === 'release' ? 'RELEASED' : 'CONSUMED';
      if (result.status !== expectedStatus) {
        setError('وضعیت رزرو هم‌زمان تغییر کرده است. فهرست و دفترکل را بررسی کنید.');
        return;
      }
      onSaved();
      onClose();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.code === 'INVENTORY_VERSION_CONFLICT') {
        setError('نسخهٔ مانده تغییر کرده است. فهرست را نوسازی کنید.');
      } else if (failure instanceof ApiClientError && failure.code === 'RESERVATION_EXPIRED') {
        setError('رزرو منقضی شده و این عملیات مجاز نیست.');
      } else if (failure instanceof ApiNetworkError) {
        setError('نتیجه نامشخص است. پیش از هر اقدام مجدد، وضعیت رزرو و دفترکل را نوسازی و بررسی کنید.');
      } else {
        setError(failure instanceof ApiClientError ? failure.message : 'عملیات ناموفق بود. وضعیت رزرو را بررسی کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="reservation-action-title">
    <DialogTitle id="reservation-action-title">{verb[action]} رزرو دستی</DialogTitle>
    <DialogContent>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <Alert severity={action === 'consume' ? 'warning' : 'info'}>
          {action === 'consume' ? 'مصرف رزرو، موجودی فیزیکی را کم می‌کند و گردش فروش ثبت می‌کند.' : 'آزادسازی فقط موجودی رزروشده را آزاد می‌کند.'}
        </Alert>
        <Typography dir="ltr" sx={{ wordBreak: 'break-all' }}>Reservation: {reservation.id}</Typography>
        <Typography>تعداد: {reservation.quantity.toLocaleString('fa-IR')}</Typography>
        {loading ? <Typography>دریافت نسخهٔ مانده…</Typography> : null}
        {balance ? <Typography>نسخهٔ مانده: {balance.version.toLocaleString('fa-IR')} | قابل فروش: {balance.available.toLocaleString('fa-IR')}</Typography> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={submitting}>انصراف</Button>
      <Button variant="contained" color={action === 'consume' ? 'warning' : 'primary'} disabled={loading || !balance || submitting || Boolean(error)} onClick={() => void submit()}>{submitting ? 'در حال ثبت…' : `تأیید ${verb[action]}`}</Button>
    </DialogActions>
  </Dialog>;
}
