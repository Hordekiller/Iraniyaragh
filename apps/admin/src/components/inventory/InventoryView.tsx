'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Lock, Plus, RefreshCw } from 'lucide-react';
import type {
  InventoryBalanceSnapshot, InventoryMovement, InventoryMovementType,
} from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { canAdjustInventory, canReadInventory } from '@/lib/inventory/inventory-permissions';
import { listBalances, listMovements } from '@/lib/inventory/ledger-api';
import { StockChangeDialog } from './StockChangeDialog';

export type InventoryFilters = { warehouseId: string; locationId: string; variantId: string; type: InventoryMovementType | '' };
const EMPTY_FILTERS: InventoryFilters = { warehouseId: '', locationId: '', variantId: '', type: '' };
const number = new Intl.NumberFormat('fa-IR');
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
const movementLabels: Record<InventoryMovementType, string> = {
  RECEIPT: 'رسید', SALE: 'فروش', RETURN_IN: 'مرجوعی ورودی', RETURN_OUT: 'مرجوعی خروجی',
  TRANSFER_IN: 'انتقال ورودی', TRANSFER_OUT: 'انتقال خروجی', ADJUSTMENT_IN: 'تعدیل افزایشی',
  ADJUSTMENT_OUT: 'تعدیل کاهشی', STOCKTAKE: 'انبارگردانی', RESERVATION: 'رزرو', RELEASE: 'آزادسازی',
};

function identifier(value: string) {
  return <Typography variant="body2" dir="ltr" textAlign="start" sx={{ userSelect: 'text', wordBreak: 'break-all' }}>{value}</Typography>;
}

export function InventoryView({ initialFilters = EMPTY_FILTERS }: { initialFilters?: InventoryFilters }) {
  const { user } = useAuth();
  const canRead = canReadInventory(user);
  const canAdjust = canAdjustInventory(user);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [balancePage, setBalancePage] = useState(0);
  const [balancePageSize, setBalancePageSize] = useState(25);
  const [balances, setBalances] = useState<InventoryBalanceSnapshot[]>([]);
  const [balanceCount, setBalanceCount] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [movementPage, setMovementPage] = useState(0);
  const [movementPageSize, setMovementPageSize] = useState(25);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementCount, setMovementCount] = useState(0);
  const [movementLoading, setMovementLoading] = useState(true);
  const [movementError, setMovementError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [change, setChange] = useState<{ open: boolean; initial?: Partial<InventoryBalanceSnapshot> }>({ open: false });

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setBalanceLoading(true);
    setBalanceError(null);
    listBalances({
      warehouseId: filters.warehouseId || undefined, locationId: filters.locationId || undefined,
      variantId: filters.variantId || undefined, offset: balancePage * balancePageSize, limit: balancePageSize,
    }, controller.signal)
      .then((result) => { setBalances(result.items); setBalanceCount(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setBalances([]); setBalanceCount(0);
        setBalanceError(failure instanceof Error ? failure.message : 'دریافت ماندهٔ موجودی ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setBalanceLoading(false); });
    return () => controller.abort();
  }, [canRead, filters, balancePage, balancePageSize, reload]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setMovementLoading(true);
    setMovementError(null);
    listMovements({
      warehouseId: filters.warehouseId || undefined, locationId: filters.locationId || undefined,
      variantId: filters.variantId || undefined,
      type: filters.type || undefined,
      offset: movementPage * movementPageSize, limit: movementPageSize,
    }, controller.signal)
      .then((result) => { setMovements(result.items); setMovementCount(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setMovements([]); setMovementCount(0);
        setMovementError(failure instanceof Error ? failure.message : 'دریافت گردش موجودی ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setMovementLoading(false); });
    return () => controller.abort();
  }, [canRead, filters, movementPage, movementPageSize, reload]);

  if (!canRead) return <>
    <PageHeader title="موجودی و گردش" />
    <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز inventory.read ندارد." />
  </>;

  return <>
    <PageHeader title="موجودی و گردش" eyebrow="کالا و انبار" description="ماندهٔ واقعی و دفترکل تغییرات؛ همهٔ اعداد از API خوانده می‌شوند." breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'موجودی و گردش' }]}
      actions={canAdjust ? <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setChange({ open: true, initial: {
        warehouseId: filters.warehouseId, locationId: filters.locationId, variantId: filters.variantId, version: 0,
      } })}>رسید یا تعدیل</Button> : undefined} />
    {!canAdjust ? <Alert severity="info" sx={{ mb: 2 }}>دسترسی شما فقط خواندنی است. تغییر فیزیکی موجودی نیازمند inventory.adjust است.</Alert> : null}
    <Box component="form" onSubmit={(event) => { event.preventDefault(); setBalancePage(0); setMovementPage(0); setFilters({
      warehouseId: draft.warehouseId.trim(), locationId: draft.locationId.trim(), variantId: draft.variantId.trim(), type: draft.type,
    }); }} sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField size="small" label="شناسه انبار" value={draft.warehouseId} onChange={(event) => setDraft((current) => ({ ...current, warehouseId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField size="small" label="شناسه مکان" value={draft.locationId} onChange={(event) => setDraft((current) => ({ ...current, locationId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField size="small" label="شناسه SKU" value={draft.variantId} onChange={(event) => setDraft((current) => ({ ...current, variantId: event.target.value }))} inputProps={{ dir: 'ltr' }} />
        <TextField select size="small" label="نوع گردش" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as InventoryMovementType | '' }))} sx={{ minWidth: 150 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(movementLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button type="submit" variant="outlined">اعمال فیلتر</Button>
        <Button type="button" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>
      </Stack>
    </Box>

    <Typography variant="h5" fontWeight={700} sx={{ mb: 1.5 }}>ماندهٔ موجودی</Typography>
    {balanceError ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{balanceError}</Alert> : null}
    <DataTable<InventoryBalanceSnapshot> caption="ماندهٔ موجودی" columns={[
      { id: 'warehouse', label: 'انبار', render: (row) => identifier(row.warehouseId) },
      { id: 'location', label: 'مکان', render: (row) => identifier(row.locationId) },
      { id: 'variant', label: 'SKU', render: (row) => identifier(row.variantId) },
      { id: 'onHand', label: 'فیزیکی', render: (row) => number.format(row.onHand) },
      { id: 'reserved', label: 'رزروشده', render: (row) => number.format(row.reserved) },
      { id: 'available', label: 'قابل فروش', render: (row) => number.format(row.available) },
      { id: 'version', label: 'نسخه', render: (row) => number.format(row.version) },
    ]} rows={balances} rowKey={(row) => `${row.warehouseId}:${row.locationId}:${row.variantId}`} loading={balanceLoading}
      rowCount={balanceCount} page={balancePage} pageSize={balancePageSize} onPageChange={(page, size) => { setBalancePage(page); setBalancePageSize(size); }}
      emptyTitle="مانده‌ای یافت نشد" emptyDescription="فیلترها را بررسی کنید یا رسید اولیه ثبت کنید."
      actions={(row) => <Stack direction="row" spacing={0.5}>
        {canAdjust ? <Button size="small" onClick={() => setChange({ open: true, initial: row })}>رسید/تعدیل</Button> : null}
        <Button size="small" component={Link} href={`/reservations?warehouseId=${encodeURIComponent(row.warehouseId)}&locationId=${encodeURIComponent(row.locationId)}&variantId=${encodeURIComponent(row.variantId)}&version=${row.version}`}>رزروها</Button>
      </Stack>}
      actionsLabel="عملیات" />

    <Typography variant="h5" fontWeight={700} sx={{ mt: 4, mb: 1.5 }}>گردش دفترکل</Typography>
    {movementError ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{movementError}</Alert> : null}
    <DataTable<InventoryMovement> caption="گردش دفترکل موجودی" columns={[
      { id: 'createdAt', label: 'زمان', render: (row) => dateTime.format(new Date(row.createdAt)) },
      { id: 'type', label: 'نوع', render: (row) => movementLabels[row.type] },
      { id: 'warehouse', label: 'انبار', render: (row) => identifier(row.warehouseId) },
      { id: 'location', label: 'مکان', render: (row) => identifier(row.locationId) },
      { id: 'variant', label: 'SKU', render: (row) => identifier(row.variantId) },
      { id: 'quantity', label: 'تغییر', render: (row) => number.format(row.quantity) },
      { id: 'balance', label: 'قبل ← بعد', render: (row) => `${number.format(row.beforeOnHand)} ← ${number.format(row.afterOnHand)}` },
      { id: 'reason', label: 'دلیل', render: (row) => row.reason || '—' },
    ]} rows={movements} rowKey={(row) => row.id} loading={movementLoading}
      rowCount={movementCount} page={movementPage} pageSize={movementPageSize} onPageChange={(page, size) => { setMovementPage(page); setMovementPageSize(size); }}
      emptyTitle="گردشی یافت نشد" emptyDescription="هنوز جنبشی برای فیلترهای انتخابی ثبت نشده است." />
    {change.open ? <StockChangeDialog initial={change.initial} onClose={() => setChange({ open: false })} onSaved={() => setReload((value) => value + 1)} /> : null}
  </>;
}
