'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { ArrowRight, Boxes, Layers, Settings2 } from 'lucide-react';
import type {
  AttributeDefinitionSummary,
  ProductDetail,
  ProductVariant,
} from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import {
  formatRial,
  catalogStatusLabel,
  catalogStatusTone,
  variantStatusLabel,
  variantStatusTone,
} from '@/lib/catalog/catalog-labels';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { getProduct, listAttributes } from '@/lib/catalog/catalog-api';
import { AttributeConfigEditor } from './AttributeConfigEditor';
import { ProductDescriptionEditor, ProductDescriptionPreview } from './ProductDescriptionEditor';
import { ProductStatusActions } from './ProductStatusActions';
import { VariantGenerateDialog } from './VariantGenerateDialog';
import { VariantRowActions } from './VariantRowActions';

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function ProductDetailView({ productId }: { productId: string }) {
  const { user } = useAuth();
  const canRead = canReadCatalog(user);
  const canWrite = canWriteCatalog(user);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<AttributeDefinitionSummary[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getProduct(productId, controller.signal), listAttributes(controller.signal)])
      .then(([detail, attributeItems]) => {
        setProduct(detail.product);
        setAttributes(attributeItems.items);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof ApiAbortError) return;
        setError(fetchError instanceof Error ? fetchError.message : 'بارگیری کالا ناموفق بود.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, reloadKey]);

  const reload = () => setReloadKey((current) => current + 1);

  const attributesById = useMemo(
    () => Object.fromEntries(attributes.map((attribute) => [attribute.code, attribute])),
    [attributes],
  );

  if (!canRead) {
    return (
      <EmptyState
        icon={<Settings2 size={28} />}
        title="دسترسی ندارید"
        description="حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد."
      />
    );
  }

  return (
    <>
      <PageHeader
        loading={loading}
        title={product?.name ?? 'کالا'}
        eyebrow="کاتالوگ"
        description="جزئیات کالا: ویژگی‌ها، تنوع‌ها، قیمت‌ها و توضیحات غنی. نام، برند و دسته‌بندی در این نسخه از طریق «واردات» یا بازآفرینی کاتالوگ ویرایش می‌شود."
        breadcrumbs={[
          { label: 'کالا و انبار' },
          { label: 'کالا و SKU', href: '/catalog' },
          { label: product?.name ?? 'کالا' },
        ]}
        actions={
          loading || !product ? undefined : (
            <>
              <Button component={Link} href="/catalog" size="small" startIcon={<ArrowRight size={18} />}>
                بازگشت به فهرست
              </Button>
              {canWrite ? <ProductStatusActions product={product} onChanged={reload} /> : null}
            </>
          )
        }
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      ) : product ? (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
                مشخصات
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    وضعیت
                  </Typography>
                  <Box>
                    <StatusChip label={catalogStatusLabel(product.status)} tone={catalogStatusTone(product.status)} />
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    برند
                  </Typography>
                  <Typography variant="body2">{product.brand?.name ?? '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    دسته‌بندی
                  </Typography>
                  <Typography variant="body2">{product.category?.name ?? '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    نسخه
                  </Typography>
                  <Typography variant="body2" dir="ltr" textAlign="start">
                    {product.version ?? '—'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="text.secondary">
                    شناسهٔ یکتا
                  </Typography>
                  <Typography variant="body2" dir="ltr" textAlign="start">
                    {product.slug}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                  توضیحات
                </Typography>
                {canWrite ? (
                  <Chip size="small" label="ویرایشگر غنی" variant="outlined" color="info" />
                ) : null}
              </Box>
              {canWrite ? (
                <ProductDescriptionEditor
                  productId={productId}
                  description={product.description}
                  version={product.version ?? 0}
                  canWrite={canWrite}
                  onServerProduct={setProduct}
                />
              ) : (
                <Stack spacing={2}>
                  <Alert severity="info">
                    حساب شما فقط دسترسی خواندن دارد؛ توضیحات به‌صورت پیش‌نمایش نمایش داده می‌شود.
                  </Alert>
                  <ProductDescriptionPreview description={product.description} />
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                  ویژگی‌های کالا
                </Typography>
                <Chip size="small" label={`${(product.attributes ?? []).length} ویژگی`} variant="outlined" color="info" />
              </Box>
              <AttributeConfigEditor
                product={product}
                allAttributes={attributes}
                canWrite={canWrite}
                onChanged={reload}
              />
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                  تنوع‌ها (SKU)
                </Typography>
                {canWrite ? (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Layers size={16} />}
                    onClick={() => setGenerateOpen(true)}
                  >
                    تولید تنوع از محورها
                  </Button>
                ) : null}
              </Box>
              {!canWrite ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  حساب شما فقط دسترسی خواندن دارد؛ ویرایش تنوع‌ها و ویژگی‌ها غیرفعال است.
                </Alert>
              ) : null}
              <DataTable<ProductVariant>
                caption="تنوع‌های کالا"
                columns={[
                  {
                    id: 'sku',
                    label: 'SKU',
                    width: 200,
                    render: (row) => (
                      <Box>
                        <Typography variant="body2" fontWeight={700} dir="ltr" textAlign="start">
                          {row.sku}
                        </Typography>
                        {row.title ? (
                          <Typography variant="caption" color="text.secondary">
                            {row.title}
                          </Typography>
                        ) : null}
                      </Box>
                    ),
                  },
                  {
                    id: 'attributes',
                    label: 'نسبت‌ها',
                    render: (row) => (
                      <Typography variant="body2" color="text.secondary">
                        {(row.attributeValues ?? []).map((value) => `${value.attributeName}: ${value.optionLabel}`).join(' / ') || '—'}
                      </Typography>
                    ),
                  },
                  {
                    id: 'status',
                    label: 'وضعیت',
                    render: (row) => (
                      <StatusChip
                        label={variantStatusLabel(row.status ?? (row.isActive ? 'ACTIVE' : 'INACTIVE'))}
                        tone={variantStatusTone(row.status ?? (row.isActive ? 'ACTIVE' : 'INACTIVE'))}
                      />
                    ),
                  },
                  {
                    id: 'salePrice',
                    label: 'قیمت فروش',
                    render: (row) => <Typography variant="body2">{formatRial(row.salePrice)}</Typography>,
                  },
                  {
                    id: 'costPrice',
                    label: 'قیمت خرید',
                    render: (row) => (
                      <Typography variant="body2" color="text.secondary">
                        {formatRial(row.costPrice)}
                      </Typography>
                    ),
                  },
                  {
                    id: 'updatedAt',
                    label: 'آخرین به‌روزرسانی',
                    render: (row) => (
                      <Typography variant="body2" color="text.secondary">
                        {faDateTime.format(new Date(row.updatedAt))}
                      </Typography>
                    ),
                  },
                ]}
                rows={product.variants}
                rowKey={(row) => row.id}
                loading={loading}
                emptyTitle="تنوعی برای این کالا ثبت نشده است"
                emptyDescription="تنوع‌ها را به‌صورت دستی ایجاد کنید یا با دکمهٔ «تولید تنوع از محورها» بسازید."
                emptyIcon={<Boxes size={28} />}
                rowCount={product.variants.length}
                page={0}
                pageSize={Math.max(product.variants.length, 1)}
                onPageChange={() => undefined}
                actions={canWrite ? (row) => <VariantRowActions variant={row} onChanged={reload} /> : undefined}
                actionsLabel="عملیات"
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                تغییرات قیمت و وضعیت تنوع‌ها در گزارش ممیزی ثبت می‌شود؛ ویرایش قیمت یک رکورد مجزا در
                تاریخچهٔ قیمت نگه می‌دارد.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      ) : null}

      {generateOpen && product ? (
        <VariantGenerateDialog
          product={product}
          attributesById={attributesById}
          onGenerated={reload}
          onClose={() => setGenerateOpen(false)}
        />
      ) : null}
    </>
  );
}