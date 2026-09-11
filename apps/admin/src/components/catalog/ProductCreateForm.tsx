'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { CatalogStatus } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { createIdempotencyKey, createProduct, listBrands, listCategories } from '@/lib/catalog/catalog-api';
import { AMOUNT_PATTERN, SLUG_PATTERN } from '@/lib/catalog/catalog-labels';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { useFeedback } from '@/components/ui/FeedbackProvider';

type VariantDraft = {
  sku: string;
  barcode: string;
  title: string;
  costPrice: string;
  salePrice: string;
  weightGrams: string;
  isActive: boolean;
};

type ProductDraft = {
  name: string;
  slug: string;
  description: string;
  brandId: string;
  categoryId: string;
  status: CatalogStatus;
  variants: VariantDraft[];
};

const emptyVariant = (): VariantDraft => ({
  sku: '',
  barcode: '',
  title: '',
  costPrice: '',
  salePrice: '',
  weightGrams: '',
  isActive: true,
});

type FieldErrors = Partial<Record<'name' | 'slug' | 'description', string>> &
  Record<string, string | undefined>;

type VariantErrors = Record<number, Partial<Record<keyof VariantDraft, string>>>;

function validateDraft(draft: ProductDraft): { fields: FieldErrors; variants: VariantErrors } {
  const fields: FieldErrors = {};
  if (!draft.name.trim()) fields.name = 'نام کالا الزامی است.';
  else if (draft.name.trim().length > 250) fields.name = 'نام کالا حداکثر ۲۵۰ کاراکتر.';
  if (!draft.slug.trim()) fields.slug = 'شناسه (Slug) الزامی است.';
  else if (!SLUG_PATTERN.test(draft.slug)) fields.slug = 'شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.';

  const variants: VariantErrors = {};
  if (draft.variants.length === 0) {
    variants[0] = { sku: 'حداقل یک تنوع (SKU) لازم است.' };
  }
  draft.variants.forEach((variant, index) => {
    const errors: Partial<Record<keyof VariantDraft, string>> = {};
    if (!variant.sku.trim()) errors.sku = 'کد SKU الزامی است.';
    else if (variant.sku.trim().length > 100) errors.sku = 'حداکثر ۱۰۰ کاراکتر.';
    if (variant.costPrice.trim() && !AMOUNT_PATTERN.test(variant.costPrice.trim()))
      errors.costPrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (!variant.salePrice.trim()) errors.salePrice = 'قیمت فروش الزامی است.';
    else if (!AMOUNT_PATTERN.test(variant.salePrice.trim()))
      errors.salePrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (!variant.costPrice.trim()) errors.costPrice = 'قیمت خرید الزامی است.';
    if (variant.weightGrams.trim() && !/^\d{1,10}$/u.test(variant.weightGrams.trim()))
      errors.weightGrams = 'وزن فقط عددی (گرم) است.';
    if (Object.keys(errors).length > 0) variants[index] = errors;
  });
  return { fields, variants };
}

export function ProductCreateForm() {
  const router = useRouter();
  const feedback = useFeedback();

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({
    name: '',
    slug: '',
    description: '',
    brandId: '',
    categoryId: '',
    status: 'DRAFT',
    variants: [emptyVariant()],
  });
  const [errors, setErrors] = useState<{ fields: FieldErrors; variants: VariantErrors }>({
    fields: {},
    variants: {},
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listBrands(controller.signal), listCategories(controller.signal)])
      .then(([brandItems, categoryItems]) => {
        setBrands(brandItems);
        setCategories(categoryItems);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setReferenceError('بارگیری برندها و دسته‌بندی‌ها ناموفق بود؛ میتوانید بدون انتخاب ادامه دهید.');
      });
    return () => controller.abort();
  }, []);

  const setField = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    idempotencyKey.current = null;
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, fields: { ...current.fields, [String(key)]: undefined } }));
  };

  const setVariantField = (index: number, key: keyof VariantDraft, value: VariantDraft[keyof VariantDraft]) => {
    idempotencyKey.current = null;
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, i) => (i === index ? { ...variant, [key]: value } : variant)),
    }));
    setErrors((current) => {
      const variants = { ...current.variants };
      const variantErrors = { ...(variants[index] ?? {}) };
      delete variantErrors[key];
      if (Object.keys(variantErrors).length === 0) delete variants[index];
      else variants[index] = variantErrors;
      return { ...current, variants };
    });
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors.fields).length > 0 || Object.keys(nextErrors.variants).length > 0) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    idempotencyKey.current ??= createIdempotencyKey('catalog-product');
    try {
      const result = await createProduct({
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(draft.brandId ? { brandId: draft.brandId } : {}),
        ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
        status: draft.status,
        variants: draft.variants.map((variant) => ({
          sku: variant.sku.trim(),
          ...(variant.barcode.trim() ? { barcode: variant.barcode.trim() } : {}),
          ...(variant.title.trim() ? { title: variant.title.trim() } : {}),
          costPrice: { amount: variant.costPrice.trim(), currency: 'IRR' },
          salePrice: { amount: variant.salePrice.trim(), currency: 'IRR' },
          ...(variant.weightGrams.trim()
            ? { weightGrams: Number.parseInt(variant.weightGrams.trim(), 10) }
            : {}),
          isActive: variant.isActive,
        })),
      }, idempotencyKey.current);
      feedback.success(`کالای «${result.product.name}» با موفقیت ثبت شد.`);
      idempotencyKey.current = null;
      router.replace('/catalog');
    } catch (error) {
      if (error instanceof ApiClientError) setFormError(error.message);
      else setFormError('ثبت کالا ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="کالای جدید"
        eyebrow="کاتالوگ"
        description="ثبت کالا با شناسهٔ یکتا و تنوع‌ها. قیمت‌ها به ریال و به‌صورت عدد صحیح ثبت می‌شوند."
        breadcrumbs={[
          { label: 'کالا و انبار' },
          { label: 'کالا و SKU', href: '/catalog' },
          { label: 'کالای جدید' },
        ]}
        actions={
          <Button component="a" href="/catalog" startIcon={<ArrowRight size={18} />} size="small">
            بازگشت به فهرست
          </Button>
        }
      />

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={3} sx={{ maxWidth: 860 }}>
          {referenceError ? <Alert severity="warning">{referenceError}</Alert> : null}
          {formError ? <Alert severity="error">{formError}</Alert> : null}

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
                مشخصات کالا
              </Typography>
              <Stack spacing={2.5}>
                <FormField label="نام کالا" required htmlFor="product-name" error={Boolean(errors.fields.name)} errorText={errors.fields.name}>
                  <TextField
                    id="product-name"
                    size="small"
                    placeholder="مثلاً قفل دستگیره‌ای برنجی"
                    value={draft.name}
                    onChange={(event) => setField('name', event.target.value)}
                    autoFocus
                  />
                </FormField>
                <FormField
                  label="شناسهٔ یکتا (Slug)"
                  required
                  htmlFor="product-slug"
                  helperText="نمونه: lock-handle-brass"
                  error={Boolean(errors.fields.slug)}
                  errorText={errors.fields.slug}
                >
                  <TextField
                    id="product-slug"
                    size="small"
                    dir="ltr"
                    value={draft.slug}
                    onChange={(event) => setField('slug', event.target.value.toLocaleLowerCase('en-US').replace(/\s+/g, '-'))}
                  />
                </FormField>
                <FormField label="توضیحات" htmlFor="product-description" helperText="اختیاری — حداکثر ۱۰۰۰۰ کاراکتر">
                  <TextField
                    id="product-description"
                    size="small"
                    multiline
                    minRows={3}
                    value={draft.description}
                    onChange={(event) => setField('description', event.target.value)}
                  />
                </FormField>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormField label="برند" htmlFor="product-brand">
                    <Select
                      id="product-brand"
                      size="small"
                      displayEmpty
                      value={draft.brandId}
                      inputProps={{ 'aria-label': 'برند' }}
                      onChange={(event) => setField('brandId', String(event.target.value))}
                    >
                      <MenuItem value="">بدون برند</MenuItem>
                      {brands.map((brand) => (
                        <MenuItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="دسته‌بندی" htmlFor="product-category">
                    <Select
                      id="product-category"
                      size="small"
                      displayEmpty
                      value={draft.categoryId}
                      inputProps={{ 'aria-label': 'دسته‌بندی' }}
                      onChange={(event) => setField('categoryId', String(event.target.value))}
                    >
                      <MenuItem value="">بدون دسته‌بندی</MenuItem>
                      {categories.map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {category.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="وضعیت" htmlFor="product-status">
                    <Select
                      id="product-status"
                      size="small"
                      value={draft.status}
                      inputProps={{ 'aria-label': 'وضعیت' }}
                      onChange={(event) => setField('status', event.target.value as CatalogStatus)}
                    >
                      <MenuItem value="DRAFT">پیش‌نویس</MenuItem>
                      <MenuItem value="PUBLISHED">منتشرشده</MenuItem>
                      <MenuItem value="ARCHIVED">بایگانی‌شده</MenuItem>
                    </Select>
                  </FormField>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                  تنوع‌ها (SKU)
                </Typography>
                <Button
                  size="small"
                  startIcon={<Plus size={16} />}
                  onClick={() => setDraft((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))}
                >
                  افزودن تنوع
                </Button>
              </Box>
              {errors.variants[0]?.sku && draft.variants.length === 0 ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {errors.variants[0].sku}
                </Alert>
              ) : null}
              {draft.variants.length === 0 ? (
                <Alert severity="info">برای ثبت کالا حداقل یک تنوع لازم است.</Alert>
              ) : (
                <Stack spacing={2}>
                  {draft.variants.map((variant, index) => (
                    <Box key={index} component="section">
                      {index > 0 ? <Divider sx={{ my: 2 }} /> : null}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                        <IconButton
                          size="small"
                          aria-label={`حذف تنوع ${index + 1}`}
                          disabled={draft.variants.length === 1}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              variants: current.variants.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </Box>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <FormField
                            label="کد SKU"
                            required
                            htmlFor={`variant-${index}-sku`}
                            error={Boolean(errors.variants[index]?.sku)}
                            errorText={errors.variants[index]?.sku}
                          >
                            <TextField
                              id={`variant-${index}-sku`}
                              size="small"
                              dir="ltr"
                              placeholder="LOCK-BR-001"
                              value={variant.sku}
                              onChange={(event) => setVariantField(index, 'sku', event.target.value)}
                            />
                          </FormField>
                          <FormField label="بارکد" htmlFor={`variant-${index}-barcode`}>
                            <TextField
                              id={`variant-${index}-barcode`}
                              size="small"
                              dir="ltr"
                              value={variant.barcode}
                              onChange={(event) => setVariantField(index, 'barcode', event.target.value)}
                            />
                          </FormField>
                          <FormField label="عنوان تنوع" htmlFor={`variant-${index}-title`}>
                            <TextField
                              id={`variant-${index}-title`}
                              size="small"
                              placeholder="مثلاً طلایی"
                              value={variant.title}
                              onChange={(event) => setVariantField(index, 'title', event.target.value)}
                            />
                          </FormField>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <FormField
                            label="قیمت خرید (ریال)"
                            required
                            htmlFor={`variant-${index}-cost`}
                            error={Boolean(errors.variants[index]?.costPrice)}
                            errorText={errors.variants[index]?.costPrice}
                          >
                            <TextField
                              id={`variant-${index}-cost`}
                              size="small"
                              dir="ltr"
                              inputMode="numeric"
                              value={variant.costPrice}
                              onChange={(event) => setVariantField(index, 'costPrice', event.target.value.replace(/[^\d]/g, ''))}
                            />
                          </FormField>
                          <FormField
                            label="قیمت فروش (ریال)"
                            required
                            htmlFor={`variant-${index}-sale`}
                            error={Boolean(errors.variants[index]?.salePrice)}
                            errorText={errors.variants[index]?.salePrice}
                          >
                            <TextField
                              id={`variant-${index}-sale`}
                              size="small"
                              dir="ltr"
                              inputMode="numeric"
                              value={variant.salePrice}
                              onChange={(event) => setVariantField(index, 'salePrice', event.target.value.replace(/[^\d]/g, ''))}
                            />
                          </FormField>
                          <FormField
                            label="وزن (گرم)"
                            htmlFor={`variant-${index}-weight`}
                            error={Boolean(errors.variants[index]?.weightGrams)}
                            errorText={errors.variants[index]?.weightGrams}
                          >
                            <TextField
                              id={`variant-${index}-weight`}
                              size="small"
                              dir="ltr"
                              inputMode="numeric"
                              value={variant.weightGrams}
                              onChange={(event) =>
                                setVariantField(index, 'weightGrams', event.target.value.replace(/[^\d]/g, ''))
                              }
                            />
                          </FormField>
                        </Stack>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={variant.isActive}
                              onChange={(event) => setVariantField(index, 'isActive', event.target.checked)}
                              inputProps={{ 'aria-label': `تنوع ${index + 1} فعال` }}
                            />
                          }
                          label="فعال"
                        />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button type="button" variant="outlined" component="a" href="/catalog">
              انصراف
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'در حال ثبت…' : 'ثبت کالا'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </>
  );
}
