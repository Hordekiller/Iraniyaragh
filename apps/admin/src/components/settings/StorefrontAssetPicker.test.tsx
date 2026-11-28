import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontAssetPicker } from './StorefrontAssetPicker';
import { archiveAsset, confirmAsset, listAssets, startAsset } from '@/lib/settings/shop-api';
import { uploadMediaObject } from '@/lib/catalog/media-api';

vi.mock('@/lib/settings/shop-api', () => ({ listAssets: vi.fn(), startAsset: vi.fn(), confirmAsset: vi.fn(), archiveAsset: vi.fn() }));
vi.mock('@/lib/catalog/media-api', () => ({ uploadMediaObject: vi.fn() }));
vi.mock('@/lib/catalog/catalog-api', () => ({ createIdempotencyKey: () => 'asset-command-key' }));

const ready = { id: 'ready-image', state: 'READY', version: 2, altText: 'تصویر آماده', failureCode: null, image: { url: '/media/ready.webp', width: 640, height: 480 } };

beforeEach(() => {
  vi.mocked(listAssets).mockReset().mockResolvedValue([ready]);
  vi.mocked(startAsset).mockReset().mockResolvedValue({ mediaId: ready.id } as never);
  vi.mocked(uploadMediaObject).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(confirmAsset).mockReset().mockResolvedValue({} as never);
  vi.mocked(archiveAsset).mockReset().mockResolvedValue({} as never);
});

describe('StorefrontAssetPicker', () => {
  it('shows only approved images and removes a selected reference', async () => {
    const onChange = vi.fn();
    render(<StorefrontAssetPicker label="تصویر دسته" value={ready.id} alt="متن جایگزین" onChange={onChange} />);
    await screen.findByAltText('متن جایگزین');
    expect(listAssets).toHaveBeenCalledWith(expect.any(AbortSignal), 1, ready.id);
    fireEvent.click(screen.getByRole('button', { name: 'حذف از این بخش' }));
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'بایگانی فایل بدون استفاده' }));
    await waitFor(() => expect(archiveAsset).toHaveBeenCalledWith(ready.id, ready.version));
  });

  it('keeps a failed archive visible with an actionable error', async () => {
    vi.mocked(archiveAsset).mockRejectedValueOnce(new Error('referenced'));
    render(<StorefrontAssetPicker label="تصویر دسته" value={ready.id} alt="متن جایگزین" onChange={vi.fn()} />);
    await screen.findByAltText('متن جایگزین');
    fireEvent.click(screen.getByRole('button', { name: 'بایگانی فایل بدون استفاده' }));
    await screen.findByText(/حذف انجام نشد/);
  });

  it('uploads through the verified media pipeline and selects the READY result', async () => {
    const onChange = vi.fn();
    vi.mocked(listAssets).mockReset().mockResolvedValueOnce([]).mockResolvedValue([ready]);
    const { container } = render(<StorefrontAssetPicker label="تصویر دسته" value={null} alt="تصویر دسته" onChange={onChange} />);
    const file = new File(['image bytes'], 'category.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(startAsset).toHaveBeenCalledWith(file, 'تصویر دسته'));
    await waitFor(() => expect(uploadMediaObject).toHaveBeenCalled());
    await waitFor(() => expect(confirmAsset).toHaveBeenCalledWith(ready.id, 'asset-command-key'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ready.id));
    expect(screen.getByRole('status')).toHaveTextContent('تصویر آمادهٔ استفاده است.');
  });

  it('allows a library retry after a failed read', async () => {
    vi.mocked(listAssets).mockRejectedValueOnce(new Error('offline'));
    render(<StorefrontAssetPicker label="تصویر دسته" value={null} alt="" onChange={vi.fn()} />);
    await screen.findByText('دریافت کتابخانهٔ تصاویر انجام نشد.');
    expect(screen.getByRole('button', { name: 'آپلود / جایگزینی' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'تازه‌سازی تصاویر' }));
    await waitFor(() => expect(listAssets).toHaveBeenCalledTimes(2));
    expect(screen.getByText('برای آپلود ابتدا متن جایگزین تصویر را وارد کنید.')).toBeInTheDocument();
  });
});
