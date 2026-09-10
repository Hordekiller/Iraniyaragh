import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmsRotateSecretDialog } from '../SmsRotateSecretDialog';

function mounted(onSubmit = vi.fn()) {
  const utils = render(
    <SmsRotateSecretDialog open busy={false} setOpen={() => undefined} onSubmit={onSubmit} />,
  );
  return { ...utils, onSubmit };
}

function enterSecret(value: string): void {
  fireEvent.change(screen.getByLabelText('کلید جدید سرویس پیامک'), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('SmsRotateSecretDialog', () => {
  it('submits the exact secret value without trimming', async () => {
    const { onSubmit } = mounted();
    const validSecret = 'abcdefghijklmnop';
    enterSecret(validSecret);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کلید جدید' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(validSecret);
  });

  it('rejects a secret that is only valid after trimming (never normalized)', async () => {
    const { onSubmit } = mounted();
    enterSecret(`  ${'abcdefghijklmnop'}  `);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کلید جدید' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects secrets containing internal whitespace or control characters', () => {
    const { onSubmit } = mounted();
    enterSecret('abcd efgh ijkl mnop');
    const submit = screen.getByRole('button', { name: 'ثبت کلید جدید' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an exact-match helper message after a form submit with a padded value', () => {
    const { onSubmit } = mounted();
    fireEvent.change(screen.getByLabelText('کلید جدید سرویس پیامک'), {
      target: { value: `  ${'abcdefghijklmnop'}  ` },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(screen.getByText(/بدون فاصله/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects secrets shorter than the contract minimum', () => {
    const { onSubmit } = mounted();
    enterSecret('tooshort');
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کلید جدید' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the submit disabled until confirmation is given', () => {
    const { onSubmit } = mounted();
    fireEvent.change(screen.getByLabelText('کلید جدید سرویس پیامک'), { target: { value: 'abcdefghijklmnop' } });
    const submit = screen.getByRole('button', { name: 'ثبت کلید جدید' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});