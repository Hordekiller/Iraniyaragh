'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Lock, RefreshCw } from 'lucide-react';
import type { StockTransfer, TransferItem } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canApproveInventory, canReadInventory, canTransferInventory } from '@/lib/inventory/inventory-permissions';
import { getTransfer, type TransferAction } from '@/lib/inventory/transfers-api';
import { TransferActionDialog } from './TransferActionDialog';
import { transferLabels } from './TransfersView';

function identifier(value: string | null) {
  return <Typography variant="body2" dir="ltr" textAlign="start" sx={{ userSelect: 'text', wordBreak: 'break-all' }}>{value ?? '—'}</Typography>;
}

export function TransferDetailView({ transferId }: { transferId: string }) {
  const { user } = useAuth();
  const canTransfer = canTransferInventory(user);
  const canApprove = canApproveInventory(user);
  const canRead = canReadInventory(user);
  const [transfer, setTransfer] = useState<StockTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<TransferAction | null>(null);

  useEffect(() => {
    if (!canTransfer) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTransfer(transferId, controller.signal)
      .then(setTransfer)
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setTransfer(null);
        setError(failure instanceof Error ? failure.message : 'دریافت انتقال ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canTransfer, transferId, reload]);

  if (!canTransfer) return <><PageHeader title="جزئیات انتقال" /><EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز inventory.transfer ندارد." /></>;

  const actions: TransferAction[] = transfer ? transfer.status === 'DRAFT' ? ['request', 'cancel']
    : transfer.status === 'REQUESTED' ? [...(canApprove ? ['approve' as const] : []), 'cancel']
      : transfer.status === 'APPROVED' ? ['dispatch', 'cancel']
        : transfer.status === 'IN_TRANSIT' ? ['receive'] : [] : [];
  const actionLabels: Record<TransferAction, string> = { request: 'درخواست تأیید', approve: 'تأیید', dispatch: 'ارسال', receive: 'دریافت', cancel: 'لغو' };

  return <>
    <PageHeader title={transfer ? `انتقال ${transfer.code}` : 'جزئیات انتقال'} eyebrow="کالا و انبار" description="وضعیت و ردیف‌ها از API؛ خروج و ورود فیزیکی فقط با فرمان‌های مجاز ثبت می‌شود." breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'انتقال‌ها', href: '/transfers' }, { label: transfer?.code ?? 'جزئیات' }]}
      actions={<Button startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>} />
    {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{error}</Alert> : null}
    {loading ? <Typography>در حال دریافت انتقال…</Typography> : null}
    {!loading && !transfer && !error ? <EmptyState title="انتقال یافت نشد" description="شناسهٔ انتقال را بررسی کنید." /> : null}
    {transfer ? <>
      <Card variant="outlined" sx={{ mb: 3 }}><CardContent><Stack spacing={1.5}>
        <Typography>وضعیت: {transferLabels[transfer.status]}</Typography>
        <Typography>نسخهٔ انتقال: {transfer.version.toLocaleString('fa-IR')}</Typography>
        <Typography component="div">انبار مبدأ: {identifier(transfer.sourceWarehouseId)}</Typography>
        <Typography component="div">انبار مقصد: {identifier(transfer.targetWarehouseId)}</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {actions.map((item) => <Button key={item} variant={item === 'cancel' ? 'outlined' : 'contained'} color={item === 'cancel' || item === 'dispatch' ? 'warning' : 'primary'} onClick={() => setAction(item)}>{actionLabels[item]}</Button>)}
        </Stack>
        {transfer.status === 'REQUESTED' && !canApprove ? <Alert severity="info">تأیید نیازمند مجوز مستقل inventory.approve است.</Alert> : null}
      </Stack></CardContent></Card>
      <DataTable<TransferItem> caption="ردیف‌های انتقال" columns={[
        { id: 'variant', label: 'SKU', render: (row) => identifier(row.variantId) },
        { id: 'quantity', label: 'تعداد', render: (row) => row.quantity.toLocaleString('fa-IR') },
        { id: 'source', label: 'مکان مبدأ', render: (row) => identifier(row.sourceLocationId) },
        { id: 'target', label: 'مکان مقصد', render: (row) => identifier(row.targetLocationId) },
      ]} rows={transfer.items} rowKey={(row) => row.id} enableClientView />
      {canRead ? <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button component={Link} href={`/inventory?warehouseId=${encodeURIComponent(transfer.sourceWarehouseId)}`}>مانده و گردش مبدأ</Button>
        <Button component={Link} href={`/inventory?warehouseId=${encodeURIComponent(transfer.targetWarehouseId)}`}>مانده و گردش مقصد</Button>
      </Stack> : null}
    </> : null}
    {transfer && action ? <TransferActionDialog transfer={transfer} action={action} onClose={() => setAction(null)} onSaved={(updated) => setTransfer(updated)} /> : null}
  </>;
}
