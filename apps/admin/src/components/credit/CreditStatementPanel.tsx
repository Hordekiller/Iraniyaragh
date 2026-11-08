'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { ApiAbortError } from '@/lib/api/client';
import { creditError, creditKindLabels } from '@/lib/credit/credit-ui';
import { getCreditLedgerPage, getCreditStatementPage } from '@/lib/credit/credit-api';
import { buildStatement, statementCsv, type StatementRange } from '@/lib/credit/statement';
import { loadFullStatement, type LoadedStatement } from '@/lib/credit/statement-loader';
import styles from './CreditStatementPrint.module.css';

const number = new Intl.NumberFormat('fa-IR');
const dayFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
const dateTimeFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });
const rial = (value: bigint) => `${number.format(value)} ریال`;
/** A positive balance is what the customer owes, a negative one is what the store owes. */
const balanceText = (value: bigint) => (value === 0n ? 'صفر' : `${number.format(value < 0n ? -value : value)} ریال ${value > 0n ? 'بدهکار' : 'بستانکار'}`);

export function CreditStatementPanel({ customerId }: { customerId: string }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [data, setData] = useState<LoadedStatement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [range, setRange] = useState<StatementRange>({});
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setPhase('loading'); setMessage(null);
    try {
      const result = await loadFullStatement({
        ledger: (offset, limit, signal) => getCreditLedgerPage(customerId, offset, limit, signal),
        statement: (offset, limit, signal) => getCreditStatementPage(customerId, offset, limit, signal),
      }, next.signal);
      if (next.signal.aborted) return;
      setData(result); setGeneratedAt(dateTimeFormat.format(new Date())); setPhase('ready');
    } catch (error) {
      if (next.signal.aborted || error instanceof ApiAbortError) return;
      setMessage(creditError(error, false)); setPhase('error');
    }
  }, [customerId]);

  const statement = useMemo(() => (data ? buildStatement(data.entries, data.documents, range) : null), [data, range]);
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);

  function download() {
    if (!statement || !data?.reconciled) return;
    const blob = new Blob([statementCsv(statement, (kind) => creditKindLabels[kind])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `credit-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }

  if (phase === 'idle') {
    return (
      <Paper variant="outlined" sx={{ p: 2, my: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1">صورت‌حساب مشتری</Typography>
            <Typography variant="body2" color="text.secondary">گردش کامل بدهکار، بستانکار و مانده، با فیلتر بازه، خروجی و چاپ.</Typography>
          </Box>
          <Button variant="contained" onClick={() => void load()}>دریافت صورت‌حساب</Button>
        </Stack>
      </Paper>
    );
  }
  if (phase === 'loading') return <Alert severity="info" role="status" sx={{ my: 2 }}>در حال دریافت همهٔ ردیف‌های دفترکل…</Alert>;
  if (phase === 'error') {
    return <Alert severity="error" sx={{ my: 2 }} action={<Button color="inherit" size="small" onClick={() => void load()}>تلاش دوباره</Button>}>{message}</Alert>;
  }
  if (!data || !statement) return null;
  if (!data.account) return <Alert severity="info" sx={{ my: 2 }}>برای این مشتری حساب اعتباری ثبت نشده است.</Alert>;
  if (!data.complete) {
    return (
      <Alert severity="warning" sx={{ my: 2 }} action={<Button color="inherit" size="small" onClick={() => void load()}>تلاش دوباره</Button>}>
        همهٔ ردیف‌های دفترکل دریافت نشد (یا تعداد از سقف مجاز بیشتر است)، پس مانده‌های جاری در صورت‌حساب قطعی نیستند و نمایش داده نمی‌شوند.
      </Alert>
    );
  }

  const { rows, opening, totalDebit, totalCredit, closing } = statement;
  const showOpening = Boolean(range.from) || opening !== 0n;
  return (
    <Paper component="section" aria-label="صورت‌حساب مشتری" variant="outlined" data-statement-print className={styles.sheet} sx={{ p: { xs: 2, sm: 3 }, my: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
          <Typography variant="h6">صورت‌حساب مشتری</Typography>
          <Stack direction="row" spacing={1} className={styles.screenOnly + ' screenOnly'}>
            <Button size="small" startIcon={<RefreshCw size={16} />} onClick={() => void load()}>بازخوانی</Button>
            <Button size="small" startIcon={<Download size={16} />} disabled={!data.reconciled || rangeInvalid} onClick={download}>خروجی CSV</Button>
            <Button size="small" startIcon={<Printer size={16} />} disabled={!data.reconciled || rangeInvalid} onClick={() => window.print()}>چاپ</Button>
          </Stack>
        </Stack>
        <Typography className={styles.printOnly} variant="body2">
          بازه: {range.from ?? 'ابتدا'} تا {range.to ?? 'انتها'} — تهیه‌شده در {generatedAt} — مبالغ به ریال
        </Typography>

        {data.reconciled
          ? <Alert severity="success" className="screenOnly">جمع ردیف‌ها با مانده فعلی دفترکل ({rial(BigInt(data.account.outstanding.amount))}) برابر است.</Alert>
          : <Alert severity="error">جمع ردیف‌ها با مانده فعلی دفترکل برابر نیست؛ ممکن است هم‌زمان ثبت جدیدی انجام شده باشد. دوباره بازخوانی کنید؛ تا آن موقع خروجی و چاپ غیرفعال است.</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} className="screenOnly">
          <TextField label="از تاریخ" type="date" size="small" value={range.from ?? ''} InputLabelProps={{ shrink: true }}
            onChange={(event) => setRange((value) => ({ ...value, from: event.target.value || undefined }))} />
          <TextField label="تا تاریخ" type="date" size="small" value={range.to ?? ''} InputLabelProps={{ shrink: true }}
            error={rangeInvalid} helperText={rangeInvalid ? 'تاریخ پایان قبل از آغاز است.' : undefined}
            onChange={(event) => setRange((value) => ({ ...value, to: event.target.value || undefined }))} />
          {(range.from || range.to) && <Button onClick={() => setRange({})}>نمایش همهٔ دوره‌ها</Button>}
        </Stack>

        <TableContainer>
          <Table size="small" aria-label="گردش حساب">
            <TableHead>
              <TableRow>
                <TableCell>تاریخ سند</TableCell><TableCell>شرح</TableCell>
                <TableCell align="left">بدهکار</TableCell><TableCell align="left">بستانکار</TableCell><TableCell align="left">مانده</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {showOpening && (
                <TableRow><TableCell /><TableCell>مانده ابتدای دوره</TableCell><TableCell /><TableCell /><TableCell align="left" className={styles.money}>{balanceText(opening)}</TableCell></TableRow>
              )}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} align="center">در این بازه گردشی ثبت نشده است.</TableCell></TableRow>}
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{dayFormat.format(new Date(row.effectiveAt))}</TableCell>
                  <TableCell>
                    {row.orderId && row.kind === 'SALE'
                      ? <Link href={`/orders/${encodeURIComponent(row.orderId)}`}>{creditKindLabels[row.kind]}</Link>
                      : creditKindLabels[row.kind]}
                  </TableCell>
                  <TableCell align="left" className={styles.money}>{row.debit > 0n ? rial(row.debit) : '—'}</TableCell>
                  <TableCell align="left" className={styles.money}>{row.credit > 0n ? rial(row.credit) : '—'}</TableCell>
                  <TableCell align="left" className={styles.money}>{balanceText(row.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell /><TableCell><strong>جمع دوره / مانده پایان</strong></TableCell>
                <TableCell align="left" className={styles.money}><strong>{rial(totalDebit)}</strong></TableCell>
                <TableCell align="left" className={styles.money}><strong>{rial(totalCredit)}</strong></TableCell>
                <TableCell align="left" className={styles.money}><strong>{balanceText(closing)}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary">
          ردیف‌ها بر پایهٔ تاریخ سند (به وقت تهران) مرتب شده‌اند. مبلغ مثبت یعنی مشتری بدهکار است؛ دریافت و سند بستانکار مانده را کم می‌کنند.
        </Typography>
      </Stack>
    </Paper>
  );
}
