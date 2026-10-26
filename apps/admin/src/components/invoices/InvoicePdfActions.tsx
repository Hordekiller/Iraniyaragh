'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { randomUuid } from '@/lib/crypto/random-uuid';
import {
  downloadInvoicePdfArtifact,
  invoicePdfStatus,
  requestInvoicePdf,
} from '@/lib/invoices/invoice-documents-api';
import type { InvoicePdfRequestResult } from '@iranyaragh/contracts';

/** Private PDF pipeline panel for one issued document. Requests are
 * idempotent, separately authorized, capacity-bounded, and the saved file is
 * verified against the stored digest before this interface completes.
 */
export function InvoicePdfActions({ id, number }: { id: string; number: string }) {
  const { user } = useAuth();
  const [request, setRequest] = useState<InvoicePdfRequestResult>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const active = useRef(new Set<AbortController>());
  const flight = useRef(false);
  useEffect(() => {
    alive.current = true;
    const tracked = active.current;
    return () => {
      alive.current = false;
      for (const controller of tracked) controller.abort();
    };
  }, []);
  if (!user?.permissions.includes('invoices.read')) return null;

  async function run(operation: (signal: AbortSignal) => Promise<InvoicePdfRequestResult>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage('');
    const controller = new AbortController();
    active.current.add(controller);
    try {
      const result = await operation(controller.signal);
      if (!alive.current) return;
      setRequest(result);
      if (result.status === 'READY') {
        setMessage('پروندهٔ فاکتور ذخیره‌شده آماده است؛ هش سند سازگار ثبت شده است.');
      } else {
        setMessage('درخواست ثبت شد؛ کارگر چاپ را اجرا می‌کند. پس از آن وضعیت را بررسی و بارگیری کنید.');
      }
    } catch (caught) {
      if (!alive.current || caught instanceof ApiAbortError) return;
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError('نتیجهٔ عملیات تأیید نشد؛ دوباره امتحان کنید.');
      }
    } finally {
      flight.current = false;
      active.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }

  function handleRequest(): void {
    const key = randomUuid();
    void run(signal => requestInvoicePdf(id, key, signal).then(result => result));
  }

  function handleStatus(): void {
    void run(signal => invoicePdfStatus(id, signal));
  }

  async function handleDownload(): Promise<void> {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage('');
    const controller = new AbortController();
    active.current.add(controller);
    try {
      const artifact = await downloadInvoicePdfArtifact(id, controller.signal);
      const digest = await crypto.subtle.digest('SHA-256', artifact.bytes);
      const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      if (artifact.sha256 && artifact.sha256 !== sha256) {
        throw new Error('پروندهٔ دریافت‌شده با هش ثبتی سازگار نیست؛ کپی را نگه ندارید و دوباره بارگیری کنید.');
      }
      const url = URL.createObjectURL(new Blob([artifact.bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener';
      anchor.download = artifact.filename.startsWith('iranyaragh-invoice-') ? artifact.filename : `iranyaragh-invoice-${number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      if (alive.current) {
        setMessage(`پروندهٔ بررسی‌شده ذخیره شد؛ ${Math.round(artifact.byteCount / 1024)} کیلوبایت.`);
      }
    } catch (caught) {
      if (!alive.current || caught instanceof ApiAbortError) return;
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError('بارگیری تأیید نشد؛ دوباره امتحان کنید.');
      }
    } finally {
      flight.current = false;
      active.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle1">پروندهٔ خصوصی فاکتور</Typography>
        <Typography>درخواست یک نسخهٔ فایلِ مشترک و ذخیره‌شده از همین سند؛ هویت، ظرفیت و هش در سرور کنترل می‌شود.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" onClick={handleRequest} disabled={busy}>درخواست ساخت پرونده</Button>
          <Button variant="outlined" onClick={handleStatus} disabled={busy}>بررسی وضعیت</Button>
          <Button variant="contained" onClick={() => void handleDownload()} disabled={busy || request?.status !== 'READY'}>بارگیری پرونده</Button>
        </Stack>
        {request && (
          <Typography>
            وضعیت: {request.status === 'READY' ? 'آماده' : 'در انتظار چاپ'}
            {request.status === 'READY' && request.sha256 ? ` — هش ${request.sha256.slice(0, 12)}…` : ''}
            {request.replayed ? '؛ پاسخ تکرار درخواست قبلی است.' : ''}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
