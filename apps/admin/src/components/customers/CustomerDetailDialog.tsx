'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { MapPin, NotebookPen, Pencil } from 'lucide-react';
import type { AdminCustomerDetail } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { getCustomer } from '@/lib/customers/customers-api';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  customerDisplayName,
  customerStatusLabel,
  customerStatusTone,
  formatCount,
  formatRial,
  noteVisibilityLabel,
  noteVisibilityTone,
} from '@/lib/customers/customers-labels';
import { DataTable } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { canManageCustomers } from '@/lib/customers/customers-permissions';
import { useAuth } from '@/lib/auth/AuthProvider';

const faDateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

type Props = {
  id: string | null;
  onClose: () => void;
  onEdit: (customer: AdminCustomerDetail) => void;
  onManageAddresses: (customer: AdminCustomerDetail) => void;
  onAddNote: (customer: AdminCustomerDetail) => void;
};

type DetailState = {
  detail: AdminCustomerDetail | null;
  loading: boolean;
  error: string | null;
};

export function CustomerDetailDialog({
  id,
  onClose,
  onEdit,
  onManageAddresses,
  onAddNote,
}: Props) {
  const { user } = useAuth();
  const canManage = canManageCustomers(user);
  const [state, setState] = useState<DetailState>({ detail: null, loading: false, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    setState({ detail: null, loading: true, error: null });
    getCustomer(id, controller.signal)
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
            failure instanceof Error ? failure.message : 'دریافت جزئیات مشتری ناموفق بود.',
        });
      });
    return () => controller.abort();
  }, [id, reload]);

  const { detail } = state;

  return (
    <Dialog open={id !== null} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>جزئیات مشتری</DialogTitle>
      <DialogContent dividers>
        {state.loading ? <Typography variant="body2">در حال بارگذاری جزئیات…</Typography> : null}
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
        {detail ? (
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6">{customerDisplayName(detail)}</Typography>
              <Typography variant="body2" dir="ltr" sx={{ textAlign: 'right' }}>
                {detail.mobile}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <StatusChip
                  label={customerStatusLabel(detail.status)}
                  tone={customerStatusTone(detail.status)}
                />
                <Typography variant="caption" color="text.secondary">
                  نسخهٔ {formatCount(detail.version)} · {formatCount(detail.orderCount)} سفارش
                </Typography>
                {detail.hasUserAccount ? (
                  <Typography variant="caption" color="text.secondary">
                    دارای حساب کاربری
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    بدون حساب کاربری
                  </Typography>
                )}
              </Stack>
              {detail.deactivatedAt ? (
                <Typography variant="caption" color="text.secondary">
                  غیرفعال‌شده در {faDateTime.format(new Date(detail.deactivatedAt))}
                </Typography>
              ) : null}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              {canManage ? (
                <Button
                  size="small"
                  startIcon={<Pencil size={16} />}
                  onClick={() => onEdit(detail)}
                >
                  ویرایش
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  size="small"
                  startIcon={<MapPin size={16} />}
                  onClick={() => onManageAddresses(detail)}
                >
                  نشانی‌ها و وضعیت
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  size="small"
                  startIcon={<NotebookPen size={16} />}
                  onClick={() => onAddNote(detail)}
                >
                  افزودن یادداشت
                </Button>
              ) : null}
            </Stack>

            <Box>
              <Typography variant="subtitle2">نشانی‌ها</Typography>
              {detail.addresses.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  نشانی ثبت‌شده‌ای وجود ندارد.
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {detail.addresses.map((address) => (
                    <Box
                      key={address.id}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={700}>
                          {address.label}
                        </Typography>
                        {address.isDefault ? (
                          <StatusChip label="پیش‌فرض" tone="info" />
                        ) : null}
                      </Stack>
                      <Typography variant="body2">
                        {address.provinceCode} — {address.city}
                      </Typography>
                      <Typography variant="body2">{address.addressLine}</Typography>
                      <Typography variant="body2">گیرنده: {address.receiverName}</Typography>
                      <Typography variant="body2" dir="ltr" sx={{ textAlign: 'right' }}>
                        {address.mobile}
                        {address.postalCode ? ` · ${address.postalCode}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2">یادداشت‌ها</Typography>
              {detail.notes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  یادداشتی ثبت نشده است.
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {detail.notes.map((note) => (
                    <Box key={note.id} sx={{ borderRight: 3, borderColor: 'divider.main', pr: 1.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <StatusChip
                          label={noteVisibilityLabel(note.visibility)}
                          tone={noteVisibilityTone(note.visibility)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {faDateTime.format(new Date(note.createdAt))}
                        </Typography>
                      </Stack>
                      <Typography variant="body2">{note.body}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ثبت‌کننده: {note.author?.displayNameMasked ?? 'سیستم'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2">سفارش‌های اخیر</Typography>
              <DataTable<AdminCustomerDetail['recentOrders'][number]>
                caption="سفارش‌های اخیر مشتری"
                columns={[
                  {
                    id: 'number',
                    label: 'سفارش',
                    render: (row) => (
                      <Typography component={Link} href={`/orders/${row.id}`} variant="body2">
                        {row.number}
                      </Typography>
                    ),
                  },
                  {
                    id: 'status',
                    label: 'وضعیت سفارش',
                    render: (row) => (
                      <Typography variant="body2">{ORDER_STATUS_LABELS[row.status]}</Typography>
                    ),
                  },
                  {
                    id: 'paymentStatus',
                    label: 'پرداخت',
                    render: (row) => (
                      <Typography variant="body2">
                        {row.paymentStatus ? PAYMENT_STATUS_LABELS[row.paymentStatus] : '—'}
                      </Typography>
                    ),
                  },
                  {
                    id: 'fulfillmentStatus',
                    label: 'تحویل',
                    render: (row) => (
                      <Typography variant="body2">
                        {row.fulfillmentStatus
                          ? FULFILLMENT_STATUS_LABELS[row.fulfillmentStatus]
                          : '—'}
                      </Typography>
                    ),
                  },
                  {
                    id: 'grandTotal',
                    label: 'مبلغ کل',
                    render: (row) => <Typography variant="body2">{formatRial(row.grandTotal)}</Typography>,
                  },
                  {
                    id: 'placedAt',
                    label: 'تاریخ',
                    render: (row) => (
                      <Typography variant="body2" color="text.secondary">
                        {faDateTime.format(new Date(row.placedAt))}
                      </Typography>
                    ),
                  },
                ]}
                rows={detail.recentOrders}
                rowKey={(row) => row.id}
                emptyTitle="سفارشی ثبت نشده"
                emptyDescription="این مشتری هنوز سفارشی ندارد."
              />
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>بستن</Button>
      </DialogActions>
    </Dialog>
  );
}
