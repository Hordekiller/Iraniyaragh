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
import { ArrowRight, Lock, Plus, Trash2 } from 'lucide-react';
import type { BrandSummary, CategorySummary } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  createIdempotencyKey,
  createProduct,
  listBrands,
  listCategories,
} from '@/lib/catalog/catalog-api';
import { AMOUNT_PATTERN, SLUG_PATTERN } from '@/lib/catalog/catalog-labels';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { BrandDialog } from './BrandDialog';
import { CategoryDialog } from './CategoryDialog';

type ProductDraft = {
  name: string;
  slug: string;
  description: string;
  brandId: string;
  categoryId: string;
  status: 'DRAFT';
  variants: VariantDraft[];
};

type VariantDraft = { sku: string; barcode: string; title: string; costPrice: string; salePrice: string; weightGrams: string; isActive: boolean };
const emptyVariant = (): VariantDraft => ({ sku: '', barcode: '', title: '', costPrice: '', salePrice: '', weightGrams: '', isActive: true });

type FieldErrors = Partial<Record<'name' | 'slug' | 'description' | 'brandId' | 'categoryId', string>>;

type VariantErrors = Record<number, Partial<Record<keyof VariantDraft, string>>>;

function validateDraft(draft: ProductDraft): { fields: FieldErrors; variants: VariantErrors } {
  const fields: FieldErrors = {};
  if (!draft.name.trim()) fields.name = 'نام کالا الزامی است.';
  else if (draft.name.trim().length > 250) fields.name = 'نام کالا حداکثر ۲۵۰ کاراکتر.';
  if (!draft.slug.trim()) fields.slug = 'شناسه (Slug) الزامی است.';
  else if (!SLUG_PATTERN.test(draft.slug)) fields.slug = 'شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.';
  if (draft.description.trim().length > 10000) fields.description = 'توضیحات حداکثر ۱۰۰۰۰ کاراکتر.';
  const variants: VariantErrors = {};
  if (!draft.variants.length) variants[0] = { sku: 'حداقل یک تنوع (SKU) لازم است.' };
  draft.variants.forEach((variant, index) => {
    const item: Partial<Record<keyof VariantDraft, string>> = {};
    if (!variant.sku.trim()) item.sku = 'کد SKU الزامی است.';
    else if (variant.sku.trim().length > 100) item.sku = 'حداکثر ۱۰۰ کاراکتر.';
    if (!variant.costPrice.trim()) item.costPrice = 'قیمت خرید الزامی است.';
    else if (!AMOUNT_PATTERN.test(variant.costPrice.trim())) item.costPrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (!variant.salePrice.trim()) item.salePrice = 'قیمت فروش الزامی است.';
    else if (!AMOUNT_PATTERN.test(variant.salePrice.trim())) item.salePrice = 'فقط ارقام (بدون جداکننده) مجاز است.';
    if (variant.weightGrams.trim() && !/^\d{1,10}$/u.test(variant.weightGrams.trim())) item.weightGrams = 'وزن فقط عددی (گرم) است.';
    if (Object.keys(item).length) variants[index] = item;
  });
  return { fields, variants };
}

export function ProductCreateForm() {
  const router = useRouter();
  const feedback = useFeedback();
  const { user } = useAuth();
  const canWrite = canWriteCatalog(user);

  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>({
    name: '',
    slug: '',
    description: '',
    brandId: '',
    categoryId: '',
    status: 'DRAFT',
    variants: [emptyVariant()],
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [variantErrors, setVariantErrors] = useState<VariantErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (!canWrite) return;
    const controller = new AbortController();
    Promise.all([listBrands(controller.signal), listCategories(controller.signal)])
      .then(([brandList, categoryList]) => {
        setBrands(brandList);
        setCategories(categoryList);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiAbortError) return;
        setReferenceError('بارگیری برندها و دسته‌بندی‌ها ناموفق بود؛ دوباره تلاش کنید.');
      });
    return () => controller.abort();
  }, [canWrite]);

  const setField = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    idempotencyKey.current = null;
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [String(key)]: undefined }));
  };

  const setVariantField = (index: number, key: keyof VariantDraft, value: VariantDraft[keyof VariantDraft]) => {
    idempotencyKey.current = null;
    setDraft((current) => ({ ...current, variants: current.variants.map((variant, i) => i === index ? { ...variant, [key]: value } : variant) }));
    setVariantErrors((current) => {
      const next = { ...current };
      const item = { ...(next[index] ?? {}) };
      delete item[key];
      if (Object.keys(item).length) next[index] = item;
      else delete next[index];
      return next;
    });
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { fields, variants } = validateDraft(draft);
    setVariantErrors(variants);
    if (Object.keys(fields).length > 0 || Object.keys(variants).length > 0) {
      setErrors(fields);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      idempotencyKey.current ??= createIdempotencyKey('product-create');
      const result = await createProduct(
        {
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          description: draft.description.trim() ? draft.description : undefined,
          brandId: draft.brandId || undefined,
          categoryId: draft.categoryId || undefined,
          status: draft.status,
          variants: draft.variants.map((variant) => ({
            sku: variant.sku.trim(),
            ...(variant.barcode.trim() ? { barcode: variant.barcode.trim() } : {}),
            ...(variant.title.trim() ? { title: variant.title.trim() } : {}),
            costPrice: { amount: variant.costPrice.trim(), currency: 'IRR' },
            salePrice: { amount: variant.salePrice.trim(), currency: 'IRR' },
            ...(variant.weightGrams.trim() ? { weightGrams: Number.parseInt(variant.weightGrams.trim(), 10) } : {}),
            isActive: variant.isActive,
          })),
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = null;
      feedback.success(`کالای «${result.product.name}» با موفقیت ثبت شد.`);
      router.replace(`/catalog/products/${result.product.id}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
      } else if (error instanceof ApiNetworkError) {
        setFormError('امکان برقراری ارتباط با سامانه وجود ندارد.');
      } else {
        setFormError('ثبت کالا ناموفق بود؛ دوباره تلاش کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!canWrite) {
    return (
      <>
        <PageHeader title="کالای جدید" />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای ساخت کالا مجوز نوشتن کاتالوگ را ندارد."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="کالای جدید"
        eyebrow="کاتالوگ"
        description="ثبت کالا مطابق مدل دامنه - Product به‌عنوان مدل تجاری ثبت می‌شود. پس از ثبت، می‌توانید ویژگی‌ها و انواع را پیکربندی کنید."
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
                مشخصات پایه
              </Typography>
              <Stack spacing={2.5}>
                <FormField label="نام کالا" required htmlFor="product-name" error={Boolean(errors.name)} errorText={errors.name}>
                  <TextField
                    id="product-name"
                    size="small"
                    placeholder="مثلاً CLIP top BLUMOTION"
                    value={draft.name}
                    onChange={(event) => setField('name', event.target.value)}
                    autoFocus
                  />
                </FormField>
                <FormField
                  label="شناسهٔ یکتا (Slug)"
                  required
                  htmlFor="product-slug"
                  helperText="نمونه: clip-top-blumotion"
                  error={Boolean(errors.slug)}
                  errorText={errors.slug}
                >
                  <TextField
                    id="product-slug"
                    size="small"
                    dir="ltr"
                    value={draft.slug}
                    onChange={(event) => setField('slug', event.target.value.toLocaleLowerCase('en-US').replace(/\s+/g, '-'))}
                  />
                </FormField>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormField label="برند" htmlFor="product-brand" >
                    <Stack direction="row" spacing={1}>
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
                      <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => setBrandDialogOpen(true)}>
                        افزودن برند
                      </Button>
                    </Stack>
                  </FormField>
                  <FormField label="دسته‌بندی" htmlFor="product-category" >
                    <Stack direction="row" spacing={1}>
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
                      <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => setCategoryDialogOpen(true)}>
                        افزودن دسته‌بندی
                      </Button>
                    </Stack>
                  </FormField>
                </Stack>
                <FormField label="وضعیت آغازین" htmlFor="product-initial-status" helperText="کالا به‌صورت پیش‌نویس ذخیره می‌شود؛ انتشار فقط از مسیر بررسی و اقدام مجاز در جزئیات کالا انجام می‌شود.">
                  <TextField id="product-initial-status" size="small" value="پیش‌نویس" InputProps={{ readOnly: true }} />
                </FormField>
                <FormField label="توضیحات" htmlFor="product-description" helperText="اختیاری — حداکثر ۱۰۰۰۰ کاراکتر" error={Boolean(errors.description)} errorText={errors.description}>
                  <RichTextEditor
                    value={draft.description}
                    onChange={(html) => setField('description', html)}
                    placeholder="توضیحات محصول را وارد کنید..."
                    height={200}
                    ariaLabel="ویرایشگر توضیحات محصول"
                  />
                </FormField>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={800}>تنوع‌ها و قیمت‌ها (SKU)</Typography>
                <Button size="small" startIcon={<Plus size={16} />} onClick={() => {
                  idempotencyKey.current = null;
                  setDraft((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }));
                }}>افزودن تنوع</Button>
              </Box>
              {draft.variants.length === 0 ? <Alert severity="info">برای ثبت کالا حداقل یک تنوع لازم است.</Alert> : null}
              <Stack spacing={2}>
                {draft.variants.map((variant, index) => (
                  <Box key={index} component="section">
                    {index > 0 ? <Divider sx={{ my: 2 }} /> : null}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <IconButton size="small" aria-label={`حذف تنوع ${index + 1}`} disabled={draft.variants.length === 1} onClick={() => {
                        idempotencyKey.current = null;
                        setDraft((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));
                      }}><Trash2 size={17} /></IconButton>
                    </Box>
                    <Stack spacing={2}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <FormField label="کد SKU" required htmlFor={`variant-${index}-sku`} error={Boolean(variantErrors[index]?.sku)} errorText={variantErrors[index]?.sku}>
                          <TextField id={`variant-${index}-sku`} size="small" dir="ltr" value={variant.sku} onChange={(event) => setVariantField(index, 'sku', event.target.value)} />
                        </FormField>
                        <FormField label="بارکد" htmlFor={`variant-${index}-barcode`}>
                          <TextField id={`variant-${index}-barcode`} size="small" dir="ltr" value={variant.barcode} onChange={(event) => setVariantField(index, 'barcode', event.target.value)} />
                        </FormField>
                        <FormField label="عنوان تنوع" htmlFor={`variant-${index}-title`}>
                          <TextField id={`variant-${index}-title`} size="small" value={variant.title} onChange={(event) => setVariantField(index, 'title', event.target.value)} />
                        </FormField>
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <FormField label="قیمت خرید (ریال)" required htmlFor={`variant-${index}-cost`} error={Boolean(variantErrors[index]?.costPrice)} errorText={variantErrors[index]?.costPrice}>
                          <TextField id={`variant-${index}-cost`} size="small" dir="ltr" inputMode="numeric" value={variant.costPrice} onChange={(event) => setVariantField(index, 'costPrice', event.target.value.replace(/[^\d]/g, ''))} />
                        </FormField>
                        <FormField label="قیمت فروش (ریال)" required htmlFor={`variant-${index}-sale`} error={Boolean(variantErrors[index]?.salePrice)} errorText={variantErrors[index]?.salePrice}>
                          <TextField id={`variant-${index}-sale`} size="small" dir="ltr" inputMode="numeric" value={variant.salePrice} onChange={(event) => setVariantField(index, 'salePrice', event.target.value.replace(/[^\d]/g, ''))} />
                        </FormField>
                        <FormField label="وزن (گرم)" htmlFor={`variant-${index}-weight`} error={Boolean(variantErrors[index]?.weightGrams)} errorText={variantErrors[index]?.weightGrams}>
                          <TextField id={`variant-${index}-weight`} size="small" dir="ltr" inputMode="numeric" value={variant.weightGrams} onChange={(event) => setVariantField(index, 'weightGrams', event.target.value.replace(/[^\d]/g, ''))} />
                        </FormField>
                      </Stack>
                      <FormControlLabel control={<Checkbox checked={variant.isActive} onChange={(event) => setVariantField(index, 'isActive', event.target.checked)} inputProps={{ 'aria-label': `تنوع ${index + 1} فعال` }} />} label="فعال" />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
            <Button type="submit" variant="contained" size="large" disabled={submitting} startIcon={<ArrowRight size={18} />}>
              {submitting ? 'در حال ثبت…' : 'ثبت کالا'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <BrandDialog
        open={brandDialogOpen}
        onClose={() => setBrandDialogOpen(false)}
        onSaved={(entity) => {
          setBrandDialogOpen(false);
          listBrands()
            .then((items) => {
              setBrands(items);
              if (entity?.id) setDraft((d) => ({ ...d, brandId: entity.id }));
            })
            .catch(() => {});
        }}
      />
      <CategoryDialog
                  categories={categories}
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onSaved={(entity) => {
          setCategoryDialogOpen(false);
          listCategories()
            .then((items) => {
              setCategories(items);
              if (entity?.id) setDraft((d) => ({ ...d, categoryId: entity.id }));
            })
            .catch(() => {});
        }}
      />
    </>
  );
}
