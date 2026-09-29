'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, Lock, Truck } from 'lucide-react';
import type { AdminShipmentDetail, AdminShipmentSummary } from '@/lib/shipments/shipments-types';
import { DataTable, type SortChange, type SortState } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { getShipment } from '@/lib/shipments/shipments-api';
import {
  describeShipmentCount,
  formatCount,
  shipmentEventActor,
  shipmentEventKindLabel,
  shipmentEventTransition,
  shipmentStatusLabel,
  shipmentStatusTone,
  SHIPMENT_STATUS_LABELS,
} from '@/lib/shipments/shipments-labels';
import { canReadShipments } from '@/lib/shipments/shipments-permissions';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@/lib/shipments/shipments-types';
import { useShipments, type AdminShipmentsQuery } from './useShipments';

export type ShipmentsUrlQuery = {
  page?: string;
  perPage?: string;
  status?: string;
  carrier?: string;
  trackingCode?: string;
  dispatchedFrom?: string;
  dispatchedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

/** `YYYY-MM-DD` for a `<input type="date">` value, in UTC. */
function toDateInput(instant: string | undefined): string {
  return instant ? instant.slice(0, 10) : '';
}

/**
 * The API filters `dispatchedTo` with an inclusive instant, so the day inputs
 * are widened to the real UTC day bounds instead of silently excluding the
 * selected day.
 */
function startOfDay(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}

function endOfDay(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

export function normalizeShipmentsQuery(raw: ShipmentsUrlQuery): AdminShipmentsQuery {
  const perPageRaw = Number.parseInt(raw.perPage ?? '', 10);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw) ? perPageRaw : 10;
  const pageRaw = Number.parseInt(raw.page ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const status = (SHIPMENT_STATUSES as readonly string[]).includes(raw.status ?? '')
    ? (raw.status as ShipmentStatus)
    : undefined;

  const sortBy =
    raw.sortBy === 'orderNumber' || raw.sortBy === 'carrier' ? raw.sortBy : 'dispatchedAt';
  const sortDir = raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'desc';

  return {
    page,
    perPage,
    status,
    carrier: raw.carrier?.trim() ? raw.carrier.trim() : undefined,
    trackingCode: raw.trackingCode?.trim() ? raw.trackingCode.trim() : undefined,
    dispatchedFrom: raw.dispatchedFrom?.trim() ? raw.dispatchedFrom.trim() : undefined,
    dispatchedTo: raw.dispatchedTo?.trim() ? raw.dispatchedTo.trim() : undefined,
    sortBy,
    sortDir,
  };
}

function toUrl(query: AdminShipmentsQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.perPage !== 10) params.set('perPage', String(query.perPage));
  if (query.status) params.set('status', query.status);
  if (query.carrier) params.set('carrier', query.carrier);
  if (query.trackingCode) params.set('trackingCode', query.trackingCode);
  if (query.dispatchedFrom) params.set('dispatchedFrom', query.dispatchedFrom);
  if (query.dispatchedTo) params.set('dispatchedTo', query.dispatchedTo);
  if (query.sortBy !== 'dispatchedAt') params.set('sortBy', query.sortBy);
  if (query.sortDir !== 'desc') params.set('sortDir', query.sortDir);
  const serialized = params.toString();
  return serialized ? `/shipments?${serialized}` : '/shipments';
}

type ShipmentDetailState = {
  detail: AdminShipmentDetail | null;
  loading: boolean;
  error: string | null;
};

function ShipmentDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [state, setState] = useState<ShipmentDetailState>({
    detail: null,
    loading: false,
    error: null,
  });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    setState({ detail: null, loading: true, error: null });
    getShipment(id, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setState({ detail, loading: false, error: null });
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setState({
          detail: null,
          loading: false,
          error:
            failure instanceof Error
              ? failure.message
              : 'دریافت جزئیات ارسال ناموفق بود.',
        });
      });
    return () => controller.abort();
  }, [id, reload]);

  return (
    <Dialog open={id !== null} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>جزئیات ارسال</DialogTitle>
      <DialogContent dividers>
        {state.loading ? (
          <Typography variant="body2">در حال بارگذاری جزئیات…</Typography>
        ) : null}
        {state.error ? (
          <Alert
            severity="error"
            action={
              <Button size="small" onClick={() => setReload((value) => value + 1)}>
                تلاش دوباره
              </Button>
            }
          >
            {state.error}
          </Alert>
        ) : null}
        {state.detail ? <ShipmentDetailBody detail={state.detail} /> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>بستن</Button>
      </DialogActions>
    </Dialog>
  );
}

function ShipmentDetailBody({ detail }: { detail: AdminShipmentDetail }) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        <b>سفارش:</b>{' '}
        <Typography component={Link} href={`/orders/${detail.orderId}`} variant="body2">
          {detail.orderNumber}
        </Typography>
      </Typography>
      <Typography variant="body2">
        <b>وضعیت:</b> {shipmentStatusLabel(detail.status)}
      </Typography>
      <Typography variant="body2">
        <b>شرکت حمل:</b> {detail.carrier}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: 'right' }} dir="ltr">
        <b>کد رهگیری:</b> {detail.trackingCode}
      </Typography>
      <Typography variant="body2">
        <b>زمان ارسال:</b> {faDateTime.format(new Date(detail.dispatchedAt))}
      </Typography>
      <Typography variant="body2">
        <b>مشتری:</b> {detail.customer.displayNameMasked ?? 'نام ثبت نشده'}{' '}
        <Typography component="span" dir="ltr" variant="body2" color="text.secondary">
          {detail.customer.mobileMasked}
        </Typography>
      </Typography>
      <Typography variant="body2">
        <b>ثبت‌کنندهٔ ارسال:</b> {detail.dispatchedBy?.displayNameMasked ?? 'سیستم'}
      </Typography>

      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        آدرس مقصد (نمایش محرمانه)
      </Typography>
      {detail.address ? (
        <Box>
          <Typography variant="body2">
            {detail.address.provinceCode} — {detail.address.city}
          </Typography>
          <Typography variant="body2">نشانی: {detail.address.addressMasked}</Typography>
          <Typography variant="body2" sx={{ textAlign: 'right' }} dir="ltr">
            کد پستی: {detail.address.postalCodeMasked}
          </Typography>
          <Typography variant="body2">گیرنده: {detail.address.recipientMasked}</Typography>
          <Typography variant="body2" sx={{ textAlign: 'right' }} dir="ltr">
            موبایل: {detail.address.mobileMasked}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          آدرس ثبت‌شده برای این ارسال قابل نمایش نیست.
        </Typography>
      )}

      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        اقلام ارسالی
      </Typography>
      <DataTable<AdminShipmentDetail['lines'][number]>
        caption="اقلام ارسالی"
        columns={[
          {
            id: 'productTitle',
            label: 'کالا',
            render: (row) => <Typography variant="body2">{row.productTitle}</Typography>,
          },
          {
            id: 'sku',
            label: 'کد کالا',
            render: (row) => (
              <Typography variant="body2" dir="ltr">
                {row.sku}
              </Typography>
            ),
          },
          {
            id: 'quantity',
            label: 'تعداد',
            render: (row) => <Typography variant="body2">{formatCount(row.quantity)}</Typography>,
          },
        ]}
        rows={detail.lines}
        rowKey={(row) => row.orderItemId}
        emptyTitle="قلمی ثبت نشده"
        emptyDescription="برای این ارسال قلم کالایی ثبت نشده است."
      />

      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        رویدادهای ارسال
      </Typography>
      {detail.timeline.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          رویدادی برای این ارسال ثبت نشده است.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {detail.timeline.map((event) => (
            <Box
              key={event.id}
              sx={{ borderRight: 3, borderColor: 'primary.main', pr: 1.5, py: 0.5 }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="body2" fontWeight={700}>
                  {shipmentEventKindLabel(event.kind)}
                </Typography>
                <StatusChip
                  label={shipmentStatusLabel(event.to)}
                  tone={shipmentStatusTone(event.to)}
                />
                <Typography variant="caption" color="text.secondary">
                  {faDateTime.format(new Date(event.createdAt))}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {shipmentEventTransition(event)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ثبت‌کننده: {shipmentEventActor(event)}
              </Typography>
              {event.proofReference ? (
                <Typography variant="caption" sx={{ textAlign: 'right' }} dir="ltr">
                  مدرک تحویل: {event.proofReference}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CarrierFilter({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <TextField
      size="small"
      label="شرکت حمل"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(draft.trim());
        }
      }}
      inputProps={{ 'aria-label': 'فیلتر شرکت حمل', dir: 'ltr' }}
      sx={{ minWidth: 150 }}
    />
  );
}

function DispatchDateFilters({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (next: { dispatchedFrom?: string; dispatchedTo?: string }) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(toDateInput(from));
  const [draftTo, setDraftTo] = useState(toDateInput(to));

  return (
    <>
      <TextField
        size="small"
        type="date"
        label="ارسال از تاریخ"
        value={draftFrom}
        onChange={(event) => {
          const value = event.target.value;
          setDraftFrom(value);
          onChange({ dispatchedFrom: startOfDay(value), dispatchedTo: endOfDay(draftTo) });
        }}
        InputLabelProps={{ shrink: true }}
        inputProps={{ 'aria-label': 'فیلتر تاریخ شروع ارسال' }}
        sx={{ minWidth: 160 }}
      />
      <TextField
        size="small"
        type="date"
        label="ارسال تا تاریخ"
        value={draftTo}
        onChange={(event) => {
          const value = event.target.value;
          setDraftTo(value);
          onChange({ dispatchedFrom: startOfDay(draftFrom), dispatchedTo: endOfDay(value) });
        }}
        InputLabelProps={{ shrink: true }}
        inputProps={{ 'aria-label': 'فیلتر تاریخ پایان ارسال' }}
        sx={{ minWidth: 160 }}
      />
    </>
  );
}

export function ShipmentsView({ initialQuery: raw }: { initialQuery: ShipmentsUrlQuery }) {
  const router = useRouter();
  const { user } = useAuth();
  const canRead = canReadShipments(user);
  const [query, setQuery] = useState<AdminShipmentsQuery>(() => normalizeShipmentsQuery(raw));
  const { items, meta, loading, error } = useShipments(query, canRead);
  const [detailId, setDetailId] = useState<string | null>(null);

  const apply = (patch: Partial<AdminShipmentsQuery>) => {
    const next = { ...query, ...patch, page: patch.page ?? 1 };
    setQuery(next);
    router.replace(toUrl(next), { scroll: false });
  };

  const sortState: SortState = { columnId: query.sortBy, direction: query.sortDir };

  if (!canRead) {
    return (
      <>
        <PageHeader title="ارسال‌ها" description="صف خواندنی بسته‌های ارسال‌شده." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ ارسال‌ها مجوز ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="ارسال‌ها"
        eyebrow="فروش و مشتری"
        description="بسته‌های ارسال‌شده به همراه شرکت حمل، کد رهگیری و مقصد. اطلاعات مشتری بهصورت محرمانه نمایش داده می‌شود."
        breadcrumbs={[{ label: 'فروش و مشتری' }, { label: 'ارسال‌ها' }]}
        actions={
          <Chip
            size="small"
            color="info"
            variant="outlined"
            icon={<Truck size={15} />}
            label={`${meta ? formatCount(meta.total) : '…'} ارسال`}
          />
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        این صفحه به API خواندنی ارسال‌ها متصل است. ثبت ارسال و تأیید تحویل از صفحهٔ سفارش انجام می‌شود.
      </Alert>

      <DataTable<AdminShipmentSummary>
        caption="فهرست ارسال‌ها"
        columns={[
          {
            id: 'orderNumber',
            label: 'سفارش',
            width: 200,
            render: (row) => (
              <Box>
                <Typography component={Link} href={`/orders/${row.orderId}`} fontWeight={700} variant="body2">
                  {row.orderNumber}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.customer.displayNameMasked ?? 'نام ثبت نشده'}
                  <span dir="ltr"> · {row.customer.mobileMasked}</span>
                </Typography>
              </Box>
            ),
          },
          {
            id: 'status',
            label: 'وضعیت',
            render: (row) => (
              <StatusChip
                label={shipmentStatusLabel(row.status)}
                tone={shipmentStatusTone(row.status)}
              />
            ),
          },
          {
            id: 'carrier',
            label: 'شرکت حمل',
            sortable: true,
            render: (row) => <Typography variant="body2">{row.carrier}</Typography>,
          },
          {
            id: 'trackingCode',
            label: 'کد رهگیری',
            render: (row) => (
              <Typography variant="body2" dir="ltr">
                {row.trackingCode}
              </Typography>
            ),
          },
          {
            id: 'city',
            label: 'مقصد',
            render: (row) => <Typography variant="body2">{row.city ?? '—'}</Typography>,
          },
          {
            id: 'totalQuantity',
            label: 'اقلام',
            render: (row) => (
              <Typography variant="body2">
                {describeShipmentCount(row.itemCount, row.totalQuantity)}
              </Typography>
            ),
          },
          {
            id: 'dispatchedAt',
            label: 'زمان ارسال',
            sortable: true,
            render: (row) => (
              <Typography variant="body2" color="text.secondary">
                {faDateTime.format(new Date(row.dispatchedAt))}
              </Typography>
            ),
          },
        ]}
        rows={items}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        emptyTitle="ارسالی یافت نشد"
        emptyDescription={
          query.status || query.carrier || query.trackingCode
            ? 'با فیلترهای فعلی ارسالی وجود ندارد؛ فیلترها را تغییر دهید.'
            : 'هنوز ارسالی ثبت نشده است.'
        }
        search={query.trackingCode ?? ''}
        onSearchChange={(trackingCode) => apply({ trackingCode })}
        searchPlaceholder="جستجو با کد رهگیری…"
        sort={sortState}
        onSortChange={(next: SortChange) =>
          apply({
            sortBy: next.columnId as AdminShipmentsQuery['sortBy'],
            sortDir: next.direction,
          })
        }
        rowCount={meta?.total ?? 0}
        page={query.page - 1}
        pageSize={query.perPage}
        onPageChange={(page, perPage) => apply({ page: page + 1, perPage })}
        actions={(row) => (
          <Button size="small" startIcon={<Eye size={16} />} onClick={() => setDetailId(row.id)}>
            جزئیات
          </Button>
        )}
        actionsLabel="عملیات"
        toolbar={
          <>
            <CarrierFilter value={query.carrier ?? ''} onCommit={(carrier) => apply({ carrier })} />
            <DispatchDateFilters
              from={query.dispatchedFrom}
              to={query.dispatchedTo}
              onChange={(next) => apply(next)}
            />
            <Select
              size="small"
              value={query.status ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت ارسال' }}
              sx={{ minWidth: 160 }}
              onChange={(event) =>
                apply({ status: (event.target.value || undefined) as AdminShipmentsQuery['status'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌های ارسال</MenuItem>
              {SHIPMENT_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>
                  {SHIPMENT_STATUS_LABELS[status]}
                </MenuItem>
              ))}
            </Select>
          </>
        }
      />

      <ShipmentDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
