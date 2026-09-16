'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ProductVariant } from '@iranyaragh/contracts';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import { updateVariant } from '@/lib/catalog/catalog-api';

type NumericKey = 'weightGrams' | 'lengthCm' | 'widthCm' | 'heightCm';

const POSITIVE_INTEGER = /^\d{1,10}$/u;

const NUMERIC_LABELS: Record<NumericKey, string> = {
  weightGrams: 'وزن (گرم)',
  lengthCm: 'طول (سانتیمتر)',
  widthCm: 'عرض (سانتیمتر)',
  heightCm: 'ارتفاع (سانتیمتر)',
};

const NUMERIC_KEYS: NumericKey[] = ['weightGrams', 'lengthCm', 'widthCm', 'heightCm'];

function toPrefill(variant: ProductVariant, key: NumericKey): string {
  const value = key === 'weightGrams' ? variant.weightGrams : variant.dimensions?.[key];
  return value == null ? '' : String(value);
}

export function VariantEditDialog({
  variant,
  onSaved,
  onClose,
}: {
  variant: ProductVariant;
  onSaved: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const [barcode, setBarcode] = useState(variant.barcode ?? '');
  const [title, setTitle] = useState(variant.title ?? '');
  const [numeric, setNumeric] = useState<Record<NumericKey, string>>(() => ({
    weightGrams: toPrefill(variant, 'weightGrams'),
    lengthCm: toPrefill(variant, 'lengthCm'),
    widthCm: toPrefill(variant, 'widthCm'),
    heightCm: toPrefill(variant, 'heightCm'),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  function setNumericField(key: NumericKey, value: string) {
    const digits = value.replace(/[^\d]/g, '');
    setNumeric((current) => ({ ...current, [key]: digits }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors: Record<string, string | undefined> = {};
    for (const key of Object.keys(numeric) as NumericKey[]) {
      if (numeric[key].trim() && !POSITIVE_INTEGER.test(numeric[key].trim())) {
        errors[key] = 'فقط عدد صحیح مثبت مجاز است.';
      }
    }
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    const input: Record<string, string | number | null> = { expectedVersion: variant.version ?? 0 };
    if (barcode.trim() !== (variant.barcode ?? '')) input.barcode = barcode.trim() || null;
    if (title.trim() !== (variant.title ?? '')) input.title = title.trim() || null;
    for (const key of Object.keys(numeric) as NumericKey[]) {
      const current = numeric[key].trim();
      const original = toPrefill(variant, key);
      if (current !== original) input[key] = current ? Number.parseInt(current, 10) : null;
    }
    if (Object.keys(input).join() === 'expectedVersion') {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await updateVariant(variant.id, input as Parameters<typeof updateVariant>[1]);
      feedback.success(`ویرایش تنوع «${variant.sku}» ثبت شد.`);
      onSaved();
      onClose();
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'ویرایش تنوع ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  const titleId = 'variant-edit-title';

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" scroll="body" aria-labelledby={titleId}>
      <DialogCloseButton onClick={onClose} disabled={saving} />
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <DialogTitle id={titleId} sx={{ p: 0, mb: 2 }}>
            ویرایش تنوع
          </DialogTitle>
          <Typography variant="body2" color="text.secondary" dir="ltr" textAlign="start">
            {variant.sku}
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 3 }}>
            <FormField label="بارکد" htmlFor="variant-edit-barcode" helperText="اختیاری">
              <TextField
                id="variant-edit-barcode"
                size="small"
                dir="ltr"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </FormField>
            <FormField label="عنوان تنوع" htmlFor="variant-edit-title-field" helperText="اختیاری — مثلاً «طلایی»">
              <TextField
                id="variant-edit-title-field"
                size="small"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </FormField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              {NUMERIC_KEYS.map((key) => (
                <FormField
                  key={key}
                  label={NUMERIC_LABELS[key]}
                  htmlFor={`variant-edit-${key}`}
                  error={Boolean(fieldErrors[key])}
                  errorText={fieldErrors[key]}
                >
                  <TextField
                    id={`variant-edit-${key}`}
                    size="small"
                    dir="ltr"
                    inputMode="numeric"
                    value={numeric[key]}
                    onChange={(event) => setNumericField(key, event.target.value)}
                  />
                </FormField>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button type="button" variant="outlined" color="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}