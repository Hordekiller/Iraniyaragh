'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Typography } from '@mui/material';
import type { StocktakeAuditEntry } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { ApiAbortError } from '@/lib/api/client';
import { getStocktakeHistory } from '@/lib/stocktake/stocktake-api';
import { stocktakeError } from '@/lib/stocktake/stocktake-errors';

const labels: Record<string, string> = { 'stocktake.created': 'ایجاد برگه', 'stocktake.started': 'آغاز شمارش',
  'stocktake.counted': 'ثبت شمارش', 'stocktake.submitted': 'ارسال برای بازبینی', 'stocktake.approved': 'تأیید و ثبت دفترکل', 'stocktake.cancelled': 'لغو برگه' };
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

export function StocktakeHistory({ stocktakeId }: { stocktakeId: string }) {
  const [items, setItems] = useState<StocktakeAuditEntry[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    getStocktakeHistory(stocktakeId, { offset: page * size, limit: size }, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setItems(result.items); setCount(result.count); } })
      .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError) && !controller.signal.aborted) setError(stocktakeError(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [stocktakeId, page, size, revision]);
  return <>
    <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>تاریخچهٔ برگه</Typography>
    {error ? <Alert severity="error" action={<Button onClick={() => setRevision(value => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <DataTable caption="تاریخچهٔ انبارگردانی" columns={[
      { id: 'action', label: 'عملیات', render: row => labels[row.action] ?? row.action },
      { id: 'actor', label: 'شناسهٔ کاربر ثبت‌کننده', render: row => row.actorId ?? '—' },
      { id: 'time', label: 'زمان', render: row => dateTime.format(new Date(row.createdAt)) },
    ]} rows={items} rowKey={row => row.id} rowCount={count} page={page} pageSize={size}
      onPageChange={(next, nextSize) => { setPage(next); setSize(nextSize); }} loading={loading} selectable={false}
      emptyTitle="تاریخچه‌ای ثبت نشده" emptyDescription="عملیات برگه در این بخش نمایش داده می‌شود." />
  </>;
}
