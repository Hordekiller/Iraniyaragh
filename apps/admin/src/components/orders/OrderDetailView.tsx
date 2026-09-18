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
import { ApiAbortError } from '@/lib/api/client';
import { ordersApi } from '@/lib/orders/orders-api';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  formatCount,
  formatRial,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from '@/lib/orders/orders-labels';
import { canReadOrders } from '@/lib/orders/orders-permissions';

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : faDateTime.format(date);
}

function actorLabel(actor: AdminOrderDetail['audit'][number]['actor']): string {
  if (!actor) return 'سامانه';
  return actor.displayNameMasked ?? `کاربر ${actor.id}`;
}

function timelineStatusLabel(
  domain: AdminOrderDetail['timeline'][number]['domain'],
  status: AdminOrderDetail['timeline'][number]['to'],
): string {
  if (domain === 'ORDER') return orderStatusLabel(status as AdminOrderDetail['status']);
  if (domain === 'PAYMENT') {
    return paymentStatusLabel(status as NonNullable<AdminOrderDetail['payment']['latestStatus']>);
  }
  return fulfillmentStatusLabel(status as NonNullable<AdminOrderDetail['fulfillmentStatus']>);
}

const DOMAIN_LABELS = {
  ORDER: 'سفارش',
  PAYMENT: 'پرداخت',
  FULFILLMENT: 'ارسال',
} as const;

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const canRead = canReadOrders(user);

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    ordersApi
      .getOrder(orderId, controller.signal)
      .then(setOrder)
      .catch((caught: unknown) => {
        if (caught instanceof ApiAbortError) return;
        setError(caught instanceof Error ? caught.message : 'خطای غیرمنتظره در بارگیری سفارش.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
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

  if (loading) return <PageHeader title="جزئیات سفارش" loading />;

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
        title={`سفارش ${order.number}`}
        eyebrow="فروش و مشتری"
        description="نمای خواندنی و ممیزی‌پذیر سفارش؛ اطلاعات هویتی و نشانی مطابق قرارداد برای کارکنان ماسک شده‌اند."
        breadcrumbs={[
          { label: 'فروش و مشتری', href: '/orders' },
          { label: 'سفارش‌ها', href: '/orders' },
          { label: order.number },
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

      <Alert severity="info" sx={{ mb: 2 }}>
        این نما فقط اطلاعات قرارداد خواندنی را نمایش می‌دهد و هیچ تغییر وضعیتی از این صفحه ارسال نمی‌شود.
      </Alert>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        <StatusChip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
        <StatusChip
          label={paymentStatusLabel(order.payment.latestStatus)}
          tone={paymentStatusTone(order.payment.latestStatus)}
        />
        <StatusChip
          label={fulfillmentStatusLabel(order.fulfillmentStatus)}
          tone={fulfillmentStatusTone(order.fulfillmentStatus)}
        />
      </Stack>

      <Stack spacing={3}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
          <Card>
            <CardContent>
              <SectionTitle>مشتری و نشانی ماسک‌شده</SectionTitle>
              <TableContainer>
                <Table size="small" aria-label="اطلاعات مشتری و نشانی">
                  <TableBody>
                    <FactRow label="نام مشتری" value={order.customer.displayNameMasked ?? 'ثبت نشده'} />
                    <FactRow label="موبایل مشتری" value={<span dir="ltr">{order.customer.mobileMasked}</span>} />
                    {order.address ? (
                      <>
                        <FactRow label="دریافت‌کننده" value={order.address.recipientMasked} />
                        <FactRow label="موبایل دریافت‌کننده" value={<span dir="ltr">{order.address.mobileMasked}</span>} />
                        <FactRow label="استان / شهر" value={`${order.address.provinceCode} / ${order.address.city}`} />
                        <FactRow label="کد پستی" value={<span dir="ltr">{order.address.postalCodeMasked}</span>} />
                        <FactRow label="نشانی" value={order.address.addressMasked} />
                      </>
                    ) : (
                      <FactRow label="نشانی" value="برای این سفارش ثبت نشده است" />
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <SectionTitle>مشخصات سفارش</SectionTitle>
              <TableContainer>
                <Table size="small" aria-label="مشخصات سفارش">
                  <TableBody>
                    <FactRow label="تعداد اقلام" value={formatCount(order.itemCount)} />
                    <FactRow label="روش ارسال" value={`${order.shippingMethod.title} (${order.shippingMethod.code})`} />
                    <FactRow label="ثبت سفارش" value={formatDateTime(order.createdAt)} />
                    <FactRow label="آخرین تغییر" value={formatDateTime(order.updatedAt)} />
                    <FactRow label="انقضای رزرو" value={formatDateTime(order.reservationExpiresAt)} />
                    <FactRow label="نسخه سیاست قیمت" value={<span dir="ltr">{order.pricePolicyRevision}</span>} />
                    <FactRow label="نسخه سیاست ارسال" value={<span dir="ltr">{order.shippingPolicyRevision}</span>} />
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardContent>
            <SectionTitle>اقلام سفارش</SectionTitle>
            {order.truncation.items ? <TruncationNotice label="فهرست اقلام" /> : null}
            <TableContainer sx={{ maxHeight: 440 }}>
              <Table size="small" stickyHeader aria-label="اقلام سفارش" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>کالا</TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper' }}>SKU</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>تعداد</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>قیمت واحد</TableCell>
                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>جمع ردیف</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={`${item.variantId}-${item.sku}`}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{item.productTitle}</Typography>
                        {item.variantTitle ? <Typography variant="caption" color="text.secondary">{item.variantTitle}</Typography> : null}
                      </TableCell>
                      <TableCell><span dir="ltr">{item.sku}</span></TableCell>
                      <TableCell align="right">{formatCount(item.quantity)}</TableCell>
                      <TableCell align="right">{formatRial(item.unitPrice)}</TableCell>
                      <TableCell align="right">{formatRial(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1} alignItems="flex-end">
              <TotalRow label="جمع کالاها" value={formatRial(order.totals.subtotal)} />
              <TotalRow label="تخفیف" value={formatRial(order.totals.discount)} />
              <TotalRow label="هزینه ارسال" value={formatRial(order.totals.shipping)} />
              <TotalRow label="مبلغ نهایی" value={formatRial(order.totals.total)} emphasized />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle>تلاش‌های پرداخت</SectionTitle>
            {order.truncation.payments ? <TruncationNotice label="سابقه پرداخت" /> : null}
            {order.payments.length === 0 ? (
              <Typography color="text.secondary" variant="body2">هنوز تلاش پرداختی ثبت نشده است.</Typography>
            ) : (
              <TableContainer>
                <Table size="small" aria-label="تلاش‌های پرداخت" sx={{ minWidth: 620 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>شناسه</TableCell>
                      <TableCell>وضعیت</TableCell>
                      <TableCell align="right">مبلغ</TableCell>
                      <TableCell>ایجاد</TableCell>
                      <TableCell>آخرین تغییر</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell><span dir="ltr">{payment.id}</span></TableCell>
                        <TableCell><StatusChip label={paymentStatusLabel(payment.status)} tone={paymentStatusTone(payment.status)} /></TableCell>
                        <TableCell align="right">{formatRial(payment.amount)}</TableCell>
                        <TableCell>{formatDateTime(payment.createdAt)}</TableCell>
                        <TableCell>{formatDateTime(payment.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle>خط زمانی وضعیت‌ها</SectionTitle>
            {order.truncation.timeline ? <TruncationNotice label="خط زمانی" /> : null}
            {order.timeline.length === 0 ? (
              <Typography color="text.secondary" variant="body2">رویداد وضعیتی ثبت نشده است.</Typography>
            ) : (
              <TableContainer>
                <Table size="small" aria-label="خط زمانی وضعیت‌های سفارش" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>دامنه</TableCell>
                      <TableCell>از</TableCell>
                      <TableCell>به</TableCell>
                      <TableCell>عامل</TableCell>
                      <TableCell>علت</TableCell>
                      <TableCell>زمان</TableCell>
                      <TableCell>Request ID</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.timeline.map((entry, index) => (
                      <TableRow key={`${entry.domain}-${entry.createdAt}-${index}`}>
                        <TableCell>{DOMAIN_LABELS[entry.domain]}</TableCell>
                        <TableCell>{timelineStatusLabel(entry.domain, entry.from)}</TableCell>
                        <TableCell>{timelineStatusLabel(entry.domain, entry.to)}</TableCell>
                        <TableCell>{actorLabel(entry.actor)}</TableCell>
                        <TableCell>{entry.reason ?? '—'}</TableCell>
                        <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                        <TableCell><span dir="ltr">{entry.requestId ?? '—'}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle>رویدادهای ممیزی</SectionTitle>
            {order.truncation.audit ? <TruncationNotice label="رویدادهای ممیزی" /> : null}
            {order.audit.length === 0 ? (
              <Typography color="text.secondary" variant="body2">رویداد ممیزی قابل نمایش وجود ندارد.</Typography>
            ) : (
              <TableContainer>
                <Table size="small" aria-label="رویدادهای ممیزی سفارش" sx={{ minWidth: 620 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>عملیات</TableCell>
                      <TableCell>عامل</TableCell>
                      <TableCell>زمان</TableCell>
                      <TableCell>Request ID</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.audit.map((entry, index) => (
                      <TableRow key={`${entry.action}-${entry.createdAt}-${index}`}>
                        <TableCell><span dir="ltr">{entry.action}</span></TableCell>
                        <TableCell>{actorLabel(entry.actor)}</TableCell>
                        <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                        <TableCell><span dir="ltr">{entry.requestId ?? '—'}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{children}</Typography>;
}

function TruncationNotice({ label }: { label: string }) {
  return <Alert severity="warning" sx={{ mb: 2 }}>{label} به سقف نمایش رسیده و ممکن است کامل نباشد.</Alert>;
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <TableRow sx={{ '&:last-child td': { borderBottom: 0 } }}>
      <TableCell width="42%" sx={{ color: 'text.secondary' }}>{label}</TableCell>
      <TableCell>{value}</TableCell>
    </TableRow>
  );
}

function TotalRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 3, minWidth: 280, justifyContent: 'space-between' }}>
      <Typography variant={emphasized ? 'h6' : 'body2'} fontWeight={emphasized ? 800 : 400}>{label}</Typography>
      <Typography variant={emphasized ? 'h6' : 'body2'} fontWeight={emphasized ? 800 : 400} textAlign="end">{value}</Typography>
    </Box>
  );
}
