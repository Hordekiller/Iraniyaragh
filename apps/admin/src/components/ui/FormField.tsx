'use client';

import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { FormControl, FormHelperText, FormLabel } from '@mui/material';

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
 * MUI `FormControl`. `required` renders the `*` marker and an `aria-required` on
 * the `FormLabel`; `error` links the helper text with `role="alert"`; `disabled`
 * is propagated onto the child control. All state is announced to assistive tech
 * as well as shown visually.
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

  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { disabled } as Record<string, unknown>)
    : children;

  return (
    <FormControl required={required} error={error} disabled={disabled} fullWidth>
      <FormLabel
        htmlFor={htmlFor}
        required={required}
        aria-required={required || undefined}
        sx={{ mb: 1, fontWeight: 600 }}
      >
        {label}
      </FormLabel>
      {control}
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
