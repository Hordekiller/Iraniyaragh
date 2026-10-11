'use client';

import { useEffect, useState } from 'react';
import { Autocomplete, Button, Stack, TextField } from '@mui/material';
import type { StocktakeLocationOption } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { listStocktakeLocations, listStocktakeVariants, listStocktakeWarehouses } from '@/lib/stocktake/stocktake-api';

type Props = {
  kind: 'warehouse' | 'location' | 'variant'; label: string; warehouseId?: string;
  value: StocktakeLocationOption[]; onChange: (value: StocktakeLocationOption[]) => void;
  disabled?: boolean; single?: boolean;
};

export function StocktakeOptionPicker({ kind, label, warehouseId, value, onChange, disabled, single }: Props) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [options, setOptions] = useState<StocktakeLocationOption[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (disabled || (kind === 'location' && !warehouseId)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(false);
      const query = { search, offset, limit: 50 };
      const request = kind === 'warehouse' ? listStocktakeWarehouses(query, controller.signal)
        : kind === 'location' ? listStocktakeLocations({ ...query, warehouseId }, controller.signal)
          : listStocktakeVariants(query, controller.signal).then(result => ({ ...result,
            items: result.items.map(option => ({ id: option.id, code: option.sku, label: option.label })) }));
      request.then(result => {
        if (controller.signal.aborted) return;
        setOptions(previous => offset === 0 ? result.items : [...previous, ...result.items.filter(option => !previous.some(entry => entry.id === option.id))]);
        setCount(result.count);
      }).catch((failure: unknown) => { if (!(failure instanceof ApiAbortError) && !controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, warehouseId, search, offset, revision, disabled]);
  const available = [...value.filter(option => !options.some(entry => entry.id === option.id)), ...options];
  return <Stack spacing={1}>
    <Autocomplete multiple options={available} value={value} loading={loading} disabled={disabled}
      filterOptions={items => items} isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={option => `${option.code} — ${option.label}`}
      onInputChange={(_, input, reason) => { if (reason === 'input' || reason === 'clear') { setSearch(input); setOffset(0); setOptions([]); } }}
      onChange={(_, next) => onChange(single ? next.slice(-1) : next)}
      noOptionsText="گزینه‌ای یافت نشد" loadingText="در حال دریافت…"
      renderInput={params => <TextField {...params} label={label} error={error}
        helperText={error ? 'دریافت گزینه‌ها ناموفق بود؛ دوباره تلاش کنید.' : 'برای جست‌وجو کد یا نام را بنویسید.'} />} />
    {error ? <Button disabled={disabled || loading} onClick={() => setRevision(current => current + 1)}>تلاش دوباره برای دریافت گزینه‌ها</Button> : null}
    {!error && offset + 50 < count ? <Button disabled={disabled || loading} onClick={() => setOffset(current => current + 50)}>گزینه‌های بیشتر</Button> : null}
  </Stack>;
}
