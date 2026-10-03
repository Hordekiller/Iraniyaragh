'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowRight, Lock, Plus } from 'lucide-react';
import type { BrandSummary, CategorySummary } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  createIdempotencyKey,
  createProduct,
  listBrands,
  listCategories,
} from '@/lib/catalog/catalog-api';
import { SLUG_PATTERN } from '@/lib/catalog/catalog-labels';
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
};

type FieldErrors = Partial<Record<'name' | 'slug' | 'description' | 'brandId' | 'categoryId', string>>;

function validateDraft(draft: ProductDraft): { fields: FieldErrors } {
  const fields: FieldErrors = {};
  if (!draft.name.trim()) fields.name = 'نام کالا الزامی است.';
  else if (draft.name.trim().length > 250) fields.name = 'نام کالا حداکثر ۲۵۰ کاراکتر.';
  if (!draft.slug.trim()) fields.slug = 'شناسه (Slug) الزامی است.';
  else if (!SLUG_PATTERN.test(draft.slug)) fields.slug = 'شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.';
  if (draft.description.trim().length > 10000) fields.description = 'توضیحات حداکثر ۱۰۰۰۰ کاراکتر.';
  return { fields };
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
  });
  const [errors, setErrors] = useState<FieldErrors>({});
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { fields } = validateDraft(draft);
    if (Object.keys(fields).length > 0) {
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
          variants: [],
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
