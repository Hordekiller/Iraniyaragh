'use client';
import { FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { StorefrontAssetPicker } from '@/components/settings/StorefrontAssetPicker';
export type ImageFields = { imageAssetId: string | null; imageAlt: string; shopOrder: number; shopFeatured: boolean };
export const emptyImage: ImageFields = { imageAssetId: null, imageAlt: '', shopOrder: 0, shopFeatured: false };
export function CatalogImageFields({ value, onChange, disabled }: { value: ImageFields; onChange: (value: ImageFields) => void; disabled: boolean }) {
  return <Stack gap={2}>
    <TextField label="متن جایگزین تصویر" value={value.imageAlt} disabled={disabled} onChange={event => onChange({ ...value, imageAlt: event.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
    <StorefrontAssetPicker label="تصویر فروشگاه / لوگو" alt={value.imageAlt} value={value.imageAssetId} disabled={disabled} onChange={imageAssetId => onChange({ ...value, imageAssetId })} />
    <TextField label="ترتیب در فروشگاه" type="number" value={value.shopOrder} disabled={disabled} onChange={event => onChange({ ...value, shopOrder: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0 } }} />
    <FormControlLabel label="نمایش در دسته‌ها / برندهای منتخب فروشگاه" control={<Switch checked={value.shopFeatured} disabled={disabled} onChange={(_, shopFeatured) => onChange({ ...value, shopFeatured })} />} />
  </Stack>;
}
