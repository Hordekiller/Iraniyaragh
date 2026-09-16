'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { ProductVariant, VariantPriceRecord } from '@iranyaragh/contracts';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { getVariantPriceHistory, updateVariantPrice } from '@/lib/catalog/catalog-api';
import { formatRial, variantPriceSourceLabel } from '@/lib/catalog/catalog-labels';

const AMOUNT_PATTERN = /^\d{1,15}$/u;

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function VariantPriceDialog({
  variant,
  onSaved,
  onClose,
}: {
  variant: ProductVariant;
  onSaved: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const [costPrice, setCostPrice] = useState(variant.costPrice.amount);
  const [salePrice, setSalePrice] = useState(variant.salePrice.amount);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<VariantPriceRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ costPrice?: string; salePrice?: string }>({});

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    getVariantPriceHistory(variant.id, controller.signal)
      .then((data) => setHistory(data.items))
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setHistoryError('بارگیری تاریخچهٔ قیمت ناموفق بود.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [variant.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!AMOUNT_PATTERN.test(costPrice.trim())) errors.costPrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (!AMOUNT_PATTERN.test(salePrice.trim())) errors.salePrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    setFieldErrors(errors);
    if (errors.costPrice || errors.salePrice) return;

    setSaving(true);
    try {
      await updateVariantPrice(variant.id, {
        costPrice: { amount: costPrice.trim(), currency: 'IRR' },
        salePrice: { amount: salePrice.trim(), currency: 'IRR' },
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        expectedVersion: variant.version ?? 0,
      });
      feedback.success(`قیمت تنوع «${variant.sku}» به‌روزرسانی شد.`);
      onSaved();
      onClose();
    } catch (error) {
      feedback.error(AppError(error));
    } finally {
      setSaving(false);
    }
  }

  const titleId = 'variant-price-title';

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" scroll="body" aria-labelledby={titleId}>
      <DialogCloseButton onClick={onClose} disabled={saving} />
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <DialogTitle id={titleId} sx={{ p: 0, mb: 2 }}>
            قیمت و تاریخچهٔ تنوع
          </DialogTitle>
          <Typography variant="body2" color="text.secondary" dir="ltr" textAlign="start">
            {variant.sku}
          </Typography>

          <Stack spacing={2.5} sx={{ mt: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="قیمت خرید (ریال)"
                required
                htmlFor="variant-price-cost"
                error={Boolean(fieldErrors.costPrice)}
                errorText={fieldErrors.costPrice}
              >
                <TextField
                  id="variant-price-cost"
                  size="small"
                  dir="ltr"
                  inputMode="numeric"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value.replace(/[^\d]/g, ''))}
                />
              </FormField>
              <FormField
                label="قیمت فروش (ریال)"
                required
                htmlFor="variant-price-sale"
                error={Boolean(fieldErrors.salePrice)}
                errorText={fieldErrors.salePrice}
              >
                <TextField
                  id="variant-price-sale"
                  size="small"
                  dir="ltr"
                  inputMode="numeric"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value.replace(/[^\d]/g, ''))}
                />
              </FormField>
            </Stack>
            <FormField label="دلیل تغییر" htmlFor="variant-price-reason" helperText="اختیاری — در گزارش ممیزی ثبت می‌شود.">
              <TextField
                id="variant-price-reason"
                size="small"
                multiline
                minRows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
          </Stack>

          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
            تاریخچهٔ قیمت
          </Typography>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} aria-label="در حال بارگیری تاریخچه" />
            </Box>
          ) : historyError ? (
            <Alert severity="warning">{historyError}</Alert>
          ) : history && history.length === 0 ? (
            <Alert severity="info">هنوز رکوردی از تغییر قیمت ثبت نشده است.</Alert>
          ) : (
            <TableContainer sx={{ maxHeight: 260 }}>
              <Table size="small" stickyHeader aria-label="تاریخچهٔ قیمت تنوع">
                <TableHead>
                  <TableRow>
                    <TableCell>زمان اعمال</TableCell>
                    <TableCell>قیمت خرید</TableCell>
                    <TableCell>قیمت فروش</TableCell>
                    <TableCell>منبع</TableCell>
                    <TableCell>دلیل</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history?.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{faDateTime.format(new Date(record.effectiveAt))}</TableCell>
                      <TableCell>{formatRial(record.costPrice)}</TableCell>
                      <TableCell>{formatRial(record.salePrice)}</TableCell>
                      <TableCell>{variantPriceSourceLabel(record.source)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {record.reason ?? '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button type="button" variant="outlined" color="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'در حال ذخیره…' : 'به‌روزرسانی قیمت'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function AppError(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'به‌روزرسانی قیمت ناموفق بود؛ دوباره تلاش کنید.';
}