'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { History, Lock, Plus, RefreshCw } from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderAuditEntry, PurchaseOrderStatus } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { ApiAbortError, ApiNetworkError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getPurchaseOrder, listPurchaseOrderHistory, listPurchaseOrders, newPurchaseOrderCommandKey, transitionPurchaseOrder } from '@/lib/purchasing/purchase-orders-api';
import { canApprovePurchaseOrders, canManagePurchaseOrders, canReadPurchaseOrders } from '@/lib/purchasing/purchase-orders-permissions';
import { PurchaseOrderFormDialog, purchaseOrderError } from './PurchaseOrderFormDialog';

const statuses: { value: PurchaseOrderStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'همه' }, { value: 'DRAFT', label: 'پیش‌نویس' },
  { value: 'APPROVED', label: 'تأییدشده' }, { value: 'PARTIALLY_RECEIVED', label: 'دریافت ناقص' },
  { value: 'RECEIVED', label: 'دریافت‌شده' }, { value: 'CANCELLED', label: 'لغوشده' },
];
const statusLabel = (status: PurchaseOrderStatus) => statuses.find(item => item.value === status)?.label ?? status;
const formatNumber = (value: string | number | bigint) => new Intl.NumberFormat('fa-IR').format(typeof value === 'string' ? BigInt(value) : value);

export function PurchaseOrdersView() {
  const { user } = useAuth();
  const canRead = canReadPurchaseOrders(user);
  const canManage = canManagePurchaseOrders(user);
  const canApprove = canApprovePurchaseOrders(user);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState<PurchaseOrderStatus | 'ALL'>('ALL');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [history, setHistory] = useState<PurchaseOrderAuditEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; order: PurchaseOrder | null }>({ open: false, order: null });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    listPurchaseOrders({ offset: page * pageSize, limit: pageSize, ...(status === 'ALL' ? {} : { status }) }, controller.signal)
      .then(result => { setOrders(result.items); setCount(result.count); })
      .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError)) setError(failure instanceof Error ? failure.message : 'دریافت سفارش‌ها ناموفق بود.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, page, pageSize, status, reload]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setHistoryError(null);
    listPurchaseOrderHistory(selected.id, controller.signal)
      .then(result => setHistory(result.items))
      .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError)) setHistoryError('دریافت سابقه ناموفق بود.'); });
    return () => controller.abort();
  }, [selected]);

  function saved(order: PurchaseOrder) {
    setForm({ open: false, order: null }); setHistory([]); setSelected(order); setReload(value => value + 1);
    setActionError(null); setUncertain(false);
  }

  async function refreshSelected() {
    if (!selected) return;
    try { setSelected(await getPurchaseOrder(selected.id)); setUncertain(false); setActionError(null); setReload(value => value + 1); }
    catch (failure) { setActionError(purchaseOrderError(failure)); }
  }

  async function transition(action: 'approve' | 'cancel') {
    if (!selected || actionBusy || uncertain) return;
    if (!globalThis.confirm(action === 'approve' ? 'سفارش خرید پس از تأیید دیگر قابل ویرایش نیست. تأیید می‌کنید؟' : 'سفارش خرید لغو شود؟')) return;
    setActionBusy(true); setActionError(null);
    try {
      const result = await transitionPurchaseOrder(selected.id, action, { expectedVersion: selected.version }, newPurchaseOrderCommandKey());
      setSelected(result); setReload(value => value + 1);
    } catch (failure) {
      setActionError(purchaseOrderError(failure));
      if (failure instanceof ApiNetworkError) setUncertain(true);
    } finally { setActionBusy(false); }
  }

  if (!canRead) return <><PageHeader title="سفارش‌های خرید" /><EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="برای مشاهدهٔ سفارش‌های خرید، مجوز purchasing.read لازم است." /></>;
  return <>
    <PageHeader title="سفارش‌های خرید" eyebrow="تأمین و خرید" description="پیش‌نویس، بازبینی و تأیید سفارش خرید؛ دریافت کالا در مرحلهٔ بعدی ثبت می‌شود." breadcrumbs={[{ label: 'تأمین و خرید' }, { label: 'سفارش‌های خرید' }]} actions={canManage ? <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setForm({ open: true, order: null })}>سفارش جدید</Button> : undefined} />
    {!canManage ? <Alert severity="info" sx={{ mb: 2 }}>دسترسی شما فقط خواندنی است. ایجاد یا لغو سفارش به purchasing.manage نیاز دارد.</Alert> : null}
    {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload(value => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
      <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}><ToggleButtonGroup size="small" exclusive value={status} onChange={(_, next: PurchaseOrderStatus | 'ALL' | null) => { if (next) { setStatus(next); setPage(0); } }}>
        {statuses.map(item => <ToggleButton key={item.value} value={item.value}>{item.label}</ToggleButton>)}
      </ToggleButtonGroup></Box>
      <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => setReload(value => value + 1)}>نوسازی</Button>
    </Stack>
    <DataTable<PurchaseOrder> caption="فهرست سفارش‌های خرید" rows={orders} rowKey={row => row.id} loading={loading}
      rowCount={count} page={page} pageSize={pageSize} onPageChange={(next, size) => { setPage(next); setPageSize(size); }}
      emptyTitle="سفارش خریدی ثبت نشده است" emptyDescription="در صورت داشتن مجوز، یک پیش‌نویس سفارش خرید ایجاد کنید."
      columns={[
        { id: 'number', label: 'شماره', render: row => <Typography dir="ltr" textAlign="start" fontWeight={700}>{row.number}</Typography> },
        { id: 'status', label: 'وضعیت', render: row => <StatusChip label={statusLabel(row.status)} tone={row.status === 'APPROVED' || row.status === 'RECEIVED' ? 'success' : 'neutral'} size="small" /> },
        { id: 'items', label: 'اقلام', render: row => formatNumber(row.items.length) },
        { id: 'totalCost', label: 'جمع (ریال)', render: row => formatNumber(row.totalCost) },
        { id: 'createdAt', label: 'تاریخ', render: row => new Date(row.createdAt).toLocaleString('fa-IR') },
      ]}
      actions={row => <Button size="small" onClick={() => { setHistory([]); setSelected(row); setActionError(null); setUncertain(false); }}>جزئیات</Button>}
    />
    <PurchaseOrderFormDialog open={form.open} order={form.order} onClose={() => setForm({ open: false, order: null })} onSaved={saved} />
    <Dialog open={Boolean(selected)} onClose={actionBusy ? undefined : () => setSelected(null)} fullWidth maxWidth="md" aria-labelledby="po-detail-title">
      <DialogTitle id="po-detail-title">سفارش خرید {selected?.number}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
        {actionError ? <Alert severity="error">{actionError}</Alert> : null}
        {selected ? <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <StatusChip label={statusLabel(selected.status)} tone={selected.status === 'APPROVED' || selected.status === 'RECEIVED' ? 'success' : 'neutral'} />
            <Typography>نسخه {formatNumber(selected.version)}</Typography>
            <Typography>تأمین‌کننده: <span dir="ltr">{selected.supplierId}</span></Typography>
            <Typography>انبار: <span dir="ltr">{selected.warehouseId}</span></Typography>
          </Stack>
          <Typography>زمان مورد انتظار: {selected.expectedAt ? new Date(selected.expectedAt).toLocaleString('fa-IR') : '—'}</Typography>
          <Typography>یادداشت: {selected.notes || '—'}</Typography>
          <Divider />
          <DataTable caption="اقلام سفارش خرید" rows={selected.items} rowKey={row => row.id} columns={[
            { id: 'sku', label: 'SKU', render: row => <span dir="ltr">{row.sku}</span> },
            { id: 'ordered', label: 'تعداد سفارش', render: row => formatNumber(row.orderedQty) },
            { id: 'received', label: 'تعداد دریافت', render: row => formatNumber(row.receivedQty) },
            { id: 'unitCost', label: 'بهای واحد (ریال)', render: row => formatNumber(row.unitCost) },
            { id: 'lineCost', label: 'جمع (ریال)', render: row => formatNumber(row.lineCost) },
          ]} />
          <Typography fontWeight={700}>جمع کل: {formatNumber(selected.totalCost)} ریال</Typography>
          <Divider />
          <Typography variant="subtitle1" fontWeight={700}><History size={16} aria-hidden="true" /> سابقهٔ عملیات</Typography>
          {historyError ? <Alert severity="error">{historyError}</Alert> : null}
          {history.map(entry => <Typography key={entry.id} variant="body2">{new Date(entry.createdAt).toLocaleString('fa-IR')} — {entry.action} — {entry.actorId || 'سیستم'}</Typography>)}
        </> : null}
      </Stack></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button onClick={() => setSelected(null)} disabled={actionBusy}>بستن</Button>
        <Button onClick={() => void refreshSelected()} disabled={actionBusy} startIcon={<RefreshCw size={16} />}>نوسازی جزئیات</Button>
        {canManage && selected?.status === 'DRAFT' ? <Button onClick={() => { setForm({ open: true, order: selected }); setSelected(null); }} disabled={actionBusy || uncertain}>ویرایش پیش‌نویس</Button> : null}
        {canApprove && selected?.status === 'DRAFT' ? <Button variant="contained" onClick={() => void transition('approve')} disabled={actionBusy || uncertain}>تأیید سفارش</Button> : null}
        {canManage && (selected?.status === 'DRAFT' || selected?.status === 'APPROVED') ? <Button color="error" onClick={() => void transition('cancel')} disabled={actionBusy || uncertain}>لغو سفارش</Button> : null}
      </DialogActions>
    </Dialog>
  </>;
}
