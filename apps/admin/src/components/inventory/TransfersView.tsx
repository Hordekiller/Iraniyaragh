'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Lock, Plus, RefreshCw } from 'lucide-react';
import type { StockTransfer, TransferStatus } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canTransferInventory } from '@/lib/inventory/inventory-permissions';
import { listTransfers } from '@/lib/inventory/transfers-api';

export type TransferFilters = { sourceWarehouseId: string; targetWarehouseId: string; status: TransferStatus | '' };
const EMPTY: TransferFilters = { sourceWarehouseId: '', targetWarehouseId: '', status: '' };
export const transferLabels: Record<TransferStatus, string> = {
  DRAFT: 'پیش‌نویس', REQUESTED: 'در انتظار تأیید', APPROVED: 'تأییدشده',
  IN_TRANSIT: 'در راه', RECEIVED: 'تحویل‌شده', CANCELLED: 'لغوشده',
};
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

function identifier(value: string) {
  return <Typography variant="body2" dir="ltr" textAlign="start" sx={{ userSelect: 'text', wordBreak: 'break-all' }}>{value}</Typography>;
}

export function TransfersView({ initialFilters = EMPTY }: { initialFilters?: TransferFilters }) {
  const { user } = useAuth();
  const canTransfer = canTransferInventory(user);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<StockTransfer[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!canTransfer) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listTransfers({ sourceWarehouseId: filters.sourceWarehouseId || undefined,
      targetWarehouseId: filters.targetWarehouseId || undefined, status: filters.status || undefined,
      offset: page * pageSize, limit: pageSize }, controller.signal)
      .then((result) => { setItems(result.items); setCount(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setItems([]); setCount(0);
        setError(failure instanceof Error ? failure.message : 'دریافت انتقال‌ها ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canTransfer, filters, page, pageSize, reload]);

  if (!canTransfer) return <><PageHeader title="انتقال‌های انبار" /><EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز inventory.transfer ندارد." /></>;

  return <>
    <PageHeader title="انتقال‌های انبار" eyebrow="کالا و انبار" description="انتقال‌های واقعی با وضعیت و نسخهٔ ثبت‌شده در API." breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'انتقال‌ها' }]}
      actions={<Button component={Link} href="/transfers/new" variant="contained" startIcon={<Plus size={17} />}>انتقال جدید</Button>} />
    <Box component="form" onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({ sourceWarehouseId: draft.sourceWarehouseId.trim(), targetWarehouseId: draft.targetWarehouseId.trim(), status: draft.status }); }} sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField size="small" label="شناسه انبار مبدأ" value={draft.sourceWarehouseId} onChange={(event) => setDraft((current) => ({ ...current, sourceWarehouseId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField size="small" label="شناسه انبار مقصد" value={draft.targetWarehouseId} onChange={(event) => setDraft((current) => ({ ...current, targetWarehouseId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField select size="small" label="وضعیت" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as TransferStatus | '' }))} sx={{ minWidth: 150 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(transferLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button type="submit" variant="outlined">اعمال فیلتر</Button>
        <Button type="button" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>
      </Stack>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <DataTable<StockTransfer> caption="فهرست انتقال‌های انبار" columns={[
      { id: 'code', label: 'کد', render: (row) => <Button component={Link} href={`/transfers/${encodeURIComponent(row.id)}`} size="small">{row.code}</Button> },
      { id: 'status', label: 'وضعیت', render: (row) => transferLabels[row.status] },
      { id: 'source', label: 'مبدأ', render: (row) => identifier(row.sourceWarehouseId) },
      { id: 'target', label: 'مقصد', render: (row) => identifier(row.targetWarehouseId) },
      { id: 'count', label: 'ردیف‌ها', render: (row) => row.items.length.toLocaleString('fa-IR') },
      { id: 'version', label: 'نسخه', render: (row) => row.version.toLocaleString('fa-IR') },
      { id: 'created', label: 'ثبت', render: (row) => dateTime.format(new Date(row.createdAt)) },
    ]} rows={items} rowKey={(row) => row.id} loading={loading} rowCount={count} page={page} pageSize={pageSize}
      onPageChange={(nextPage, size) => { setPage(nextPage); setPageSize(size); }}
      emptyTitle="انتقالی یافت نشد" emptyDescription="فیلترها را بررسی کنید یا یک انتقال جدید بسازید." />
  </>;
}
