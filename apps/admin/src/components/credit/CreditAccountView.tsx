'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { CreditAccountStatus, CreditLedgerItem, CreditLedgerPage, CreditStatement } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiAbortError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { adjustCreditDocument, getCreditLedger, getCreditStatement, recordCreditOpening, recordCreditReceipt, reverseCreditReceipt, saveCreditPolicy } from '@/lib/credit/credit-api';
import { creditDate, creditError, creditKindLabels, creditRial, parseCreditIrr, receivableLabels } from '@/lib/credit/credit-ui';
import { useCreditCommand } from '@/lib/credit/useCreditCommand';

type Action = { kind: 'policy' | 'opening' | 'receipt' | 'adjust' | 'reverse'; version: number | null; documentId?: string; receiptId?: string };
const titles = { policy: 'تنظیم اعتبار مشتری', opening: 'ثبت ماندهٔ اول دوره', receipt: 'ثبت دریافت واقعی', adjust: 'ثبت سند اصلاحی', reverse: 'برگشت دریافت' };
const localNow = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const iso = (value: string) => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toISOString() : null; };
const permission = { policy: 'credit.manage', opening: 'credit.opening', receipt: 'credit.receive', adjust: 'credit.adjust', reverse: 'credit.adjust' };

export function CreditAccountView({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const can = (key: string) => Boolean(user?.permissions.includes(key));
  const canRead = can('credit.read');
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerPage | null>(null);
  const [documentOffset, setDocumentOffset] = useState(0); const [ledgerOffset, setLedgerOffset] = useState(0);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [action, setAction] = useState<Action | null>(null);
  const [status, setStatus] = useState<CreditAccountStatus>('SUSPENDED'); const [limit, setLimit] = useState('0'); const [terms, setTerms] = useState('0');
  const [amount, setAmount] = useState(''); const [reference, setReference] = useState(''); const [reason, setReason] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localNow); const [dueAt, setDueAt] = useState(localNow);
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER');
  const [adjustmentKind, setAdjustmentKind] = useState<'DEBIT_ADJUSTMENT' | 'CREDIT_NOTE'>('CREDIT_NOTE');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadError(null);
    try {
      const result = await getCreditStatement(customerId, documentOffset, signal);
      const history = result.account ? await getCreditLedger(customerId, ledgerOffset, signal) : null;
      if (!signal?.aborted) { setStatement(result); setLedger(history); }
    } catch (error) {
      if (!signal?.aborted && !(error instanceof ApiAbortError)) setLoadError(creditError(error, false));
      throw error;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [customerId, documentOffset, ledgerOffset]);
  const command = useCreditCommand(result => {
    setMessage('دستور روی دفترکل ثبت شد.'); setAction(null);
    setStatement(current => current ? { ...current, account: result.account } : current);
    void load().catch(() => undefined);
  });
  const locked = command.busy || command.uncertain || loading;
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); void load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [canRead, load]);

  function open(kind: Action['kind'], ids: { documentId?: string; receiptId?: string } = {}) {
    if (locked) return;
    setAction({ kind, version: statement?.account?.version ?? null, ...ids });
    setStatus(statement?.account?.status ?? 'SUSPENDED'); setLimit(statement?.account?.creditLimit.amount ?? '0'); setTerms(String(statement?.account?.termsDays ?? 0));
    setAmount(''); setReference(''); setReason(''); setEffectiveAt(localNow()); setDueAt(localNow()); setAllocations({});
    setMessage(null); command.setError(null);
  }
  function submit() {
    if (!action || !can(permission[action.kind])) return;
    const irr = parseCreditIrr(amount); const creditLimit = parseCreditIrr(limit, true);
    const at = iso(effectiveAt); const due = iso(dueAt);
    if (action.kind === 'policy') {
      const normalizedTerms = terms.replace(/[۰-۹]/gu, digit => String(digit.charCodeAt(0) - 1776));
      if (creditLimit === null || !/^\d{1,3}$/u.test(normalizedTerms) || Number(normalizedTerms) > 365) { command.setError('سقف باید ریال صحیح و مهلت بین ۰ و ۳۶۵ روز باشد.'); return; }
      const input = { expectedVersion: action.version, status, creditLimit, termsDays: Number(normalizedTerms) };
      command.run(key => () => saveCreditPolicy(customerId, input, key)); return;
    }
    if (action.version === null || !at || !reference.trim() || reference.trim().length > 128) { command.setError('تاریخ و شناسهٔ سند مرجع معتبر را وارد کنید.'); return; }
    const expectedVersion = action.version;
    if (action.kind === 'opening') {
      if (!irr || !due) { command.setError('مبلغ ریالی صحیح و تاریخ سررسید لازم است.'); return; }
      const input = { expectedVersion, amount: irr, issuedAt: at, dueAt: due, sourceReference: reference.trim() };
      command.run(key => () => recordCreditOpening(customerId, input, key)); return;
    }
    if (action.kind === 'receipt') {
      const chosen = Object.entries(allocations).filter(([, value]) => value.trim() !== '').map(([documentId, value]) => ({ documentId, amount: parseCreditIrr(value) }));
      if (!irr || !chosen.length || chosen.some(item => item.amount === null)) { command.setError('مبلغ دریافت و تخصیص هر سند باید ریال صحیح مثبت باشد.'); return; }
      const input = { expectedVersion, amount: irr, method, effectiveAt: at, evidenceReference: reference.trim(), allocations: chosen.map(item => ({ ...item, amount: item.amount! })) };
      command.run(key => () => recordCreditReceipt(customerId, input, key)); return;
    }
    if (!reason.trim() || reason.trim().length > 500) { command.setError('دلیل اصلاح لازم است و باید حداکثر ۵۰۰ نویسه باشد.'); return; }
    const correction = { expectedVersion, effectiveAt: at, evidenceReference: reference.trim(), reason: reason.trim() };
    if (action.kind === 'reverse' && action.receiptId) {
      const receiptId = action.receiptId;
      command.run(key => () => reverseCreditReceipt(customerId, receiptId, correction, key)); return;
    }
    if (action.kind === 'adjust' && action.documentId && irr) {
      const documentId = action.documentId; const input = { ...correction, kind: adjustmentKind, amount: irr };
      command.run(key => () => adjustCreditDocument(customerId, documentId, input, key)); return;
    }
    command.setError('مبلغ ریالی صحیح مثبت لازم است.');
  }
  if (!canRead) return <Alert severity="warning">مجوز مشاهدهٔ اعتبار مشتری را ندارید.</Alert>;
  if (loading && !statement) return <Alert severity="info">در حال دریافت دفترکل…</Alert>;
  const account = statement?.account;
  const refresh = () => void load().catch(() => undefined);
  const reversedReceiptIds = new Set(ledger?.items.filter(item => item.kind === 'RECEIPT_REVERSAL').map(item => item.receiptId));
  const pageButtons = (offset: number, total: number, change: (value: number) => void) => <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
    <Button disabled={locked || offset === 0} onClick={() => change(Math.max(0, offset - 25))}>صفحهٔ قبل</Button>
    <Button disabled={locked || offset + 25 >= total} onClick={() => change(offset + 25)}>صفحهٔ بعد</Button>
    <Typography>{new Intl.NumberFormat('fa-IR').format(total)} سند</Typography>
  </Stack>;
  return <>
    <PageHeader title="اعتبار و دفترکل مشتری" description="مانده‌های مستند، دریافت‌های واقعی و اصلاحات قابل ردیابی" breadcrumbs={[{ label: 'مشتریان', href: '/customers' }, { label: 'اعتبار مشتری' }]} />
    <Button component={Link} href="/customers">بازگشت به مشتریان</Button>
    {loadError ? <Alert severity="error" action={<Button onClick={refresh}>بازخوانی</Button>}>{loadError}</Alert> : null}
    {command.error && !action ? <Alert severity="error">{command.error}</Alert> : null}
    {message ? <Alert severity="success" role="status">{message}</Alert> : null}
    {!account && statement ? <Alert severity="info">برای این مشتری هنوز حساب اعتباری ثبت نشده است.</Alert> : null}
    {account ? <Box sx={{ my: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Stack spacing={1}>
        <Typography>وضعیت اعتبار: {account.status === 'ACTIVE' ? 'فعال' : 'تعلیق‌شده'} · مهلت فروش: {new Intl.NumberFormat('fa-IR').format(account.termsDays)} روز</Typography>
        <Typography data-testid="credit-outstanding">بدهی باز: {creditRial(account.outstanding.amount)}</Typography>
        <Typography>سقف اعتبار: {creditRial(account.creditLimit.amount)} · اعتبار باقی‌مانده: {creditRial(account.availableCredit.amount)}</Typography>
        <Typography>بدهی سررسیدگذشته: {creditRial(account.overdue.amount)}</Typography>
        {account.overLimit ? <Alert severity="warning">بدهی موجود از سقف اعتبار بیشتر است.</Alert> : null}
      </Stack>
    </Box> : null}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 2 }}>
      <Button disabled={locked} onClick={refresh}>بازخوانی وضعیت</Button>
      {can('credit.manage') ? <Button disabled={locked} onClick={() => open('policy')}>تنظیم اعتبار</Button> : null}
      {account && can('credit.opening') && statement?.total === 0 ? <Button disabled={locked} onClick={() => open('opening')}>ثبت ماندهٔ اول دوره</Button> : null}
      {account && can('credit.receive') ? <Button disabled={locked || account.outstanding.amount === '0'} onClick={() => open('receipt')}>ثبت دریافت واقعی</Button> : null}
    </Stack>
    {statement ? <>
      <DataTable caption="اسناد بدهی مشتری" rows={statement.documents} rowKey={row => row.id} emptyTitle="سند بدهی ثبت نشده" emptyDescription="ماندهٔ بدهی فقط با سند معتبر ثبت می‌شود." columns={[
        { id: 'kind', label: 'سند', render: row => creditKindLabels[row.kind] },
        { id: 'principal', label: 'مبلغ اصل / اصلاح‌شده', render: row => `${creditRial(row.originalAmount.amount)} / ${creditRial(row.effectivePrincipal.amount)}` },
        { id: 'outstanding', label: 'بدهی باز', render: row => creditRial(row.outstanding.amount) },
        { id: 'due', label: 'سررسید', render: row => creditDate(row.dueAt) },
        { id: 'status', label: 'وضعیت مالی', render: row => receivableLabels[row.status] },
        { id: 'actions', label: 'عملیات', render: row => can('credit.adjust') ? <Button disabled={locked} onClick={() => open('adjust', { documentId: row.id })}>اصلاح سند</Button> : '—' },
      ]} />
      {pageButtons(documentOffset, statement.total, setDocumentOffset)}
    </> : null}
    {ledger ? <Box sx={{ mt: 3 }}>
      <DataTable caption="گردش دفترکل اعتبار" rows={ledger.items} rowKey={row => row.id} emptyTitle="گردشی ثبت نشده" columns={[
        { id: 'kind', label: 'نوع حرکت', render: row => creditKindLabels[row.kind] },
        { id: 'amount', label: 'بدهکار / بستانکار', render: row => creditRial(row.amount.amount) },
        { id: 'at', label: 'تاریخ سند', render: row => creditDate(row.effectiveAt) },
        { id: 'recorded', label: 'زمان ثبت', render: row => creditDate(row.createdAt) },
        { id: 'action', label: 'عملیات', render: (row: CreditLedgerItem) => row.kind === 'RECEIPT' && row.receiptId && can('credit.adjust')
          ? <Button disabled={locked || reversedReceiptIds.has(row.receiptId)} onClick={() => open('reverse', { receiptId: row.receiptId! })}>برگشت دریافت</Button> : '—' },
      ]} />
      {pageButtons(ledgerOffset, ledger.total, setLedgerOffset)}
    </Box> : null}
    <Dialog open={action !== null} onClose={() => { if (!locked) setAction(null); }} maxWidth="sm" fullWidth>
      <DialogTitle>{action ? titles[action.kind] : ''}</DialogTitle>
      <Box component="form" onSubmit={event => { event.preventDefault(); submit(); }}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">ثبت مالی قابل حذف یا بازنویسی نیست. دریافت وجه فقط پس از دریافت واقعی و با سند مرجع ثبت شود.</Alert>
            {command.error ? <Alert severity="error">{command.error}</Alert> : null}
            {command.uncertain ? <Button disabled={command.busy} onClick={() => void command.reconcileAndRetry(() => load())}>بازخوانی و بررسی همان دستور</Button> : null}
            <Box component="fieldset" disabled={locked} sx={{ border: 0, p: 0, m: 0 }}>
              <Stack spacing={2}>
                {action?.kind === 'policy' ? <>
                  <TextField select label="وضعیت اعتبار" value={status} onChange={event => setStatus(event.target.value as CreditAccountStatus)}><MenuItem value="SUSPENDED">تعلیق‌شده</MenuItem><MenuItem value="ACTIVE">فعال</MenuItem></TextField>
                  <TextField label="سقف اعتبار (ریال)" value={limit} onChange={event => setLimit(event.target.value)} required inputProps={{ inputMode: 'numeric' }} />
                  <TextField label="مهلت پرداخت (روز)" value={terms} onChange={event => setTerms(event.target.value)} required inputProps={{ inputMode: 'numeric' }} />
                </> : <>
                  {action?.kind !== 'reverse' ? <TextField label={action?.kind === 'receipt' ? 'مبلغ دریافت (ریال)' : 'مبلغ سند (ریال)'} value={amount} onChange={event => setAmount(event.target.value)} required inputProps={{ inputMode: 'numeric' }} /> : null}
                  {action?.kind === 'adjust' ? <TextField select label="نوع اصلاح" value={adjustmentKind} onChange={event => setAdjustmentKind(event.target.value as typeof adjustmentKind)}><MenuItem value="CREDIT_NOTE">بستانکار؛ کاهش بدهی</MenuItem><MenuItem value="DEBIT_ADJUSTMENT">بدهکار؛ افزایش بدهی</MenuItem></TextField> : null}
                  <TextField label="شناسهٔ سند مرجع" value={reference} onChange={event => setReference(event.target.value)} required inputProps={{ maxLength: 128 }} helperText="مرجع دفتر قبلی یا رسید معتبر؛ رمز و اطلاعات حساس وارد نکنید." />
                  <TextField label={action?.kind === 'opening' ? 'تاریخ ایجاد بدهی (زمان محلی)' : 'تاریخ عملیات (زمان محلی)'} type="datetime-local" value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} required InputLabelProps={{ shrink: true }} />
                  {action?.kind === 'opening' ? <TextField label="سررسید (زمان محلی)" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} required InputLabelProps={{ shrink: true }} /> : null}
                  {action?.kind === 'receipt' ? <>
                    <TextField select label="روش دریافت" value={method} onChange={event => setMethod(event.target.value as typeof method)}><MenuItem value="BANK_TRANSFER">انتقال بانکی ثبت‌شده</MenuItem><MenuItem value="CASH">وجه نقد دریافت‌شده</MenuItem></TextField>
                    <Typography variant="body2">مبلغ هر تخصیص را وارد کنید. مجموع باید دقیقاً برابر مبلغ دریافت باشد؛ کنترل نهایی در سرور است.</Typography>
                    {statement?.documents.filter(row => row.outstanding.amount !== '0').map(row => <TextField key={row.id} label={`تخصیص به ${creditKindLabels[row.kind]} — ${creditDate(row.issuedAt)}`} value={allocations[row.id] ?? ''} onChange={event => setAllocations(current => ({ ...current, [row.id]: event.target.value }))} helperText={`بدهی باز: ${creditRial(row.outstanding.amount)}`} inputProps={{ inputMode: 'numeric' }} />)}
                  </> : null}
                  {action?.kind === 'adjust' || action?.kind === 'reverse' ? <TextField label="دلیل اصلاح" value={reason} onChange={event => setReason(event.target.value)} required multiline inputProps={{ maxLength: 500 }} /> : null}
                </>}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={locked} onClick={() => setAction(null)}>انصراف</Button><Button type="submit" disabled={locked}>{command.busy ? 'در حال ثبت…' : 'تأیید و ثبت'}</Button></DialogActions>
      </Box>
    </Dialog>
  </>;
}
