'use client';

import type { ReactNode } from 'react';
import { FormControl, FormHelperText, FormLabel } from '@mui/material';
import { useId } from 'react';

export type FormFieldProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: boolean;
  errorText?: string;
  helperText?: string;
  disabled?: boolean;
  children: ReactNode;
};

/**
 * Consistent label + control + helper/error block for MUI form controls, built on
 * MUI `FormControl`. Error/disabled state flows to the control and the helper
 * text is linked to it, so validation and required state are announced correctly.
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  error = false,
  errorText,
  helperText,
  disabled = false,
  children,
}: FormFieldProps) {
  const helperId = useId();

  return (
    <FormControl required={required} error={error} disabled={disabled} fullWidth>
      <FormLabel htmlFor={htmlFor} sx={{ mb: 1, fontWeight: 600 }}>
        {label}
      </FormLabel>
      {children}
      {error && errorText ? (
        <FormHelperText id={helperId} role="alert">
          {errorText}
        </FormHelperText>
      ) : helperText ? (
        <FormHelperText id={helperId}>{helperText}</FormHelperText>
      ) : null}
    </FormControl>
  );
}
