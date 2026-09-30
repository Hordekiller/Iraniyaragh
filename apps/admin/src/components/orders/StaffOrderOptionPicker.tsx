'use client';

import { useEffect, useState } from 'react';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import { ApiAbortError } from '@/lib/api/client';
import { searchStaffOrderOptions } from '@/lib/orders/orders-api';
import type { StaffOrderOption, StaffOrderOptionKind } from '@iranyaragh/contracts';

const DEBOUNCE_MS = 250;

export type StaffOrderOptionPickerProps = {
  kind: StaffOrderOptionKind;
  label: string;
  value: StaffOrderOption | null;
  onChange: (value: StaffOrderOption | null) => void;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  size?: 'small' | 'medium';
};

/**
 * Server-side typeahead for the staff order form.
 *
 * Filtering happens on the server so a large catalog never has to be shipped
 * to the browser, and each keystroke supersedes the previous request, so a
 * slow early response cannot overwrite a newer one.
 */
export function StaffOrderOptionPicker({
  kind,
  label,
  value,
  onChange,
  helperText,
  disabled,
  required,
  size,
}: StaffOrderOptionPickerProps) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<StaffOrderOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Suggestions from the previous query must stop being selectable the
    // moment a new query starts. Otherwise an operator who types a SKU and
    // clicks quickly can pick a stale suggestion and create the order for the
    // wrong customer or product.
    setOptions([]);
    const timer = setTimeout(() => {
      setLoading(true);
      searchStaffOrderOptions({ kind, search, signal: controller.signal })
        .then((data) => setOptions(data.items))
        .catch((error) => {
          if (error instanceof ApiAbortError) return;
          setOptions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, search]);

  return (
    <Autocomplete
      options={options}
      value={value}
      loading={loading}
      filterOptions={(items) => items}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={(option) =>
        option.detail ? `${option.label} — ${option.detail}` : option.label
      }
      onChange={(_event, next) => onChange(next)}
      onInputChange={(_event, next, reason) => {
        if (reason === 'input' || reason === 'clear') setSearch(next);
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <span>{option.label}</span>
          {option.detail ? (
            <span style={{ marginInlineStart: 8, opacity: 0.7, fontSize: 12 }}>
              {option.detail}
            </span>
          ) : null}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          disabled={disabled}
          size={size}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
