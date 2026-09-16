'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { ArrowRight, Layers3, MoreVertical, Pencil, Plus, RefreshCw } from 'lucide-react';
import type { AttributeDefinitionSummary } from '@iranyaragh/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ApiAbortError } from '@/lib/api/client';
import {
  attributeStatusLabel,
  attributeStatusTone,
} from '@/lib/catalog/catalog-labels';
import { canReadCatalog, canWriteCatalog } from '@/lib/catalog/catalog-permissions';
import { listAttributes } from '@/lib/catalog/catalog-api';
import { AttributeDialog } from './AttributeDialog';
import { AttributeOptionsDialog } from './AttributeOptionsDialog';

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function AttributesView() {
  const { user } = useAuth();
  const canRead = canReadCatalog(user);
  const canWrite = canWriteCatalog(user);

  const [items, setItems] = useState<AttributeDefinitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; attribute: AttributeDefinitionSummary } | { mode: 'options'; attribute: AttributeDefinitionSummary } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listAttributes(controller.signal)
      .then((data) => setItems(data.items))
      .catch((fetchError: unknown) => {
        if (fetchError instanceof ApiAbortError) return;
        setError('بارگیری ویژگی‌ها ناموفق بود؛ دوباره تلاش کنید.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  if (!canRead) {
    return (
      <>
        <PageHeader title="ویژگی‌ها" eyebrow="کاتالوگ" description="مدیریت ویژگی‌ها و گزینه‌های آن‌ها." />
        <EmptyState
          icon={<Layers3 size={28} />}
          title="دسترسی ندارید"
          description="حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="ویژگی‌ها"
        eyebrow="کاتالوگ"
        description="ویژگی‌های کاتالوگ (مانند رنگ یا جنس) و گزینه‌های آن‌ها. گزینه‌ها پس از ساخت، در ساخت تنوع و واردات استفاده می‌شوند."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'ویژگی‌ها' }]}
        actions={
          <>
            <Button component={Link} href="/catalog" size="small" startIcon={<ArrowRight size={18} />}>
              بازگشت به کالا و SKU
            </Button>
            {canWrite ? (
              <Button
                variant="contained"
                size="small"
                startIcon={<Plus size={18} />}
                onClick={() => setDialog({ mode: 'create' })}
              >
                ویژگی جدید
              </Button>
            ) : null}
          </>
        }
      />

      {!canWrite ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          حساب شما فقط دسترسی خواندن دارد؛ ساخت و ویرایش ویژگی‌ها غیرفعال است.
        </Alert>
      ) : null}

      <DataTable<AttributeDefinitionSummary>
        caption="فهرست ویژگی‌های کاتالوگ"
        columns={[
          {
            id: 'code',
            label: 'کد',
            width: 160,
            render: (row) => (
              <Typography variant="body2" dir="ltr" textAlign="start" fontWeight={700}>
                {row.code}
              </Typography>
            ),
          },
          {
            id: 'name',
            label: 'نام',
            render: (row) => <Typography variant="body2">{row.name}</Typography>,
          },
          {
            id: 'status',
            label: 'وضعیت',
            render: (row) => (
              <StatusChip label={attributeStatusLabel(row.status)} tone={attributeStatusTone(row.status)} />
            ),
          },
          {
            id: 'optionCount',
            label: 'گزینه‌ها',
            align: 'center',
            render: (row) => (
              <Chip size="small" variant="outlined" color="info" label={String(row.optionCount)} />
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
        rows={items}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        emptyTitle="ویژگی‌ای ثبت نشده است"
        emptyDescription="اولین ویژگی را با دکمهٔ «ویژگی جدید» بسازید."
        emptyIcon={<Layers3 size={28} />}
        actions={
          canWrite
            ? (row) => (
                <AttributeRowActions
                  attribute={row}
                  onEdit={() => setDialog({ mode: 'edit', attribute: row })}
                  onOptions={() => setDialog({ mode: 'options', attribute: row })}
                />
              )
            : undefined
        }
        actionsLabel="عملیات"
        toolbar={
          <Button size="small" startIcon={<RefreshCw size={16} />} onClick={reload} disabled={loading}>
            به‌روزرسانی
          </Button>
        }
      />

      {dialog ? (
        dialog.mode === 'create' ? (
          <AttributeDialog mode="create" onSaved={reload} onClose={() => setDialog(null)} />
        ) : dialog.mode === 'edit' ? (
          <AttributeDialog mode="edit" attribute={dialog.attribute} onSaved={reload} onClose={() => setDialog(null)} />
        ) : (
          <AttributeOptionsDialog
            attributeId={dialog.attribute.id}
            attributeName={dialog.attribute.name}
            onChanged={reload}
            onClose={() => setDialog(null)}
          />
        )
      ) : null}
    </>
  );
}

function AttributeRowActions({
  attribute,
  onEdit,
  onOptions,
}: {
  attribute: AttributeDefinitionSummary;
  onEdit: () => void;
  onOptions: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`اقدامات ${attribute.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVertical size={18} />
      </IconButton>
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
        <MenuItem
          dense
          onClick={() => {
            setAnchor(null);
            onEdit();
          }}
        >
          <ListItemIcon>
            <Pencil size={18} />
          </ListItemIcon>
          <ListItemText>ویرایش</ListItemText>
        </MenuItem>
        <MenuItem
          dense
          onClick={() => {
            setAnchor(null);
            onOptions();
          }}
        >
          <ListItemIcon>
            <Layers3 size={18} />
          </ListItemIcon>
          <ListItemText>گزینه‌ها</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}