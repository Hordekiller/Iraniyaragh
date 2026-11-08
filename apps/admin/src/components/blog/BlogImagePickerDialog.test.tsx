import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlogImagePickerDialog } from './BlogImagePickerDialog';

const option = { id: 'm1', url: 'https://cdn.test/a.webp', width: 1200, height: 800, alt: 'لولا', productName: 'لولا ۳۵' };

describe('blog image picker', () => {
  it('requires alt text and inserts the image with its dimensions and optional caption', () => {
    const onInsert = vi.fn();
    render(<BlogImagePickerDialog open options={[option]} onInsert={onInsert} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب تصویر لولا' }));
    const alt = screen.getByRole('textbox', { name: /متن جایگزین/ });
    expect(alt).toHaveValue('لولا');
    fireEvent.change(alt, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'درج در مقاله' })).toBeDisabled();
    fireEvent.change(alt, { target: { value: ' لولای نصب‌شده روی درب ' } });
    fireEvent.change(screen.getByRole('textbox', { name: /عنوان زیر تصویر/ }), { target: { value: 'نمونهٔ نصب' } });
    fireEvent.click(screen.getByRole('button', { name: 'درج در مقاله' }));
    expect(onInsert).toHaveBeenCalledWith({ id: 'm1', url: option.url, alt: 'لولای نصب‌شده روی درب', caption: 'نمونهٔ نصب', width: 1200, height: 800 });
  });
  it('lets the author go back and pick another image', () => {
    render(<BlogImagePickerDialog open options={[option]} onInsert={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب تصویر لولا' }));
    fireEvent.click(screen.getByRole('button', { name: 'تغییر تصویر' }));
    expect(screen.getByRole('button', { name: 'انتخاب تصویر لولا' })).toBeInTheDocument();
  });
  it('explains when no ready image exists and can be cancelled', () => {
    const onCancel = vi.fn();
    render(<BlogImagePickerDialog open options={[]} onInsert={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByText('تصویر آماده‌ای وجود ندارد')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
