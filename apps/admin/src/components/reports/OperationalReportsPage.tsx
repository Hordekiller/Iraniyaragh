'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  DebtorsReportResponse,
  OperationalReportQuery,
  OperationalReportSummary,
  ReportMetric,
  ReportOrdersResponse,
} from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import {
  formatCount,
  formatIranDateTime,
  formatIrr,
  dashboardStatusLabel,
} from '@/lib/dashboard/dashboard-format';
import {
  readOperationalReport,
  readReportOrders,
  readReportDebtors,
  readReportOptions,
} from '@/lib/reports/operational-report-api';
import { PageHeader } from '@/components/ui/PageHeader';
const metricLabels: Record<ReportMetric, string> = {
  createdOrderValue: 'ارزش سفارش‌های ایجادشده',
  providerSettlements: 'تسویه‌های تأییدشدهٔ درگاه (همهٔ محیط‌ها)',
  recordedGatewayRefunds: 'بازپرداخت‌های ثبت‌شدهٔ درگاه',
  netRecordedCreditReceipts: 'خالص دریافت‌های ثبت‌شدهٔ نسیه',
  recordedCreditRefundPayouts: 'پرداخت‌های ثبت‌شدهٔ برگشت نسیه',
  issuedInvoiceValue: 'ارزش فاکتورهای صادرشده',
};
function initialDates() {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000)
    .toISOString()
    .slice(0, 10);
  return { from, to: today };
}
export function reportDayRange(from: string, to: string) {
  const lower = new Date(`${from}T00:00:00Z`),
    last = new Date(`${to}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(to) ||
    !Number.isFinite(lower.getTime()) ||
    !Number.isFinite(last.getTime()) ||
    lower.toISOString().slice(0, 10) !== from ||
    last.toISOString().slice(0, 10) !== to ||
    lower > last ||
    last.getTime() - lower.getTime() >= 366 * 86400000
  )
    throw new Error('invalid range');
  return {
    from: lower.toISOString(),
    toExclusive: new Date(last.getTime() + 86400000).toISOString(),
  };
}
export function OperationalReportsPage() {
  const { user, isRestoring } = useAuth();
  if (isRestoring)
    return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!user?.permissions.includes('reports.read'))
    return <Alert severity="error">دسترسی مشاهدهٔ گزارش لازم است.</Alert>;
  return (
    <Reports
      key={`${user.userId}:${[...user.permissions].sort().join(',')}`}
      credit={user.permissions.includes('credit.read')}
      customers={user.permissions.includes('customers.read')}
      catalog={user.permissions.includes('catalog.read')}
    />
  );
}
function Reports({
  credit,
  customers,
  catalog,
}: {
  credit: boolean;
  customers: boolean;
  catalog: boolean;
}) {
  const [dates, setDates] = useState(initialDates),
    [grain, setGrain] = useState<'day' | 'week' | 'month'>('day'),
    [customerId, setCustomerId] = useState(''),
    [productId, setProductId] = useState(''),
    [status, setStatus] = useState('');
  const [view, setView] = useState('summary'),
    [query, setQuery] = useState<OperationalReportQuery>(() => ({
      ...reportDayRange(dates.from, dates.to),
      grain: 'day',
    })),
    [attempt, setAttempt] = useState(0),
    [offset, setOffset] = useState(0),
    [invalid, setInvalid] = useState(false),
    [asOf, setAsOf] = useState(() => new Date().toISOString());
  function submit() {
    try {
      setQuery({
        ...reportDayRange(dates.from, dates.to),
        grain,
        customerId: customerId || undefined,
        productId: productId || undefined,
        status: status
          ? (status as OperationalReportQuery['status'])
          : undefined,
      });
      setAsOf(
        new Date(
          Math.min(
            Date.parse(reportDayRange(dates.from, dates.to).toExclusive),
            Date.now(),
          ),
        ).toISOString(),
      );
      setOffset(0);
      setAttempt((value) => value + 1);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <Stack spacing={3}>
      <PageHeader
        title="گزارش‌های عملیاتی"
        description="سفارش، وصول، بازپرداخت، فاکتور و بدهی با مبنای ثبت‌شدهٔ خودشان گزارش می‌شوند."
      />
      <Paper
        component="form"
        sx={{ p: 2 }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="از تاریخ میلادی (UTC)"
              type="date"
              value={dates.from}
              onChange={(event) =>
                setDates((value) => ({ ...value, from: event.target.value }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="تا پایان تاریخ میلادی (UTC)"
              type="date"
              value={dates.to}
              onChange={(event) =>
                setDates((value) => ({ ...value, to: event.target.value }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="گروه‌بندی"
              value={grain}
              onChange={(event) => setGrain(event.target.value as typeof grain)}
              sx={{ minWidth: 160 }}
            >
              {[
                ['day', 'روزانه'],
                ['week', 'هفتگی'],
                ['month', 'ماهانه'],
              ].map(([value, label]) => (
                <MenuItem value={value} key={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="وضعیت فعلی سفارش"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">همهٔ وضعیت‌ها</MenuItem>
              {(
                [
                  'DRAFT',
                  'PENDING_PAYMENT',
                  'PAID',
                  'CREDIT_APPROVED',
                  'CANCELLED',
                  'RETURNED',
                ] as const
              ).map((value) => (
                <MenuItem value={value} key={value}>
                  {dashboardStatusLabel(value)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <ReportSelector
              kind="customer"
              allowed={customers}
              value={customerId}
              onChange={setCustomerId}
            />
            <ReportSelector
              kind="product"
              allowed={catalog}
              value={productId}
              onChange={setProductId}
            />
          </Stack>
          {invalid && (
            <Alert severity="error">
              تاریخ‌های معتبر با بازهٔ حداکثر ۳۶۶ روز انتخاب کنید.
            </Alert>
          )}
          <Button type="submit" variant="contained" sx={{ alignSelf: 'start' }}>
            اعمال فیلتر گزارش
          </Button>
        </Stack>
      </Paper>
      <Alert severity="info">
        ارزش سفارش شامل سفارش‌های پرداخت‌نشده و لغوشده هم هست. وصول درگاه از
        تأیید ثبت‌شدهٔ پرداخت محاسبه می‌شود؛ دریافت نسیه و برگشت وجه جداست. محیط
        sandbox در جدول مشخص می‌شود.
      </Alert>
      {view === 'debtors' && (
        <Alert severity="info">
          مانده و سررسید در تاریخ {formatIranDateTime(asOf)} از دفترکل محاسبه
          می‌شود. این گزارش با فیلتر مشتری کار می‌کند؛ وضعیت سفارش و محصول، بدهی
          تاریخی مشتری را تغییر نمی‌دهد.
        </Alert>
      )}
      {productId && view !== 'debtors' && (
        <Alert severity="info">
          فیلتر محصول، سفارش‌های شامل آن محصول را انتخاب می‌کند؛ مبلغ کل سفارش
          یا پرداخت، قیمت فقط همان محصول محسوب نمی‌شود.
        </Alert>
      )}
      <Tabs
        value={view}
        onChange={(_, next: string) => {
          setView(next);
          setOffset(0);
        }}
        variant="scrollable"
        aria-label="نوع گزارش"
      >
        <Tab label="خلاصه و روند" value="summary" />
        <Tab label="سفارش و پرداخت" value="orders" />
        <Tab label="بدهکاران و سررسید" value="debtors" disabled={!credit} />
      </Tabs>
      {!credit && (
        <Typography color="text.secondary">
          مشاهدهٔ بدهکاران به دسترسی دفترکل نسیه نیاز دارد.
        </Typography>
      )}
      <ReportResult
        key={`${view}:${JSON.stringify(query)}:${asOf}:${offset}:${attempt}`}
        view={view}
        query={query}
        asOf={asOf}
        offset={offset}
        page={setOffset}
        retry={() => setAttempt((value) => value + 1)}
      />
    </Stack>
  );
}
function ReportSelector({
  kind,
  allowed,
  value,
  onChange,
}: {
  kind: 'customer' | 'product';
  allowed: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [activeSearch, setActiveSearch] = useState(''),
    [attempt, setAttempt] = useState(0);
  const label = kind === 'customer' ? 'مشتری' : 'محصول';
  return (
    <Stack spacing={1} sx={{ flex: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField
          label={`جستجوی ${label}`}
          disabled={!allowed}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          inputProps={{ maxLength: 64 }}
        />
        <Button
          type="button"
          disabled={!allowed}
          onClick={() => {
            setActiveSearch(search);
            setAttempt((value) => value + 1);
          }}
        >
          جستجوی {label}
        </Button>
      </Stack>
      {allowed ? (
        <OptionResult
          key={`${activeSearch}:${attempt}`}
          kind={kind}
          search={activeSearch}
          value={value}
          onChange={onChange}
        />
      ) : (
        <Typography color="text.secondary">
          فیلتر {label} به دسترسی مشاهدهٔ {label} نیاز دارد.
        </Typography>
      )}
    </Stack>
  );
}
function OptionResult({
  kind,
  search,
  value,
  onChange,
}: {
  kind: 'customer' | 'product';
  search: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const label = kind === 'customer' ? 'مشتری' : 'محصول';
  useEffect(() => {
    const controller = new AbortController();
    void readReportOptions(kind, search, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && !(cause instanceof ApiAbortError))
          setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, search]);
  return (
    <>
      {error && (
        <Alert severity="error">
          فهرست {label} دریافت نشد؛ دوباره جستجو کنید.
        </Alert>
      )}
      <TextField
        select
        label={`انتخاب ${label}`}
        value={value}
        disabled={loading || error}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">
          همهٔ {kind === 'customer' ? 'مشتریان' : 'محصولات'}
        </MenuItem>
        {value && !options.some((row) => row.id === value) && (
          <MenuItem value={value}>انتخاب فعلی (خارج از نتایج جستجو)</MenuItem>
        )}
        {options.map((row) => (
          <MenuItem value={row.id} key={row.id}>
            {row.label}
          </MenuItem>
        ))}
      </TextField>
      {loading ? (
        <Typography role="status">در حال دریافت {label}…</Typography>
      ) : (
        <Typography variant="caption">
          حداکثر ۲۵ نتیجه؛ برای یافتن موارد دیگر جستجو کنید.
        </Typography>
      )}
    </>
  );
}
function reportError(error: unknown) {
  if (error instanceof ApiClientError && error.statusCode === 403)
    return 'دسترسی گزارش تغییر کرده است؛ مجوزهای حساب را بررسی کنید.';
  if (error instanceof ApiClientError && error.statusCode === 400)
    return 'فیلتر گزارش معتبر نیست؛ تاریخ و موارد انتخاب‌شده را بررسی کنید.';
  return 'گزارش دریافت نشد؛ اتصال و نشست خود را بررسی و دوباره تلاش کنید.';
}
function ReportResult({
  view,
  query,
  asOf,
  offset,
  page,
  retry,
}: {
  view: string;
  query: OperationalReportQuery;
  asOf: string;
  offset: number;
  page: (value: number) => void;
  retry: () => void;
}) {
  const [summary, setSummary] = useState<OperationalReportSummary>(),
    [orders, setOrders] = useState<ReportOrdersResponse['data']>(),
    [debtors, setDebtors] = useState<DebtorsReportResponse['data']>(),
    [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        if (view === 'summary') {
          const result = await readOperationalReport(query, controller.signal);
          if (!controller.signal.aborted) setSummary(result);
        } else if (view === 'orders') {
          const result = await readReportOrders(
            query,
            offset,
            controller.signal,
          );
          if (!controller.signal.aborted) setOrders(result);
        } else {
          const result = await readReportDebtors(
            { asOf, customerId: query.customerId, offset },
            controller.signal,
          );
          if (!controller.signal.aborted) setDebtors(result);
        }
      } catch (cause) {
        if (!controller.signal.aborted && !(cause instanceof ApiAbortError))
          setError(cause);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [view, query, asOf, offset]);
  if (loading)
    return <Typography role="status">در حال محاسبهٔ گزارش…</Typography>;
  if (error !== undefined)
    return (
      <Alert severity="error">
        {reportError(error)}
        <Button onClick={retry}>تلاش دوباره گزارش</Button>
      </Alert>
    );
  const count = orders?.count ?? debtors?.count;
  return (
    <Stack spacing={2}>
      <Button onClick={retry} sx={{ alignSelf: 'start' }}>
        بازخوانی گزارش
      </Button>
      <Typography variant="caption">
        زمان محاسبه:{' '}
        {formatIranDateTime(
          summary?.generatedAt ?? orders?.generatedAt ?? debtors!.generatedAt,
        )}
      </Typography>
      {summary && <Summary report={summary} />}
      {orders && (
        <>
          {orders.items.length === 0 ? (
            <Typography>سفارشی با این فیلتر وجود ندارد.</Typography>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table aria-label="گزارش سفارش و پرداخت">
                <TableHead>
                  <TableRow>
                    {[
                      'سفارش',
                      'زمان',
                      'وضعیت',
                      'ارزش سفارش (ریال)',
                      'تلاش پرداخت',
                      'تسویه درگاه (ریال)',
                      'بازپرداخت (ریال)',
                      'فاکتور صادرشده',
                    ].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/orders/${encodeURIComponent(row.id)}`}>
                          {row.number}
                        </Link>
                      </TableCell>
                      <TableCell>{formatIranDateTime(row.createdAt)}</TableCell>
                      <TableCell>{dashboardStatusLabel(row.status)}</TableCell>
                      <TableCell>{formatIrr(row.total.amount)}</TableCell>
                      <TableCell>{formatCount(row.paymentAttempts)}</TableCell>
                      <TableCell>
                        {formatIrr(row.providerSettled.amount)}
                      </TableCell>
                      <TableCell>
                        {formatIrr(row.gatewayRefunded.amount)}
                      </TableCell>
                      <TableCell>
                        {row.issuedInvoiceNumber ?? 'صادر نشده'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
      {debtors && (
        <>
          {debtors.items.length === 0 ? (
            <Typography>
              بدهی یا تعهد برگشت وجهی با این فیلتر وجود ندارد.
            </Typography>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table aria-label="گزارش بدهکاران و سررسید">
                <TableHead>
                  <TableRow>
                    {[
                      'حساب مشتری',
                      'سند باز',
                      'مانده (ریال)',
                      'سررسیدنشده (ریال)',
                      'تا ۳۰ روز (ریال)',
                      '۳۱ تا ۶۰ روز (ریال)',
                      '۶۱ تا ۹۰ روز (ریال)',
                      'بیش از ۹۰ روز (ریال)',
                      'تعهد برگشت وجه (ریال)',
                    ].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {debtors.items.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>
                        <Link
                          href={`/customers/${encodeURIComponent(row.customerId)}/credit`}
                        >
                          مشاهدهٔ حساب
                        </Link>
                      </TableCell>
                      <TableCell>{formatCount(row.documents)}</TableCell>
                      {[
                        row.outstanding,
                        row.notDue,
                        row.overdueUpTo30Days,
                        row.overdue31To60Days,
                        row.overdue61To90Days,
                        row.overdueOver90Days,
                        row.refundObligation,
                      ].map((value, index) => (
                        <TableCell key={index}>
                          {formatIrr(value.amount)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
      {count !== undefined && (
        <Stack direction="row" spacing={2}>
          <Button
            disabled={offset === 0}
            onClick={() => page(Math.max(0, offset - 25))}
          >
            صفحهٔ قبل
          </Button>
          <Typography>تعداد نتایج: {formatCount(count)}</Typography>
          <Button
            disabled={offset + 25 >= count}
            onClick={() => page(offset + 25)}
          >
            صفحهٔ بعد
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
function Summary({ report }: { report: OperationalReportSummary }) {
  const maximum = Math.max(1, ...report.topItems.map((row) => row.quantity));
  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' },
          gap: 2,
        }}
      >
        {Object.entries(report.totals).map(([metric, value]) => (
          <Paper key={metric} sx={{ p: 2 }}>
            <Typography>{metricLabels[metric as ReportMetric]}</Typography>
            <Typography variant="h6">
              {formatIrr(value.amount.amount)}
            </Typography>
            <Typography variant="caption">
              تعداد ثبت/تخصیص: {formatCount(value.count)}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="h6">روند گزارش در تقویم تهران</Typography>
      {report.timeline.length === 0 ? (
        <Typography>در این بازه رویدادی ثبت نشده است.</Typography>
      ) : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table aria-label="روند زمانی گزارش">
            <TableHead>
              <TableRow>
                {[
                  'آغاز دوره (میلادی تهران)',
                  'نوع ثبت',
                  'محیط درگاه',
                  'تعداد',
                  'مبلغ (ریال)',
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {report.timeline.map((row) => (
                <TableRow
                  key={`${row.period}:${row.metric}:${row.environment}`}
                >
                  <TableCell>{row.period}</TableCell>
                  <TableCell>{metricLabels[row.metric]}</TableCell>
                  <TableCell>{row.environment ?? '—'}</TableCell>
                  <TableCell>{formatCount(row.count)}</TableCell>
                  <TableCell>{formatIrr(row.amount.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {[
          ['وضعیت سفارش‌های ایجادشده', report.orderStatuses],
          ['وضعیت تلاش‌های پرداخت', report.paymentAttemptStatuses],
        ].map(([title, rows]) => (
          <Paper sx={{ p: 2, flex: 1 }} key={title as string}>
            <Typography variant="h6">{title as string}</Typography>
            {(rows as typeof report.orderStatuses).length === 0 ? (
              <Typography>داده‌ای ثبت نشده است.</Typography>
            ) : (
              (rows as typeof report.orderStatuses).map((row) => (
                <Typography key={row.status}>
                  {dashboardStatusLabel(row.status)} — {formatCount(row.count)}{' '}
                  — {formatIrr(row.amount.amount)}
                </Typography>
              ))
            )}
          </Paper>
        ))}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">
          کالاهای پرفروش بر مبنای تعداد ناخالص
        </Typography>
        <Typography variant="body2">
          اقلام سفارش‌های دارای تأیید پرداخت یا نسیه، پیش از مرجوعی و بازپرداخت؛
          مبلغ این بخش درآمد خالص نیست.
        </Typography>
        {report.topItems.length === 0 ? (
          <Typography sx={{ mt: 2 }}>
            فروش تأییدشده‌ای در این بازه ثبت نشده است.
          </Typography>
        ) : (
          <>
            <Box
              role="img"
              aria-label="نمودار تعداد ناخالص اقلام تأییدشده"
              sx={{ my: 2 }}
            >
              {report.topItems.map((row) => (
                <Box key={row.sku} sx={{ mb: 1 }}>
                  <Typography>
                    {row.title} — {formatCount(row.quantity)}
                  </Typography>
                  <Box
                    sx={{
                      height: 8,
                      width: `${(row.quantity / maximum) * 100}%`,
                      backgroundColor: 'primary.main',
                      borderRadius: 1,
                    }}
                    aria-hidden
                  />
                </Box>
              ))}
            </Box>
            <Table aria-label="اقلام پرفروش ناخالص">
              <TableHead>
                <TableRow>
                  <TableCell>کد کالا</TableCell>
                  <TableCell>شرح ذخیره‌شده</TableCell>
                  <TableCell>تعداد</TableCell>
                  <TableCell>ارزش اقلام (ریال)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.topItems.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{formatCount(row.quantity)}</TableCell>
                    <TableCell>{formatIrr(row.grossValue.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>
      {report.unavailable.length > 0 && (
        <Alert severity="info">
          گزارش اصلاحیه و ابطال فاکتور، ارزش‌گذاری انبار با هزینهٔ معتبر و خروجی
          PDF/Excel هنوز آمادهٔ پذیرش نیستند.
        </Alert>
      )}
    </Stack>
  );
}
