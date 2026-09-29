'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Lock, Plus, RefreshCw } from 'lucide-react';
import type { Stocktake, StocktakeStatus } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listStocktakes } from '@/lib/stocktake/stocktake-api';
import { stocktakeScopeLabels, stocktakeStatusLabels, stocktakeStatusTone } from '@/lib/stocktake/stocktake-labels';
import { canApproveStocktakes, canReadStocktakes } from '@/lib/stocktake/stocktake-permissions';
import { StocktakeCreateDialog } from './StocktakeCreateDialog';

export type StocktakeFilters = { status: StocktakeStatus | ''; warehouseId: string };
const EMPTY_FILTERS: StocktakeFilters = { status: '', warehouseId: '' };
const number = new Intl.NumberFormat('fa-IR');
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

function identifier(value: string) {
  return <Typography variant="body2" dir="ltr" textAlign="start" sx={{ userSelect: 'text', wordBreak: 'break-all' }}>{value}</Typography>;
}

export function StocktakesView({ initialFilters = EMPTY_FILTERS }: { initialFilters?: StocktakeFilters }) {
  const { user } = useAuth();
  const router = useRouter();
  const canRead = canReadStocktakes(user);
  const canApprove = canApproveStocktakes(user);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<Stocktake[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listStocktakes({
      status: filters.status || undefined, warehouseId: filters.warehouseId || undefined,
      offset: page * pageSize, limit: pageSize,
    }, controller.signal)
      .then((result) => { setItems(result.items); setCount(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setItems([]); setCount(0);
        setError(failure instanceof Error ? failure.message : 'دریافت فهرست انبارگردانی ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, filters, page, pageSize, reload]);

  if (!canRead) return <>
    <PageHeader title="انبارگردانی" />
    <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز stocktake.read ندارد." />
  </>;

  return <>
    <PageHeader title="انبارگردانی" eyebrow="کالا و انبار" description="برگهٔ شمارش فیزیکی و اعمال مغایرت روی دفترکل موجودی؛ اعداد انتظاری فقط برای بازبین قابل مشاهده است."
      breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'انبارگردانی' }]}
      actions={<Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setCreating(true)}>برگهٔ جدید</Button>} />
    {canApprove ? null : <Alert severity="info" sx={{ mb: 2 }}>شمارش برای شما «کور» است: مقدار انتظاری و مغایرت نمایش داده نمی‌شود تا شمارش مستقل از سیستم باشد.</Alert>}
    <Box component="form" onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({
      status: draft.status, warehouseId: draft.warehouseId.trim(),
    }); }} sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField select size="small" label="وضعیت" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as StocktakeStatus | '' }))} sx={{ minWidth: 160 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(stocktakeStatusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="شناسه انبار" value={draft.warehouseId} onChange={(event) => setDraft((current) => ({ ...current, warehouseId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <Button type="submit" variant="outlined">اعمال فیلتر</Button>
        <Button type="button" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>
      </Stack>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <DataTable<Stocktake> caption="فهرست انبارگردانی" columns={[
      { id: 'number', label: 'شماره', render: (row) => identifier(row.number) },
      { id: 'status', label: 'وضعیت', render: (row) => <Chip size="small" color={stocktakeStatusTone[row.status]} label={stocktakeStatusLabels[row.status]} /> },
      { id: 'warehouse', label: 'انبار', render: (row) => `${row.warehouseCode} — ${row.warehouseName ?? '—'}` },
      { id: 'scope', label: 'دامنه', render: (row) => stocktakeScopeLabels[row.scopeType] },
      { id: 'progress', label: 'پیشرفت', render: (row) => `${number.format(row.summary.countedLines)} از ${number.format(row.summary.totalLines)}` },
      ...(canApprove ? [{ id: 'netDifference', label: 'مغایرت خالص', render: (row: Stocktake) => number.format(row.summary.netDifference ?? 0) }] : []),
      { id: 'createdAt', label: 'ایجاد', render: (row) => dateTime.format(new Date(row.createdAt)) },
    ]} rows={items} rowKey={(row) => row.id} loading={loading}
      rowCount={count} page={page} pageSize={pageSize} onPageChange={(next, size) => { setPage(next); setPageSize(size); }}
      emptyTitle="برگه‌ای یافت نشد" emptyDescription="برگهٔ جدید بسازید و شمارش را آغاز کنید."
      actions={(row) => <Button size="small" component={Link} href={`/stocktakes/${encodeURIComponent(row.id)}`}>برگه</Button>}
      actionsLabel="عملیات" />
    {creating ? <StocktakeCreateDialog onClose={() => setCreating(false)}
      onCreated={(id) => { setCreating(false); setReload((value) => value + 1); router.push(`/stocktakes/${encodeURIComponent(id)}`); }} /> : null}
  </>;
}
