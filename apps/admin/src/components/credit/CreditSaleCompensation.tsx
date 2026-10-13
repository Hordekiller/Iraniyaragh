'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AdminOrderDetail, FulfillmentPickListResponse, CreditSaleReturns, CreditStatement, Warehouse, WarehouseLocation } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { cancelCreditSale, getCreditReturns, getCreditStatement, receiveCreditReturn, recordCreditRefundPayout } from '@/lib/credit/credit-api';
import { creditError, creditRial, parseCreditIrr } from '@/lib/credit/credit-ui';
import { useCreditCommand } from '@/lib/credit/useCreditCommand';
import { listWarehouses, listLocations } from '@/lib/inventory/warehouses-api';

export function CreditSaleCompensation({ order, picks, onChanged }: { order: AdminOrderDetail; picks: FulfillmentPickListResponse['data'] | null; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const read = !!user?.permissions.includes('credit.read');
  const mayReturn = ['credit.adjust','orders.manage','inventory.adjust'].every(permission => user?.permissions.includes(permission));
  const mayPayout = ['credit.adjust','credit.receive'].every(permission => user?.permissions.includes(permission));
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [returns, setReturns] = useState<CreditSaleReturns | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState(''); const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [quantities, setQuantities] = useState<Record<string,string>>({});
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]); const [warehouseId, setWarehouseId] = useState('');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]); const [locationId, setLocationId] = useState('');
  const [warehouseMore, setWarehouseMore] = useState(false); const [locationMore, setLocationMore] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false); const [optionsError, setOptionsError] = useState<string | null>(null);
  const [returnId, setReturnId] = useState(''); const [amount, setAmount] = useState(''); const [method, setMethod] = useState<'CASH'|'BANK_TRANSFER'>('CASH'); const [effectiveAt, setEffectiveAt] = useState('');
  const [saved, setSaved] = useState(false);
  const command = useCreditCommand(() => { if (!alive.current) return; setSaved(true); void onChanged().catch(failure => setError(creditError(failure, false))); });
  useEffect(() => {
    if (!read) return;
    setLoading(true); setError(null);
    const controller = new AbortController();
    Promise.all([getCreditStatement(order.customer.id, 0, controller.signal), getCreditReturns(order.customer.id, order.id, controller.signal)]).then(([account, documents]) => { if (!controller.signal.aborted) { setStatement(account); setReturns(documents); setLoading(false); } }).catch(failure => { if (!controller.signal.aborted) { setError(creditError(failure, false)); setLoading(false); } });
    return () => controller.abort();
  }, [read, order.customer.id, order.id, order.version]);
  useEffect(() => {
    if (!read || !mayReturn || order.fulfillment?.status !== 'DELIVERED' || !user?.permissions.includes('inventory.read')) return;
    const controller = new AbortController(); setOptionsLoading(true);
    listWarehouses({ offset: 0, limit: 100, isActive: true }, controller.signal).then(result => { if (!controller.signal.aborted) { setWarehouses(result.items); setWarehouseMore(result.count > result.items.length); } }).catch(failure => { if (!controller.signal.aborted) setOptionsError(creditError(failure, false)); }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [read, mayReturn, order.fulfillment?.status, user?.permissions]);
  useEffect(() => {
    setLocationId(''); setLocations([]); setLocationMore(false);
    if (!warehouseId) return;
    const controller = new AbortController(); setOptionsLoading(true); setOptionsError(null);
    listLocations(warehouseId, { offset: 0, limit: 100, isActive: true }, controller.signal).then(result => { if (!controller.signal.aborted) { setLocations(result.items); setLocationMore(result.count > result.items.length); } }).catch(failure => { if (!controller.signal.aborted) setOptionsError(creditError(failure, false)); }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [warehouseId]);
  async function reload() {
    setLoading(true); setError(null);
    try { const [account, documents] = await Promise.all([getCreditStatement(order.customer.id), getCreditReturns(order.customer.id, order.id)]); if (!alive.current) return; await onChanged(); if (!alive.current) return; setStatement(account); setReturns(documents); return documents; }
    catch (failure) { setError(creditError(failure, false)); throw failure; } finally { setLoading(false); }
  }
  async function moreOptions(location: boolean) {
    setOptionsLoading(true); setOptionsError(null);
    try {
      if (location) { const result = await listLocations(warehouseId, { offset: locations.length, limit: 100, isActive: true }); setLocations(old => [...old,...result.items]); setLocationMore(result.count > locations.length + result.items.length); }
      else { const result = await listWarehouses({ offset: warehouses.length, limit: 100, isActive: true }); setWarehouses(old => [...old,...result.items]); setWarehouseMore(result.count > warehouses.length + result.items.length); }
    } catch (failure) { setOptionsError(creditError(failure, false)); } finally { setOptionsLoading(false); }
  }
  if (!read) return null;
  const account = statement?.account;
  const locked = command.busy || command.uncertain || loading || !!error || saved;
  const commonValid = !!account && !!reference.trim() && !!reason.trim() && confirmed;
  const cancelable = order.status === 'CREDIT_APPROVED' && !order.shipment && ['PENDING','PROCESSING','READY_TO_SHIP'].includes(order.fulfillment?.status ?? '');
  const receivable = order.status === 'CREDIT_APPROVED' && order.fulfillment?.status === 'DELIVERED';
  const items = (picks?.items ?? []).flatMap(line => { const item = order.items.find(item => item.sku === line.sku); return item ? [{ ...item, id: line.orderItemId }] : []; });
  const selectedLines = items.filter(item => /^[1-9][0-9]{0,5}$/u.test(quantities[item.id] ?? '')).map(item => ({ orderItemId: item.id, quantity: Number(quantities[item.id]), warehouseId, locationId }));
  const payout = returns?.items.find(item => item.id === returnId);
  return <Card><CardContent><Stack spacing={2}>
    <Typography variant="h6">برگشت و لغو فروش نسیه</Typography>
    <Alert severity="info">مرجوعی، بدهی و موجودی را اصلاح می‌کند. وجه قابل‌برگشت تا ثبت سند پرداخت واقعی، بازپرداخت‌شده محسوب نمی‌شود.</Alert>
    {loading ? <Typography role="status">در حال بررسی اسناد…</Typography> : null}
    {error || command.error ? <Alert severity="error">{error ?? command.error}</Alert> : null}
    {saved ? <Alert severity="success">فرمان ثبت شد؛ برای عملیات بعدی وضعیت را بازخوانی کنید.</Alert> : null}
    <Button disabled={command.busy || loading} onClick={() => void reload().then(() => setSaved(false)).catch(() => undefined)}>بازخوانی اسناد برگشت</Button>
    {returns?.items.length === 0 ? <Typography>سند برگشت ثبت نشده است.</Typography> : returns ? <Table size="small" aria-label="اسناد برگشت فروش نسیه"><TableHead><TableRow>{['نوع','مبلغ برگشت','کاهش بدهی','وجه قابل‌برگشت','بازپرداخت ثبت‌شده','باقی‌مانده'].map(title => <TableCell key={title}>{title}</TableCell>)}</TableRow></TableHead><TableBody>{returns.items.map(row => <TableRow key={row.id}><TableCell>{row.kind === 'CANCEL' ? 'لغو' : 'مرجوعی'}</TableCell>{[row.amount,row.debtCredit,row.refundDue,row.refunded,row.refundRemaining].map((value,index) => <TableCell key={index}>{creditRial(value.amount)}</TableCell>)}</TableRow>)}</TableBody></Table> : null}
    {mayReturn || mayPayout ? <>
      <TextField label="شماره سند مرجع واقعی" value={reference} disabled={locked} onChange={event => setReference(event.target.value)} inputProps={{ maxLength: 128 }} />
      <TextField label="دلیل عملیات" value={reason} disabled={locked} onChange={event => setReason(event.target.value)} inputProps={{ maxLength: 500 }} />
      <FormControlLabel control={<Checkbox checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} />} label="صحت سند و انجام واقعی عملیات مربوط را تأیید می‌کنم" />
    </> : null}
    {mayReturn && cancelable ? <Button variant="contained" color="warning" disabled={locked || !commonValid} onClick={() => {
      if (!account) return; const input = { expectedVersion: account.version, expectedOrderVersion: order.version, evidenceReference: reference, reason };
      command.run(key => () => cancelCreditSale(order.customer.id, order.id, input, key));
    }}>لغو پیش از ارسال و بازگرداندن کالا به محل اصلی</Button> : null}
    {mayReturn && receivable ? <>
      <Alert severity="warning">فقط کالای دریافت‌شده و سالمِ قابل‌فروش را ثبت کنید. کالای آسیب‌دیده نیازمند تعیین تکلیف جداگانه است.</Alert>
      {optionsError ? <Alert severity="error">{optionsError}</Alert> : null}
      <TextField select label="انبار دریافت" value={warehouseId} disabled={locked || optionsLoading} onChange={event => setWarehouseId(event.target.value)}>{warehouses.map(row => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</TextField>
      {warehouseMore ? <Button disabled={locked || optionsLoading} onClick={() => void moreOptions(false)}>انبارهای بیشتر</Button> : null}
      <TextField select label="محل دریافت" value={locationId} disabled={locked || optionsLoading || !warehouseId} onChange={event => setLocationId(event.target.value)}>{locations.map(row => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</TextField>
      {locationMore ? <Button disabled={locked || optionsLoading} onClick={() => void moreOptions(true)}>محل‌های بیشتر</Button> : null}
      {items.map(item => <TextField key={item.id} label={`تعداد برگشت ${item.sku}`} value={quantities[item.id] ?? ''} disabled={locked} inputProps={{ inputMode: 'numeric' }} onChange={event => setQuantities(old => ({ ...old, [item.id]: event.target.value }))} helperText={`تعداد اولیه ${item.quantity}؛ قیمت اصلی ${creditRial(item.unitPrice.amount)}`} />)}
      <Button variant="contained" disabled={locked || !commonValid || !warehouseId || !locationId || !selectedLines.length || optionsLoading || !!optionsError} onClick={() => {
        if (!account) return; const input = { expectedVersion: account.version, expectedOrderVersion: order.version, evidenceReference: reference, reason, lines: selectedLines };
        command.run(key => () => receiveCreditReturn(order.customer.id, order.id, input, key));
      }}>ثبت دریافت مرجوعی و اصلاح بدهی</Button>
    </> : null}
    {mayPayout && returns?.items.some(item => BigInt(item.refundRemaining.amount) > 0n) ? <>
      <Alert severity="warning">ابتدا وجه را واقعاً به مشتری بپردازید، سپس سند آن را ثبت کنید. این دکمه انتقال بانکی انجام نمی‌دهد.</Alert>
      <TextField select label="سند دارای وجه قابل‌برگشت" value={returnId} disabled={locked} onChange={event => setReturnId(event.target.value)}>{returns.items.filter(item => BigInt(item.refundRemaining.amount) > 0n).map(row => <MenuItem key={row.id} value={row.id}>{creditRial(row.refundRemaining.amount)} · {row.createdAt}</MenuItem>)}</TextField>
      <TextField label="مبلغ واقعاً بازپرداخت‌شده (ریال)" value={amount} disabled={locked} onChange={event => setAmount(event.target.value)} />
      <TextField select label="روش بازپرداخت" value={method} disabled={locked} onChange={event => setMethod(event.target.value as typeof method)}><MenuItem value="CASH">نقدی</MenuItem><MenuItem value="BANK_TRANSFER">انتقال بانکی</MenuItem></TextField>
      <TextField label="زمان واقعی بازپرداخت" type="datetime-local" value={effectiveAt} disabled={locked} onChange={event => setEffectiveAt(event.target.value)} InputLabelProps={{ shrink: true }} />
      <Button disabled={locked || !commonValid || !payout || !parseCreditIrr(amount) || !effectiveAt} onClick={() => {
        if (!account || !payout) return; const timestamp = new Date(effectiveAt); const parsed = parseCreditIrr(amount);
        if (!parsed || !Number.isFinite(timestamp.getTime())) { command.setError('مبلغ یا تاریخ معتبر نیست.'); return; }
        const input = { expectedVersion: account.version, amount: parsed, method, effectiveAt: timestamp.toISOString(), evidenceReference: reference, reason };
        command.run(key => () => recordCreditRefundPayout(order.customer.id, order.id, payout.id, input, key));
      }}>ثبت سند بازپرداخت انجام‌شده</Button>
    </> : null}
    {command.uncertain ? <Button disabled={command.busy || loading} onClick={() => void command.reconcileAndRetry(reload)}>بررسی و تکرار همان فرمان</Button> : null}
  </Stack></CardContent></Card>;
}
