import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '../FormField';
import { TextField } from '@mui/material';

describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="نام محصول">
        <TextField />
      </FormField>,
    );
    expect(screen.getByText('نام محصول')).toBeInTheDocument();
  });

  it('renders required asterisk when required', () => {
    render(
      <FormField label="نام محصول" required>
        <TextField />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not render asterisk when not required', () => {
    render(
      <FormField label="نام محصول">
        <TextField />
      </FormField>,
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders error text when error is true', () => {
    render(
      <FormField label="نام" error errorText="نام الزامی است">
        <TextField />
      </FormField>,
    );
    expect(screen.getByText('نام الزامی است')).toBeInTheDocument();
  });

  it('does not render error text when error is false', () => {
    render(
      <FormField label="نام" error={false} errorText="نام الزامی است">
        <TextField />
      </FormField>,
    );
    expect(screen.queryByText('نام الزامی است')).not.toBeInTheDocument();
  });

  it('renders helper text when no error', () => {
    render(
      <FormField label="نام" helperText="نام محصول را وارد کنید">
        <TextField />
      </FormField>,
    );
    expect(screen.getByText('نام محصول را وارد کنید')).toBeInTheDocument();
  });

  it('shows error text instead of helper text when both provided', () => {
    render(
      <FormField label="نام" error errorText="خطا" helperText="راهنما">
        <TextField />
      </FormField>,
    );
    expect(screen.getByText('خطا')).toBeInTheDocument();
    expect(screen.queryByText('راهنما')).not.toBeInTheDocument();
  });

  it('renders full width by default', () => {
    const { container } = render(
      <FormField label="نام">
        <TextField />
      </FormField>,
    );
    const formControl = container.querySelector('.MuiFormControl-root');
    expect(formControl).toHaveClass('MuiFormControl-fullWidth');
  });
});
