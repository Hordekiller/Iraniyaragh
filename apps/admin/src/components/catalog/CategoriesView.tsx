'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, IconButton, Stack, Typography } from '@mui/material';
import { ArrowRight, Edit, Lock, Plus } from 'lucide-react';
import type { CategorySummary } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { listCategories } from '@/lib/catalog/catalog-api';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { categoryPaths } from '@/lib/catalog/category-hierarchy';
import { CategoryDialog } from './CategoryDialog';

export function CategoriesView() {
  const { user } = useAuth();
  const canRead = canReadCatalog(user);
  const canWrite = canWriteCatalog(user);

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialParentId, setInitialParentId] = useState<string | undefined>();
  const [editing, setEditing] = useState<CategorySummary | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listCategories(controller.signal)
      .then(setCategories)
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setError(err instanceof Error ? err.message : 'خطا در بارگیری دسته‌بندی‌ها.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canRead, reloadKey]);

  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const nameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  if (!canRead) {
    return (
      <>
        <PageHeader title="دسته‌بندی‌ها" />
        <EmptyState
          icon={<Lock size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="دسته‌بندی‌ها"
        eyebrow="کاتالوگ"
        description="ساختار دسته‌ها برای نمایش فروشگاهی و دسته‌بندی کالاها. هر دسته می‌تواند زیرمجموعه داشته باشد؛ مسیر کامل دسته و والد آن در این بخش قابل تنظیم است."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'کالا و SKU', href: '/catalog' }, { label: 'دسته‌بندی‌ها' }]}
        actions={
          <>
            <Button component={Link} href="/catalog/brands" variant="outlined" size="small">
              برندها
            </Button>
            {canWrite ? (
              <Button
                type="button"
                variant="contained"
                startIcon={<Plus size={18} />}
                onClick={() => {
                  setInitialParentId(undefined);
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                دسته‌بندی جدید
              </Button>
            ) : null}
          </>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن به کاتالوگ دارد؛ ساخت و ویرایش دسته‌بندی غیرفعال است.
        </Alert>
      ) : null}

      <DataTable<CategorySummary>
        caption="فهرست دسته‌بندی‌ها"
        columns={[
          {
            id: 'name',
            label: 'نام دسته',
            width: 260,
            render: (row) => <Stack><Typography fontWeight={700}>{row.name}</Typography>{row.parentId ? <Typography variant="caption" color="text.secondary">{paths.get(row.id) ?? row.name}</Typography> : null}</Stack>,
          },
          {
            id: 'slug',
            label: 'شناسه',
            render: (row) => (
              <Typography variant="body2" color="text.secondary" dir="ltr" textAlign="start">
                {row.slug}
              </Typography>
            ),
          },
          {
            id: 'parent',
            label: 'والد',
            render: (row) =>
              row.parentId && nameById.has(row.parentId) ? nameById.get(row.parentId) : '—',
          },
          {
            id: 'productCount',
            label: 'تعداد کالا',
            render: (row) => (
              <Chip
                size="small"
                variant="outlined"
                label={new Intl.NumberFormat('fa-IR').format(row.productCount)}
              />
            ),
          },
        ]}
        rows={categories}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        emptyTitle="دسته‌بندی‌ای ثبت نشده است"
        emptyDescription="اولین دسته را با دکمهٔ «دسته‌بندی جدید» بسازید."
        actions={
          canWrite
            ? (row) => (
                <Stack direction="row">
                <IconButton
                  size="small"
                  aria-label={`ویرایش ${row.name}`}
                  onClick={() => {
                    setEditing(row);
                    setDialogOpen(true);
                  }}
                >
                  <Edit size={17} />
                </IconButton>
                <IconButton size="small" aria-label={`افزودن زیرمجموعه ${row.name}`} onClick={() => { setEditing(null); setInitialParentId(row.id); setDialogOpen(true); }}><Plus size={17} /></IconButton>
                </Stack>
              )
            : undefined
        }
        actionsLabel="ویرایش و زیرمجموعه"
        toolbar={
          !loading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={`${new Intl.NumberFormat('fa-IR').format(categories.length)} دسته`}
              />
            </Stack>
          ) : null
        }
      />

      <CategoryDialog
        open={dialogOpen}
        categories={categories}
        category={editing}
        initialParentId={initialParentId}
        onClose={() => setDialogOpen(false)}
        onSaved={() => setReloadKey((current) => current + 1)}
      />

      <Box sx={{ mt: 3 }}>
        <Button component={Link} href="/catalog" startIcon={<ArrowRight size={18} />} size="small">
          بازگشت به فهرست کالاها
        </Button>
      </Box>
    </>
  );
}