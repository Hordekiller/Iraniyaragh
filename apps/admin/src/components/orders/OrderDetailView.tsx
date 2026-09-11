'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowRight, Lock, PackageSearch } from 'lucide-react';
import Link from 'next/link';
import type { AdminOrderDetail } from '@/lib/orders/orders-types';
import { ordersApi } from '@/lib/orders/orders-fixture';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  formatRial,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from '@/lib/orders/orders-labels';
import { canReadOrders, canWriteOrders } from '@/lib/orders/orders-permissions';

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const canRead = canReadOrders(user);
  const canWrite = canWriteOrders(user);

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    ordersApi
      .getOrder(orderId)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'خطای غیرمنتظره در بارگیری سفارش.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, canRead]);

  if (!canRead) {
    return (
      <>
        <PageHeader title="جزئیات سفارش" description="مشاهدهٔ جزئیات سفارش." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ سفارش‌ها مجوز ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  if (loading) {
    return <PageHeader title="جزئیات سفارش" loading />;
  }

  if (error || !order) {
    return (
      <>
        <PageHeader title="جزئیات سفارش" description="مشاهدهٔ جزئیات سفارش." />
        <EmptyState
          icon={<PackageSearch size={28} />}
          title="سفارش یافت نشد"
          description={error ?? 'سفارش موردنظر در دسترس نیست.'}
          action={
            <Typography component={Link} href="/orders" variant="body2" color="primary.main">
              بازگشت به فهرست سفارش‌ها
            </Typography>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`سفارش ${order.orderNumber}`}
        eyebrow="فروش و مشتری"
        description="جزئیات خواندنی سفارش: چرخهٔ سفارش، پرداخت و ارسال جداگانه نمایش داده می‌شوند و هرگز در یک وضعیت ادغام نمی‌شوند."
        breadcrumbs={[
          { label: 'فروش و مشتری', href: '/orders' },
          { label: 'سفارش‌ها', href: '/orders' },
          { label: order.orderNumber },
        ]}
        actions={
          <Typography
            component={Link}
            href="/orders"
            variant="body2"
            color="primary.main"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <ArrowRight size={16} />
            بازگشت به فهرست
          </Typography>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن به سفارش‌ها دارد؛ عملیات اجرایی در این نسخهٔ پایه ارائه نشده است.
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
        <StatusChip label={orderStatusLabel(order.orderStatus)} tone={orderStatusTone(order.orderStatus)} />
        <StatusChip label={paymentStatusLabel(order.paymentStatus)} tone={paymentStatusTone(order.paymentStatus)} />
        <StatusChip
          label={fulfillmentStatusLabel(order.fulfillmentStatus)}
          tone={fulfillmentStatusTone(order.fulfillmentStatus)}
        />
      </Stack>

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              مشتری و ارسال
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  <FactRow label="نام دریافت‌کننده" value={order.customer.fullName} />
                  <FactRow label="موبایل" value={<span dir="ltr">{order.customer.mobile}</span>} />
                  <FactRow label="استان / شهر" value={`${order.shipping.province} / ${order.shipping.city}`} />
                  <FactRow label="کد پستی" value={<span dir="ltr">{order.shipping.postalCode}</span>} />
                  <FactRow label="آدرس" value={order.shipping.address} />
                  <FactRow label="تاریخ ثبت" value={faDateTime.format(new Date(order.createdAt))} />
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              اقلام سفارش
            </Typography>
            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>کالا</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>تعداد</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>قیمت واحد</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>جمع ردیف</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {line.productName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" dir="ltr" display="block" textAlign="start">
                          {line.sku}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{new Intl.NumberFormat('fa-IR').format(line.quantity)}</TableCell>
                      <TableCell align="right">{formatRial(line.unitPriceRials)}</TableCell>
                      <TableCell align="right">{formatRial(line.lineTotalRials)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1} alignItems="flex-end">
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  جمع کالاها
                </Typography>
                <Typography variant="body2" textAlign="end">
                  {formatRial(order.subtotalRials)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  هزینهٔ ارسال
                </Typography>
                <Typography variant="body2" textAlign="end">
                  {formatRial(order.shippingRials)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Typography variant="h6" fontWeight={800}>
                  مبلغ نهایی
                </Typography>
                <Typography variant="h6" fontWeight={800} textAlign="end">
                  {formatRial(order.totalRials)}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <TableRow sx={{ '&:last-child td': { borderBottom: 0 } }}>
      <TableCell width="40%" sx={{ color: 'text.secondary' }}>
        {label}
      </TableCell>
      <TableCell>{value}</TableCell>
    </TableRow>
  );
}