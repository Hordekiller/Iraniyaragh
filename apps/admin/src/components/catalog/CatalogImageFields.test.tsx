import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogImageFields, emptyImage } from './CatalogImageFields';

vi.mock('@/components/settings/StorefrontAssetPicker', () => ({
  StorefrontAssetPicker: ({ onChange }: { onChange: (id: string) => void }) => <button type="button" onClick={() => onChange('ready-image')}>انتخاب تصویر</button>,
}));

describe('CatalogImageFields', () => {
  it('keeps image, alt text, order and featured state independent', () => {
    const onChange = vi.fn();
    render(<CatalogImageFields value={emptyImage} onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByLabelText('متن جایگزین تصویر'), { target: { value: 'دریل روی میز' } });
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب تصویر' }));
    fireEvent.change(screen.getByLabelText('ترتیب در فروشگاه'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: 'نمایش در دسته‌ها / برندهای منتخب فروشگاه' }));
    expect(onChange).toHaveBeenNthCalledWith(1, { ...emptyImage, imageAlt: 'دریل روی میز' });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...emptyImage, imageAssetId: 'ready-image' });
    expect(onChange).toHaveBeenNthCalledWith(3, { ...emptyImage, shopOrder: 3 });
    expect(onChange).toHaveBeenNthCalledWith(4, { ...emptyImage, shopFeatured: true });
  });
});
