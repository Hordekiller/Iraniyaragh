'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { ApiClientError } from '@/lib/api/client';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { executeInvoiceDraft, listInvoiceDrafts, type DraftCommand } from '@/lib/invoices/invoice-drafts-api';
export function InvoiceFromOrder({ orderId, version }: { orderId: string; version: number }) {
  const { user } = useAuth();
  if (!hasPermission(user, 'invoices.read') || !hasPermission(user, 'invoices.manage')) return null;
  return <FromOrder key={`${user?.userId}:${orderId}`} orderId={orderId} version={version} />;
}
function FromOrder({ orderId, version }: { orderId: string; version: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [message, setMessage] = useState('');
  const pending = useRef<{ command: DraftCommand; key: string } | null>(null); const flight = useRef(false); const alive = useRef(false); const abort = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  async function run() {
    if (flight.current) return;
    const retry = pending.current !== null;
    if (!pending.current) pending.current = { command: { kind: 'fromOrder', id: orderId, body: { expectedOrderVersion: version, note: null } }, key: `invoice-order-${randomUuid()}` };
    const captured = pending.current; flight.current = true; setBusy(true); setMessage(''); abort.current = new AbortController();
    try {
      if (retry) await listInvoiceDrafts(0, abort.current.signal); // Failed reconciliation must never resend.
      const result = await executeInvoiceDraft(captured.command, captured.key, abort.current.signal);
      if (!alive.current) return; pending.current = null; setUncertain(false); router.push(`/invoices/drafts/${encodeURIComponent(result.draft.id)}`);
    } catch (cause) {
      if (!alive.current) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.statusCode >= 500; setUncertain(ambiguous);
      if (!ambiguous) pending.current = null;
      setMessage(cause instanceof ApiClientError && cause.code === 'INVOICE_DRAFT_EXISTS' ? 'پیش‌نویس فعال این سفارش قبلاً ساخته شده؛ فهرست پیش‌فاکتورها را بررسی کنید.' :
        cause instanceof ApiClientError && cause.code === 'STALE_VERSION' ? 'سفارش تغییر کرده؛ جزئیات سفارش را بازخوانی کنید.' :
        ambiguous ? 'نتیجهٔ ساخت پیش‌نویس نامشخص است؛ تلاش دوباره با همان درخواست انجام می‌شود.' : 'پیش‌نویس ساخته نشد؛ وضعیت سفارش، اطلاعات و دسترسی را بررسی کنید.');
    } finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  return <Stack spacing={1}>{message && <Alert severity={uncertain ? 'warning' : 'error'}>{message}</Alert>}
    <Button disabled={busy} onClick={() => void run()}>{uncertain ? 'بازخوانی و تکرار همان درخواست پیش‌نویس' : 'ساخت پیش‌فاکتور از سفارش'}</Button></Stack>;
}
