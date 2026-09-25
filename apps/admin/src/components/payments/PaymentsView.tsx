'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Lock } from 'lucide-react';
import type { AdminPaymentSummary, OrderListMeta, PaymentStatus } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatRial, paymentStatusLabel, paymentStatusTone, PAYMENT_STATUS_LABELS } from '@/lib/orders/orders-labels';
import { listPayments, type PaymentQuery } from '@/lib/payments/payments-api';

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

export function PaymentsView() {
  const router = useRouter();
  const { user } = useAuth();
  const canRead = Boolean(user?.permissions.includes('payments.read'));
  const [query, setQuery] = useState<PaymentQuery>({ page: 1, perPage: 25 });
  const [items, setItems] = useState<AdminPaymentSummary[]>([]);
  const [meta, setMeta] = useState<OrderListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');

  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listPayments(query, controller.signal)
      .then((result) => { setItems(result.items); setMeta(result.meta); })
      .catch((cause: unknown) => {
        if (!(cause instanceof ApiAbortError)) setError(cause instanceof Error ? cause.message : 'خطا در دریافت پرداخت‌ها.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, query]);

  if (!canRead) return <>
    <PageHeader title="پرداخت‌ها" description="شواهد پرداخت‌ها" />
    <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="مجوز مشاهدهٔ پرداخت‌ها برای این حساب فعال نیست." />
  </>;

  return <>
    <PageHeader title="پرداخت‌ها" eyebrow="فروش و مشتری" description="شواهد واقعی تلاش‌های پرداخت و وضعیت ثبت‌شده در سرور." />
    <Alert severity="info" sx={{ mb: 2 }}>این نما فقط‌خواندنی است. مرجع پرداخت به‌تنهایی تأیید واریز یا دستور تطبیق مالی نیست.</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, page: 1, search: searchDraft.trim() || undefined })); }}>
        <TextField label="شماره سفارش" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} size="small" inputProps={{ maxLength: 120 }} />
        <Button type="submit" sx={{ ms: 1 }}>جستجو</Button>
      </Box>
      <TextField select label="وضعیت پرداخت" size="small" value={query.status ?? ''}
        onChange={(event) => setQuery((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as PaymentStatus | undefined }))} sx={{ minWidth: 180 }}>
        <MenuItem value="">همه</MenuItem>
        {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
    </Stack>
    <DataTable<AdminPaymentSummary>
      caption="فهرست پرداخت‌ها"
      rows={items}
      rowKey={(row) => row.id}
      loading={loading}
      error={error ?? undefined}
      columns={[
        { id: 'order', label: 'سفارش', render: (row) => <Typography component={Link} href={`/payments/${row.id}`} variant="body2">{row.order.number}</Typography> },
        { id: 'status', label: 'وضعیت پرداخت', render: (row) => <StatusChip label={paymentStatusLabel(row.status)} tone={paymentStatusTone(row.status)} /> },
        { id: 'amount', label: 'مبلغ', render: (row) => <Typography variant="body2">{formatRial(row.amount)}</Typography> },
        { id: 'referenceId', label: 'شماره مرجع', render: (row) => <Typography variant="body2" dir="ltr">{row.referenceId ?? '—'}</Typography> },
        { id: 'createdAt', label: 'زمان ایجاد', render: (row) => <Typography variant="body2">{faDateTime.format(new Date(row.createdAt))}</Typography> },
      ]}
      rowCount={meta?.total ?? 0}
      page={query.page - 1}
      pageSize={query.perPage}
      onPageChange={(page, pageSize) => setQuery((current) => ({ ...current, page: page + 1, perPage: pageSize }))}
      onRowClick={(row) => router.push(`/payments/${row.id}`)}
      emptyTitle="پرداختی یافت نشد"
    />
  </>;
}
