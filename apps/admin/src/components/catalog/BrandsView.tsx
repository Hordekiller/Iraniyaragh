'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, IconButton, Stack, Typography } from '@mui/material';
import { ArrowRight, Edit, Lock, Plus } from 'lucide-react';
import type { BrandSummary } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import { listBrands } from '@/lib/catalog/catalog-api';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { BrandDialog } from './BrandDialog';

export function BrandsView() {
  const { user } = useAuth();
  const canRead = canReadCatalog(user);
  const canWrite = canWriteCatalog(user);

  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BrandSummary | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listBrands(controller.signal)
      .then(setBrands)
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setError(err instanceof Error ? err.message : 'خطا در بارگیری برندها.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canRead, reloadKey]);

  const total = useMemo(() => brands.length, [brands]);

  if (!canRead) {
    return (
      <>
        <PageHeader title="برندها" />
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
        title="برندها"
        eyebrow="کاتالوگ"
        description="فهرست برندهای فعال در کاتالوگ به‌همراه تعداد کالاهای مرتبط."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'کالا و SKU', href: '/catalog' }, { label: 'برندها' }]}
        actions={
          <>
            <Button component={Link} href="/catalog/categories" variant="outlined" size="small">
              دسته‌بندی‌ها
            </Button>
            {canWrite ? (
              <Button
                type="button"
                variant="contained"
                startIcon={<Plus size={18} />}
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                برند جدید
              </Button>
            ) : null}
          </>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن به کاتالوگ دارد؛ ساخت و ویرایش برند غیرفعال است.
        </Alert>
      ) : null}

      <DataTable<BrandSummary>
        caption="فهرست برندها"
        columns={[
          {
            id: 'name',
            label: 'نام برند',
            width: 260,
            render: (row) => <Typography fontWeight={700}>{row.name}</Typography>,
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
        rows={brands}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        emptyTitle="برندی ثبت نشده است"
        emptyDescription="اولین برند را با دکمهٔ «برند جدید» بسازید."
        actions={
          canWrite
            ? (row) => (
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
              )
            : undefined
        }
        actionsLabel="ویرایش"
        toolbar={
          !loading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={`${new Intl.NumberFormat('fa-IR').format(total)} برند`}
              />
            </Stack>
          ) : null
        }
      />

      <BrandDialog
        open={dialogOpen}
        brand={editing}
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