'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Edit, History, Lock, Plus, RefreshCw, Truck } from 'lucide-react';
import type { Supplier } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { canManageSuppliers, canReadSuppliers } from '@/lib/suppliers/suppliers-permissions';
import { listSuppliers } from '@/lib/suppliers/suppliers-api';
import { SupplierDialog } from './SupplierDialog';
import { SupplierHistoryDialog } from './SupplierHistoryDialog';

type StatusFilterValue = 'all' | 'active' | 'inactive';

const count = new Intl.NumberFormat('fa-IR');

export function SuppliersView() {
  const { user } = useAuth();
  const canRead = canReadSuppliers(user);
  const canManage = canManageSuppliers(user);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierCount, setSupplierCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState<StatusFilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<{ open: boolean; edit: Supplier | null }>({ open: false, edit: null });
  const [history, setHistory] = useState<Supplier | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listSuppliers(
      {
        offset: page * pageSize,
        limit: pageSize,
        ...(status === 'all' ? {} : { isActive: status === 'active' }),
      },
      controller.signal,
    )
      .then((result) => {
        setSuppliers(result.items);
        setSupplierCount(result.count);
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(failure instanceof Error ? failure.message : 'دریافت تأمین‌کنندگان ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, page, pageSize, status, reload]);

  if (!canRead) return (
    <>
      <PageHeader title="تأمین‌کنندگان" />
      <EmptyState
        icon={<Lock size={28} />}
        title="دسترسی ندارید"
        description="حساب شما برای مشاهدهٔ تأمین‌کنندگان مجوز suppliers.read ندارد."
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="تأمین‌کنندگان"
        eyebrow="تأمین و خرید"
        description="تأمین‌کنندگان واقعی با مجوز، ممیزی و کنترل نسخه؛ پایهٔ سفارش خرید و دریافت کالا."
        breadcrumbs={[{ label: 'تأمین و خرید' }, { label: 'تأمین‌کنندگان' }]}
        actions={canManage ? (
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialog({ open: true, edit: null })}>
            تأمین‌کننده جدید
          </Button>
        ) : undefined}
      />
      {!canManage ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          دسترسی شما فقط خواندنی است. ایجاد، ویرایش و غیرفعال‌سازی نیازمند suppliers.manage است.
        </Alert>
      ) : null}
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>
          {error}
        </Alert>
      ) : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          size="small" exclusive value={status} onChange={(_, next: StatusFilterValue | null) => {
            if (!next) return;
            setStatus(next);
            setPage(0);
          }}
        >
          <ToggleButton value="all">همه</ToggleButton>
          <ToggleButton value="active">فعال</ToggleButton>
          <ToggleButton value="inactive">غیرفعال</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {count.format(supplierCount)} تأمین‌کننده
          </Typography>
          <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>
            نوسازی
          </Button>
        </Stack>
      </Stack>
      <DataTable<Supplier>
        caption="فهرست تأمین‌کنندگان"
        columns={[
          { id: 'code', label: 'کد', render: (row) => <Typography dir="ltr" textAlign="start" fontWeight={700}>{row.code}</Typography> },
          { id: 'name', label: 'نام', render: (row) => row.name },
          { id: 'contact', label: 'تماس', render: (row) => row.mobile || row.phone || row.email || '—' },
          { id: 'economicCode', label: 'کد اقتصادی', render: (row) => <Typography dir="ltr" textAlign="start">{row.economicCode || '—'}</Typography> },
          {
            id: 'status',
            label: 'وضعیت',
            render: (row) => <StatusChip label={row.isActive ? 'فعال' : 'غیرفعال'} tone={row.isActive ? 'success' : 'neutral'} size="small" />,
          },
        ]}
        rows={suppliers} rowKey={(row) => row.id} loading={loading}
        emptyTitle="تأمین‌کننده‌ای ثبت نشده است"
        emptyDescription="برای شروع خرید، اولین تأمین‌کننده را ثبت کنید."
        rowCount={supplierCount} page={page} pageSize={pageSize}
        onPageChange={(next, size) => { setPage(next); setPageSize(size); }}
        actions={(row) => (
          <Stack direction="row" spacing={0.5}>
            <Button size="small" startIcon={<History size={16} />} onClick={() => setHistory(row)}>سابقه</Button>
            {canManage ? (
              <IconButton size="small" aria-label={`ویرایش تأمین‌کننده ${row.name}`} onClick={() => setDialog({ open: true, edit: row })}>
                <Edit size={17} />
              </IconButton>
            ) : null}
          </Stack>
        )}
        actionsLabel="عملیات"
      />
      {!canManage ? (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info" icon={<Truck size={18} />}>
            حذف سخت تأمین‌کننده در سیستم وجود ندارد؛ برای خروج از چرخهٔ خرید، آن را غیرفعال کنید تا سابقه و اسناد مالی حفظ شود.
          </Alert>
        </Box>
      ) : null}
      <SupplierDialog
        open={dialog.open} supplier={dialog.edit}
        onClose={() => setDialog({ open: false, edit: null })}
        onSaved={() => setReload((value) => value + 1)}
      />
      <SupplierHistoryDialog open={history !== null} supplier={history} onClose={() => setHistory(null)} />
    </>
  );
}
