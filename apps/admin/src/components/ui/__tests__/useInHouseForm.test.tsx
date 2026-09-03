import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInHouseForm, required, minLength, email } from '../useInHouseForm';

type TestForm = {
  name: string;
  email: string;
  age: string;
};

describe('useInHouseForm', () => {
  const schema = {
    name: { rules: [required(), minLength(3, 'حداقل ۳ حرف')] },
    email: { rules: [required(), email()] },
    age: { rules: [required()] },
  };

  it('initializes with correct values', () => {
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: '', email: '', age: '' },
        schema,
        onSubmit: vi.fn(),
      }),
    );

    expect(result.current.values).toEqual({ name: '', email: '', age: '' });
    expect(result.current.errors).toEqual({});
    expect(result.current.submitting).toBe(false);
  });

  it('handleChange updates values', () => {
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: '', email: '', age: '' },
        schema,
        onSubmit: vi.fn(),
      }),
    );

    act(() => result.current.handleChange('name', 'علی'));
    expect(result.current.values.name).toBe('علی');
  });

  it('validates and sets errors for invalid fields', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: '', email: 'invalid', age: '' },
        schema,
        onSubmit,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.name).toBe('این فیلد الزامی است');
    expect(result.current.errors.email).toBe('ایمیل معتبر نیست');
    expect(result.current.errors.age).toBe('این فیلد الزامی است');
  });

  it('validates minLength', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: 'عل', email: 'a@b.com', age: '25' },
        schema,
        onSubmit,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.name).toBe('حداقل ۳ حرف');
  });

  it('calls onSubmit when all fields are valid', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: 'علی', email: 'ali@test.com', age: '25' },
        schema,
        onSubmit,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: 'علی', email: 'ali@test.com', age: '25' });
  });

  it('clears field error when value becomes valid', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: '', email: '', age: '' },
        schema,
        onSubmit,
      }),
    );

    // First submit to get errors
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.errors.name).toBe('این فیلد الزامی است');

    // Then fix the field
    act(() => result.current.handleChange('name', 'علی'));
    expect(result.current.errors.name).toBeUndefined();
  });

  it('reset clears values and errors', async () => {
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: 'علی', email: 'ali@test.com', age: '25' },
        schema,
        onSubmit: vi.fn(),
      }),
    );

    act(() => result.current.handleChange('name', ''));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.errors.name).toBeTruthy();

    act(() => result.current.reset());
    expect(result.current.values.name).toBe('علی');
    expect(result.current.errors).toEqual({});
  });

  it('getFieldProps returns correct props', () => {
    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: 'علی', email: '', age: '' },
        schema,
        onSubmit: vi.fn(),
      }),
    );

    const props = result.current.getFieldProps('name');
    expect(props.name).toBe('name');
    expect(props.value).toBe('علی');
    expect(props.error).toBe(false);
  });

  it('submitting flag is set during async onSubmit', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });

    const { result } = renderHook(() =>
      useInHouseForm<TestForm>({
        initialValues: { name: 'علی', email: 'ali@test.com', age: '25' },
        schema,
        onSubmit: () => submitPromise,
      }),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(result.current.submitting).toBe(true);

    await act(async () => {
      resolveSubmit();
      await submitPromise;
    });

    expect(result.current.submitting).toBe(false);
  });
});
