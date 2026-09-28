'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Lock, Plus, RefreshCw } from 'lucide-react';
import type { Reservation, ReservationStatus } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAdjustInventory, canReadInventory } from '@/lib/inventory/inventory-permissions';
import { listReservations } from '@/lib/inventory/reservations-api';
import { ReservationActionDialog } from './ReservationActionDialog';
import { ReservationCreateDialog, type ReservationIdentity } from './ReservationCreateDialog';

export type ReservationFilters = { warehouseId: string; variantId: string; status: ReservationStatus | ''; locationId: string; version: number | null };
const EMPTY: ReservationFilters = { warehouseId: '', variantId: '', status: '', locationId: '', version: null };
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<ReservationStatus, string> = { ACTIVE: 'فعال', CONSUMED: 'مصرف‌شده', RELEASED: 'آزادشده', EXPIRED: 'منقضی' };

function identifier(value: string) {
  return <Typography variant="body2" dir="ltr" textAlign="start" sx={{ userSelect: 'text', wordBreak: 'break-all' }}>{value}</Typography>;
}

export function ReservationsView({ initialFilters = EMPTY }: { initialFilters?: ReservationFilters }) {
  const { user } = useAuth();
  const canRead = canReadInventory(user);
  const canAdjust = canAdjustInventory(user);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<Reservation[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<{ reservation: Reservation; type: 'release' | 'consume' } | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listReservations({ warehouseId: filters.warehouseId || undefined, variantId: filters.variantId || undefined,
      status: filters.status || undefined, offset: page * pageSize, limit: pageSize }, controller.signal)
      .then((result) => { setItems(result.items); setCount(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setItems([]); setCount(0);
        setError(failure instanceof Error ? failure.message : 'دریافت رزروها ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, filters, page, pageSize, reload]);

  if (!canRead) return <><PageHeader title="رزروهای موجودی" /><EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز inventory.read ندارد." /></>;

  const initialCreate: Partial<ReservationIdentity> = {
    warehouseId: filters.warehouseId, locationId: filters.locationId, variantId: filters.variantId,
    ...(filters.version !== null ? { version: filters.version } : {}),
  };
  return <>
    <PageHeader title="رزروهای موجودی" eyebrow="کالا و انبار" description="وضعیت واقعی رزروها؛ عملیات دستی فقط برای رزروهای مستقل از سفارش." breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'موجودی و گردش', href: '/inventory' }, { label: 'رزروها' }]}
      actions={canAdjust ? <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>رزرو دستی</Button> : undefined} />
    {!canAdjust ? <Alert severity="info" sx={{ mb: 2 }}>دسترسی شما فقط خواندنی است؛ تغییر رزرو نیازمند inventory.adjust است.</Alert> : null}
    <Box component="form" onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({ ...draft, warehouseId: draft.warehouseId.trim(), variantId: draft.variantId.trim() }); }} sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField size="small" label="شناسه انبار" value={draft.warehouseId} onChange={(event) => setDraft((current) => ({ ...current, warehouseId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField size="small" label="شناسه SKU" value={draft.variantId} onChange={(event) => setDraft((current) => ({ ...current, variantId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField select size="small" label="وضعیت" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ReservationStatus | '' }))} sx={{ minWidth: 150 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button type="submit" variant="outlined">اعمال فیلتر</Button>
        <Button type="button" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>
      </Stack>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <DataTable<Reservation> caption="رزروهای موجودی" columns={[
      { id: 'id', label: 'شناسه رزرو', render: (row) => identifier(row.id) },
      { id: 'status', label: 'وضعیت', render: (row) => statusLabels[row.status] },
      { id: 'warehouse', label: 'انبار', render: (row) => identifier(row.warehouseId) },
      { id: 'location', label: 'مکان', render: (row) => identifier(row.locationId) },
      { id: 'variant', label: 'SKU', render: (row) => identifier(row.variantId) },
      { id: 'quantity', label: 'تعداد', render: (row) => row.quantity.toLocaleString('fa-IR') },
      { id: 'expires', label: 'انقضا', render: (row) => dateTime.format(new Date(row.expiresAt)) },
      { id: 'source', label: 'منبع', render: (row) => row.orderId ? <Link href={`/orders/${encodeURIComponent(row.orderId)}`}>سفارش {row.orderId}</Link> : 'دستی' },
    ]} rows={items} rowKey={(row) => row.id} loading={loading} rowCount={count} page={page} pageSize={pageSize}
      onPageChange={(nextPage, size) => { setPage(nextPage); setPageSize(size); }}
      emptyTitle="رزروی یافت نشد" emptyDescription="فیلترها را بررسی کنید؛ رزرو سفارش فقط از Checkout ایجاد می‌شود."
      actions={canAdjust ? (row) => row.status === 'ACTIVE' && !row.orderId && new Date(row.expiresAt).getTime() > Date.now() ? <Stack direction="row" spacing={0.5}>
        <Button size="small" onClick={() => setAction({ reservation: row, type: 'release' })}>آزادسازی</Button>
        <Button size="small" color="warning" onClick={() => setAction({ reservation: row, type: 'consume' })}>مصرف</Button>
      </Stack> : null : undefined} actionsLabel="عملیات" />
    {createOpen ? <ReservationCreateDialog initial={initialCreate} onClose={() => setCreateOpen(false)} onSaved={() => setReload((value) => value + 1)} /> : null}
    {action ? <ReservationActionDialog reservation={action.reservation} action={action.type} onClose={() => setAction(null)} onSaved={() => setReload((value) => value + 1)} /> : null}
  </>;
}
