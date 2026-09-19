'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminDashboardSummary } from '@iranyaragh/contracts';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Banknote,
  Boxes,
  CalendarDays,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  ShieldX,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canReadDashboard } from '@/lib/dashboard/dashboard-permissions';
import {
  formatCount,
  formatDashboardRange,
  formatIranDateTime,
  formatIrr,
} from '@/lib/dashboard/dashboard-format';
import { StatusBreakdownCard } from './StatusBreakdownCard';
import {
  useDashboardSummary,
  type DashboardRangeDays,
} from './useDashboardSummary';
import styles from './DashboardView.module.css';

const RANGE_OPTIONS: { value: DashboardRangeDays; label: string }[] = [
  { value: 7, label: '۷ روز' },
  { value: 30, label: '۳۰ روز' },
  { value: 90, label: '۹۰ روز' },
];

export function DashboardView() {
  const { user } = useAuth();
  const permitted = canReadDashboard(user);
  const [rangeDays, setRangeDays] = useState<DashboardRangeDays>(7);
  const { summary, loading, error, refresh } = useDashboardSummary(
    rangeDays,
    permitted,
  );

  if (!permitted) {
    return (
      <EmptyState
        icon={<ShieldX size={30} />}
        title="دسترسی ندارید"
        description="برای مشاهدهٔ داشبورد عملیاتی، مجوز reports.read و نشست Staff MFA لازم است."
      />
    );
  }

  const rangeControl = (
    <ToggleButtonGroup
      exclusive
      value={rangeDays}
      onChange={(_, value: DashboardRangeDays | null) => {
        if (value !== null) setRangeDays(value);
      }}
      size="small"
      aria-label="بازهٔ گزارش سفارش‌های ایجادشده"
      sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 2 } }}
    >
      {RANGE_OPTIONS.map((option) => (
        <ToggleButton key={option.value} value={option.value}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="مرکز عملیات"
        title="داشبورد عملیاتی"
        description="نمایی فقط‌خواندنی از رخدادهای ثبت‌شده در پایگاه داده؛ بدون عدد نمونه، پیش‌بینی یا آستانهٔ حدسی."
        actions={rangeControl}
      />

      {loading ? <DashboardLoading /> : null}
      {!loading && error ? <DashboardErrorState error={error} onRetry={refresh} /> : null}
      {!loading && summary ? <DashboardContent summary={summary} /> : null}
    </div>
  );
}

type DashboardContentProps = {
  summary: AdminDashboardSummary;
};

function DashboardContent({ summary }: DashboardContentProps) {
  const { rangeMetrics, commerceSnapshot, inventorySnapshot } = summary;
  const allCounts = [
    rangeMetrics.ordersCreated,
    commerceSnapshot.ordersWithoutPaymentAttempts,
    commerceSnapshot.ordersWithoutFulfillment,
    inventorySnapshot.zeroAvailableBalances,
    inventorySnapshot.activeReservations,
    ...commerceSnapshot.ordersByStatus.map(({ count }) => count),
    ...commerceSnapshot.paymentAttemptsByStatus.map(({ count }) => count),
    ...commerceSnapshot.fulfillmentsByStatus.map(({ count }) => count),
    ...inventorySnapshot.reservationsByStatus.map(({ count }) => count),
    ...inventorySnapshot.transfersByStatus.map(({ count }) => count),
  ];
  const isEmpty = allCounts.every((count) => count === 0);

  return (
    <>
      <section className={styles.snapshotMeta} aria-label="تعریف و تازگی گزارش">
        <div>
          <CalendarDays size={18} aria-hidden="true" />
          <span>بازهٔ سفارش‌های ایجادشده</span>
          <strong>{formatDashboardRange(summary.range.createdFrom, summary.range.createdToExclusive)}</strong>
        </div>
        <div>
          <RefreshCw size={18} aria-hidden="true" />
          <span>زمان تولید نمای لحظه‌ای</span>
          <strong>{formatIranDateTime(summary.generatedAt)}</strong>
        </div>
        <div>
          <Banknote size={18} aria-hidden="true" />
          <span>واحد و منطقهٔ نمایش</span>
          <strong>ریال · Asia/Tehran</strong>
        </div>
      </section>

      {isEmpty ? (
        <Alert severity="info">
          برای این بازه سفارش ثبت‌شده‌ای وجود ندارد و snapshot فعلی نیز شمارش عملیاتی فعالی ندارد.
        </Alert>
      ) : null}

      <section className={styles.metrics} aria-labelledby="range-metrics-title">
        <div className={styles.sectionHeading}>
          <div>
            <Typography component="h2" variant="h5" id="range-metrics-title">
              شاخص‌های بازهٔ انتخابی
            </Typography>
            <Typography variant="body2" color="text.secondary">
              فقط سفارش‌هایی که زمان ایجادشان داخل مرزهای بالا است.
            </Typography>
          </div>
        </div>
        <div className={styles.metricGrid}>
          <StatCard
            variant="horizontal"
            stats={formatCount(rangeMetrics.ordersCreated)}
            title="سفارش ایجادشده"
            subtitle="همهٔ وضعیت‌ها؛ معادل فروش قطعی نیست"
            avatar={<ClipboardList size={22} />}
            accent="var(--admin-chart-1)"
          />
          <StatCard
            variant="horizontal"
            stats={formatIrr(rangeMetrics.grossOrderValue.amount)}
            title="ارزش ناخالص سفارش‌های ایجادشده"
            subtitle="جمع grandTotal؛ شامل همهٔ وضعیت‌ها"
            avatar={<Banknote size={22} />}
            accent="var(--admin-chart-3)"
          />
        </div>
      </section>

      <section className={styles.metrics} aria-labelledby="snapshot-metrics-title">
        <div className={styles.sectionHeading}>
          <div>
            <Typography component="h2" variant="h5" id="snapshot-metrics-title">
              نمای لحظه‌ای فعلی کل سامانه
            </Typography>
            <Typography variant="body2" color="text.secondary">
              این اعداد مستقل از بازهٔ بالا و مربوط به وضعیت فعلی همهٔ رکوردها هستند.
            </Typography>
          </div>
        </div>
        <div className={styles.metricGrid}>
          <StatCard
            variant="horizontal"
            stats={formatCount(inventorySnapshot.zeroAvailableBalances)}
            title="ردیف موجودی با available دقیقاً صفر"
            subtitle="آستانهٔ «موجودی کم» تعریف نشده است"
            avatar={<Boxes size={22} />}
            accent="var(--admin-chart-4)"
          />
          <StatCard
            variant="horizontal"
            stats={formatCount(inventorySnapshot.activeReservations)}
            title="رزرو فعال موجودی"
            subtitle="شمارش وضعیت ACTIVE"
            avatar={<PackageCheck size={22} />}
            accent="var(--admin-chart-2)"
          />
        </div>
      </section>

      <section className={styles.followUpCard} aria-labelledby="follow-up-title">
        <div>
          <Typography component="h2" variant="h6" id="follow-up-title">
            واقعیت‌های نیازمند بررسی اپراتور
          </Typography>
          <Typography variant="body2" color="text.secondary">
            این‌ها شمارش factual هستند؛ SLA، هشدار یا تخلف مالی محسوب نمی‌شوند.
          </Typography>
        </div>
        <div className={styles.followUpFacts}>
          <div>
            <span>سفارش بدون هیچ تلاش پرداخت</span>
            <strong>{formatCount(commerceSnapshot.ordersWithoutPaymentAttempts)}</strong>
          </div>
          <div>
            <span>سفارش بدون رکورد fulfillment</span>
            <strong>{formatCount(commerceSnapshot.ordersWithoutFulfillment)}</strong>
          </div>
        </div>
      </section>

      <section className={styles.charts} aria-labelledby="status-breakdowns-title">
        <div className={`${styles.sectionHeading} ${styles.fullSpan}`}>
          <div>
            <Typography component="h2" variant="h5" id="status-breakdowns-title">
              توزیع وضعیت‌های فعلی
            </Typography>
            <Typography variant="body2" color="text.secondary">
              طول میله فقط برای مقایسهٔ دیداری است؛ مقدار دقیق کنار هر ردیف و در جدول همان کارت آمده است.
            </Typography>
          </div>
        </div>
        <StatusBreakdownCard
          id="orders-status"
          title="سفارش‌ها"
          description="وضعیت جاری هر سفارش"
          items={commerceSnapshot.ordersByStatus}
        />
        <StatusBreakdownCard
          id="payment-status"
          title="تلاش‌های پرداخت"
            description="تعداد تلاش‌ها، نه وضعیت یکتای سفارش"
          items={commerceSnapshot.paymentAttemptsByStatus}
        />
        <StatusBreakdownCard
          id="fulfillment-status"
          title="آماده‌سازی و ارسال"
          description="وضعیت جاری رکوردهای آماده‌سازی و ارسال"
          items={commerceSnapshot.fulfillmentsByStatus}
        />
        <StatusBreakdownCard
          id="reservation-status"
          title="رزروهای موجودی"
          description="وضعیت فعلی همهٔ رزروها"
          items={inventorySnapshot.reservationsByStatus}
        />
        <StatusBreakdownCard
          id="transfer-status"
          title="انتقال‌های انبار"
          description="وضعیت فعلی همهٔ انتقال‌ها"
          items={inventorySnapshot.transfersByStatus}
        />
      </section>

      <Typography component="p" variant="caption" color="text.secondary" className={styles.sourceNote}>
        منبع: تجمیع فقط‌خواندنی PostgreSQL در یک نمای سازگار با RepeatableRead؛ زمان تولید و مرزهای گزارش از پاسخ سرور آمده‌اند.
      </Typography>
    </>
  );
}

function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="در حال بارگیری داشبورد" className={styles.loadingLayout}>
      <Skeleton variant="rounded" height={76} />
      <div className={styles.metricGrid}>
        {Array.from({ length: 4 }, (_, index) => (
          <StatCard key={index} variant="horizontal" stats="" title="" loading />
        ))}
      </div>
      <div className={styles.charts}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={360} />
        ))}
      </div>
    </div>
  );
}

function DashboardErrorState({
  error,
  onRetry,
}: {
  error: NonNullable<ReturnType<typeof useDashboardSummary>['error']>;
  onRetry: () => void;
}) {
  const isPermissionError = error.kind === 'forbidden';
  const isAuthError = error.kind === 'unauthorized';

  return (
    <Card>
      <CardContent>
        <Alert severity={isPermissionError || isAuthError ? 'warning' : 'error'}>
          <Typography component="p" fontWeight={700}>
            {isPermissionError ? 'دسترسی گزارش رد شد' : isAuthError ? 'نشست منقضی شده است' : 'دریافت داشبورد ناموفق بود'}
          </Typography>
          <Typography component="p" variant="body2">
            {error.message}
          </Typography>
          {error.requestId ? (
            <Typography component="p" variant="caption" sx={{ mt: 1 }}>
              شناسهٔ پیگیری: <bdi>{error.requestId}</bdi>
            </Typography>
          ) : null}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {isAuthError ? (
              <Button component={Link} href="/login" variant="contained">
                ورود دوباره
              </Button>
            ) : null}
            {!isPermissionError && !isAuthError ? (
              <Button variant="contained" onClick={onRetry} startIcon={<RefreshCw size={17} />}>
                تلاش دوباره
              </Button>
            ) : null}
          </Box>
        </Alert>
      </CardContent>
    </Card>
  );
}
