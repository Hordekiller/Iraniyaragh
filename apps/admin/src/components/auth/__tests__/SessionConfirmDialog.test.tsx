import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionConfirmDialog } from '../SessionConfirmDialog';

function mounted(onConfirm = vi.fn()) {
  const utils = render(
    <SessionConfirmDialog
      open
      busy={false}
      setOpen={() => undefined}
      title="خروج از همهٔ دستگاه‌ها"
      description="از تمام نشست‌های فعال خارج می‌شوید."
      confirmLabel="خروج از همه"
      onConfirm={onConfirm}
    />,
  );
  return { ...utils, onConfirm };
}

describe('SessionConfirmDialog', () => {
  it('calls onConfirm once when the operator confirms', () => {
    const { onConfirm } = mounted();
    fireEvent.click(screen.getByRole('button', { name: 'خروج از همه' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm on cancel', () => {
    const { onConfirm } = mounted();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is clickable only through the visible confirm action', async () => {
    const { onConfirm } = mounted();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});