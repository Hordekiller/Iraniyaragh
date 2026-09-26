'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  TextField,
  Typography,
} from '@mui/material';
import { ArrowRight, Lock, PackageSearch } from 'lucide-react';
import Link from 'next/link';
import type { AdminOrderDetail } from '@/lib/orders/orders-types';
import type { FulfillmentPickListResponse } from '@iranyaragh/contracts';
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
import { canReadOrders, hasOrderPermission, ORDERS_MANAGE } from '@/lib/orders/orders-permissions';

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
  status: AdminOrderDetail['timeline'][number]['from'],
): string {
  if (status === null) return 'ایجاد اولیه';
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

const SHIPMENTS_MANAGE = 'shipments.manage';

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const canRead = canReadOrders(user);
  const canManage = hasOrderPermission(user, ORDERS_MANAGE);
  const canDispatch = hasOrderPermission(user, SHIPMENTS_MANAGE);

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [picks, setPicks] = useState<FulfillmentPickListResponse['data'] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const actionKeys = useRef<Record<string, string>>({});
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
    setPicks(null);
    setPickError(null);
    setActionError(null);
    setActionSuccess(null);
    actionKeys.current = {};

    ordersApi
      .getOrder(orderId, controller.signal)
      .then(async (detail) => {
        if (controller.signal.aborted) return;
        setOrder(detail);
        if (detail.fulfillment) {
          try {
            setPicks(await ordersApi.getPicks(orderId, controller.signal));
          } catch (caught) {
            if (!(caught instanceof ApiAbortError)) setPickError(caught instanceof Error ? caught.message : 'خطا در دریافت برداشت اقلام.');
          }
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiAbortError) return;
        setError(caught instanceof Error ? caught.message : 'خطای غیرمنتظره در بارگیری سفارش.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [orderId, canRead]);

  async function runAction(action: 'start' | 'ready' | 'pick', itemId?: string, quantity?: number) {
    if (!canManage || actionBusy) return;
    const actionId = `${orderId}:${action}:${itemId ?? ''}`;
    const key = actionKeys.current[actionId] ?? crypto.randomUUID();
    actionKeys.current[actionId] = key;
    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      if (action === 'start') await ordersApi.startFulfillment(orderId, key);
      if (action === 'ready') await ordersApi.markReady(orderId, key);
      if (action === 'pick') {
        if (!itemId || !quantity) throw new Error('قلم یا تعداد برداشت مشخص نیست.');
        await ordersApi.recordPick(orderId, itemId, quantity, key);
      }
      const [updated, updatedPicks] = await Promise.all([ordersApi.getOrder(orderId), ordersApi.getPicks(orderId)]);
      setOrder(updated);
      setPicks(updatedPicks);
      setPickError(null);
      setActionSuccess(action === 'pick' ? 'برداشت قلم ثبت شد.' : action === 'start' ? 'پردازش سفارش آغاز شد.' : 'سفارش آمادهٔ ارسال شد.');
      delete actionKeys.current[actionId];
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'ثبت عملیات ناموفق بود؛ همان عملیات را دوباره امتحان کنید.');
    } finally {
      setActionBusy(false);
    }
  }

  async function dispatch() {
    if (!canDispatch || actionBusy || !carrier.trim() || !trackingCode.trim()) return;
    const actionId = `${orderId}:dispatch`;
    const key = actionKeys.current[actionId] ?? crypto.randomUUID();
    actionKeys.current[actionId] = key;
    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await ordersApi.dispatchShipment(orderId, carrier.trim(), trackingCode.trim(), key);
      setOrder(await ordersApi.getOrder(orderId));
      setActionSuccess('ارسال و کد رهگیری ثبت شد.');
      delete actionKeys.current[actionId];
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'ثبت ارسال ناموفق بود؛ همان عملیات را دوباره امتحان کنید.');
    } finally {
      setActionBusy(false);
    }
  }

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

      {!canManage ? <Alert severity="info" sx={{ mb: 2 }}>این نما فقط خواندنی است؛ برای ثبت عملیات به مجوز مدیریت سفارش نیاز دارید.</Alert> : null}
      {actionError ? <Alert severity="error" sx={{ mb: 2 }}>{actionError} کلید تکرار برای تلاش دوباره حفظ شده است.</Alert> : null}
      {actionSuccess ? <Alert severity="success" sx={{ mb: 2 }}>{actionSuccess}</Alert> : null}

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
        {order.fulfillment ? (
          <Card>
            <CardContent>
              <SectionTitle>برداشت و آماده‌سازی سفارش</SectionTitle>
              {pickError ? <Alert severity="error" sx={{ mb: 2 }}>{pickError}</Alert> : null}
              {canManage && order.fulfillment.status === 'PENDING' ? (
                <Button disabled={actionBusy} variant="contained" onClick={() => void runAction('start')} sx={{ mb: 2 }}>شروع پردازش</Button>
              ) : null}
              {picks ? (
                <TableContainer>
                  <Table size="small" aria-label="اثبات برداشت اقلام">
                    <TableHead><TableRow><TableCell>کالا</TableCell><TableCell>SKU</TableCell><TableCell>تعداد</TableCell><TableCell>برداشت</TableCell><TableCell>ثبت‌کننده</TableCell><TableCell>عملیات</TableCell></TableRow></TableHead>
                    <TableBody>
                      {picks.items.map((item) => (
                        <TableRow key={item.orderItemId}>
                          <TableCell>{item.productTitle}{item.variantTitle ? ` — ${item.variantTitle}` : ''}</TableCell>
                          <TableCell><span dir="ltr">{item.sku}</span></TableCell>
                          <TableCell>{formatCount(item.quantity)}</TableCell>
                          <TableCell>{item.pick ? `ثبت‌شده · ${formatDateTime(item.pick.createdAt)}` : 'ثبت نشده'}</TableCell>
                          <TableCell>{item.pick?.actorId ? <span dir="ltr">{item.pick.actorId}</span> : '—'}</TableCell>
                          <TableCell>
                            {canManage && order.fulfillment?.status === 'PROCESSING' && !item.pick ? (
                              <Button disabled={actionBusy} size="small" onClick={() => void runAction('pick', item.orderItemId, item.quantity)}>ثبت برداشت</Button>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : <Typography variant="body2" color="text.secondary">در حال دریافت وضعیت برداشت اقلام…</Typography>}
              {canManage && order.fulfillment.status === 'PROCESSING' ? (
                <Button
                  disabled={actionBusy || !picks || picks.items.length === 0 || picks.items.some((item) => !item.pick)}
                  variant="contained" sx={{ mt: 2 }} onClick={() => void runAction('ready')}
                >آمادهٔ ارسال</Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {order.fulfillment?.status === 'READY_TO_SHIP' || order.shipment ? (
          <Card><CardContent>
            <SectionTitle>مرسوله و رهگیری</SectionTitle>
            {order.shipment ? (
              <Stack spacing={1}>
                <Typography variant="body2">حامل: {order.shipment.carrier}</Typography>
                <Typography variant="body2">کد رهگیری: <span dir="ltr">{order.shipment.trackingCode}</span></Typography>
                <Typography variant="body2">ثبت ارسال: {formatDateTime(order.shipment.dispatchedAt)}</Typography>
              </Stack>
            ) : canDispatch ? (
              <Stack spacing={2} sx={{ maxWidth: 420 }}>
                <TextField label="حامل" value={carrier} onChange={(event) => { delete actionKeys.current[`${orderId}:dispatch`]; setCarrier(event.target.value); }} inputProps={{ maxLength: 80 }} />
                <TextField label="کد رهگیری" value={trackingCode} onChange={(event) => { delete actionKeys.current[`${orderId}:dispatch`]; setTrackingCode(event.target.value); }} inputProps={{ maxLength: 120, dir: 'ltr' }} />
                <Button variant="contained" disabled={actionBusy || carrier.trim().length < 2 || trackingCode.trim().length < 4} onClick={() => void dispatch()}>ثبت ارسال</Button>
              </Stack>
            ) : <Alert severity="info">برای ثبت ارسال به مجوز مدیریت مرسوله نیاز دارید.</Alert>}
          </CardContent></Card>
        ) : null}
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
