'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { Lock } from 'lucide-react';
import type { AdminPaymentDetail } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatRial, orderStatusLabel, paymentStatusLabel, paymentStatusTone } from '@/lib/orders/orders-labels';
import { getPayment } from '@/lib/payments/payments-api';

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const { user } = useAuth();
  const canRead = Boolean(user?.permissions.includes('payments.read'));
  const [payment, setPayment] = useState<AdminPaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!payment) return <EmptyState title="پرداخت یافت نشد" description="رکورد پرداخت در دسترس نیست." />;

  return <>
    <PageHeader title={`پرداخت سفارش ${payment.order.number}`} eyebrow="پرداخت‌ها" description="شواهد ثبت‌شده در سرور؛ بدون امکان تغییر وضعیت مالی." breadcrumbs={[{ label: 'پرداخت‌ها', href: '/payments' }, { label: payment.order.number }]} />
    <Alert severity="info" sx={{ mb: 2 }}>وضعیت پرداخت و وضعیت سفارش مستقل‌اند. هر مورد نامنطبق باید در فرآیند تطبیق مالی بررسی شود؛ این صفحه دستور تطبیق یا استرداد صادر نمی‌کند.</Alert>
    <Card sx={{ mb: 3 }}><CardContent>
      <Stack spacing={1}>
        <Typography>شناسه پرداخت: <span dir="ltr">{payment.id}</span></Typography>
        <Typography>سفارش: <Link href={`/orders/${payment.order.id}`}>{payment.order.number}</Link> — {orderStatusLabel(payment.order.status)}</Typography>
        <Typography>مبلغ: {formatRial(payment.amount)}</Typography>
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
  </>;
}
