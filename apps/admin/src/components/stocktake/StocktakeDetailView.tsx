'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { CheckCheck, Lock, Play, Send, XCircle } from 'lucide-react';
import type { StocktakeDetail } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  approveStocktake, cancelStocktake, getStocktake, newStocktakeCommandKey, recordStocktakeCounts,
  startStocktake, submitStocktake,
} from '@/lib/stocktake/stocktake-api';
import { stocktakeStatusLabels, stocktakeStatusTone } from '@/lib/stocktake/stocktake-labels';
import { canApproveStocktakes, canCountStocktakes, canManageStocktakes } from '@/lib/stocktake/stocktake-permissions';

type Props = { stocktakeId: string };
const number = new Intl.NumberFormat('fa-IR');
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

export function StocktakeDetailView({ stocktakeId }: Props) {
  const { user } = useAuth();
  const canCount = canCountStocktakes(user);
  const canApprove = canApproveStocktakes(user);
  const canManage = canManageStocktakes(user);
  const [stocktake, setStocktake] = useState<StocktakeDetail | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    return getStocktake(stocktakeId, signal)
      .then(setStocktake)
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(failure instanceof Error ? failure.message : 'دریافت برگهٔ انبارگردانی ناموفق بود.');
      })
      .finally(() => setLoading(false));
  }, [stocktakeId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function run(action: () => Promise<StocktakeDetail>, success: string) {
    if (busy) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      setStocktake(await action());
      setInfo(success);
      setCounts({}); setNotes({});
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : 'انجام عملیات ناموفق بود؛ وضعیت برگه را بازخوانی کنید.');
      void load();
    } finally { setBusy(false); }
  }

  if (loading && !stocktake) return <Alert severity="info">در حال دریافت برگه…</Alert>;
  if (!stocktake) return <>
    {error ? <Alert severity="error" action={<Button size="small" onClick={() => void load()}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <Button startIcon={<Lock size={16} />} onClick={() => void load()}>تلاش دوباره</Button>
  </>;

  const open = stocktake.status === 'DRAFT' || stocktake.status === 'COUNTING' || stocktake.status === 'REVIEW';
  const countable = stocktake.status === 'COUNTING' || stocktake.status === 'REVIEW';
  const pending = stocktake.summary.pendingLines;
  const visibleLines = stocktake.lines.map((line) => ({ line, countedQty: counts[line.id] ?? '' }));
  const dirtyLines = visibleLines.filter((entry) => entry.countedQty.trim() !== '');

  return <>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
      <Chip size="small" color={stocktakeStatusTone[stocktake.status]} label={stocktakeStatusLabels[stocktake.status]} />
      <Typography variant="body2" dir="ltr">{stocktake.number}</Typography>
      <Typography variant="body2">نسخه {number.format(stocktake.version)}</Typography>
      <Typography variant="body2">شمارش‌شده: {number.format(stocktake.summary.countedLines)} از {number.format(stocktake.summary.totalLines)}</Typography>
      {canApprove && typeof stocktake.summary.netDifference === 'number'
        ? <Typography variant="body2" fontWeight={700}>مغایرت خالص: {number.format(stocktake.summary.netDifference)}</Typography> : null}
    </Stack>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    {info ? <Alert severity="success" sx={{ mb: 2 }}>{info}</Alert> : null}
    {!canApprove ? <Alert severity="info" sx={{ mb: 2 }}>مقدار انتظاری و مغایرت برای شما پنهان است تا شمارش مستقل از سیستم ثبت شود.</Alert> : null}
    {stocktake.status === 'DRAFT' ? <Alert severity="warning" sx={{ mb: 2 }}>برگه در وضعیت پیش‌نویس است و هنوز برگهٔ شمارشی ساخته نشده است. با «آغاز شمارش» موجودی زنده قفل و به برگه تبدیل می‌شود.</Alert> : null}
    {pending > 0 && stocktake.status === 'REVIEW' ? <Alert severity="warning" sx={{ mb: 2 }}>{number.format(pending)} خط هنوز شمارش نشده است؛ تأیید تا شمارش کامل همهٔ خطوط ممکن نیست.</Alert> : null}

    <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
      {stocktake.status === 'DRAFT' && canCount
        ? <Button variant="contained" startIcon={<Play size={16} />} disabled={busy} onClick={() => void run(
          async () => startStocktake(stocktakeId, { expectedVersion: stocktake.version }, newStocktakeCommandKey()),
          'برگهٔ شمارش ساخته شد.')}>آغاز شمارش</Button> : null}
      {countable && canCount ? <Button variant="contained" disabled={busy || !dirtyLines.length}
        onClick={() => void run(
          async () => recordStocktakeCounts(stocktakeId, {
            expectedVersion: stocktake.version,
            lines: dirtyLines.map(({ line }) => ({ locationId: line.locationId, variantId: line.variantId,
              countedQty: Number(counts[line.id]), notes: notes[line.id]?.trim() || null })),
          }, newStocktakeCommandKey()),
          'شمارش ثبت شد.')}>ثبت {dirtyLines.length ? `${number.format(dirtyLines.length)} خط` : 'شمارش'}</Button> : null}
      {stocktake.status === 'COUNTING' && canCount
        ? <Button variant="outlined" startIcon={<Send size={16} />} disabled={busy} onClick={() => void run(
          async () => submitStocktake(stocktakeId, { expectedVersion: stocktake.version }, newStocktakeCommandKey()),
          'برگه به بازبینی ارسال شد.')}>ارسال برای بازبینی</Button> : null}
      {stocktake.status === 'REVIEW' && canApprove
        ? <Button variant="contained" color="success" startIcon={<CheckCheck size={16} />} disabled={busy || pending > 0}
          onClick={() => void run(
            async () => approveStocktake(stocktakeId, { expectedVersion: stocktake.version }, newStocktakeCommandKey()),
            'انبارگردانی تأیید و روی دفترکل اعمال شد.')}>تأیید و اعمال روی دفترکل</Button> : null}
      {open && canManage
        ? <Button color="error" startIcon={<XCircle size={16} />} disabled={busy} onClick={() => void run(
          async () => cancelStocktake(stocktakeId, { expectedVersion: stocktake.version }, newStocktakeCommandKey()),
          'برگه لغو شد.')}>لغو برگه</Button> : null}
      {stocktake.status === 'COMPLETED' ? <Alert severity="success" sx={{ flex: 1 }}>موجودی این برگه روی دفترکل اعمال شده و برگه تغییرناپذیر است.</Alert> : null}
    </Stack>

    <Box sx={{ overflowX: 'auto' }}>
      <DataTable caption="برگهٔ شمارش" columns={[
        { id: 'location', label: 'مکان', render: (row) => `${row.line.locationCode} — ${row.line.locationName ?? '—'}` },
        { id: 'sku', label: 'SKU', render: (row) => row.line.sku },
        { id: 'product', label: 'کالا', render: (row) => `${row.line.productName}${row.line.variantTitle ? ` — ${row.line.variantTitle}` : ''}` },
        ...(canApprove ? [{ id: 'expected', label: 'انتظاری', render: (row: typeof visibleLines[number]) => number.format(row.line.expectedQty ?? 0) }] : []),
        ...(canApprove && countable ? [{ id: 'difference', label: 'مغایرت', render: (row: typeof visibleLines[number]) => row.line.difference === null || row.line.difference === undefined ? '—' : number.format(row.line.difference) }] : []),
        { id: 'counted', label: 'شمارش‌شده', render: (row) => row.line.countedQty === null ? '—' : number.format(row.line.countedQty) },
        { id: 'countedAt', label: 'زمان شمارش', render: (row) => row.line.countedAt ? dateTime.format(new Date(row.line.countedAt)) : '—' },
        { id: 'movement', label: 'سند انبار', render: (row) => row.line.movementId ?? '—' },
        ...(countable && canCount ? [{
          id: 'input', label: 'مقدار شمارش', render: (row: typeof visibleLines[number]) => <TextField size="small" type="number" value={row.countedQty}
            inputProps={{ min: 0, step: 1, dir: 'ltr', 'aria-label': `مقدار شمارش ${row.line.sku}` }}
            onChange={(event) => setCounts((current) => ({ ...current, [row.line.id]: event.target.value }))} />,
        }, {
          id: 'notes', label: 'یادداشت', render: (row: typeof visibleLines[number]) => <TextField size="small" value={notes[row.line.id] ?? ''}
            placeholder={row.line.notes ?? ''} inputProps={{ maxLength: 500 }}
            onChange={(event) => setNotes((current) => ({ ...current, [row.line.id]: event.target.value }))} />,
        }] : []),
      ]} rows={visibleLines} rowKey={(row) => row.line.id} loading={loading}
        emptyTitle="خطی یافت نشد" emptyDescription={stocktake.status === 'DRAFT' ? 'برگهٔ شمارش هنوز ساخته نشده است.' : 'برگهٔ شمارش خالی است.'}
        selectable={false} />
    </Box>
  </>;
}
