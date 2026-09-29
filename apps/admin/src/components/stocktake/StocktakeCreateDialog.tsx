'use client';

import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItemButton, ListItemText, MenuItem, Stack, TextField } from '@mui/material';
import type { StocktakeScopeType } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createStocktake, listStocktakeLocations, listStocktakeVariants, newStocktakeCommandKey } from '@/lib/stocktake/stocktake-api';
import { stocktakeScopeLabels } from '@/lib/stocktake/stocktake-labels';

type Props = { onClose: () => void; onCreated: (id: string) => void };

export function StocktakeCreateDialog({ onClose, onCreated }: Props) {
  const [warehouseId, setWarehouseId] = useState('');
  const [scopeType, setScopeType] = useState<StocktakeScopeType>('WAREHOUSE');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<{ id: string; code: string; label: string }[]>([]);
  const [variants, setVariants] = useState<{ id: string; sku: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadLocations(warehouse: string) {
    setLocations([]); setLocationIds([]);
    if (!warehouse.trim()) return;
    try {
      const result = await listStocktakeLocations({ warehouseId: warehouse.trim(), limit: 50 });
      setLocations(result.items);
    } catch { setError('دریافت مکان‌های انبار ناموفق بود.'); }
  }

  async function loadVariants() {
    setVariants([]); setVariantIds([]);
    try {
      const result = await listStocktakeVariants({ limit: 50 });
      setVariants(result.items);
    } catch { setError('دریافت فهرست SKU ناموفق بود.'); }
  }

  const toggle = (list: string[], id: string, set: (next: string[]) => void) => {
    set(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const warehouse = warehouseId.trim();
    if (!warehouse) { setError('شناسه انبار را وارد کنید.'); return; }
    if (scopeType === 'LOCATIONS' && !locationIds.length) { setError('حداقل یک مکان را انتخاب کنید.'); return; }
    if (scopeType === 'VARIANTS' && !variantIds.length) { setError('حداقل یک SKU را انتخاب کنید.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createStocktake({
        warehouseId: warehouse, scopeType,
        ...(scopeType === 'LOCATIONS' ? { locationIds } : {}),
        ...(scopeType === 'VARIANTS' ? { variantIds } : {}),
        notes: notes.trim() || null,
      }, newStocktakeCommandKey());
      onCreated(created.id);
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : 'ثبت برگهٔ انبارگردانی ناموفق بود.');
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="stocktake-create-title">
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="stocktake-create-title">برگهٔ جدید انبارگردانی</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="شناسه انبار" required inputProps={{ dir: 'ltr' }} value={warehouseId} disabled={submitting}
              onChange={(event) => { setWarehouseId(event.target.value); if (scopeType === 'LOCATIONS') void loadLocations(event.target.value); }}
              onBlur={() => { if (scopeType === 'LOCATIONS' && !locations.length) void loadLocations(warehouseId); }} />
            <TextField select label="دامنهٔ شمارش" value={scopeType} disabled={submitting}
              onChange={(event) => {
                const next = event.target.value as StocktakeScopeType;
                setScopeType(next);
                if (next === 'LOCATIONS' && !locations.length) void loadLocations(warehouseId);
                if (next === 'VARIANTS' && !variants.length) void loadVariants();
              }}>
              {Object.entries(stocktakeScopeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            {scopeType === 'LOCATIONS' ? <List dense sx={{ maxHeight: 220, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {locations.length ? locations.map((option) => <ListItemButton key={option.id} onClick={() => toggle(locationIds, option.id, setLocationIds)}>
                <Checkbox size="small" edge="start" checked={locationIds.includes(option.id)} tabIndex={-1} disableRipple />
                <ListItemText primary={option.code} secondary={option.label} />
              </ListItemButton>) : <ListItemButton disabled><ListItemText primary="مکانی برای این انبار یافت نشد." /></ListItemButton>}
            </List> : null}
            {scopeType === 'VARIANTS' ? <List dense sx={{ maxHeight: 220, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {variants.length ? variants.map((option) => <ListItemButton key={option.id} onClick={() => toggle(variantIds, option.id, setVariantIds)}>
                <Checkbox size="small" edge="start" checked={variantIds.includes(option.id)} tabIndex={-1} disableRipple />
                <ListItemText primary={option.sku} secondary={option.label} />
              </ListItemButton>) : <ListItemButton disabled><ListItemText primary="SKU فعالی برای شمارش یافت نشد." /></ListItemButton>}
            </List> : null}
            <Alert severity="info">دامنه هنگام ساخت قفل می‌شود؛ برگهٔ شمارش از موجودی زندهٔ همان دامنه ساخته می‌شود و بعداً قابل تغییر نیست.</Alert>
            <TextField label="یادداشت" multiline minRows={2} inputProps={{ maxLength: 500 }} value={notes} disabled={submitting} onChange={(event) => setNotes(event.target.value)} />
            <FormControlLabel control={<Checkbox checked disabled />} label="شمارش به‌صورت کور ثبت می‌شود" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>انصراف</Button>
          <Button type="submit" variant="contained" disabled={submitting}>{submitting ? 'در حال ثبت…' : 'ثبت برگه'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
