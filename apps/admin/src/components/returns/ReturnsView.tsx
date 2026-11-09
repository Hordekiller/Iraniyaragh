'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Lock } from 'lucide-react';
import type { ReturnListResponse } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { creditDate, creditRial } from '@/lib/credit/credit-ui';
import { listReturns } from '@/lib/returns/returns-api';
import { returnErrorMessage, returnWindowShortLabels } from '@/lib/returns/returns-ui';

const PER_PAGE = 25;
type Page = ReturnListResponse['data'];

export function ReturnsView() {
  const { user, isRestoring } = useAuth();
  const allowed = Boolean(user?.permissions.includes('returns.read'));
  const [page, setPage] = useState(1);
  const [orderNumber, setOrderNumber] = useState('');
  const [applied, setApplied] = useState('');
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const result = await listReturns({ page, perPage: PER_PAGE, orderNumber: applied }, signal);
      if (!signal?.aborted) setData(result);
    } catch (failure) {
      if (!signal?.aborted) setError(returnErrorMessage(failure, false));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [allowed, load]);

  if (isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!allowed) {
    return (
      <>
        <PageHeader title="مرجوعی‌ها" description="مرجوعی کالاهای سفارش‌های پرداخت‌شده." />
        <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز مشاهدهٔ مرجوعی‌ها را ندارد." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="مرجوعی‌ها"
        eyebrow="فروش و مشتری"
        description="کالاهای مرجوع‌شده و وضعیت استرداد دستی هر کدام. مهلت: ۲ روز کاری برای حضوری و ۱ هفته برای شهرهای دیگر، از صدور فاکتور. ثبت مرجوعی از صفحهٔ هر سفارش انجام می‌شود."
        breadcrumbs={[{ label: 'فروش و مشتری' }, { label: 'مرجوعی‌ها' }]}
      />
      <Stack component="form" direction="row" spacing={1} sx={{ mb: 2 }} onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(orderNumber.trim()); }}>
        <TextField size="small" label="شمارهٔ سفارش" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} inputProps={{ maxLength: 64 }} />
        <Button type="submit" variant="outlined">جست‌وجو</Button>
      </Stack>
      {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => void load()}>تلاش دوباره</Button>}>{error}</Alert> : null}
      {loading && !data ? <Typography role="status">در حال دریافت…</Typography> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="مرجوعی‌ای ثبت نشده است" description={applied ? 'برای این شماره سفارش مرجوعی‌ای پیدا نشد.' : 'پس از ثبت اولین مرجوعی، اینجا فهرست می‌شود.'} />
      ) : null}
      {data && data.items.length > 0 ? (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small" aria-label="فهرست مرجوعی‌ها">
              <TableHead>
                <TableRow>
                  {['شمارهٔ مرجوعی', 'سفارش', 'زمان', 'نوع مهلت', 'مبلغ قابل‌استرداد', 'استرداد ثبت‌شده', 'باقی‌مانده'].map((title) => <TableCell key={title}>{title}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.number}</TableCell>
                    <TableCell><Link href={`/orders/${row.orderId}`}>{row.orderNumber}</Link></TableCell>
                    <TableCell>{creditDate(row.returnedAt)}</TableCell>
                    <TableCell>{returnWindowShortLabels[row.windowKind]}</TableCell>
                    <TableCell>{creditRial(row.refundDue.amount)}</TableCell>
                    <TableCell>{creditRial(row.refunded.amount)}</TableCell>
                    <TableCell>{creditRial(row.refundRemaining.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>قبلی</Button>
            <Typography variant="body2">صفحهٔ {page} از {data.meta.pages} — {data.meta.total} مرجوعی</Typography>
            <Button disabled={loading || page >= data.meta.pages} onClick={() => setPage((current) => current + 1)}>بعدی</Button>
          </Box>
        </Paper>
      ) : null}
    </>
  );
}
