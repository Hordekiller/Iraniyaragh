'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Chip, MenuItem, Select, Stack, Typography } from '@mui/material';
import { Lock, PackagePlus } from 'lucide-react';
import type { BrandSummary, CategorySummary, ProductListItem } from '@iranyaragh/contracts';
import { DataTable, type SortChange, type SortState } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import {
  catalogStatusLabel,
  catalogStatusTone,
  CATALOG_STATUS_META,
} from '@/lib/catalog/catalog-labels';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { listBrands, listCategories } from '@/lib/catalog/catalog-api';
import { ProductStatusActions } from './ProductStatusActions';
import { useCatalogProducts, type CatalogProductsQuery } from './useCatalogProducts';

export type CatalogUrlQuery = {
  page?: string;
  perPage?: string;
  search?: string;
  status?: string;
  brandId?: string;
  categoryId?: string;
  sortBy?: string;
  sortDir?: string;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function normalizeQuery(raw: CatalogUrlQuery): CatalogProductsQuery {
  const perPageRaw = Number.parseInt(raw.perPage ?? '', 10);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw) ? perPageRaw : 25;
  const pageRaw = Number.parseInt(raw.page ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const status: CatalogProductsQuery['status'] =
    raw.status === 'DRAFT' || raw.status === 'PUBLISHED' || raw.status === 'ARCHIVED'
      ? raw.status
      : undefined;
  const sortBy = raw.sortBy === 'name' || raw.sortBy === 'updatedAt' ? raw.sortBy : 'createdAt';
  const sortDir = raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'desc';
  return {
    page,
    perPage,
    search: raw.search?.trim() ? raw.search?.trim() : undefined,
    status,
    brandId: raw.brandId || undefined,
    categoryId: raw.categoryId || undefined,
    sortBy,
    sortDir,
  };
}

function toUrl(query: CatalogProductsQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.perPage !== 25) params.set('perPage', String(query.perPage));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.brandId) params.set('brandId', query.brandId);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.sortBy !== 'createdAt') params.set('sortBy', query.sortBy);
  if (query.sortDir !== 'desc') params.set('sortDir', query.sortDir);
  const serialized = params.toString();
  return serialized ? `/catalog?${serialized}` : '/catalog';
}

export function ProductsView({ initialQuery: raw }: { initialQuery: CatalogUrlQuery }) {
  const router = useRouter();
  const { user } = useAuth();
  const canRead = canReadCatalog(user);
  const canWrite = canWriteCatalog(user);

  const [query, setQuery] = useState<CatalogProductsQuery>(() => normalizeQuery(raw));
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listBrands(controller.signal), listCategories(controller.signal)])
      .then(([brandItems, categoryItems]) => {
        setBrands(brandItems);
        setCategories(categoryItems);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setReferenceError('بارگیری برندها و دسته‌بندی‌ها ناموفق بود؛ فیلترها ممکن است ناقص باشند.');
      });
    return () => controller.abort();
  }, []);

  const { items, meta, loading, error, refresh } = useCatalogProducts(query);

  const brandById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.name])),
    [brands],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const apply = (patch: Partial<CatalogProductsQuery>) => {
    const next = { ...query, ...patch, page: patch.page ?? 1 };
    setQuery(next);
    router.replace(toUrl(next), { scroll: false });
  };

  const sortState: SortState = { columnId: query.sortBy, direction: query.sortDir };

  if (!canRead) {
    return (
      <>
        <PageHeader title="کالا و SKU" description="مدیریت کاتالوگ کالاها و شناسه‌های فروش." />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد. برای دسترسی با مدیر سیستم هماهنگ کنید."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="کالا و SKU"
        eyebrow="کاتالوگ"
        description="فهرست عملیاتی کالاها با جستجو، فیلتر و صفحه‌بندی سمت سرور. وضعیت با دستورهای منتشر/پیش‌نویس/بایگانی تغییر می‌کند."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'کالا و SKU' }]}
        actions={
          <>
            <Button
              component={Link}
              href="/catalog/brands"
              variant="outlined"
              size="small"
            >
              برندها
            </Button>
            <Button
              component={Link}
              href="/catalog/categories"
              variant="outlined"
              size="small"
            >
              دسته‌بندی‌ها
            </Button>
            {canWrite ? (
              <Button
                component={Link}
                href="/catalog/products/new"
                variant="contained"
                startIcon={<PackagePlus size={18} />}
              >
                کالای جدید
              </Button>
            ) : null}
          </>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن به کاتالوگ دارد؛ ساخت و تغییر وضعیت غیرفعال است.
        </Alert>
      ) : null}

      <DataTable<ProductListItem>
        caption="فهرست کالاهای کاتالوگ"
        columns={[
          {
            id: 'name',
            label: 'کالا',
            sortable: true,
            width: 280,
            render: (row) => (
              <Box>
                <Typography fontWeight={700} variant="body2">
                  {row.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" dir="ltr" textAlign="start">
                  {row.slug}
                </Typography>
              </Box>
            ),
          },
          {
            id: 'status',
            label: 'وضعیت',
            render: (row) => (
              <StatusChip label={catalogStatusLabel(row.status)} tone={catalogStatusTone(row.status)} />
            ),
          },
          {
            id: 'brand',
            label: 'برند',
            render: (row) => (row.brandId && brandById.has(row.brandId) ? brandById.get(row.brandId) : '—'),
          },
          {
            id: 'category',
            label: 'دسته‌بندی',
            render: (row) =>
              row.categoryId && categoryById.has(row.categoryId) ? categoryById.get(row.categoryId) : '—',
          },
          {
            id: 'updatedAt',
            label: 'آخرین به‌روزرسانی',
            sortable: true,
            render: (row) => (
              <Typography variant="body2" color="text.secondary">
                {faDateTime.format(new Date(row.updatedAt))}
              </Typography>
            ),
          },
        ]}
        rows={items}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? referenceError ?? undefined}
        emptyTitle="کالایی یافت نشد"
        emptyDescription={
          query.search || query.status || query.brandId
            ? 'با فیلترهای فعلی کالایی وجود ندارد؛ فیلترها را تغییر دهید یا از «کالای جدید» شروع کنید.'
            : 'هنوز کالایی ثبت نشده است. اولین کالا را با دکمهٔ «کالای جدید» بسازید.'
        }
        search={query.search ?? ''}
        onSearchChange={(search) => apply({ search })}
        searchPlaceholder="جستجوی نام یا شناسه…"
        sort={sortState}
        onSortChange={(next: SortChange) =>
          apply({
            sortBy: next.columnId === 'name' || next.columnId === 'updatedAt' ? next.columnId : 'createdAt',
            sortDir: next.direction,
          })
        }
        rowCount={meta?.total ?? 0}
        page={query.page - 1}
        pageSize={query.perPage}
        onPageChange={(page, perPage) => apply({ page: page + 1, perPage })}
        actions={
          canWrite
            ? (row) => <ProductStatusActions product={row} onChanged={refresh} />
            : undefined
        }
        actionsLabel="وضعیت"
        toolbar={
          <>
            <Select
              size="small"
              value={query.status ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر وضعیت' }}
              sx={{ minWidth: 150 }}
              onChange={(event) =>
                apply({ status: (event.target.value || undefined) as CatalogProductsQuery['status'] })
              }
            >
              <MenuItem value="">همهٔ وضعیت‌ها</MenuItem>
              {(Object.keys(CATALOG_STATUS_META) as (keyof typeof CATALOG_STATUS_META)[]).map((status) => (
                <MenuItem key={status} value={status}>
                  {CATALOG_STATUS_META[status].label}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={query.brandId ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر برند' }}
              sx={{ minWidth: 150 }}
              onChange={(event) => apply({ brandId: (event.target.value as string) || undefined })}
            >
              <MenuItem value="">همهٔ برندها</MenuItem>
              {brands.map((brand) => (
                <MenuItem key={brand.id} value={brand.id}>
                  {brand.name}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={query.categoryId ?? ''}
              displayEmpty
              inputProps={{ 'aria-label': 'فیلتر دسته‌بندی' }}
              sx={{ minWidth: 160 }}
              onChange={(event) => apply({ categoryId: (event.target.value as string) || undefined })}
            >
              <MenuItem value="">همهٔ دسته‌بندی‌ها</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
            {loading ? (
              <Typography variant="caption" color="text.secondary">
                در حال بارگیری…
              </Typography>
            ) : meta ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={`${new Intl.NumberFormat('fa-IR').format(meta.total)} کالا`}
                />
              </Stack>
            ) : null}
          </>
        }
      />
    </>
  );
}