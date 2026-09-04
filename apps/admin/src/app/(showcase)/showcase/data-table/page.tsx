'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Stack,
  Alert,
  type AlertProps,
} from '@mui/material';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {
  SelectableCardGroup,
  SelectableCardInput,
  type SelectableCardValue,
} from '@/components/ui/SelectableCardInput';
import { Package, Truck, Users, Trash2, Warehouse } from 'lucide-react';

type ProductRow = {
  id: number;
  name: string;
  sku: string;
  stock: number;
  category: string;
  status: 'فعال' | 'غیرفعال';
};

const initialProducts: ProductRow[] = [
  { id: 1, name: 'قفل دستگیره‌ای', sku: 'LOCK-001', stock: 120, category: 'قفل', status: 'فعال' },
  { id: 2, name: 'لولا درب', sku: 'HINGE-001', stock: 340, category: 'لولا', status: 'فعال' },
  { id: 3, name: 'دستگیره‌ی درب', sku: 'HANDLE-001', stock: 0, category: 'دستگیره', status: 'غیرفعال' },
  { id: 4, name: 'پروفیل آلمینیوم', sku: 'PROF-001', stock: 24, category: 'پروفیل', status: 'فعال' },
  { id: 5, name: 'شیشه سکوریت', sku: 'GLASS-001', stock: 12, category: 'شیشه', status: 'فعال' },
  { id: 6, name: 'جک پارکینگی', sku: 'JACK-001', stock: 5, category: 'جک', status: 'غیرفعال' },
];

const columns: DataTableColumn<ProductRow>[] = [
  {
    id: 'name',
    label: 'نام محصول',
    width: 200,
    sortable: true,
    render: (r) => r.name,
    sortFn: (a, b) => a.name.localeCompare(b.name, 'fa'),
  },
  {
    id: 'sku',
    label: 'کد کالا',
    width: 140,
    render: (r) => r.sku,
    searchValue: (r) => r.sku,
  },
  {
    id: 'category',
    label: 'دسته',
    width: 140,
    sortable: true,
    render: (r) => r.category,
    sortFn: (a, b) => a.category.localeCompare(b.category, 'fa'),
  },
  {
    id: 'stock',
    label: 'موجودی',
    align: 'left',
    sortable: true,
    render: (r) => r.stock,
    sortFn: (a, b) => a.stock - b.stock,
  },
  {
    id: 'status',
    label: 'وضعیت',
    width: 140,
    render: (row) => (
      <Alert
        severity={row.status === 'فعال' ? 'success' : 'error'}
        icon={false}
        sx={{ py: 0, px: 1, display: 'inline-flex' }}
      >
        {row.status}
      </Alert>
    ),
  },
];

const departmentOptions = [
  { value: 'warehouse', title: 'انبار', subtitle: 'مدیریت موجودی و کالا', icon: <Warehouse size={20} /> },
  { value: 'sales', title: 'فروش', subtitle: 'سفارش‌ها و مشتریان', icon: <Users size={20} /> },
  { value: 'inbound', title: 'ورود کالا', subtitle: 'دریافت از تأمین‌کننده', icon: <Package size={20} /> },
  { value: 'delivery', title: 'تحویل', subtitle: 'ارسال و حمل‌ونقل', icon: <Truck size={20} /> },
];

export default function DataTableShowcasePage() {
  const [rows, setRows] = useState<ProductRow[]>(initialProducts);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [department, setDepartment] = useState<SelectableCardValue | null>(null);
  const [result, setResult] = useState<AlertProps['severity'] | null>(null);

  const handleConfirm = () => {
    setResult('success');
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          جدول داده
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          جستجو، مرتب‌سازی، انتخاب ردیف و صفحه‌بندی سمت کلاینت (ADR-0008).
        </Typography>
      </Box>

      {result && (
        <Alert severity={result} onClose={() => setResult(null)}>
          {result === 'success' ? 'عملیات با موفقیت انجام شد.' : 'از عملیات منصرف شدید.'}
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="فهرست محصولات"
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        enableClientView
        searchKeys={['name', 'sku']}
        emptyTitle="محصولی یافت نشد"
        emptyDescription="متن جستجو را تغییر دهید یا محصول جدیدی اضافه کنید."
        loading={loading}
        bulkActions={
          <Button
            startIcon={<Trash2 />}
            color="error"
            disabled={selected.size === 0}
            onClick={() => setOpen(true)}
          >
            حذف انتخاب‌شده ({selected.size})
          </Button>
        }
      />

      <Button variant="outlined" onClick={() => setLoading((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
        تغییر وضعیت بارگذاری
      </Button>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          گروه کارت‌های انتخابی
        </Typography>
        <SelectableCardGroup
          label="بخش کاری مورد نظر"
          value={department}
          onValueChange={setDepartment}
        >
          {departmentOptions.map((opt) => (
            <SelectableCardInput
              key={opt.value}
              value={opt.value}
              icon={opt.icon}
              title={opt.title}
              subtitle={opt.subtitle}
            />
          ))}
        </SelectableCardGroup>
      </Box>

      <ConfirmationDialog
        open={open}
        setOpen={setOpen}
        type="delete"
        title="حذف محصولات"
        description={`آیا از حذف ${selected.size} محصول انتخاب‌شده مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmLabel="حذف"
        onConfirm={handleConfirm}
        requireReason
        reasonLabel="دلیل حذف"
        reasonPlaceholder="دلیل حذف را وارد کنید"
      />
    </Stack>
  );
}
