'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Eye, Lock, RefreshCw } from 'lucide-react';
import type { AuditLogEntry } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listAuditLogs } from '@/lib/audit/audit-api';
import { canReadAuditLogs } from '@/lib/audit/audit-permissions';
import {
  describeAuditChange,
  entityTypeLabel,
  entityTypeLabels,
} from '@/lib/audit/audit-labels';

const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
const count = new Intl.NumberFormat('fa-IR');

export type AuditFilters = {
  entityType: string;
  action: string;
  entityId: string;
  createdFrom: string;
  createdToExclusive: string;
};

const EMPTY_FILTERS: AuditFilters = { entityType: '', action: '', entityId: '', createdFrom: '', createdToExclusive: '' };

function asJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DetailDialog({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  return (
    <Dialog open={entry !== null} onClose={onClose} maxWidth="md" fullWidth>
      {entry ? (
        <>
          <DialogTitle>جزئیات رویداد ممیزی</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Typography variant="body2"><b>کنش:</b> {describeAuditChange(entry)}</Typography>
              <Typography variant="body2"><b>موجودیت:</b> {entityTypeLabel(entry.entityType)} (شناسه: {entry.entityId ?? '—'})</Typography>
              <Typography variant="body2"><b>بازیگر:</b> {entry.actorLabel ?? 'سیستم / کاربر ناشناس'}</Typography>
              <Typography variant="body2"><b>زمان:</b> {dateTime.format(new Date(entry.createdAt))}</Typography>
              <Typography variant="body2"><b>شناسه درخواست:</b> <Typography component="span" dir="ltr">{entry.requestId ?? '—'}</Typography></Typography>
              {entry.ipHash ? <Typography variant="body2" dir="ltr"><b>IP:</b> {entry.ipHash.slice(0, 16)}…</Typography> : null}
              {entry.userAgent ? <Typography variant="body2" sx={{ wordBreak: 'break-word' }}><b>مرورگر:</b> {entry.userAgent}</Typography> : null}
            </Stack>
            {asJson(entry.before) ? (
              <>
                <Typography variant="subtitle2" sx={{ mt: 2 }}>قبل</Typography>
                <Box component="pre" dir="ltr" sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, overflow: 'auto', fontSize: 12, maxHeight: 220 }}>{asJson(entry.before)}</Box>
              </>
            ) : null}
            {asJson(entry.after) ? (
              <>
                <Typography variant="subtitle2" sx={{ mt: 2 }}>بعد</Typography>
                <Box component="pre" dir="ltr" sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, overflow: 'auto', fontSize: 12, maxHeight: 220 }}>{asJson(entry.after)}</Box>
              </>
            ) : null}
            {asJson(entry.metadata) ? (
              <>
                <Typography variant="subtitle2" sx={{ mt: 2 }}>متادیتا</Typography>
                <Box component="pre" dir="ltr" sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, overflow: 'auto', fontSize: 12, maxHeight: 220 }}>{asJson(entry.metadata)}</Box>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>بستن</Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}

export function AuditLogsView({ initialFilters = EMPTY_FILTERS }: { initialFilters?: AuditFilters }) {
  const { user } = useAuth();
  const canRead = canReadAuditLogs(user);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listAuditLogs({
      entityType: filters.entityType || undefined,
      action: filters.action.trim() || undefined,
      entityId: filters.entityId.trim() || undefined,
      createdFrom: filters.createdFrom || undefined,
      createdToExclusive: filters.createdToExclusive || undefined,
      offset: page * pageSize,
      limit: pageSize,
    }, controller.signal)
      .then((result) => { setItems(result.items); setTotal(result.count); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setItems([]); setTotal(0);
        setError(failure instanceof Error ? failure.message : 'دریافت گزارش ممیزی ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canRead, filters, page, pageSize, reload]);

  if (!canRead) return (
    <>
      <PageHeader title="گزارش ممیزی" />
      <EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما برای مشاهدهٔ گزارش ممیزی مجوز audit.read ندارد." />
    </>
  );

  return (
    <>
      <PageHeader
        title="گزارش ممیزی"
        eyebrow="سیستم"
        description="رویدادهای حساس ثبت‌شده (ورود، نشست، پرداخت، سفارش، ارسال، انبارگردانی و…) با قابلیت فیلتر و مشاهدهٔ جزئیات قبل/بعد."
        breadcrumbs={[{ label: 'سیستم' }, { label: 'گزارش ممیزی' }]}
      />
      <Box component="form" onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({
        entityType: draft.entityType, action: draft.action.trim(), entityId: draft.entityId.trim(),
        createdFrom: draft.createdFrom, createdToExclusive: draft.createdToExclusive,
      }); }} sx={{ mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} flexWrap="wrap">
          <TextField select size="small" label="موجودیت" value={draft.entityType} onChange={(event) => setDraft((current) => ({ ...current, entityType: event.target.value }))} sx={{ minWidth: 150 }}>
            <MenuItem value="">همه</MenuItem>
            {Object.keys(entityTypeLabels).map((value) => <MenuItem key={value} value={value}>{entityTypeLabel(value)}</MenuItem>)}
          </TextField>
          <TextField size="small" label="کنش" placeholder="مثلاً order.paid" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} inputProps={{ dir: 'ltr', spellCheck: false }} sx={{ minWidth: 200 }} />
          <TextField size="small" label="شناسه موجودیت" value={draft.entityId} onChange={(event) => setDraft((current) => ({ ...current, entityId: event.target.value }))} inputProps={{ dir: 'ltr' }} sx={{ minWidth: 180 }} />
          <TextField size="small" type="date" label="از تاریخ" value={draft.createdFrom} onChange={(event) => setDraft((current) => ({ ...current, createdFrom: event.target.value }))} sx={{ minWidth: 150 }} />
          <TextField size="small" type="date" label="تا تاریخ (انحصاری)" value={draft.createdToExclusive} onChange={(event) => setDraft((current) => ({ ...current, createdToExclusive: event.target.value }))} sx={{ minWidth: 160 }} />
          <Button type="submit" variant="outlined">اعمال فیلتر</Button>
          <Button type="button" startIcon={<RefreshCw size={16} />} onClick={() => setReload((value) => value + 1)}>نوسازی</Button>
        </Stack>
      </Box>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>{error}</Alert>
      ) : null}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">{count.format(total)} رویداد</Typography>
      </Stack>
      <DataTable<AuditLogEntry>
        caption="رویدادهای ممیزی"
        columns={[
          { id: 'createdAt', label: 'زمان', render: (row) => dateTime.format(new Date(row.createdAt)) },
          { id: 'action', label: 'کنش', render: (row) => <Typography variant="body2">{describeAuditChange(row)}</Typography> },
          { id: 'entityType', label: 'موجودیت', render: (row) => <Typography variant="body2">{entityTypeLabel(row.entityType)}{row.entityId ? <> <Typography component="span" color="text.secondary" dir="ltr">({row.entityId.slice(0, 12)}…)</Typography></> : null}</Typography> },
          { id: 'actor', label: 'بازیگر', render: (row) => row.actorLabel ?? 'سیستم' },
          { id: 'requestId', label: 'شناسه درخواست', render: (row) => row.requestId ? <Typography variant="body2" dir="ltr">{row.requestId.slice(0, 16)}…</Typography> : '—' },
        ]}
        rows={items} rowKey={(row) => row.id} loading={loading}
        rowCount={total} page={page} pageSize={pageSize}
        onPageChange={(next, size) => { setPage(next); setPageSize(size); }}
        emptyTitle="رویدادی یافت نشد"
        emptyDescription="فیلترها را تغییر دهید یا بعداً دوباره بررسی کنید."
        actions={(row) => (
          <Button size="small" startIcon={<Eye size={16} />} onClick={() => setDetail(row)}>جزئیات</Button>
        )}
        actionsLabel="عملیات"
      />
      <DetailDialog entry={detail} onClose={() => setDetail(null)} />
    </>
  );
}