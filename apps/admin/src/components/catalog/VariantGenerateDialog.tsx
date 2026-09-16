'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AttributeDefinitionSummary, ProductDetail, VariantGeneratePreviewResponse } from '@iranyaragh/contracts';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import {
  createIdempotencyKey,
  generateVariants,
  getAttribute,
  previewVariantGeneration,
} from '@/lib/catalog/catalog-api';

const AMOUNT_PATTERN = /^\d{1,15}$/u;

export function VariantGenerateDialog({
  product,
  attributesById,
  onGenerated,
  onClose,
}: {
  product: ProductDetail;
  attributesById: Record<string, AttributeDefinitionSummary>;
  onGenerated: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const axes = useMemo(
    () => (product.attributes ?? []).filter((attribute) => attribute.isVariantAxis),
    [product.attributes],
  );

  const [optionsByAxis, setOptionsByAxis] = useState<Record<string, string[]>>({});
  const [axisLoading, setAxisLoading] = useState(true);
  const [axisError, setAxisError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState<VariantGeneratePreviewResponse['data'] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [costPrice, setCostPrice] = useState(product.variants[0]?.costPrice.amount ?? '');
  const [salePrice, setSalePrice] = useState(product.variants[0]?.salePrice.amount ?? '');
  const [titlePattern, setTitlePattern] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ costPrice?: string; salePrice?: string }>({});
  const [generating, setGenerating] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const axisIds = axes
      .map((axis) => attributesById[axis.attributeCode]?.id)
      .filter((id): id is string => Boolean(id));
    if (axisIds.length === 0) {
      setAxisLoading(false);
      return () => controller.abort();
    }
    setAxisLoading(true);
    setAxisError(null);
    Promise.all(axisIds.map((id) => getAttribute(id, controller.signal)))
      .then((details) => {
        const loaded: Record<string, string[]> = {};
        details.forEach((detail) => {
          loaded[detail.attribute.code] = detail.attribute.options
            .filter((option) => option.status === 'ACTIVE')
            .map((option) => option.code);
        });
        setOptionsByAxis(loaded);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setAxisError('بارگیری گزینه‌های محورها ناموفق بود؛ دوباره تلاش کنید.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAxisLoading(false);
      });
    return () => controller.abort();
  }, [axes, attributesById]);

  function toggleOption(axisCode: string, optionCode: string) {
    setPreview(null);
    setSelection((current) => {
      const next = { ...current };
      const picked = new Set(next[axisCode] ?? []);
      if (picked.has(optionCode)) picked.delete(optionCode);
      else picked.add(optionCode);
      next[axisCode] = [...picked];
      return next;
    });
  }

  function allAxesSelected(): boolean {
    return axes.every((axis) => (selection[axis.attributeCode] ?? []).length > 0);
  }

  async function runPreview() {
    if (!allAxesSelected()) return;
    setPreviewing(true);
    idempotencyKey.current = null;
    try {
      const data = await previewVariantGeneration(product.id, { optionSelection: selection });
      setPreview(data);
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'پیش‌نمایش ترکیب‌ها ناموفق بود.');
    } finally {
      setPreviewing(false);
    }
  }

  async function runGenerate() {
    const errors: typeof fieldErrors = {};
    if (!AMOUNT_PATTERN.test(costPrice.trim())) errors.costPrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (!AMOUNT_PATTERN.test(salePrice.trim())) errors.salePrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    setFieldErrors(errors);
    if (errors.costPrice || errors.salePrice || !preview) return;

    setGenerating(true);
    idempotencyKey.current ??= createIdempotencyKey('catalog-variant-generate');
    try {
      await generateVariants(
        product.id,
        {
          optionSelection: selection,
          costPrice: { amount: costPrice.trim(), currency: 'IRR' },
          salePrice: { amount: salePrice.trim(), currency: 'IRR' },
          ...(titlePattern.trim() ? { titlePattern: titlePattern.trim() } : {}),
        },
        idempotencyKey.current,
      );
      feedback.success(`تنوع‌های «${product.name}» تولید شدند.`);
      idempotencyKey.current = null;
      onGenerated();
      onClose();
    } catch (error) {
      feedback.error(
        error instanceof ApiClientError ? error.message : 'تولید تنوع‌ها ناموفق بود؛ دوباره تلاش کنید.',
      );
    } finally {
      setGenerating(false);
    }
  }

  const titleId = 'variant-generate-title';

  return (
    <Dialog open onClose={generating || previewing ? undefined : onClose} fullWidth maxWidth="sm" scroll="body" aria-labelledby={titleId}>
      <DialogCloseButton onClick={onClose} disabled={generating || previewing} />
      <DialogContent>
        <DialogTitle id={titleId} sx={{ p: 0, mb: 2 }}>
          تولید تنوع از محورها
        </DialogTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          برای هر محورِ واریانت این کالا، دست‌کم یک گزینه انتخاب کنید؛ ترکیب گزینه‌ها به‌صورت خودکار
          ساخته می‌شود (حداکثر ۲۰۰۰ ترکیب).
        </Typography>

        {axes.length === 0 ? (
          <Alert severity="info">
            این کالا هنوز محور واریانت ندارد. ابتدا در بخش «ویژگی‌های کالا» دست‌کم یک ویژگی را به‌عنوان محور فعال کنید.
          </Alert>
        ) : (
          <>
            {axisError ? <Alert severity="error" sx={{ mb: 2 }}>{axisError}</Alert> : null}
            {axisLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} aria-label="در حال بارگیری گزینه‌ها" />
              </Box>
            ) : (
              axes.map((axis) => {
                const options = optionsByAxis[axis.attributeCode] ?? [];
                return (
                  <Box key={axis.attributeCode} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {axis.attributeName}
                    </Typography>
                    {options.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        گزینه‌ای برای این محور فعال نیست؛ ابتدا در بخش ویژگی‌ها گزینه بسازید.
                      </Typography>
                    ) : (
                      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                        {options.map((optionCode) => (
                          <FormControlLabel
                            key={optionCode}
                            control={
                              <Checkbox
                                size="small"
                                checked={(selection[axis.attributeCode] ?? []).includes(optionCode)}
                                onChange={() => toggleOption(axis.attributeCode, optionCode)}
                                inputProps={{ 'aria-label': `${axis.attributeName}: ${optionCode}` }}
                              />
                            }
                            label={optionCode}
                          />
                        ))}
                      </Stack>
                    )}
                  </Box>
                );
              })
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 3 }}>
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={!allAxesSelected() || previewing}
                onClick={() => void runPreview()}
              >
                {previewing ? 'در حال محاسبه…' : 'پیش‌نمایش ترکیب‌ها'}
              </Button>
            </Stack>

            {preview ? (
              <>
                <Divider sx={{ my: 2 }} />
                <Alert severity="success" sx={{ mb: 2 }}>
                  {new Intl.NumberFormat('fa-IR').format(preview.total)} ترکیب آمادهٔ ایجاد است
                  {preview.total === preview.limit ? ` (سقف ${new Intl.NumberFormat('fa-IR').format(preview.limit)} ترکیب)` : ''}.
                </Alert>
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <FormField
                    label="قیمت خرید (ریال)"
                    required
                    htmlFor="generate-cost"
                    error={Boolean(fieldErrors.costPrice)}
                    errorText={fieldErrors.costPrice}
                  >
                    <TextField
                      id="generate-cost"
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
                    htmlFor="generate-sale"
                    error={Boolean(fieldErrors.salePrice)}
                    errorText={fieldErrors.salePrice}
                  >
                    <TextField
                      id="generate-sale"
                      size="small"
                      dir="ltr"
                      inputMode="numeric"
                      value={salePrice}
                      onChange={(event) => setSalePrice(event.target.value.replace(/[^\d]/g, ''))}
                    />
                  </FormField>
                </Stack>
                <FormField
                  label="الگوی عنوان"
                  htmlFor="generate-title-pattern"
                  helperText="اختیاری — مثلاً «{color} {size}»؛ پیش‌فرض ترکیب برچسب گزینه‌هاست."
                >
                  <TextField
                    id="generate-title-pattern"
                    size="small"
                    dir="ltr"
                    value={titlePattern}
                    onChange={(event) => setTitlePattern(event.target.value)}
                  />
                </FormField>
              </>
            ) : null}
          </>
        )}
      </DialogContent>
      {preview ? (
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button type="button" variant="outlined" color="secondary" onClick={onClose} disabled={generating}>
            انصراف
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={generating}
            onClick={() => void runGenerate()}
            startIcon={generating ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {generating ? 'در حال ایجاد…' : `ایجاد ${new Intl.NumberFormat('fa-IR').format(preview.total)} تنوع`}
          </Button>
        </DialogActions>
      ) : (
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button type="button" variant="outlined" color="secondary" onClick={onClose}>
            بستن
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}