'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type {
  InvoicePublicationRequest,
  InvoicePublicationResponse,
} from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { randomUuid } from '@/lib/crypto/random-uuid';
import {
  readInvoicePublication,
  changeInvoicePublication,
} from '@/lib/invoices/invoice-documents-api';
import { invoiceDocumentError } from './InvoiceIssue';
export function InvoicePublication({ id }: { id: string }) {
  const { user } = useAuth();
  if (!user?.permissions.includes('invoices.read')) return null;
  return (
    <Publication
      key={`${user.userId}:${id}`}
      id={id}
      manage={user.permissions.includes('invoices.publish')}
    />
  );
}
function Publication({ id, manage }: { id: string; manage: boolean }) {
  const [data, setData] = useState<InvoicePublicationResponse['data']>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const alive = useRef(false);
  const active = useRef(new Set<AbortController>());
  const flight = useRef(false);
  const pending = useRef<{
    body: InvoicePublicationRequest;
    key: string;
  } | null>(null);
  useEffect(() => {
    alive.current = true;
    const requests = active.current;
    return () => {
      alive.current = false;
      for (const controller of requests) controller.abort();
    };
  }, []);
  async function load(signal?: AbortSignal) {
    const result = await readInvoicePublication(id, offset, signal);
    if (alive.current && !signal?.aborted) setData(result);
    return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    active.current.add(controller);
    setLoading(true);
    setError(undefined);
    setData(undefined);
    void readInvoicePublication(id, offset, controller.signal)
      .then((result) => {
        if (alive.current && !controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (
          alive.current &&
          !controller.signal.aborted &&
          !(cause instanceof ApiAbortError)
        )
          setError(cause);
      })
      .finally(() => {
        active.current.delete(controller);
        if (alive.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, offset]);
  async function reload() {
    if (flight.current) return;
    setLoading(true);
    setError(undefined);
    const controller = new AbortController();
    active.current.add(controller);
    try {
      await load(controller.signal);
      if (alive.current) {
        setNeedsReview(false);
        setConfirmed(false);
      }
    } catch (cause) {
      if (alive.current) setError(cause);
    } finally {
      active.current.delete(controller);
      if (alive.current) setLoading(false);
    }
  }
  async function change() {
    if (
      flight.current ||
      !manage ||
      (!pending.current &&
        (!data || loading || needsReview || !confirmed || !reason.trim()))
    )
      return;
    const retry = pending.current !== null;
    if (!pending.current)
      pending.current = {
        body: {
          expectedVersion: data!.publication.version,
          isPublished: !data!.publication.isPublished,
          reason: reason.trim(),
        },
        key: `invoice-publication-${randomUuid()}`,
      };
    const captured = pending.current;
    flight.current = true;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    const controller = new AbortController();
    active.current.add(controller);
    try {
      if (retry) await load(controller.signal); // Failed reconciliation must never resend.
      if (!alive.current || controller.signal.aborted) return;
      await changeInvoicePublication(
        id,
        captured.body,
        captured.key,
        controller.signal,
      );
      if (!alive.current) return;
      pending.current = null;
      setUncertain(false);
      setSaved(true);
      setConfirmed(false);
      setReason('');
      setData(undefined);
      setLoading(true);
      await load(controller.signal); // Replay may describe an older event: render the current head.
    } catch (cause) {
      if (!alive.current) return;
      setError(cause);
      if (!pending.current) return;
      const ambiguous =
        !(cause instanceof ApiClientError) || cause.statusCode >= 500;
      setUncertain(ambiguous);
      if (!ambiguous) {
        pending.current = null;
        setNeedsReview(true);
        setConfirmed(false);
      }
    } finally {
      active.current.delete(controller);
      flight.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }
  const locked =
    loading || busy || uncertain || needsReview || error !== undefined;
  return (
    <Paper sx={{ p: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Typography variant="h6">دسترسی مشتری به فاکتور</Typography>
        <Alert severity="info">
          انتشار یا لغو دسترسی، وضعیت مالی، پرداخت و موجودی را تغییر نمی‌دهد.
          فقط صاحب فاکتور پس از ورود می‌تواند آن را مشاهده کند.
        </Alert>
        {loading && (
          <Typography role="status">در حال بررسی دسترسی فاکتور…</Typography>
        )}
        {error !== undefined && (
          <Alert severity="error">
            {error instanceof ApiClientError &&
            error.code === 'AUTH_REAUTHENTICATION_REQUIRED'
              ? 'برای تغییر دسترسی، تأیید تازهٔ رمز و کد دومرحله‌ای لازم است.'
              : invoiceDocumentError(error)}
          </Alert>
        )}
        {saved && (
          <Alert severity="success">
            فرمان دسترسی ثبت شد. وضعیت دسترسی را از سرور بازخوانی کنید.
          </Alert>
        )}
        {data && (
          <>
            <Typography>
              دسترسی مشتری:{' '}
              {data.publication.isPublished ? 'منتشرشده' : 'خصوصی'} — نسخهٔ{' '}
              {data.publication.version}
            </Typography>
            {data.publication.isPublished && (
              <Typography>
                مسیر مشاهده پس از ورود مشتری:{' '}
                <Typography component="code" dir="ltr" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {`/account/invoices/${encodeURIComponent(id)}`}
                </Typography>
              </Typography>
            )}
            {manage && (
              <>
                <TextField
                  label="دلیل تغییر دسترسی فاکتور"
                  value={reason}
                  disabled={locked}
                  onChange={(event) => setReason(event.target.value)}
                  inputProps={{ maxLength: 500 }}
                />
                <FormControlLabel
                  label="تغییر دسترسی این فاکتور برای صاحب آن را تأیید می‌کنم"
                  control={
                    <Checkbox
                      checked={confirmed}
                      disabled={locked}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                  }
                />
                <Button
                  variant="contained"
                  color={data.publication.isPublished ? 'warning' : 'primary'}
                  disabled={locked || !confirmed || !reason.trim()}
                  onClick={() => void change()}
                >
                  {data.publication.isPublished
                    ? 'لغو دسترسی مشتری به فاکتور'
                    : 'انتشار فاکتور در پنل مشتری'}
                </Button>
              </>
            )}
            <Typography variant="h6">تاریخچهٔ دسترسی</Typography>
            {data.history.length === 0 ? (
              <Typography>تغییر دسترسی ثبت نشده است.</Typography>
            ) : (
              data.history.map((row) => (
                <Typography key={row.version}>
                  نسخهٔ {row.version} —{' '}
                  {row.isPublished ? 'انتشار' : 'لغو دسترسی'} — {row.actorId} —{' '}
                  {row.reason} —{' '}
                  {new Date(row.createdAt).toLocaleString('fa-IR')}
                </Typography>
              ))
            )}
            <Stack direction="row">
              <Button
                disabled={busy || uncertain || loading || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 25))}
              >
                تاریخچهٔ جدیدتر
              </Button>
              <Button
                disabled={
                  busy || uncertain || loading || offset + 25 >= data.count
                }
                onClick={() => setOffset((value) => value + 25)}
              >
                تاریخچهٔ قدیمی‌تر
              </Button>
            </Stack>
          </>
        )}
        {uncertain ? (
          <Alert severity="warning">
            نتیجهٔ فرمان نامشخص است؛ درخواست اولیه حفظ شده است.
            <Button disabled={busy || loading} onClick={() => void change()}>
              بازخوانی و بررسی همان فرمان دسترسی
            </Button>
          </Alert>
        ) : (
          <Button disabled={busy || loading} onClick={() => void reload()}>
            بازخوانی دسترسی فاکتور
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
