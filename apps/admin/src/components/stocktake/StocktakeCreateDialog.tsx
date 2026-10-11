'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import type { StocktakeLocationOption, StocktakeScopeType } from '@iranyaragh/contracts';
import { createStocktake, listStocktakes } from '@/lib/stocktake/stocktake-api';
import { stocktakeScopeLabels } from '@/lib/stocktake/stocktake-labels';
import { useStocktakeCommand } from '@/lib/stocktake/useStocktakeCommand';
import { StocktakeOptionPicker } from './StocktakeOptionPicker';

type Props = { onClose: () => void; onCreated: (id: string) => void };

export function StocktakeCreateDialog({ onClose, onCreated }: Props) {
  const [warehouse, setWarehouse] = useState<StocktakeLocationOption[]>([]);
  const [scopeType, setScopeType] = useState<StocktakeScopeType>('WAREHOUSE');
  const [locations, setLocations] = useState<StocktakeLocationOption[]>([]);
  const [variants, setVariants] = useState<StocktakeLocationOption[]>([]);
  const [notes, setNotes] = useState('');
  const command = useStocktakeCommand(detail => onCreated(detail.id));
  const locked = command.busy || command.uncertain;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (!warehouse[0] || (scopeType === 'LOCATIONS' && !locations.length) || (scopeType === 'VARIANTS' && !variants.length)) {
      command.setError('انبار و دامنهٔ شمارش را انتخاب کنید.'); return;
    }
    const input = { warehouseId: warehouse[0].id, scopeType,
      ...(scopeType === 'LOCATIONS' ? { locationIds: locations.map(option => option.id) } : {}),
      ...(scopeType === 'VARIANTS' ? { variantIds: variants.map(option => option.id) } : {}), notes: notes.trim() || null };
    command.run(key => () => createStocktake(input, key));
  }

  return <Dialog open onClose={locked ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="stocktake-create-title">
    <form onSubmit={submit} noValidate>
      <DialogTitle id="stocktake-create-title">برگهٔ جدید انبارگردانی</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
        {command.error ? <Alert severity="error">{command.error}</Alert> : null}
        {command.uncertain ? <Button disabled={command.busy} onClick={() => void command.reconcileAndRetry(
          () => listStocktakes({ warehouseId: warehouse[0]?.id, limit: 20 }))}>بازخوانی و تکرار همان دستور</Button> : null}
        <StocktakeOptionPicker kind="warehouse" label="انبار" single value={warehouse} disabled={locked}
          onChange={next => { setWarehouse(next); setLocations([]); }} />
        <TextField select label="دامنهٔ شمارش" value={scopeType} disabled={locked}
          onChange={event => setScopeType(event.target.value as StocktakeScopeType)}>
          {Object.entries(stocktakeScopeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        {scopeType === 'LOCATIONS' ? <StocktakeOptionPicker key={warehouse[0]?.id ?? 'none'} kind="location" label="مکان‌های شمارش"
          warehouseId={warehouse[0]?.id} value={locations} onChange={setLocations} disabled={locked || !warehouse[0]} /> : null}
        {scopeType === 'VARIANTS' ? <StocktakeOptionPicker kind="variant" label="SKUهای شمارش" value={variants} onChange={setVariants} disabled={locked} /> : null}
        <Alert severity="info">دامنهٔ برگه پس از ایجاد ثابت است. هنگام آغاز، موجودی همان دامنه به برگهٔ شمارش تبدیل می‌شود. هر برگه حداکثر ۵۰۰ خط دارد؛ برای انبار بزرگ دامنه را تقسیم کنید. مقدار انتظاری فقط برای دارندهٔ مجوز تأیید قابل مشاهده است.</Alert>
        <TextField label="یادداشت" multiline minRows={2} inputProps={{ maxLength: 500 }} value={notes} disabled={locked} onChange={event => setNotes(event.target.value)} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose} disabled={locked}>انصراف</Button>
        <Button type="submit" variant="contained" disabled={locked}>{command.busy ? 'در حال ثبت…' : 'ثبت برگه'}</Button></DialogActions>
    </form>
  </Dialog>;
}
