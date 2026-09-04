import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from '../ConfirmationDialog';

const defaultProps = {
  open: true,
  setOpen: vi.fn(),
  title: 'حذف محصول',
  description: 'آیا از حذف این محصول مطمئنید؟',
  onConfirm: vi.fn(),
};

describe('ConfirmationDialog', () => {
  it('renders title and description when open', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText('حذف محصول')).toBeInTheDocument();
    expect(screen.getByText('آیا از حذف این محصول مطمئنید؟')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(<ConfirmationDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('حذف محصول')).not.toBeInTheDocument();
  });

  it('has aria-labelledby and aria-describedby linking title and description', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('حذف محصول');
    expect(document.getElementById(describedBy!)).toHaveTextContent('آیا از حذف این محصول مطمئنید؟');
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onConfirm with reason when requireReason is true', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        {...defaultProps}
        onConfirm={onConfirm}
        requireReason
        reasonLabel="دلیل حذف"
        reasonPlaceholder="دلیل را بنویسید"
      />,
    );

    const reasonInput = screen.getByLabelText('دلیل حذف');
    fireEvent.change(reasonInput, { target: { value: 'محصول قدیمی است' } });
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    expect(onConfirm).toHaveBeenCalledWith('محصول قدیمی است');
  });

  it('shows validation error when reason is required but empty', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        {...defaultProps}
        onConfirm={onConfirm}
        requireReason
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('وارد کردن دلیل الزامی است')).toBeInTheDocument();
  });

  it('shows custom confirm label', () => {
    render(
      <ConfirmationDialog
        {...defaultProps}
        type="archive"
        confirmLabel="بایگانی کن"
      />,
    );
    expect(screen.getByRole('button', { name: 'بایگانی کن' })).toBeInTheDocument();
  });

  it('shows default label based on type', () => {
    render(<ConfirmationDialog {...defaultProps} type="archive" />);
    expect(screen.getByRole('button', { name: 'بایگانی' })).toBeInTheDocument();
  });

  it('shows loading state on confirm button', () => {
    render(<ConfirmationDialog {...defaultProps} loading />);
    expect(screen.getByRole('button', { name: 'در حال انجام...' })).toBeDisabled();
  });

  it('disables cancel button while loading', () => {
    render(<ConfirmationDialog {...defaultProps} loading />);
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled();
  });

  it('calls setOpen(false) when cancel is clicked', () => {
    const setOpen = vi.fn();
    render(<ConfirmationDialog {...defaultProps} setOpen={setOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('shows result dialog on success', () => {
    render(<ConfirmationDialog {...defaultProps} result="success" />);
    expect(screen.getByText('انجام شد')).toBeInTheDocument();
    expect(screen.getByText(/با موفقیت اعمال شد/)).toBeInTheDocument();
  });

  it('shows result dialog on cancelled', () => {
    render(<ConfirmationDialog {...defaultProps} result="cancelled" />);
    expect(screen.getByText('لغو شد')).toBeInTheDocument();
    expect(screen.getByText('عملیات توسط شما لغو شد.')).toBeInTheDocument();
  });

  it('disables confirm button when loading', () => {
    render(<ConfirmationDialog {...defaultProps} loading />);
    const confirmBtn = screen.getByRole('button', { name: 'در حال انجام...' });
    expect(confirmBtn).toBeDisabled();
  });

  it('does not call onConfirm when loading', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} loading />);
    fireEvent.click(screen.getByRole('button', { name: 'در حال انجام...' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
