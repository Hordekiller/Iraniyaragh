'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { Supplier, SupplierAuditEntry } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { ApiAbortError } from '@/lib/api/client';
import { listSupplierHistory } from '@/lib/suppliers/suppliers-api';

type Props = { open: boolean; supplier: Supplier | null; onClose: () => void };

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, string> = {
  'supplier.created': 'ایجاد',
  'supplier.updated': 'ویرایش',
  'supplier.deactivated': 'غیرفعال‌سازی',
};

const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

export function SupplierHistoryDialog({ open, supplier, onClose }: Props) {
  const [entries, setEntries] = useState<SupplierAuditEntry[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open || !supplier) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listSupplierHistory(supplier.id, { offset: page * PAGE_SIZE, limit: PAGE_SIZE }, controller.signal)
      .then((result) => {
        setEntries(result.items);
        setCount(result.count);
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(failure instanceof Error ? failure.message : 'دریافت سابقهٔ تأمین‌کننده ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, supplier, page, reload]);

  useEffect(() => {
    if (open) setPage(0);
  }, [open, supplier]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="supplier-history-title">
      <DialogTitle id="supplier-history-title">سابقهٔ تغییرات {supplier?.name ?? ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error ? (
            <Alert severity="error" action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>
              {error}
            </Alert>
          ) : null}
          <DataTable<SupplierAuditEntry>
            caption={`سابقهٔ تغییرات تأمین‌کننده ${supplier?.code ?? ''}`}
            columns={[
              {
                id: 'action',
                label: 'عملیات',
                render: (row) => <Chip size="small" label={ACTION_LABELS[row.action] ?? row.action} />,
              },
              {
                id: 'actor',
                label: 'عامل',
                render: (row) => <Typography dir="ltr" textAlign="start">{row.actorId ?? 'سیستم'}</Typography>,
              },
              {
                id: 'createdAt',
                label: 'زمان',
                render: (row) => <Typography textAlign="start">{dateTime.format(new Date(row.createdAt))}</Typography>,
              },
            ]}
            rows={entries} rowKey={(row) => row.id} loading={loading}
            emptyTitle="سابقه‌ای ثبت نشده است" emptyDescription="برای این تأمین‌کننده هنوز تغییری ثبت نشده است."
            rowCount={count} page={page} pageSize={PAGE_SIZE}
            onPageChange={(next) => setPage(next)}
            actionsLabel="عملیات"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>بستن</Button>
      </DialogActions>
    </Dialog>
  );
}
