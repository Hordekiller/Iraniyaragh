'use client';

import { useCallback, useState } from 'react';

/**
 * A minimal, dependency-free form-validation layer for the admin panel.
 *
 * It is intentionally shaped like react-hook-form's field API so that swapping
 * to react-hook-form + zod/valibot later (ADR-0009) requires only changing the
 * internals, not the call sites: `values`, `errors`, `handleChange`,
 * `validate`, `reset`.
 */

export type FieldError = { message: string };

export type FormErrors<TValues extends Record<string, unknown>> = Partial<
  Record<keyof TValues, string>
>;

export type Validator<T> = {
  validate: (value: T) => string | null;
};

type Rule<T> = (value: T) => string | null;

export const required = (message = 'این فیلد الزامی است'): Rule<unknown> => (value) =>
  value == null || value === '' ? message : null;

export const minLength = (min: number, message = `حداقل ${min} کاراکتر`): Rule<string> => (value) =>
  value != null && value.length < min ? message : null;

export const maxLength = (max: number, message = `حداکثر ${max} کاراکتر`): Rule<string> => (value) =>
  value != null && value.length > max ? message : null;

export const pattern = (re: RegExp, message: string): Rule<string> => (value) =>
  value != null && value !== '' && !re.test(value) ? message : null;

export const email = (message = 'ایمیل معتبر نیست'): Rule<string> => (value) =>
  value != null && value !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? message : null;

export const min = (minimum: number, message = `مقدار نباید کمتر از ${minimum} باشد`): Rule<number> => (value) =>
  value != null && value < minimum ? message : null;

export const max = (maximum: number, message = `مقدار نباید بیشتر از ${maximum} باشد`): Rule<number> => (value) =>
  value != null && value > maximum ? message : null;

export const matches = <T>(otherName: string, getOther: () => T, message = 'مقدارها هم‌خوانی ندارند'): Rule<T> => (value) =>
  value !== getOther() ? message : null;

export type FieldDef<T> = {
  rules?: Rule<T>[];
  /** Cross-field validation ran after single-field rules. */
  validate?: (values: Record<string, unknown>) => string | null;
};

export type FormSchema<TValues extends Record<string, unknown>> = {
  [K in keyof TValues]?: FieldDef<TValues[K]>;
};

export function validateField<T>(value: T, def: FieldDef<T> | undefined): string | null {
  if (!def) return null;
  for (const rule of def.rules ?? []) {
    const error = rule(value);
    if (error) return error;
  }
  return null;
}

export function validateForm<TValues extends Record<string, unknown>>(
  values: TValues,
  schema: FormSchema<TValues>,
): FormErrors<TValues> {
  const errors: FormErrors<TValues> = {};
  for (const key of Object.keys(schema) as (keyof TValues)[]) {
    const def = schema[key];
    const value = values[key];
    const error = validateField(value, def);
    if (error) errors[key] = error;
    else if (def?.validate) {
      const cross = def.validate(values);
      if (cross) errors[key] = cross;
    }
  }
  return errors;
}

export type UseFormOptions<TValues extends Record<string, unknown>> = {
  initialValues: TValues;
  schema?: FormSchema<TValues>;
  onSubmit: (values: TValues) => void | Promise<void>;
};

export function useInHouseForm<TValues extends Record<string, unknown>>({
  initialValues,
  schema,
  onSubmit,
}: UseFormOptions<TValues>) {
  const [values, setValues] = useState<TValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors<TValues>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    <K extends keyof TValues>(key: K, value: TValues[K]) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value } as TValues;
        if (schema && errors[key]) {
          const error = validateField(value, schema[key]);
          setErrors((e) => {
            const nextErrors = { ...e };
            if (error) nextErrors[key] = error;
            else delete nextErrors[key];
            return nextErrors;
          });
        }
        return next;
      });
    },
    [schema, errors],
  );

  const validate = useCallback(() => {
    if (!schema) return true;
    const nextErrors = validateForm(values, schema);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [schema, values]);

  const handleSubmit = useCallback(
    async (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setSubmitting(false);
      }
    },
    [validate, onSubmit, values],
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  const getFieldProps = useCallback(
    <K extends keyof TValues>(key: K) => ({
      name: String(key),
      value: values[key] === undefined ? '' : (values[key] as TValues[K]),
      onChange: (event: { target: { value: string } }) =>
        handleChange(key, event.target.value as TValues[K]),
      error: Boolean(errors[key]),
      helperText: errors[key],
    }),
    [values, errors, handleChange],
  );

  return { values, errors, setValues, handleChange, handleSubmit, validate, reset, submitting, getFieldProps };
}
