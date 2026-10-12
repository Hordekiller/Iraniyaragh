'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { CreditStatement } from '@iranyaragh/contracts';
import { useAuth } from '@/lib/auth/AuthProvider';
import { approveCreditSale, getCreditStatement } from '@/lib/credit/credit-api';
import { creditError, creditRial } from '@/lib/credit/credit-ui';
import { useCreditCommand } from '@/lib/credit/useCreditCommand';

export function CreditSaleApproval({ customerId, orderId, orderVersion, orderTotal, onApproved }: {
  customerId: string; orderId: string; orderVersion: number; orderTotal: string; onApproved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const allowed = ['credit.read', 'credit.approve', 'orders.manage'].every(permission => user?.permissions.includes(permission));
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const command = useCreditCommand(() => { setSaved(true); void onApproved().catch(failure => setError(creditError(failure, false))); });
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    getCreditStatement(customerId, 0, controller.signal).then(result => { if (!controller.signal.aborted) { setStatement(result); setLoading(false); } })
      .catch(failure => { if (!controller.signal.aborted) { setError(creditError(failure, false)); setLoading(false); } });
    return () => controller.abort();
  }, [allowed, customerId]);
  async function reload() {
    setLoading(true); setError(null);
    try { const result = await getCreditStatement(customerId); setStatement(result); return result; }
    catch (failure) { setError(creditError(failure, false)); throw failure; }
    finally { setLoading(false); }
  }
  if (!allowed) return null;
  const account = statement?.account;
  const eligible = !!account && account.status === 'ACTIVE' && BigInt(account.overdue.amount) === 0n && BigInt(account.availableCredit.amount) >= BigInt(orderTotal) && BigInt(orderTotal) > 0n;
  return <Card><CardContent><Stack spacing={2}>
    <Typography variant="h6">فروش نسیه به مشتری شناخته‌شده</Typography>
    <Alert severity="warning">فقط سفارش ثبت‌شده توسط کارمند و بدون هیچ تلاش پرداخت قابل تأیید است. تأیید نسیه بدهی و مصرف موجودی ثبت می‌کند؛ وجهی دریافت یا پرداخت‌شده اعلام نمی‌شود.</Alert>
    {loading ? <Typography>در حال بررسی اعتبار…</Typography> : account ? <Typography>اعتبار قابل استفاده: {creditRial(account.availableCredit.amount)} · بدهی: {creditRial(account.outstanding.amount)} · مهلت: {account.termsDays} روز</Typography> : <Typography>برای مشتری هنوز حساب اعتباری تعریف نشده است.</Typography>}
    <Typography component={Link} href={`/customers/${encodeURIComponent(customerId)}/credit`} color="primary">تنظیم اعتبار و مشاهدهٔ دفترکل مشتری</Typography>
    {error || command.error ? <Alert severity="error">{error ?? command.error}</Alert> : null}
    {saved ? <Alert severity="success">فروش نسیه ثبت شد؛ وضعیت سفارش از سرور بازخوانی می‌شود.</Alert> : null}
    {command.uncertain ? <Button disabled={command.busy || loading} onClick={() => void command.reconcileAndRetry(reload)}>بررسی و تکرار همان تأیید</Button> : <>
      <Button disabled={command.busy || loading || saved} onClick={() => void reload().catch(() => undefined)}>بازخوانی اعتبار</Button>
      <Button variant="contained" disabled={!eligible || command.busy || loading || saved || !!error} onClick={() => {
        if (!account) return;
        const input = { expectedVersion: account.version, expectedOrderVersion: orderVersion };
        command.run(key => () => approveCreditSale(customerId, orderId, input, key));
      }}>تأیید فروش نسیه و ثبت بدهی</Button>
    </>}
  </Stack></CardContent></Card>;
}
