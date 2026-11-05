'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, MenuItem, Pagination, Paper, Stack, Switch, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import type { CouponAdmin, PromotionAdmin, PromotionInput, PromotionRedemptionRow, PromotionReportRow } from '@iranyaragh/contracts';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { canManageSettings, hasPermission } from '@/lib/settings/settings-permissions';
import {
  createPromotion, generateCoupons, listCoupons, listPromotions, listRedemptions, readPromotionReport, setCouponActive, setPromotionActive, updatePromotion,
} from '@/lib/promotions/promotions-api';
import {
  KIND_LABELS, MODE_LABELS, REDEMPTION_LABELS, REDEMPTION_TONES, STATE_LABELS, STATE_TONES, formatIrr, percentLabel, toLatinDigits,
} from '@/lib/promotions/promotion-labels';
import { PromotionForm } from './PromotionForm';

const PAGE = 20;

export function promotionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const map: Record<string, string> = {
      STALE_VERSION: 'کمپین توسط کاربر دیگری تغییر کرده است؛ فهرست را تازه‌سازی و دوباره بررسی کنید.',
      AUTH_REAUTHENTICATION_REQUIRED: 'برای این عملیات حساس باید رمز و کد دومرحله‌ای را دوباره تأیید کنید و سپس تلاش کنید.',
      FORBIDDEN: 'دسترسی لازم برای مدیریت تخفیف‌ها را ندارید.',
      IDEMPOTENCY_CONFLICT: 'این درخواست با محتوای دیگری قبلاً ثبت شده است؛ فرم را دوباره باز کنید.',
      COUPON_CODE_TAKEN: 'این کد تخفیف قبلاً ثبت شده است.',
      LIMIT_BELOW_USAGE: 'سقف استفاده نمی‌تواند کمتر از تعداد استفادهٔ فعلی باشد.',
      INVALID_REQUEST: 'مقادیر واردشده معتبر نیست؛ فیلدها را بررسی کنید.',
      NOT_FOUND: 'مورد یافت نشد.',
    };
    if (map[error.code]) return map[error.code]!;
  }
  return 'عملیات تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
}

export function PromotionsPage() {
  const auth = useAuth();
  if (auth.isRestoring) return <Typography role="status">در حال بررسی نشست…</Typography>;
  if (!canManageSettings(auth.user)) return <Alert severity="error">دسترسی مدیریت تخفیف‌ها لازم است.</Alert>;
  return <PromotionsWorkspace canReport={hasPermission(auth.user, 'reports.read')} />;
}

function PromotionsWorkspace({ canReport }: { canReport: boolean }) {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <PageHeader title="تخفیف‌ها و کمپین‌ها" description="کدهای تخفیف و کمپین‌های خودکار؛ تمام محاسبات و محدودیت‌ها در سرور اعمال می‌شود." breadcrumbs={[{ label: 'بازاریابی' }, { label: 'تخفیف‌ها' }]} />
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="کمپین‌ها" />
        {canReport && <Tab label="سابقهٔ استفاده" />}
        {canReport && <Tab label="گزارش عملکرد" />}
      </Tabs>
      {tab === 0 && <CampaignList />}
      {tab === 1 && canReport && <RedemptionHistory />}
      {tab === 2 && canReport && <PerformanceReport />}
    </Box>
  );
}

function CampaignList() {
  const [items, setItems] = useState<PromotionAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState<PromotionAdmin | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<PromotionAdmin | null>(null);
  const [couponsFor, setCouponsFor] = useState<PromotionAdmin | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setLoadError(null);
    listPromotions({ q: q.trim() || undefined, state: state || undefined, mode: mode || undefined, offset: (page - 1) * PAGE, limit: PAGE }, abort.signal)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => { if (!(e instanceof ApiAbortError)) setLoadError(e); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [page, q, state, mode, refresh]);

  // A retry of the same payload reuses its key so an uncertain network result can never double-create.
  const keyFor = (fingerprint: string) => {
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: `promo-${crypto.randomUUID()}` };
    return pending.current.key;
  };

  async function submit(input: PromotionInput) {
    setBusy(true); setFormError(null);
    try {
      if (editing === 'new') await createPromotion(input, keyFor(`create:${JSON.stringify(input)}`));
      else if (editing) await updatePromotion(editing.id, input, editing.version, keyFor(`update:${editing.id}:${editing.version}:${JSON.stringify(input)}`));
      pending.current = null; setEditing(null); setNotice('کمپین در سرور ذخیره شد.'); setRefresh((n) => n + 1);
    } catch (cause) { setFormError(promotionErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function confirmToggle() {
    if (!toggle) return;
    setBusy(true); setActionError(null);
    try {
      await setPromotionActive(toggle.id, !toggle.isActive, toggle.version, keyFor(`active:${toggle.id}:${toggle.version}:${!toggle.isActive}`));
      pending.current = null; setNotice(toggle.isActive ? 'کمپین بلافاصله غیرفعال شد.' : 'کمپین فعال شد.'); setToggle(null); setRefresh((n) => n + 1);
    } catch (cause) { setActionError(promotionErrorMessage(cause)); setToggle(null); }
    finally { setBusy(false); }
  }

  const describeValue = (p: PromotionAdmin) =>
    p.kind === 'PERCENTAGE' ? percentLabel(p.percentBp) : p.kind === 'FREE_SHIPPING' ? 'هزینهٔ ارسال' : p.amount ? formatIrr(p.amount) : '';

  return (
    <Box>
      {notice && <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField size="small" label="جستجوی نام یا کد" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} sx={{ minWidth: 220 }} />
        <TextField select size="small" label="وضعیت" value={state} onChange={(e) => { setPage(1); setState(e.target.value); }} sx={{ minWidth: 160 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(STATE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="نوع استفاده" value={mode} onChange={(e) => { setPage(1); setMode(e.target.value); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(MODE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={() => { setFormError(null); setEditing('new'); }}>کمپین جدید</Button>
      </Stack>
      {loading && <Typography role="status">در حال دریافت کمپین‌ها…</Typography>}
      {Boolean(loadError) && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh((n) => n + 1)}>تلاش دوباره</Button>}>{promotionErrorMessage(loadError)}</Alert>}
      {!loading && !loadError && items.length === 0 && <Alert severity="info">کمپینی با این فیلترها وجود ندارد. با «کمپین جدید» اولین تخفیف را بسازید.</Alert>}
      {items.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small" aria-label="فهرست کمپین‌ها">
            <TableHead>
              <TableRow>
                <TableCell>نام</TableCell><TableCell>نوع</TableCell><TableCell>مقدار</TableCell><TableCell>وضعیت</TableCell>
                <TableCell>استفاده</TableCell><TableCell>فروش منتسب</TableCell><TableCell>فعال</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.name}<Typography variant="caption" display="block" color="text.secondary">{MODE_LABELS[p.mode]}{p.mode === 'COUPON' ? ` · ${p.couponCount.toLocaleString('fa-IR')} کد` : ''}</Typography></TableCell>
                  <TableCell>{KIND_LABELS[p.kind]}</TableCell>
                  <TableCell>{describeValue(p)}</TableCell>
                  <TableCell><StatusChip label={STATE_LABELS[p.state]} tone={STATE_TONES[p.state]} size="small" /></TableCell>
                  <TableCell>{p.stats.confirmed.toLocaleString('fa-IR')} قطعی · {p.stats.reserved.toLocaleString('fa-IR')} رزرو{p.maxRedemptions !== null ? ` / سقف ${p.maxRedemptions.toLocaleString('fa-IR')}` : ''}</TableCell>
                  <TableCell>{formatIrr(p.stats.salesAttributed.amount)}</TableCell>
                  <TableCell><Switch checked={p.isActive} onChange={() => setToggle(p)} slotProps={{ input: { 'aria-label': `${p.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} ${p.name}` } }} /></TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => { setFormError(null); setEditing(p); }}>ویرایش</Button>
                    {p.mode === 'COUPON' && <Button size="small" onClick={() => setCouponsFor(p)}>کدها</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {total > PAGE && <Pagination sx={{ mt: 2 }} count={Math.ceil(total / PAGE)} page={page} onChange={(_, v) => setPage(v)} />}

      <Dialog open={editing !== null} onClose={() => !busy && setEditing(null)} fullWidth maxWidth="md" aria-labelledby="promotion-form-title">
        <DialogTitle id="promotion-form-title">{editing === 'new' ? 'کمپین جدید' : 'ویرایش کمپین'}</DialogTitle>
        <DialogContent>
          {editing && <PromotionForm key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`} initial={editing === 'new' ? null : editing} busy={busy} error={formError} onSubmit={(i) => void submit(i)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={toggle !== null} setOpen={(o) => { if (!o) setToggle(null); }} type={toggle?.isActive ? 'deactivate' : 'dangerous'}
        title={toggle?.isActive ? 'غیرفعال‌سازی فوری کمپین' : 'فعال‌سازی کمپین'}
        description={toggle?.isActive ? `«${toggle.name}» بلافاصله برای همهٔ مشتریان متوقف می‌شود. سفارش‌های ثبت‌شده تغییر نمی‌کنند.` : `«${toggle?.name ?? ''}» طبق زمان‌بندی خود برای مشتریان فعال می‌شود.`}
        confirmLabel={toggle?.isActive ? 'غیرفعال کن' : 'فعال کن'} loading={busy} onConfirm={() => confirmToggle()}
      />
      {couponsFor && <CouponsDialog promotion={couponsFor} onClose={() => { setCouponsFor(null); setRefresh((n) => n + 1); }} />}
    </Box>
  );
}

function CouponsDialog({ promotion, onClose }: { promotion: PromotionAdmin; onClose: () => void }) {
  const [items, setItems] = useState<CouponAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const [count, setCount] = useState('1');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const key = useRef<{ fp: string; key: string } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    listCoupons(promotion.id, (page - 1) * PAGE, PAGE, abort.signal)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => { if (!(e instanceof ApiAbortError)) setError(promotionErrorMessage(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [promotion.id, page, reload]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    const body = {
      ...(code.trim() ? { code: code.trim() } : { count: Number(toLatinDigits(count)) || 1 }),
      maxRedemptions: maxRedemptions.trim() ? Number(toLatinDigits(maxRedemptions)) : null,
      customerId: customerId.trim() || null,
    };
    const fp = JSON.stringify(body);
    if (key.current?.fp !== fp) key.current = { fp, key: `coupon-${crypto.randomUUID()}` };
    try {
      await generateCoupons(promotion.id, body, key.current.key);
      key.current = null; setCode(''); setReload((n) => n + 1);
    } catch (cause) { setError(promotionErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function flip(c: CouponAdmin) {
    setBusy(true); setError(null);
    try { await setCouponActive(c.id, !c.isActive, `coupon-active-${crypto.randomUUID()}`); setReload((n) => n + 1); }
    catch (cause) { setError(promotionErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="coupons-title">
      <DialogTitle id="coupons-title">کدهای تخفیف — {promotion.name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack component="form" onSubmit={(e) => void add(e)} direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ my: 2 }}>
          <TextField size="small" label="کد دلخواه (لاتین/عدد)" value={code} onChange={(e) => setCode(e.target.value)} helperText="خالی = تولید خودکار" />
          <TextField size="small" label="تعداد کد تصادفی" value={count} disabled={Boolean(code.trim())} onChange={(e) => setCount(e.target.value)} />
          <TextField size="small" label="سقف استفادهٔ هر کد" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} helperText="۱ = یک‌بار مصرف" />
          <TextField size="small" label="شناسهٔ مشتری (اختیاری)" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          <Button type="submit" variant="contained" disabled={busy}>افزودن</Button>
        </Stack>
        {loading && <Typography role="status">در حال دریافت…</Typography>}
        {!loading && items.length === 0 && <Alert severity="info">هنوز کدی ثبت نشده است.</Alert>}
        {items.length > 0 && (
          <Table size="small" aria-label="کدهای تخفیف">
            <TableHead><TableRow><TableCell>کد</TableCell><TableCell>استفاده</TableCell><TableCell>مشتری</TableCell><TableCell>فعال</TableCell></TableRow></TableHead>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell dir="ltr" sx={{ fontFamily: 'monospace' }}>{c.code}</TableCell>
                  <TableCell>{c.usedCount.toLocaleString('fa-IR')}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions.toLocaleString('fa-IR')}` : ''}</TableCell>
                  <TableCell>{c.customerId ?? '—'}</TableCell>
                  <TableCell><Switch checked={c.isActive} disabled={busy} onChange={() => void flip(c)} slotProps={{ input: { 'aria-label': `فعال بودن کد ${c.code}` } }} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {total > PAGE && <Pagination sx={{ mt: 2 }} count={Math.ceil(total / PAGE)} page={page} onChange={(_, v) => setPage(v)} />}
        <Button onClick={onClose} sx={{ mt: 2 }}>بستن</Button>
      </DialogContent>
    </Dialog>
  );
}

function RedemptionHistory() {
  const [items, setItems] = useState<PromotionRedemptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback((signal: AbortSignal) => {
    setLoading(true); setError(null);
    listRedemptions({ status: status || undefined, customerId: customerId.trim() || undefined, offset: (page - 1) * PAGE, limit: PAGE }, signal)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => { if (!(e instanceof ApiAbortError)) setError(e); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [page, status, customerId]);
  useEffect(() => { const a = new AbortController(); load(a.signal); return () => a.abort(); }, [load]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="وضعیت استفاده" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} sx={{ minWidth: 220 }}>
          <MenuItem value="">همه</MenuItem>
          {Object.entries(REDEMPTION_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <TextField size="small" label="شناسهٔ مشتری" value={customerId} onChange={(e) => { setPage(1); setCustomerId(e.target.value); }} />
      </Stack>
      {loading && <Typography role="status">در حال دریافت…</Typography>}
      {Boolean(error) && <Alert severity="error">{promotionErrorMessage(error)}</Alert>}
      {!loading && !error && items.length === 0 && <Alert severity="info">استفاده‌ای ثبت نشده است.</Alert>}
      {items.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small" aria-label="سابقهٔ استفاده">
            <TableHead><TableRow><TableCell>کمپین</TableCell><TableCell>کد</TableCell><TableCell>سفارش</TableCell><TableCell>مشتری</TableCell><TableCell>وضعیت</TableCell><TableCell>تخفیف</TableCell><TableCell>بازگشتی</TableCell><TableCell>مبلغ سفارش</TableCell></TableRow></TableHead>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.promotionName}</TableCell>
                  <TableCell dir="ltr">{r.couponCode ?? '—'}</TableCell>
                  <TableCell dir="ltr">{r.orderNumber}</TableCell>
                  <TableCell dir="ltr">{r.customerId}</TableCell>
                  <TableCell><StatusChip label={REDEMPTION_LABELS[r.status]} tone={REDEMPTION_TONES[r.status]} size="small" /></TableCell>
                  <TableCell>{formatIrr(r.discount.amount)}</TableCell>
                  <TableCell>{formatIrr(r.refundedDiscount.amount)}</TableCell>
                  <TableCell>{formatIrr(r.orderTotal.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {total > PAGE && <Pagination sx={{ mt: 2 }} count={Math.ceil(total / PAGE)} page={page} onChange={(_, v) => setPage(v)} />}
    </Box>
  );
}

function PerformanceReport() {
  const [rows, setRows] = useState<PromotionReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const abort = new AbortController();
    readPromotionReport(abort.signal).then(setRows).catch((e) => { if (!(e instanceof ApiAbortError)) setError(e); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        استفادهٔ رزروشده، پرداخت‌شده، بازپرداخت‌شده و لغو/منقضی جدا شمارش می‌شوند. فروش منتسب فقط شامل سفارش‌های پرداخت‌شده است.
      </Typography>
      {loading && <Typography role="status">در حال دریافت گزارش…</Typography>}
      {Boolean(error) && <Alert severity="error">{promotionErrorMessage(error)}</Alert>}
      {!loading && !error && rows.length === 0 && <Alert severity="info">کمپینی برای گزارش وجود ندارد.</Alert>}
      {rows.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small" aria-label="گزارش کمپین‌ها">
            <TableHead><TableRow><TableCell>کمپین</TableCell><TableCell>وضعیت</TableCell><TableCell>رزرو</TableCell><TableCell>پرداخت‌شده</TableCell><TableCell>لغو/منقضی</TableCell><TableCell>بازپرداخت کامل</TableCell><TableCell>مجموع تخفیف قطعی</TableCell><TableCell>تخفیف بازگشتی</TableCell><TableCell>فروش منتسب</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.promotionId}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell><StatusChip label={STATE_LABELS[r.state]} tone={STATE_TONES[r.state]} size="small" /></TableCell>
                  <TableCell>{r.stats.reserved.toLocaleString('fa-IR')}</TableCell>
                  <TableCell>{r.stats.confirmed.toLocaleString('fa-IR')}</TableCell>
                  <TableCell>{r.stats.released.toLocaleString('fa-IR')}</TableCell>
                  <TableCell>{r.stats.refunded.toLocaleString('fa-IR')}</TableCell>
                  <TableCell>{formatIrr(r.stats.discountConfirmed.amount)}</TableCell>
                  <TableCell>{formatIrr(r.stats.discountRefunded.amount)}</TableCell>
                  <TableCell>{formatIrr(r.stats.salesAttributed.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
