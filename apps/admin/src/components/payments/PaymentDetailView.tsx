'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { Lock } from 'lucide-react';
import type { AdminPaymentDetail } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatRial, orderStatusLabel, paymentStatusLabel, paymentStatusTone } from '@/lib/orders/orders-labels';
import { getPayment, reconcilePayment } from '@/lib/payments/payments-api';
import { RefundDialog } from './RefundDialog';

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
const outcomeLabels = {
  VERIFIED: 'تأیید و تسویه شد',
  REPLAY: 'وضعیت ثبت‌شده بازخوانی شد',
  VERIFIED_AFTER_CANCELLED: 'پرداخت پس از لغو سفارش تأیید شد؛ نیازمند بررسی استرداد',
  NOT_PAID: 'درگاه پرداختی را تأیید نکرد',
  ACCEPTED_UNCONFIRMED: 'پاسخ هنوز نامشخص است',
} as const;

export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const { user } = useAuth();
  const canRead = Boolean(user?.permissions.includes('payments.read'));
  const canReconcile = Boolean(user?.permissions.includes('payments.reconcile'));
  const canRefund = Boolean(user?.permissions.includes('payments.refund'));
  const [payment, setPayment] = useState<AdminPaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  async function refresh() {
    setPayment(await getPayment(paymentId));
  }

  async function recheck() {
    if (!payment || !canReconcile || !payment.reconciliationEligible || rechecking) return;
    if (!window.confirm('فقط وضعیت نامشخص از درگاه دوباره پرس‌وجو می‌شود. در صورت تأیید درگاه، پرداخت و سفارش طبق قوانین سرور تسویه خواهند شد. ادامه می‌دهید؟')) return;
    setRechecking(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await reconcilePayment(payment.id);
      const updated = await getPayment(payment.id);
      setPayment(updated);
      setResult(`نتیجهٔ بررسی درگاه: ${outcomeLabels[outcome.outcome]}؛ وضعیت پرداخت: ${paymentStatusLabel(outcome.status)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بررسی دوبارهٔ درگاه انجام نشد.');
    } finally {
      setRechecking(false);
    }
  }

  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    getPayment(paymentId, controller.signal)
      .then(setPayment)
      .catch((cause: unknown) => {
        if (!(cause instanceof ApiAbortError)) setError(cause instanceof Error ? cause.message : 'خطا در دریافت جزئیات پرداخت.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, paymentId]);

  if (!canRead) return <>
    <PageHeader title="جزئیات پرداخت" description="شواهد پرداخت" />
    <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="مجوز مشاهدهٔ پرداخت‌ها برای این حساب فعال نیست." />
  </>;
  if (loading) return <Typography>در حال دریافت پرداخت…</Typography>;
  if (error && !payment) return <Alert severity="error">{error}</Alert>;
  if (!payment) return <EmptyState title="پرداخت یافت نشد" description="رکورد پرداخت در دسترس نیست." />;

  return <>
    <PageHeader title={`پرداخت سفارش ${payment.order.number}`} eyebrow="پرداخت‌ها" description="شواهد ثبت‌شده در سرور، بررسی دوبارهٔ موارد نامشخص و ثبت استرداد انجام‌شده در پنل درگاه." breadcrumbs={[{ label: 'پرداخت‌ها', href: '/payments' }, { label: payment.order.number }]} />
    <Alert severity="info" sx={{ mb: 2 }}>وضعیت پرداخت و سفارش مستقل‌اند. بررسی دوباره فقط برای پاسخ نامشخص درگاه است. استرداد پس از برگرداندن پول در پنل درگاه و با شمارهٔ مرجع آن تراکنش ثبت می‌شود.</Alert>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {result && <Alert severity="success" sx={{ mb: 2 }}>{result}</Alert>}
    {canReconcile && payment.reconciliationEligible && <Button variant="contained" disabled={rechecking} onClick={recheck} sx={{ mb: 2 }}>
      {rechecking ? 'در حال بررسی درگاه…' : 'بررسی دوبارهٔ وضعیت نامشخص در درگاه'}
    </Button>}
    {canRefund && payment.refundEligible && <Button variant="contained" color="error" onClick={() => setRefundOpen(true)} sx={{ mb: 2 }}>
      ثبت استرداد
    </Button>}
    <Card sx={{ mb: 3 }}><CardContent>
      <Stack spacing={1}>
        <Typography>شناسه پرداخت: <span dir="ltr">{payment.id}</span></Typography>
        <Typography>سفارش: <Link href={`/orders/${payment.order.id}`}>{payment.order.number}</Link> — {orderStatusLabel(payment.order.status)}</Typography>
        <Typography>مبلغ: {formatRial(payment.amount)}</Typography>
        <Typography>استردادشده: {formatRial(payment.refundedTotal)}</Typography>
        <Typography>قابل استرداد باقی‌مانده: {formatRial(payment.remainingRefundable)}</Typography>
        <Typography>درگاه: {payment.provider} ({payment.gatewayEnvironment})</Typography>
        <Typography>شماره مرجع: <span dir="ltr">{payment.referenceId ?? '—'}</span></Typography>
        <Stack direction="row" spacing={1} alignItems="center"><Typography>وضعیت:</Typography><StatusChip label={paymentStatusLabel(payment.status)} tone={paymentStatusTone(payment.status)} /></Stack>
        <Typography>ایجاد: {faDateTime.format(new Date(payment.createdAt))}</Typography>
        <Typography>آخرین به‌روزرسانی: {faDateTime.format(new Date(payment.updatedAt))}</Typography>
      </Stack>
    </CardContent></Card>
    <Typography variant="h6" component="h2" sx={{ mb: 1 }}>تاریخچهٔ وضعیت</Typography>
    {payment.transitionsTruncated && <Alert severity="warning" sx={{ mb: 1 }}>فقط ۱۰۰ تغییر وضعیت اخیر نمایش داده شده است.</Alert>}
    <Table aria-label="تاریخچهٔ وضعیت پرداخت"><TableHead><TableRow>
      <TableCell>از</TableCell><TableCell>به</TableCell><TableCell>دلیل</TableCell><TableCell>شناسه درخواست</TableCell><TableCell>زمان</TableCell>
    </TableRow></TableHead><TableBody>
      {payment.transitions.map((transition, index) => <TableRow key={`${transition.createdAt}-${index}`}>
        <TableCell>{paymentStatusLabel(transition.from)}</TableCell>
        <TableCell>{paymentStatusLabel(transition.to)}</TableCell>
        <TableCell>{transition.reason ?? '—'}</TableCell>
        <TableCell dir="ltr">{transition.requestId ?? '—'}</TableCell>
        <TableCell>{faDateTime.format(new Date(transition.createdAt))}</TableCell>
      </TableRow>)}
      {payment.transitions.length === 0 && <TableRow><TableCell colSpan={5}>تغییر وضعیتی ثبت نشده است.</TableCell></TableRow>}
    </TableBody></Table>
    <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>استردادهای ثبت‌شده</Typography>
    {payment.refundsTruncated && <Alert severity="warning" sx={{ mb: 1 }}>فقط ۱۰۰ استرداد اخیر نمایش داده شده است.</Alert>}
    <Table aria-label="استردادهای ثبت‌شدهٔ پرداخت"><TableHead><TableRow>
      <TableCell>مبلغ</TableCell><TableCell>مرجع درگاه</TableCell><TableCell>دلیل</TableCell><TableCell>یادداشت</TableCell><TableCell>زمان ثبت</TableCell>
    </TableRow></TableHead><TableBody>
      {payment.refunds.map((refund) => <TableRow key={refund.refundId}>
        <TableCell>{formatRial(refund.amount)}</TableCell>
        <TableCell dir="ltr">{refund.gatewayReferenceId}</TableCell>
        <TableCell>{refund.reason}</TableCell>
        <TableCell>{refund.note ?? '—'}</TableCell>
        <TableCell>{faDateTime.format(new Date(refund.createdAt))}</TableCell>
      </TableRow>)}
      {payment.refunds.length === 0 && <TableRow><TableCell colSpan={5}>استردادی ثبت نشده است.</TableCell></TableRow>}
    </TableBody></Table>
    {canRefund && payment.refundEligible && <RefundDialog
      open={refundOpen}
      onClose={() => setRefundOpen(false)}
      paymentId={payment.id}
      remaining={payment.remainingRefundable}
      onRecorded={async () => {
        await refresh();
        setResult('استرداد ثبت شد و وضعیت پرداخت از سرور بازخوانی شد.');
      }}
    />}
  </>;
}
