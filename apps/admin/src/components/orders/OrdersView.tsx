'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Chip, MenuItem, Select, Stack, Typography } from '@mui/material';
import { Lock, ShoppingBag } from 'lucide-react';
import type { AdminOrderSummary } from '@/lib/orders/orders-types';
import { DataTable, type SortChange, type SortState } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  FULFILLMENT_STATUS_LABELS,
  formatCount,
  formatRial,
  orderStatusLabel,
  orderStatusTone,
  ORDER_STATUS_LABELS,
  paymentStatusLabel,
  paymentStatusTone,
  PAYMENT_STATUS_LABELS,
} from '@/lib/orders/orders-labels';
import { canReadOrders, canWriteOrders } from '@/lib/orders/orders-permissions';
import type { AdminOrdersQuery } from './useOrders';
import { useOrders } from './useOrders';

export type OrdersUrlQuery = {
  page?: string;
  perPage?: string;
  search?: string;
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  sortBy?: string;
  sortDir?: string;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function normalizeOrdersQuery(raw: OrdersUrlQuery): AdminOrdersQuery {
  const perPageRaw = Number.parseInt(raw.perPage ?? '', 10);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw) ? perPageRaw : 10;
  const pageRaw = Number.parseInt(raw.page ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const orderStatus: AdminOrdersQuery['orderStatus'] =
    raw.orderStatus && raw.orderStatus in ORDER_STATUS_LABELS
      ? (raw.orderStatus as AdminOrdersQuery['orderStatus'])
      : undefined;
  const paymentStatus: AdminOrdersQuery['paymentStatus'] =
    raw.paymentStatus && raw.paymentStatus in PAYMENT_STATUS_LABELS
      ? (raw.paymentStatus as AdminOrdersQuery['paymentStatus'])
      : undefined;
  const fulfillmentStatus: AdminOrdersQuery['fulfillmentStatus'] =
    raw.fulfillmentStatus && raw.fulfillmentStatus in FULFILLMENT_STATUS_LABELS
      ? (raw.fulfillmentStatus as AdminOrdersQuery['fulfillmentStatus'])
      : undefined;

  const sortBy = raw.sortBy === 'updatedAt' || raw.sortBy === 'totalRials' ? raw.sortBy : 'createdAt';
  const sortDir = raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'desc';

  return {
    page,
    perPage,
    search: raw.search?.trim() ? raw.search?.trim() : undefined,
    orderStatus,
    paymentStatus,
    fulfillmentStatus,
    sortBy,
    sortDir,
  };
}

function toUrl(query: AdminOrdersQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.perPage !== 10) params.set('perPage', String(query.perPage));
  if (query.search) params.set('search', query.search);
  if (query.orderStatus) params.set('orderStatus', query.orderStatus);
  if (query.paymentStatus) params.set('paymentStatus', query.paymentStatus);
  if (query.fulfillmentStatus) params.set('fulfillmentStatus', query.fulfillmentStatus);
  if (query.sortBy !== 'createdAt') params.set('sortBy', query.sortBy);
  if (query.sortDir !== 'desc') params.set('sortDir', query.sortDir);
  const serialized = params.toString();
  return serialized ? `/orders?${serialized}` : '/orders';
}

export function OrdersView({ initialQuery: raw }: { initialQuery: OrdersUrlQuery }) {
  const router = useRouter();
  const { user } = useAuth();
  const canRead = canReadOrders(user);
  const canWrite = canWriteOrders(user);

  const [query, setQuery] = useState<AdminOrdersQuery>(() => normalizeOrdersQuery(raw));

  const { items, meta, loading, error } = useOrders(query);

  const apply = (patch: Partial<AdminOrdersQuery>) => {
    const next = { ...query, ...patch, page: patch.page ?? 1 };
    setQuery(next);
    router.replace(toUrl(next), { scroll: false });
  };

  const sortState: SortState = { columnId: query.sortBy, direction: query.sortDir };

  if (!canRead) {
    return (
      <>
        <PageHeader title="سفارش‌ها" description="صف عملیات سفارش‌ها." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ سفارش‌ها مجوز ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="سفارش‌ها"
        eyebrow="فروش و مشتری"
        description="صف خواندنی سفارش‌ها با جستجو و فیلتر جداگانهٔ چرخهٔ سفارش، پرداخت و ارسال. وضعیت‌ها هرگز در یک ستون ادغام نمی‌شوند."
        breadcrumbs={[{ label: 'فروش و مشتری' }, { label: 'سفارش‌ها' }]}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              color="info"
              variant="outlined"
              icon={<ShoppingBag size={15} />}
              label={`${meta ? formatCount(meta.total) : '…'} سفارش`}
            />
          </Stack>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن به سفارش‌ها دارد؛ عملیات اجرایی (تغییر وضعیت، پردازش و ارسال) در این نسخهٔ پایه
          ارائه نشده است و پس از اتصال سرویس سفارش فعال می‌شود.
        </Alert>
      ) : null}

      <DataTable<AdminOrderSummary>
        caption="فهرست سفارش‌ها"
        columns={[
          {
            id: 'orderNumber',
            label: 'سفارش',
            width: 220,
            render: (row) => (
              <Box>
                <Typography component={Link} href={`/orders/${row.id}`} fontWeight={700} variant="body2">
                  {row.orderNumber}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.customer.fullName}
                  <span dir="ltr"> · {row.customer.mobile}</span>
                </Typography>
              </Box>
            ),
          },
          {
            id: 'orderStatus',
            label: 'وضعیت سفارش',
            render: (row) => (
              <StatusChip label={orderStatusLabel(row.orderStatus)} tone={orderStatusTone(row.orderStatus)} />
            ),
          },
          {
            id: 'paymentStatus',
            label: 'وضعیت پرداخت',
            render: (row) => (
              <StatusChip label={paymentStatusLabel(row.paymentStatus)} tone={paymentStatusTone(row.paymentStatus)} />
            ),
          },
          {
            id: 'fulfillmentStatus',
            label: 'وضعیت ارسال',
            render: (row) => (
              <StatusChip
                label={fulfillmentStatusLabel(row.fulfillmentStatus)}
                tone={fulfillmentStatusTone(row.fulfillmentStatus)}
              />
            ),
          },
          {
            id: 'totalRials',
            label: 'مبلغ',
            sortable: true,
            render: (row) => <Typography variant="body2">{formatRial(row.totalRials)}</Typography>,
          },
          {
            id: 'createdAt',
            label: 'تاریخ ثبت',
            sortable: true,
            render: (row) => (
              <Typography variant="body2" color="text.secondary">
                {faDateTime.format(new Date(row.createdAt))}
              </Typography>
            ),
          },
        ]}
        rows={items}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        emptyTitle="سفارشی یافت نشد"
        emptyDescription={
          query.search || query.orderStatus || query.paymentStatus || query.fulfillmentStatus
            ? 'با فیلترهای فعلی سفارشی وجود ندارد؛ فیلترها را تغییر دهید.'
            : 'هنوز سفارشی ثبت نشده است.'
        }
        search={query.search ?? ''}
        onSearchChange={(search) => apply({ search })}
        searchPlaceholder="جستجوی شماره‌سفارش، نام یا موبایل…"
        sort={sortState}
        onSortChange={(next: SortChange) => apply({ sortBy: next.columnId as AdminOrdersQuery['sortBy'], sortDir: next.direction })}
        rowCount={meta?.total ?? 0}
        page={query.page - 1}
        pageSize={query.perPage}
        onPageChange={(page, perPage) => apply({ page: page + 1, perPage })}
        toolbar={
          <>
            <Select
              size="small"
              value={query.orderStatus ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت سفارش' }}
              sx={{ minWidth: 150 }}
              onChange={(event) =>
                apply({ orderStatus: (event.target.value || undefined) as AdminOrdersQuery['orderStatus'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌های سفارش</MenuItem>
              {(Object.keys(ORDER_STATUS_LABELS) as (keyof typeof ORDER_STATUS_LABELS)[]).map((status) => (
                <MenuItem key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={query.paymentStatus ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت پرداخت' }}
              sx={{ minWidth: 150 }}
              onChange={(event) =>
                apply({ paymentStatus: (event.target.value || undefined) as AdminOrdersQuery['paymentStatus'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌های پرداخت</MenuItem>
              {(Object.keys(PAYMENT_STATUS_LABELS) as (keyof typeof PAYMENT_STATUS_LABELS)[]).map((status) => (
                <MenuItem key={status} value={status}>
                  {PAYMENT_STATUS_LABELS[status]}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={query.fulfillmentStatus ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت ارسال' }}
              sx={{ minWidth: 160 }}
              onChange={(event) =>
                apply({ fulfillmentStatus: (event.target.value || undefined) as AdminOrdersQuery['fulfillmentStatus'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌های ارسال</MenuItem>
              {(Object.keys(FULFILLMENT_STATUS_LABELS) as (keyof typeof FULFILLMENT_STATUS_LABELS)[]).map((status) => (
                <MenuItem key={status} value={status}>
                  {FULFILLMENT_STATUS_LABELS[status]}
                </MenuItem>
              ))}
            </Select>
          </>
        }
      />
    </>
  );
}