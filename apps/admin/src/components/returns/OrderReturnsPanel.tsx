'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import type { OrderReturnView, ReturnDisposition, ReturnEligibility, Warehouse, WarehouseLocation } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { creditDate, creditRial, parseCreditIrr } from '@/lib/credit/credit-ui';
import { listLocations, listWarehouses } from '@/lib/inventory/warehouses-api';
import { createOrderReturn, getReturnEligibility, listReturns, recordReturnRefund } from '@/lib/returns/returns-api';
import {
  returnDispositionLabels, returnErrorMessage, returnIneligibleLabels, returnWindowLabels, returnWindowShortLabels,
} from '@/lib/returns/returns-ui';
import { useReturnCommand } from '@/lib/returns/useReturnCommand';

type Props = { orderId: string; orderNumber: string; onChanged: () => Promise<void> };

const DISPOSITIONS: ReturnDisposition[] = ['RESTOCK', 'DAMAGED', 'NOT_RETURNED'];

/**
 * Returns of one paid order. A return records goods received back; it never moves
 * money. The refund is executed by staff in the gateway panel first and only then
 * recorded here as evidence.
 */
export function OrderReturnsPanel({ orderId, orderNumber, onChanged }: Props) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = permissions.includes('returns.read');
  const canRecord = permissions.includes('returns.manage');
  const canSettle = canRecord && permissions.includes('payments.refund');
  const canPickStock = permissions.includes('inventory.read');

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const [eligibility, setEligibility] = useState<ReturnEligibility | null>(null);
  const [returns, setReturns] = useState<OrderReturnView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadError(null);
    try {
      const [state, list] = await Promise.all([getReturnEligibility(orderId, signal), listReturns({ page: 1, perPage: 100, orderNumber }, signal)]);
      if (signal?.aborted || !alive.current) return;
      setEligibility(state); setReturns(list.items.filter((item) => item.orderId === orderId));
    } catch (failure) {
      if (!signal?.aborted && alive.current) setLoadError(returnErrorMessage(failure, false));
    } finally {
      if (!signal?.aborted && alive.current) setLoading(false);
    }
  }, [orderId, orderNumber]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [canRead, reload]);

  // --- recording form ---------------------------------------------------------
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dispositions, setDispositions] = useState<Record<string, ReturnDisposition>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const eligible = eligibility?.eligible === true;
  useEffect(() => {
    if (!eligible || !canRecord || !canPickStock) return;
    const controller = new AbortController();
    listWarehouses({ offset: 0, limit: 100, isActive: true }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setWarehouses(result.items); })
      .catch((failure) => { if (!controller.signal.aborted) setOptionsError(returnErrorMessage(failure, false)); });
    return () => controller.abort();
  }, [eligible, canRecord, canPickStock]);
  useEffect(() => {
    setLocationId(''); setLocations([]);
    if (!warehouseId) return;
    const controller = new AbortController();
    listLocations(warehouseId, { offset: 0, limit: 100, isActive: true }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setLocations(result.items); })
      .catch((failure) => { if (!controller.signal.aborted) setOptionsError(returnErrorMessage(failure, false)); });
    return () => controller.abort();
  }, [warehouseId]);

  const afterSaved = useCallback(async () => {
    setQuantities({}); setDispositions({}); setReason(''); setNote(''); setConfirmed(false);
    setNotice('ثبت شد. موجودی و وضعیت سفارش به‌روزرسانی می‌شود؛ پولی جابه‌جا نشده است و استرداد جداگانه ثبت می‌شود.');
    await Promise.allSettled([reload(), onChanged()]);
  }, [reload, onChanged]);
  const create = useReturnCommand<OrderReturnView>(() => { void afterSaved(); });

  const lines = eligibility?.lines ?? [];
  const chosen = lines.flatMap((line) => {
    const raw = quantities[line.orderItemId] ?? '';
    if (!/^[1-9][0-9]{0,5}$/u.test(raw)) return [];
    const disposition = dispositions[line.orderItemId] ?? 'RESTOCK';
    return [{ line, quantity: Number(raw), disposition }];
  });
  const typed = lines.filter((line) => (quantities[line.orderItemId] ?? '').trim() !== '');
  const quantityOk = typed.length === chosen.length && chosen.every((row) => row.quantity <= row.line.remainingQuantity);
  const needsStock = chosen.some((row) => row.disposition === 'RESTOCK');
  const formValid = chosen.length > 0 && quantityOk && reason.trim().length > 0 && confirmed && (!needsStock || (warehouseId !== '' && locationId !== ''));
  const locked = create.busy || create.uncertain || loading || Boolean(loadError);

  // --- settling refund --------------------------------------------------------
  const [refundReturnId, setRefundReturnId] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const refund = useReturnCommand<unknown>(() => {
    setRefundReturnId(''); setRefundReference(''); setRefundAmount(''); setRefundReason(''); setRefundConfirmed(false);
    setNotice('استرداد دستی ثبت شد. این ثبت فقط سند انجام استرداد در درگاه است؛ سامانه وجهی منتقل نکرده است.');
    void Promise.allSettled([reload(), onChanged()]);
  });
  const settling = returns.find((item) => item.id === refundReturnId);
  const parsedRefund = parseCreditIrr(refundAmount);
  const refundValid = Boolean(settling) && parsedRefund !== null && BigInt(parsedRefund) <= BigInt(settling?.refundRemaining.amount ?? '0')
    && refundReference.trim().length > 0 && refundReason.trim().length > 0 && refundConfirmed;
  const refundLocked = refund.busy || refund.uncertain || loading;

  if (!canRead) return null;
  const owing = returns.filter((item) => BigInt(item.refundRemaining.amount) > 0n);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">مرجوعی کالا</Typography>
          <Alert severity="info">
            مهلت از لحظهٔ صدور فاکتور آغاز می‌شود: ۲ روز کاری برای تحویل حضوری و ۱ هفته برای شهرهای دیگر. ثبت مرجوعی فقط دریافت کالا را ثبت می‌کند و هیچ پولی جابه‌جا نمی‌کند؛ استرداد وجه دستی است.
          </Alert>
          {loading ? <Typography role="status">در حال بررسی مرجوعی…</Typography> : null}
          {loadError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>تلاش دوباره</Button>}>{loadError}</Alert> : null}
          {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

          {eligibility ? (
            <Stack spacing={0.5}>
              {eligibility.windowKind ? <Typography variant="body2">نوع مهلت: {returnWindowLabels[eligibility.windowKind]}</Typography> : null}
              {eligibility.invoiceIssuedAt ? <Typography variant="body2">صدور فاکتور: {creditDate(eligibility.invoiceIssuedAt)}</Typography> : null}
              {eligibility.deadlineAt ? <Typography variant="body2">پایان مهلت: {creditDate(eligibility.deadlineAt)}</Typography> : null}
              {!eligibility.eligible && eligibility.reason ? <Alert severity={eligibility.reason === 'FULLY_RETURNED' ? 'info' : 'warning'}>{returnIneligibleLabels[eligibility.reason]}</Alert> : null}
            </Stack>
          ) : null}

          {returns.length > 0 ? (
            <Table size="small" aria-label="مرجوعی‌های ثبت‌شده این سفارش">
              <TableHead>
                <TableRow>{['شمارهٔ مرجوعی', 'زمان', 'مهلت', 'مبلغ قابل‌استرداد', 'استرداد ثبت‌شده', 'باقی‌مانده'].map((title) => <TableCell key={title}>{title}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {returns.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.number}</TableCell>
                    <TableCell>{creditDate(row.returnedAt)}</TableCell>
                    <TableCell>{returnWindowShortLabels[row.windowKind]}</TableCell>
                    <TableCell>{creditRial(row.refundDue.amount)}</TableCell>
                    <TableCell>{creditRial(row.refunded.amount)}</TableCell>
                    <TableCell>{creditRial(row.refundRemaining.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {canRecord && eligible ? (
            <Stack spacing={2} component="form" aria-label="ثبت مرجوعی" onSubmit={(event) => {
              event.preventDefault();
              if (!formValid || locked) return;
              const body = {
                reason: reason.trim(), ...(note.trim() ? { note: note.trim() } : {}),
                lines: chosen.map((row) => ({
                  orderItemId: row.line.orderItemId, quantity: row.quantity, disposition: row.disposition,
                  ...(row.disposition === 'RESTOCK' ? { warehouseId, locationId } : {}),
                })),
              };
              create.run((key) => () => createOrderReturn(orderId, body, key));
            }}>
              <Typography variant="subtitle1" component="h3">ثبت دریافت کالای مرجوعی</Typography>
              {lines.filter((line) => line.remainingQuantity > 0).map((line) => (
                <Stack key={line.orderItemId} direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
                  <TextField
                    label={`تعداد مرجوعی ${line.sku}`} value={quantities[line.orderItemId] ?? ''} disabled={locked}
                    inputProps={{ inputMode: 'numeric' }} sx={{ minWidth: 180 }}
                    onChange={(event) => setQuantities((old) => ({ ...old, [line.orderItemId]: event.target.value }))}
                    helperText={`${line.title}؛ قابل مرجوع: ${line.remainingQuantity} از ${line.orderedQuantity}`}
                    error={(quantities[line.orderItemId] ?? '') !== '' && !(/^[1-9][0-9]{0,5}$/u.test(quantities[line.orderItemId] ?? '') && Number(quantities[line.orderItemId]) <= line.remainingQuantity)}
                  />
                  <TextField
                    select label={`وضعیت کالا ${line.sku}`} value={dispositions[line.orderItemId] ?? 'RESTOCK'} disabled={locked} sx={{ minWidth: 280 }}
                    onChange={(event) => setDispositions((old) => ({ ...old, [line.orderItemId]: event.target.value as ReturnDisposition }))}
                  >
                    {DISPOSITIONS.map((value) => <MenuItem key={value} value={value}>{returnDispositionLabels[value]}</MenuItem>)}
                  </TextField>
                </Stack>
              ))}
              {needsStock ? (
                <>
                  {!canPickStock ? <Alert severity="warning">برای بازگرداندن کالا به موجودی، مجوز مشاهدهٔ انبار لازم است.</Alert> : null}
                  {optionsError ? <Alert severity="error">{optionsError}</Alert> : null}
                  <TextField select label="انبار دریافت" value={warehouseId} disabled={locked || !canPickStock} onChange={(event) => setWarehouseId(event.target.value)}>
                    {warehouses.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
                  </TextField>
                  <TextField select label="محل دریافت" value={locationId} disabled={locked || !warehouseId} onChange={(event) => setLocationId(event.target.value)}>
                    {locations.map((row) => <MenuItem key={row.id} value={row.id}>{row.name ?? row.code}</MenuItem>)}
                  </TextField>
                </>
              ) : null}
              <TextField label="دلیل مرجوعی" value={reason} disabled={locked} onChange={(event) => setReason(event.target.value)} inputProps={{ maxLength: 500 }} required />
              <TextField label="یادداشت (اختیاری)" value={note} disabled={locked} onChange={(event) => setNote(event.target.value)} inputProps={{ maxLength: 500 }} />
              <FormControlLabel
                control={<Checkbox checked={confirmed} disabled={locked} onChange={(event) => setConfirmed(event.target.checked)} />}
                label="کالا را واقعاً دریافت و بررسی کرده‌ام و وضعیت هر قلم درست ثبت شده است"
              />
              {create.error ? <Alert severity="error">{create.error}</Alert> : null}
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={!formValid || locked}>{create.busy ? 'در حال ثبت…' : 'ثبت مرجوعی'}</Button>
                {create.uncertain ? <Button disabled={create.busy} onClick={() => void create.retry()}>بررسی و تکرار همان ثبت</Button> : null}
              </Stack>
            </Stack>
          ) : null}

          {canSettle && owing.length > 0 ? (
            <Stack spacing={2} component="form" aria-label="ثبت استرداد دستی" onSubmit={(event) => {
              event.preventDefault();
              if (!refundValid || refundLocked || !settling || !parsedRefund) return;
              const body = { amountMinorUnits: parsedRefund, gatewayReferenceId: refundReference.trim(), reason: refundReason.trim() };
              refund.run((key) => () => recordReturnRefund(settling.id, body, key));
            }}>
              <Typography variant="subtitle1" component="h3">ثبت استرداد دستی</Typography>
              <Alert severity="warning">
                ابتدا استرداد را در پنل درگاه پرداخت واقعاً انجام دهید و شناسهٔ مرجع آن را اینجا ثبت کنید. این فرم هیچ وجهی منتقل نمی‌کند و بدون شناسهٔ واقعی ثبت نمی‌شود.
              </Alert>
              <TextField select label="مرجوعی دارای مبلغ باقی‌مانده" value={refundReturnId} disabled={refundLocked} onChange={(event) => {
                setRefundReturnId(event.target.value);
                const picked = owing.find((item) => item.id === event.target.value);
                setRefundAmount(picked ? picked.refundRemaining.amount : '');
              }}>
                {owing.map((row) => <MenuItem key={row.id} value={row.id}>{row.number} · باقی‌مانده {creditRial(row.refundRemaining.amount)}</MenuItem>)}
              </TextField>
              <TextField label="شناسهٔ مرجع استرداد در درگاه" value={refundReference} disabled={refundLocked} onChange={(event) => setRefundReference(event.target.value)} inputProps={{ maxLength: 128 }} required />
              <TextField
                label="مبلغ واقعاً مسترد‌شده (ریال)" value={refundAmount} disabled={refundLocked} onChange={(event) => setRefundAmount(event.target.value)}
                error={refundAmount !== '' && !refundValid && parsedRefund === null}
                helperText="عدد صحیح ریالی؛ نمی‌تواند بیشتر از مبلغ باقی‌ماندهٔ همین مرجوعی باشد."
              />
              <TextField label="دلیل ثبت" value={refundReason} disabled={refundLocked} onChange={(event) => setRefundReason(event.target.value)} inputProps={{ maxLength: 255 }} required />
              <FormControlLabel
                control={<Checkbox checked={refundConfirmed} disabled={refundLocked} onChange={(event) => setRefundConfirmed(event.target.checked)} />}
                label="استرداد را در پنل درگاه انجام داده‌ام و مبلغ و شناسهٔ مرجع درست است"
              />
              {refund.error ? <Alert severity="error">{refund.error}</Alert> : null}
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={!refundValid || refundLocked}>{refund.busy ? 'در حال ثبت…' : 'ثبت سند استرداد'}</Button>
                {refund.uncertain ? <Button disabled={refund.busy} onClick={() => void refund.retry()}>بررسی و تکرار همان ثبت</Button> : null}
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
