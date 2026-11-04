'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { AdminProductMediaPickerItem } from '@iranyaragh/contracts';
import { listProducts } from '@/lib/catalog/catalog-api';
import { listProductMediaPicker } from '@/lib/catalog/media-api';
import { doorAdminError } from '@/lib/custom-doors/api';

type Props = { value: string | null; onChange: (id: string | null) => void; label: string; square?: boolean; imageUrl?: string | null; initialValue?: string | null; originalWidth?: number | null; originalHeight?: number | null };

export function DoorImagePicker({ value, onChange, label, square = false, imageUrl, initialValue, originalWidth, originalHeight }: Readonly<Props>) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [productId, setProductId] = useState('');
  const [media, setMedia] = useState<AdminProductMediaPickerItem[]>([]);
  const [error, setError] = useState('');
  const selected = media.find(item => item.id === value);
  const current = value !== null;
  const isInitial = current && value === initialValue;
  const width = selected?.originalWidth ?? (isInitial ? originalWidth : null);
  const height = selected?.originalHeight ?? (isInitial ? originalHeight : null);
  const url = selected?.url ?? (isInitial ? imageUrl : null);
  async function searchProducts() {
    try { setProducts((await listProducts({ search, perPage: 20 })).items); setError(''); }
    catch (reason) { setError(doorAdminError(reason)); }
  }
  async function chooseProduct(id: string) {
    setProductId(id); setMedia([]);
    if (!id) return;
    try { setMedia(await listProductMediaPicker(id)); setError(''); }
    catch (reason) { setError(doorAdminError(reason)); }
  }
  return <Stack spacing={2}>
    <Typography variant="h6">{label}</Typography>
    <Alert severity="info">{square ? 'نسبت نمایش ۱:۱ (مربعی)؛ اندازه پیشنهادی ۴۸۰ × ۴۸۰ پیکسل یا بزرگ‌تر با همین نسبت.' : 'نسبت نمایش مدل درب ۴:۳؛ اندازه پیشنهادی ۱۲۰۰ × ۹۰۰ پیکسل یا بزرگ‌تر با همین نسبت.'} تصویر باید از کتابخانه رسانه انتخاب و پردازش آن تکمیل شده باشد.</Alert>
    <TextField label="جستجوی کالای دارای تصویر" value={search} onChange={event => setSearch(event.target.value)} />
    <Button onClick={() => void searchProducts()}>جستجو در رسانه‌های موجود</Button>
    <TextField select label="کالای مرجع تصویر" value={productId} onChange={event => void chooseProduct(event.target.value)}>
      <MenuItem value="">انتخاب کنید</MenuItem>
      {products.map(product => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
    </TextField>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select label={label} value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
      <MenuItem value="">بدون تصویر ثبت‌شده</MenuItem>
      {value && !selected && <MenuItem value={value}>تصویر فعلی</MenuItem>}
      {media.map(item => <MenuItem key={item.id} value={item.id}>{item.alt || item.id} — فایل اصلی: {item.originalWidth && item.originalHeight ? `${item.originalWidth} × ${item.originalHeight}` : 'نامشخص'} پیکسل</MenuItem>)}
    </TextField>
    {current && <Typography variant="body2">ابعاد فایل اصلی انتخاب‌شده: {width && height ? `${width} × ${height} پیکسل` : 'برای این فایل ثبت نشده است'}</Typography>}
    {selected && <Typography variant="caption">ابعاد پیش‌نمایش پردازش‌شده: {selected.width} × {selected.height} پیکسل</Typography>}
    {url && <Box component="img" src={url} alt={`پیش‌نمایش ${label}`} width={240} height={square ? 240 : 180} sx={{ objectFit: 'cover', maxWidth: '100%', borderRadius: 2, bgcolor: 'grey.50' }} />}
    {productId && <Button component={Link} href={`/catalog/${productId}`}>بارگذاری یا مدیریت تصویر در رسانه‌های کالا</Button>}
  </Stack>;
}
