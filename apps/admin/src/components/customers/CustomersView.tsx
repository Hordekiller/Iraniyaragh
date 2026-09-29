'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { Eye, Lock, Plus, Users } from 'lucide-react';
import type { AdminCustomerDetail, AdminCustomerSummary } from '@iranyaragh/contracts';
import { DataTable, type SortChange, type SortState } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  CUSTOMER_STATUS_LABELS,
  customerDisplayName,
  customerStatusLabel,
  customerStatusTone,
  formatCount,
} from '@/lib/customers/customers-labels';
import { canManageCustomers, canReadCustomers } from '@/lib/customers/customers-permissions';
import { CustomerAddressesDialog } from './CustomerAddressesDialog';
import { CustomerDetailDialog } from './CustomerDetailDialog';
import { CustomerDialog } from './CustomerDialog';
import { CustomerNoteDialog } from './CustomerNoteDialog';
import { useCustomers, type AdminCustomersQuery } from './useCustomers';

export type CustomersUrlQuery = {
  page?: string;
  perPage?: string;
  search?: string;
  status?: string;
  hasUserAccount?: string;
  sortBy?: string;
  sortDir?: string;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });

export function normalizeCustomersQuery(raw: CustomersUrlQuery): AdminCustomersQuery {
  const perPageRaw = Number.parseInt(raw.perPage ?? '', 10);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw) ? perPageRaw : 10;
  const pageRaw = Number.parseInt(raw.page ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const status = raw.status === 'ACTIVE' || raw.status === 'INACTIVE' ? raw.status : undefined;
  const hasUserAccount =
    raw.hasUserAccount === 'true' ? true : raw.hasUserAccount === 'false' ? false : undefined;

  const sortBy =
    raw.sortBy === 'mobile' || raw.sortBy === 'lastName' || raw.sortBy === 'orderCount'
      ? raw.sortBy
      : 'createdAt';
  const sortDir = raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'desc';

  return {
    page,
    perPage,
    search: raw.search?.trim() ? raw.search.trim() : undefined,
    status,
    hasUserAccount,
    sortBy,
    sortDir,
  };
}

function toUrl(query: AdminCustomersQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.perPage !== 10) params.set('perPage', String(query.perPage));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.hasUserAccount !== undefined) {
    params.set('hasUserAccount', String(query.hasUserAccount));
  }
  if (query.sortBy !== 'createdAt') params.set('sortBy', query.sortBy);
  if (query.sortDir !== 'desc') params.set('sortDir', query.sortDir);
  const serialized = params.toString();
  return serialized ? `/customers?${serialized}` : '/customers';
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; customer: AdminCustomerSummary }
  | { kind: 'create' }
  | { kind: 'addresses'; customer: AdminCustomerDetail }
  | { kind: 'note'; customer: AdminCustomerSummary };

export function CustomersView({ initialQuery: raw }: { initialQuery: CustomersUrlQuery }) {
  const router = useRouter();
  const { user } = useAuth();
  const canRead = canReadCustomers(user);
  const canManage = canManageCustomers(user);
  const [query, setQuery] = useState<AdminCustomersQuery>(() => normalizeCustomersQuery(raw));
  const { items, meta, loading, error, refresh } = useCustomers(query, canRead);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const apply = (patch: Partial<AdminCustomersQuery>) => {
    const next = { ...query, ...patch, page: patch.page ?? 1 };
    setQuery(next);
    router.replace(toUrl(next), { scroll: false });
  };

  const sortState: SortState = { columnId: query.sortBy, direction: query.sortDir };

  const close = () => setDialog({ kind: 'none' });

  if (!canRead) {
    return (
      <>
        <PageHeader title="مشتریان" description="فهرست مشتریان فروشگاه." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ مشتریان مجوز ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="مشتریان"
        eyebrow="فروش و مشتری"
        description="فهرست مشتریان با جستجوی موبایل و نام، وضعیت فعالیت و سابقهٔ سفارش."
        breadcrumbs={[{ label: 'فروش و مشتری' }, { label: 'مشتریان' }]}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              color="info"
              variant="outlined"
              icon={<Users size={15} />}
              label={`${meta ? formatCount(meta.total) : '…'} مشتری`}
            />
            {canManage ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={16} />}
                onClick={() => setDialog({ kind: 'create' })}
              >
                مشتری جدید
              </Button>
            ) : null}
          </Stack>
        }
      />

      <DataTable<AdminCustomerSummary>
        caption="فهرست مشتریان"
        columns={[
          {
            id: 'firstName',
            label: 'نام',
            render: (row) => (
              <Box>
                <Typography variant="body2" fontWeight={700}>
                  {customerDisplayName(row)}
                </Typography>
                <Typography variant="caption" color="text.secondary" dir="ltr">
                  {row.mobile}
                </Typography>
              </Box>
            ),
          },
          {
            id: 'status',
            label: 'وضعیت',
            render: (row) => (
              <StatusChip
                label={customerStatusLabel(row.status)}
                tone={customerStatusTone(row.status)}
              />
            ),
          },
          {
            id: 'mobile',
            label: 'موبایل',
            sortable: true,
            render: (row) => (
              <Typography variant="body2" dir="ltr">
                {row.mobile}
              </Typography>
            ),
          },
          {
            id: 'orderCount',
            label: 'سفارش',
            sortable: true,
            render: (row) => (
              <Typography variant="body2">{formatCount(row.orderCount)}</Typography>
            ),
          },
          {
            id: 'hasUserAccount',
            label: 'حساب کاربری',
            render: (row) => (
              <Typography variant="body2" color="text.secondary">
                {row.hasUserAccount ? 'دارد' : 'ندارد'}
              </Typography>
            ),
          },
          {
            id: 'createdAt',
            label: 'تاریخ ایجاد',
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
        emptyTitle="مشتری یافت نشد"
        emptyDescription={
          query.search || query.status || query.hasUserAccount !== undefined
            ? 'با فیلترهای فعلی مشتری وجود ندارد؛ فیلترها را تغییر دهید.'
            : 'هنوز مشتری‌ای ثبت نشده است.'
        }
        search={query.search ?? ''}
        onSearchChange={(search) => apply({ search })}
        searchPlaceholder="جستجو با موبایل یا نام…"
        sort={sortState}
        onSortChange={(next: SortChange) =>
          apply({
            sortBy: next.columnId as AdminCustomersQuery['sortBy'],
            sortDir: next.direction,
          })
        }
        rowCount={meta?.total ?? 0}
        page={query.page - 1}
        pageSize={query.perPage}
        onPageChange={(page, perPage) => apply({ page: page + 1, perPage })}
        actions={(row) => (
          <Button
            size="small"
            startIcon={<Eye size={16} />}
            onClick={() => setDialog({ kind: 'detail', id: row.id })}
          >
            جزئیات
          </Button>
        )}
        actionsLabel="عملیات"
        toolbar={
          <>
            <Select
              size="small"
              value={query.status ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت مشتری' }}
              sx={{ minWidth: 150 }}
              onChange={(event) =>
                apply({ status: (event.target.value || undefined) as AdminCustomersQuery['status'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌ها</MenuItem>
              {(['ACTIVE', 'INACTIVE'] as const).map((status) => (
                <MenuItem key={status} value={status}>
                  {CUSTOMER_STATUS_LABELS[status]}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={query.hasUserAccount === undefined ? '' : String(query.hasUserAccount)}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر حساب کاربری' }}
              sx={{ minWidth: 170 }}
              onChange={(event) =>
                apply({
                  hasUserAccount:
                    event.target.value === '' ? undefined : event.target.value === 'true',
                })
              }
            >
              <MenuItem value="">همهٔ مشتریان</MenuItem>
              <MenuItem value="true">دارای حساب کاربری</MenuItem>
              <MenuItem value="false">بدون حساب کاربری</MenuItem>
            </Select>
          </>
        }
      />

      <CustomerDetailDialog
        id={dialog.kind === 'detail' ? dialog.id : null}
        onClose={close}
        onEdit={(detail) => {
          close();
          setDialog({ kind: 'edit', customer: detail });
        }}
        onManageAddresses={(detail) => {
          close();
          setDialog({ kind: 'addresses', customer: detail });
        }}
        onAddNote={(detail) => {
          close();
          setDialog({ kind: 'note', customer: detail });
        }}
      />

      {/*
        Each dialog is mounted only while its own state is active, so a
        half-built customer object can never be handed to a mutation form.
      */}
      {dialog.kind === 'create' ? (
        <CustomerDialog open customer={null} onClose={close} onSaved={refresh} />
      ) : null}

      {dialog.kind === 'edit' ? (
        <CustomerDialog
          open
          customer={dialog.customer}
          onClose={close}
          onSaved={refresh}
        />
      ) : null}

      {dialog.kind === 'addresses' ? (
        <CustomerAddressesDialog
          open
          customer={dialog.customer}
          onClose={close}
          onSaved={refresh}
        />
      ) : null}

      {dialog.kind === 'note' ? (
        <CustomerNoteDialog
          open
          customer={dialog.customer}
          onClose={close}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
