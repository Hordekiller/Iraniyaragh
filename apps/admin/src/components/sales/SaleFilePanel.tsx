'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Ban, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasPermission } from '@/lib/settings/settings-permissions';
import { ApiAbortError } from '@/lib/api/client';
import { listInvoiceDraftsForOrder } from '@/lib/invoices/invoice-drafts-api';
import { listInvoiceDocumentsForOrder, readInvoicePublication } from '@/lib/invoices/invoice-documents-api';
import { deriveSaleFile, type SaleFileInput, type SaleStep, type StepState } from '@/lib/sales/sale-file';
import { InvoiceFromOrder } from '@/components/invoices/InvoiceFromOrder';

type OrderPart = Pick<SaleFileInput, 'orderStatus' | 'paymentStatus' | 'fulfillmentStatus'> & { orderId: string; orderVersion: number };
type Loaded = { draft: SaleFileInput['draft']; document: SaleFileInput['document']; published: boolean | null };

const ICON: Record<StepState, React.ReactNode> = {
  done: <CheckCircle2 size={22} color="var(--mui-palette-success-main, #2e7d32)" />,
  current: <CircleDot size={22} color="var(--mui-palette-primary-main, #1976d2)" />,
  upcoming: <Circle size={22} color="var(--mui-palette-text-disabled, #9e9e9e)" />,
  blocked: <Ban size={22} color="var(--mui-palette-error-main, #d32f2f)" />,
};

/** پروندهٔ فروش: where this sale stands, and the one thing to do next. Read-only on the server. */
export function SaleFilePanel(props: OrderPart) {
  const { user } = useAuth();
  const canRead = hasPermission(user, 'invoices.read');
  const can = { manage: hasPermission(user, 'invoices.manage'), issue: hasPermission(user, 'invoices.issue'), publish: hasPermission(user, 'invoices.publish') };
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const { orderId } = props;

  const load = useCallback(async (signal: AbortSignal) => {
    const [drafts, documents] = await Promise.all([listInvoiceDraftsForOrder(orderId, signal), listInvoiceDocumentsForOrder(orderId, signal)]);
    const draft = drafts.items.find((item) => item.state !== 'CANCELLED') ?? null;
    const document = documents.items[0] ? { id: documents.items[0].id, number: documents.items[0].number } : null;
    let published: boolean | null = null;
    if (document) {
      try { published = (await readInvoicePublication(document.id, 0, signal)).publication.isPublished; }
      catch (cause) { if (cause instanceof ApiAbortError) throw cause; published = null; } // Unknown is never shown as published.
    }
    return { draft: draft ? { id: draft.id, state: draft.state } : null, document, published } satisfies Loaded;
  }, [orderId]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setFailed(false);
    load(controller.signal).then((result) => { if (!controller.signal.aborted) setLoaded(result); })
      .catch((cause) => { if (!controller.signal.aborted && !(cause instanceof ApiAbortError)) setFailed(true); });
    return () => controller.abort();
  }, [canRead, load, reload]);

  const { steps, next } = deriveSaleFile({
    orderStatus: props.orderStatus, paymentStatus: props.paymentStatus, fulfillmentStatus: props.fulfillmentStatus,
    draft: loaded?.draft ?? null, document: loaded?.document ?? null, published: loaded?.published ?? null, can,
  });
  // Without invoice data the invoice step must not pretend nothing exists.
  const invoiceUnknown = canRead && !loaded;

  return (
    <Paper component="section" aria-label="پروندهٔ فروش" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">پروندهٔ فروش</Typography>
        {failed && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>}>
            وضعیت فاکتور بارگذاری نشد؛ تا بارگذاری دوباره، مرحلهٔ فاکتور قطعی نیست.
          </Alert>
        )}
        <Box component="ol" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, listStyle: 'none', m: 0, p: 0 }}>
          {steps.map((step) => <StepCard key={step.key} step={step} unknown={step.key === 'invoice' && invoiceUnknown} failed={failed} orderId={orderId} version={props.orderVersion} />)}
        </Box>
        {next?.action && !invoiceUnknown && (
          <Alert severity="info" icon={false}>
            <strong>قدم بعدی:</strong> {next.detail}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

function StepCard({ step, unknown, failed, orderId, version }: { step: SaleStep; unknown: boolean; failed: boolean; orderId: string; version: number }) {
  const action = step.action;
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2, borderColor: step.state === 'current' ? 'primary.main' : undefined }} aria-current={step.state === 'current' ? 'step' : undefined}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          {ICON[step.state]}
          <Typography variant="subtitle2">{step.title}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">{unknown ? (failed ? 'وضعیت فاکتور نامشخص است.' : 'در حال بررسی وضعیت فاکتور…') : step.detail}</Typography>
        {!unknown && action?.kind === 'link' && <Button component={Link} href={action.href} size="small" variant={step.state === 'current' ? 'contained' : 'outlined'}>{action.label}</Button>}
        {!unknown && action?.kind === 'create-draft' && <InvoiceFromOrder orderId={orderId} version={version} />}
      </Stack>
    </Paper>
  );
}
