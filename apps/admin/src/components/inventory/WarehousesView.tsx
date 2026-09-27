'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Stack, Typography } from '@mui/material';
import { Edit, Lock, MapPin, Plus, RefreshCw, Warehouse as WarehouseIcon } from 'lucide-react';
import type { Warehouse, WarehouseLocation } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { canAdjustInventory, canReadInventory } from '@/lib/inventory/inventory-permissions';
import { listLocations, listWarehouses } from '@/lib/inventory/warehouses-api';
import { WarehouseDialog } from './WarehouseDialog';
import { LocationDialog } from './LocationDialog';

const count = new Intl.NumberFormat('fa-IR');

export function WarehousesView() {
  const { user } = useAuth();
  const canRead = canReadInventory(user);
  const canAdjust = canAdjustInventory(user);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseCount, setWarehouseCount] = useState(0);
  const [warehousePage, setWarehousePage] = useState(0);
  const [warehousePageSize, setWarehousePageSize] = useState(25);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [warehouseReload, setWarehouseReload] = useState(0);
  const [selected, setSelected] = useState<Warehouse | null>(null);
  const [warehouseDialog, setWarehouseDialog] = useState<{ open: boolean; edit: Warehouse | null }>({ open: false, edit: null });
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationCount, setLocationCount] = useState(0);
  const [locationPage, setLocationPage] = useState(0);
  const [locationPageSize, setLocationPageSize] = useState(25);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationReload, setLocationReload] = useState(0);
  const [locationDialog, setLocationDialog] = useState<{ open: boolean; edit: WarehouseLocation | null }>({ open: false, edit: null });

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setWarehouseLoading(true);
    setWarehouseError(null);
    listWarehouses({ offset: warehousePage * warehousePageSize, limit: warehousePageSize }, controller.signal)
      .then((result) => {
        setWarehouses(result.items);
        setWarehouseCount(result.count);
        setSelected((current) => current ? result.items.find((row) => row.id === current.id) ?? current : null);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setWarehouseError(error instanceof Error ? error.message : 'دریافت انبارها ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setWarehouseLoading(false); });
    return () => controller.abort();
  }, [canRead, warehousePage, warehousePageSize, warehouseReload]);

  useEffect(() => {
    if (!canRead || !selected) return;
    const controller = new AbortController();
    setLocationLoading(true);
    setLocationError(null);
    listLocations(selected.id, { offset: locationPage * locationPageSize, limit: locationPageSize }, controller.signal)
      .then((result) => { setLocations(result.items); setLocationCount(result.count); })
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setLocationError(error instanceof Error ? error.message : 'دریافت مکان‌ها ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLocationLoading(false); });
    return () => controller.abort();
  }, [canRead, selected, locationPage, locationPageSize, locationReload]);

  if (!canRead) return (
    <>
      <PageHeader title="انبارها و مکان‌ها" />
      <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما برای مشاهدهٔ موجودی و انبارها مجوز inventory.read ندارد." />
    </>
  );

  return (
    <>
      <PageHeader
        title="انبارها و مکان‌ها"
        eyebrow="کالا و انبار"
        description="ساختار واقعی انبار و مکان‌ها؛ تغییرات از API دارای مجوز و ممیزی ثبت می‌شود."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'انبارها' }]}
        actions={canAdjust ? <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setWarehouseDialog({ open: true, edit: null })}>انبار جدید</Button> : undefined}
      />
      {!canAdjust ? <Alert severity="info" sx={{ mb: 2 }}>دسترسی شما فقط خواندنی است. ساخت و ویرایش نیازمند inventory.adjust است.</Alert> : null}
      {warehouseError ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setWarehouseReload((value) => value + 1)}>تلاش دوباره</Button>}>{warehouseError}</Alert> : null}
      <DataTable<Warehouse>
        caption="فهرست انبارها"
        columns={[
          { id: 'code', label: 'کد', render: (row) => <Typography dir="ltr" textAlign="start" fontWeight={700}>{row.code}</Typography> },
          { id: 'name', label: 'نام', render: (row) => row.name },
          { id: 'city', label: 'شهر', render: (row) => row.city || '—' },
          { id: 'status', label: 'وضعیت', render: (row) => <Chip size="small" color={row.isActive ? 'success' : 'default'} label={row.isActive ? 'فعال' : 'غیرفعال'} /> },
        ]}
        rows={warehouses} rowKey={(row) => row.id} loading={warehouseLoading}
        emptyTitle="انباری ثبت نشده است" emptyDescription="برای آغاز عملیات موجودی، یک انبار بسازید."
        rowCount={warehouseCount} page={warehousePage} pageSize={warehousePageSize}
        onPageChange={(page, size) => { setWarehousePage(page); setWarehousePageSize(size); }}
        actions={(row) => <Stack direction="row" spacing={0.5}>
          <Button size="small" startIcon={<MapPin size={16} />} onClick={() => { setSelected(row); setLocationPage(0); setLocations([]); }}>مکان‌ها</Button>
          {canAdjust ? <IconButton size="small" aria-label={`ویرایش انبار ${row.name}`} onClick={() => setWarehouseDialog({ open: true, edit: row })}><Edit size={17} /></IconButton> : null}
        </Stack>}
        actionsLabel="عملیات"
      />
      {selected ? <Box sx={{ mt: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>مکان‌های {selected.name}</Typography>
            <Typography variant="body2" color="text.secondary">{count.format(locationCount)} مکان ثبت‌شده در این انبار</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => setLocationReload((value) => value + 1)}>نوسازی</Button>
            {canAdjust ? <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setLocationDialog({ open: true, edit: null })}>مکان جدید</Button> : null}
          </Stack>
        </Stack>
        {locationError ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setLocationReload((value) => value + 1)}>تلاش دوباره</Button>}>{locationError}</Alert> : null}
        <DataTable<WarehouseLocation>
          caption={`مکان‌های انبار ${selected.name}`}
          columns={[
            { id: 'code', label: 'کد مکان', render: (row) => <Typography dir="ltr" textAlign="start" fontWeight={700}>{row.code}</Typography> },
            { id: 'name', label: 'نام', render: (row) => row.name || '—' },
            { id: 'zone', label: 'زون/راهرو', render: (row) => [row.zone, row.aisle].filter(Boolean).join(' / ') || '—' },
            { id: 'rack', label: 'قفسه/طبقه/خانه', render: (row) => [row.rack, row.shelf, row.bin].filter(Boolean).join(' / ') || '—' },
            { id: 'status', label: 'وضعیت', render: (row) => <Chip size="small" color={row.isActive ? 'success' : 'default'} label={row.isActive ? 'فعال' : 'غیرفعال'} /> },
          ]}
          rows={locations} rowKey={(row) => row.id} loading={locationLoading}
          emptyTitle="مکانی ثبت نشده است" emptyDescription="در این انبار هنوز مکانی ثبت نشده است."
          rowCount={locationCount} page={locationPage} pageSize={locationPageSize}
          onPageChange={(page, size) => { setLocationPage(page); setLocationPageSize(size); }}
          actions={canAdjust ? (row) => <IconButton size="small" aria-label={`ویرایش مکان ${row.code}`} onClick={() => setLocationDialog({ open: true, edit: row })}><Edit size={17} /></IconButton> : undefined}
          actionsLabel="ویرایش"
        />
      </Box> : <EmptyState icon={<WarehouseIcon size={28} />} title="یک انبار انتخاب کنید" description="برای مشاهده و مدیریت مکان‌ها، دکمهٔ «مکان‌ها» را در ردیف انبار بزنید." />}
      <WarehouseDialog open={warehouseDialog.open} warehouse={warehouseDialog.edit} onClose={() => setWarehouseDialog({ open: false, edit: null })} onSaved={() => setWarehouseReload((value) => value + 1)} />
      {selected ? <LocationDialog open={locationDialog.open} warehouseId={selected.id} location={locationDialog.edit} onClose={() => setLocationDialog({ open: false, edit: null })} onSaved={() => setLocationReload((value) => value + 1)} /> : null}
    </>
  );
}
