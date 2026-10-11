'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { CheckCheck, Lock, Play, Send, XCircle } from 'lucide-react';
import type { StocktakeDetail } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  approveStocktake, cancelStocktake, getStocktake, recordStocktakeCounts,
  startStocktake, submitStocktake,
} from '@/lib/stocktake/stocktake-api';
import { stocktakeStatusLabels, stocktakeStatusTone } from '@/lib/stocktake/stocktake-labels';
import { canApproveStocktakes, canCountStocktakes, canManageStocktakes, canReadStocktakes } from '@/lib/stocktake/stocktake-permissions';
import { parseStocktakeQuantity, stocktakeError } from '@/lib/stocktake/stocktake-errors';
import { useStocktakeCommand } from '@/lib/stocktake/useStocktakeCommand';
import { StocktakeHistory } from './StocktakeHistory';

type Props = { stocktakeId: string };
const number = new Intl.NumberFormat('fa-IR');
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

export function StocktakeDetailView({ stocktakeId }: Props) {
  const { user } = useAuth();
  const canRead = canReadStocktakes(user);
  const canCount = canCountStocktakes(user);
  const canApprove = canApproveStocktakes(user);
  const canManage = canManageStocktakes(user);
  const [stocktake, setStocktake] = useState<StocktakeDetail | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const command = useStocktakeCommand(detail => {
    setStocktake(detail); setCounts({}); setNotes({}); setInfo('دستور ثبت شد.');
  });
  const locked = command.busy || command.uncertain;

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    return getStocktake(stocktakeId, signal)
      .then(detail => { if (!signal?.aborted) setStocktake(detail); })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        if (!signal?.aborted) setError(stocktakeError(failure));
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [stocktakeId]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setStocktake(null); setCounts({}); setNotes({});
    void load(controller.signal);
    return () => controller.abort();
  }, [load, canRead, canApprove]);

  if (!canRead) return <Alert severity="warning">مجوز مشاهدهٔ انبارگردانی را ندارید.</Alert>;

  if (loading && !stocktake) return <Alert severity="info">در حال دریافت برگه…</Alert>;
  if (!stocktake) return <>
    {error ? <Alert severity="error" action={<Button size="small" onClick={() => void load()}>تلاش دوباره</Button>}>{error}</Alert> : null}
    <Button startIcon={<Lock size={16} />} onClick={() => void load()}>تلاش دوباره</Button>
  </>;

  const open = stocktake.status === 'DRAFT' || stocktake.status === 'COUNTING' || stocktake.status === 'REVIEW';
  const countable = stocktake.status === 'COUNTING';
  const pending = stocktake.summary.pendingLines;
  const visibleLines = stocktake.lines.map((line) => ({ line, countedQty: counts[line.id] ?? '' }));
  const dirtyLines = visibleLines.filter(entry => entry.countedQty.trim() !== '' ||
    (notes[entry.line.id] !== undefined && entry.line.countedQty !== null))
    .map(entry => ({ ...entry, countedQty: entry.countedQty.trim() || String(entry.line.countedQty) }));
  function saveCounts() {
    if (dirtyLines.some(({ line, countedQty }) => parseStocktakeQuantity(countedQty) === null || (notes[line.id]?.length ?? 0) > 500)) {
      command.setError('تعداد شمارش باید عدد صحیح بین ۰ و ۲٬۱۴۷٬۴۸۳٬۶۴۷ باشد.'); return;
    }
    const input = { expectedVersion: stocktake!.version, lines: dirtyLines.map(({ line, countedQty }) => ({
      locationId: line.locationId, variantId: line.variantId, countedQty: parseStocktakeQuantity(countedQty)!,
      notes: notes[line.id] === undefined ? line.notes : notes[line.id].trim() || null,
    })) };
    command.run(key => () => recordStocktakeCounts(stocktakeId, input, key));
  }

  return <>
    <PageHeader title={`انبارگردانی ${stocktake.number}`} eyebrow={`${stocktake.warehouseCode} — ${stocktake.warehouseName}`}
      breadcrumbs={[{ label: 'انبارگردانی', href: '/stocktakes' }, { label: stocktake.number }]}
      description="ثبت شمارش فیزیکی، بازبینی و تطبیق موجودی با دفترکل." />
    {user?.permissions.includes('inventory.read') ? <Button component={Link} href={`/inventory?warehouseId=${encodeURIComponent(stocktake.warehouseId)}`} sx={{ mb: 2 }}>مانده و گردش این انبار</Button> : null}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
      <Chip size="small" color={stocktakeStatusTone[stocktake.status]} label={stocktakeStatusLabels[stocktake.status]} />
      <Typography variant="body2" dir="ltr">{stocktake.number}</Typography>
      <Typography variant="body2">نسخه {number.format(stocktake.version)}</Typography>
      <Typography variant="body2">شمارش‌شده: {number.format(stocktake.summary.countedLines)} از {number.format(stocktake.summary.totalLines)}</Typography>
      {canApprove && typeof stocktake.summary.netDifference === 'number'
        ? <Typography variant="body2" fontWeight={700}>مغایرت خالص: {number.format(stocktake.summary.netDifference)}</Typography> : null}
    </Stack>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    {command.error ? <Alert severity="error" sx={{ mb: 2 }}>{command.error}</Alert> : null}
    {info ? <Alert severity="success" sx={{ mb: 2 }}>{info}</Alert> : null}
    {!canApprove ? <Alert severity="info" sx={{ mb: 2 }}>مقدار انتظاری و مغایرت برای شما پنهان است تا شمارش مستقل از سیستم ثبت شود.</Alert> : null}
    {stocktake.status === 'DRAFT' ? <Alert severity="warning" sx={{ mb: 2 }}>با آغاز شمارش، تصویر موجودی همان لحظه ثبت می‌شود. این برگه ورود و خروج بعدی کالا را متوقف نمی‌کند؛ تأیید نهایی، مقدار فیزیکی شمارش‌شده را روی موجودی زنده اعمال می‌کند.</Alert> : null}
    {pending > 0 && stocktake.status === 'REVIEW' ? <Alert severity="warning" sx={{ mb: 2 }}>{number.format(pending)} خط هنوز شمارش نشده است؛ تأیید تا شمارش کامل همهٔ خطوط ممکن نیست.</Alert> : null}

    <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
      {stocktake.status === 'DRAFT' && canManage
        ? <Button variant="contained" startIcon={<Play size={16} />} disabled={locked} onClick={() => command.run(
          key => () => startStocktake(stocktakeId, { expectedVersion: stocktake.version }, key))}>آغاز شمارش</Button> : null}
      {countable && canCount ? <Button variant="contained" disabled={locked || !dirtyLines.length}
        onClick={saveCounts}>ثبت {dirtyLines.length ? `${number.format(dirtyLines.length)} خط` : 'شمارش'}</Button> : null}
      {stocktake.status === 'COUNTING' && canManage
        ? <Button variant="outlined" startIcon={<Send size={16} />} disabled={locked || pending > 0 || dirtyLines.length > 0} onClick={() => command.run(
          key => () => submitStocktake(stocktakeId, { expectedVersion: stocktake.version }, key))}>ارسال برای بازبینی</Button> : null}
      {stocktake.status === 'REVIEW' && canApprove
        ? <Button variant="contained" color="success" startIcon={<CheckCheck size={16} />} disabled={locked || pending > 0}
          onClick={() => command.run(key => () => approveStocktake(stocktakeId, { expectedVersion: stocktake.version }, key))}>تأیید و اعمال روی دفترکل</Button> : null}
      {open && canManage
        ? <Button color="error" startIcon={<XCircle size={16} />} disabled={locked} onClick={() => command.run(
          key => () => cancelStocktake(stocktakeId, { expectedVersion: stocktake.version }, key))}>لغو برگه</Button> : null}
      <Button disabled={command.busy} onClick={() => void load()}>بازخوانی وضعیت برگه</Button>
      {command.uncertain ? <Button disabled={command.busy} onClick={() => void command.reconcileAndRetry(
        () => getStocktake(stocktakeId).then(setStocktake))}>بازخوانی و تکرار همان دستور</Button> : null}
      {stocktake.status === 'COMPLETED' ? <Alert severity="success" sx={{ flex: 1 }}>موجودی این برگه روی دفترکل اعمال شده و برگه تغییرناپذیر است.</Alert> : null}
    </Stack>

    <Box sx={{ overflowX: 'auto' }}>
      <DataTable caption="برگهٔ شمارش" columns={[
        { id: 'location', label: 'مکان', render: (row) => `${row.line.locationCode} — ${row.line.locationName ?? '—'}` },
        { id: 'sku', label: 'SKU', render: (row) => row.line.sku },
        { id: 'product', label: 'کالا', render: (row) => `${row.line.productName}${row.line.variantTitle ? ` — ${row.line.variantTitle}` : ''}` },
        ...(canApprove ? [{ id: 'expected', label: 'انتظاری', render: (row: typeof visibleLines[number]) => number.format(row.line.expectedQty ?? 0) }] : []),
        ...(canApprove ? [{ id: 'difference', label: 'مغایرت با تصویر آغاز', render: (row: typeof visibleLines[number]) => row.line.difference === null || row.line.difference === undefined ? '—' : number.format(row.line.difference) }] : []),
        { id: 'counted', label: 'شمارش‌شده', render: (row) => row.line.countedQty === null ? '—' : number.format(row.line.countedQty) },
        { id: 'countedAt', label: 'زمان شمارش', render: (row) => row.line.countedAt ? dateTime.format(new Date(row.line.countedAt)) : '—' },
        { id: 'movement', label: 'سند انبار', render: (row) => row.line.movementId ?? '—' },
        ...(countable && canCount ? [{
          id: 'input', label: 'مقدار شمارش', render: (row: typeof visibleLines[number]) => <TextField size="small" value={row.countedQty} disabled={locked}
            inputProps={{ inputMode: 'numeric', dir: 'ltr', 'aria-label': `مقدار شمارش ${row.line.sku}` }}
            onChange={(event) => setCounts((current) => ({ ...current, [row.line.id]: event.target.value }))} />,
        }, {
          id: 'notes', label: 'یادداشت', render: (row: typeof visibleLines[number]) => <TextField size="small" value={notes[row.line.id] ?? ''} disabled={locked}
            placeholder={row.line.notes ?? ''} inputProps={{ maxLength: 500, 'aria-label': `یادداشت شمارش ${row.line.sku}` }}
            onChange={(event) => setNotes((current) => ({ ...current, [row.line.id]: event.target.value }))} />,
        }] : []),
      ]} rows={visibleLines} rowKey={(row) => row.line.id} loading={loading}
        emptyTitle="خطی یافت نشد" emptyDescription={stocktake.status === 'DRAFT' ? 'برگهٔ شمارش هنوز ساخته نشده است.' : 'برگهٔ شمارش خالی است.'}
        selectable={false} />
    </Box>
    <StocktakeHistory key={`${stocktakeId}:${stocktake.version}`} stocktakeId={stocktakeId} />
  </>;
}
