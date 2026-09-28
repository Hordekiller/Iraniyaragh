'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { MAX_TRANSFER_ITEMS } from '@iranyaragh/contracts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { randomUuid } from '@/lib/crypto/random-uuid';
import { canTransferInventory } from '@/lib/inventory/inventory-permissions';
import { createTransfer } from '@/lib/inventory/transfers-api';

type DraftItem = { key: string; variantId: string; quantity: string; sourceLocationId: string; targetLocationId: string };
function newItem(variantId = ''): DraftItem { return { key: randomUuid(), variantId, quantity: '', sourceLocationId: '', targetLocationId: '' }; }

export function TransferCreateView({ initialSourceWarehouseId = '', initialVariantId = '' }: { initialSourceWarehouseId?: string; initialVariantId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const canTransfer = canTransferInventory(user);
  const [code, setCode] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState(initialSourceWarehouseId);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => [newItem(initialVariantId)]);
  const [key] = useState(() => `inventory-transfer-${randomUuid()}`);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(id: string, field: keyof Omit<DraftItem, 'key'>, value: string) {
    setItems((current) => current.map((item) => item.key === id ? { ...item, [field]: value } : item));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || uncertain) return;
    const source = sourceWarehouseId.trim();
    const target = targetWarehouseId.trim();
    if (!source || !target || source === target || code.trim().length > 64 || items.length < 1 || items.length > MAX_TRANSFER_ITEMS || items.some((item) => !item.variantId.trim() || !item.sourceLocationId.trim() || !item.targetLocationId.trim() || !/^\d+$/u.test(item.quantity) || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 2_147_483_647)) {
      setError('انبارهای متمایز، کد معتبر و شناسهٔ SKU/مکان/تعداد صحیح مثبت برای هر ردیف لازم است.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const transfer = await createTransfer({
        ...(code.trim() ? { code: code.trim() } : {}), sourceWarehouseId: source, targetWarehouseId: target,
        items: items.map((item) => ({ variantId: item.variantId.trim(), quantity: Number(item.quantity),
          sourceLocationId: item.sourceLocationId.trim(), targetLocationId: item.targetLocationId.trim() })),
      }, key);
      router.push(`/transfers/${encodeURIComponent(transfer.id)}`);
    } catch (failure) {
      if (failure instanceof ApiNetworkError) {
        setUncertain(true);
        setError('نتیجهٔ ساخت نامشخص است. فهرست انتقال‌ها را بررسی کنید؛ این فرم دوباره ارسال نمی‌شود.');
      } else {
        setError(failure instanceof ApiClientError ? failure.message : 'ساخت انتقال ناموفق بود.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!canTransfer) return <><PageHeader title="انتقال جدید" /><EmptyState icon={<Lock size={28} />} title="دسترسی ندارید" description="حساب شما مجوز inventory.transfer ندارد." /></>;

  return <>
    <PageHeader title="انتقال جدید" eyebrow="کالا و انبار" description="پیش‌نویس انتقال با مکان‌های دقیق؛ جابه‌جایی فیزیکی فقط هنگام dispatch/receive انجام می‌شود." breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'انتقال‌ها', href: '/transfers' }, { label: 'جدید' }]} />
    <Alert severity="info" sx={{ mb: 2 }}>شناسهٔ انبار، مکان و SKU را از صفحه‌های واقعی Admin بردارید. مبدأ باید موجودی آزاد کافی داشته باشد؛ مکان‌ها در زمان dispatch/receive دوباره در API اعتبارسنجی می‌شوند.</Alert>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    <Box component="form" onSubmit={(event) => void submit(event)} noValidate>
      <Card variant="outlined" sx={{ mb: 2 }}><CardContent><Stack spacing={2}>
        <TextField label="کد انتقال (اختیاری)" value={code} disabled={submitting || uncertain} onChange={(event) => setCode(event.target.value)} inputProps={{ dir: 'ltr', maxLength: 64 }} helperText="در صورت خالی‌بودن، API کد یکتا می‌سازد." />
        <TextField label="شناسه انبار مبدأ" required value={sourceWarehouseId} disabled={submitting || uncertain} onChange={(event) => setSourceWarehouseId(event.target.value)} inputProps={{ dir: 'ltr' }} />
        <TextField label="شناسه انبار مقصد" required value={targetWarehouseId} disabled={submitting || uncertain} onChange={(event) => setTargetWarehouseId(event.target.value)} inputProps={{ dir: 'ltr' }} />
      </Stack></CardContent></Card>
      <Stack spacing={2}>
        {items.map((item, index) => <Card variant="outlined" key={item.key}><CardContent><Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">ردیف {index + 1}</Typography>
            <Button color="error" size="small" startIcon={<Trash2 size={16} />} disabled={items.length === 1 || submitting || uncertain} onClick={() => setItems((current) => current.filter((currentItem) => currentItem.key !== item.key))}>حذف ردیف</Button>
          </Stack>
          <Divider />
          <TextField label={`شناسه SKU ردیف ${index + 1}`} required value={item.variantId} disabled={submitting || uncertain} onChange={(event) => updateItem(item.key, 'variantId', event.target.value)} inputProps={{ dir: 'ltr' }} />
          <TextField label={`تعداد ردیف ${index + 1}`} required value={item.quantity} disabled={submitting || uncertain} onChange={(event) => updateItem(item.key, 'quantity', event.target.value)} inputProps={{ inputMode: 'numeric', dir: 'ltr' }} />
          <TextField label={`شناسه مکان مبدأ ردیف ${index + 1}`} required value={item.sourceLocationId} disabled={submitting || uncertain} onChange={(event) => updateItem(item.key, 'sourceLocationId', event.target.value)} inputProps={{ dir: 'ltr' }} />
          <TextField label={`شناسه مکان مقصد ردیف ${index + 1}`} required value={item.targetLocationId} disabled={submitting || uncertain} onChange={(event) => updateItem(item.key, 'targetLocationId', event.target.value)} inputProps={{ dir: 'ltr' }} />
        </Stack></CardContent></Card>)}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button type="button" startIcon={<Plus size={16} />} disabled={items.length >= MAX_TRANSFER_ITEMS || submitting || uncertain} onClick={() => setItems((current) => [...current, newItem()])}>افزودن ردیف</Button>
        <Button component={Link} href="/transfers">بازگشت به فهرست</Button>
        <Button type="submit" variant="contained" disabled={submitting || uncertain}>{submitting ? 'در حال ساخت…' : 'ساخت پیش‌نویس'}</Button>
      </Stack>
    </Box>
  </>;
}
