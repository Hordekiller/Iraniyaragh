import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BrandSummary } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createBrand, updateBrand } from '@/lib/catalog/catalog-api';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { BrandDialog } from '../BrandDialog';

vi.mock('@/lib/catalog/catalog-api', () => ({
  createBrand: vi.fn(),
  updateBrand: vi.fn(),
  createIdempotencyKey: (prefix: string) => `${prefix}-test-key`,
}));

const brand: BrandSummary = { id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 3 };

function renderDialog(props: Partial<React.ComponentProps<typeof BrandDialog>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const result = render(
    <FeedbackProvider>
      <BrandDialog open onClose={onClose} onSaved={onSaved} {...props} />
    </FeedbackProvider>,
  );
  return { onClose, onSaved, ...result };
}

describe('BrandDialog', () => {
  it('creates a brand with trimmed name and slug', async () => {
    vi.mocked(createBrand).mockResolvedValue({ brand: { ...brand, productCount: 0 } } as never);
    const { onClose, onSaved } = renderDialog();
    expect(screen.getByText('برند جدید')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/نام برند/), { target: { value: '  آبان   ' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'Ab an lock' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت برند' }));

    await waitFor(() => expect(createBrand).toHaveBeenCalledWith({ name: 'آبان', slug: 'ab-an-lock' }, expect.any(String)));
    expect(await screen.findByText(/برند «آبان» ساخته شد/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prefills and updates an existing brand', async () => {
    vi.mocked(updateBrand).mockResolvedValue({ brand } as never);
    renderDialog({ brand });

    expect((screen.getByLabelText(/نام برند/) as HTMLInputElement).value).toBe('آبان لک');
    const button = screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' });
    fireEvent.click(button);

    await waitFor(() => expect(updateBrand).toHaveBeenCalledWith('b1', { name: 'آبان لک', slug: 'abanlock' }));
  });

  it('validates required fields before submitting', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت برند' }));

    expect(screen.getByText('نام برند الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('شناسه (Slug) الزامی است.')).toBeInTheDocument();
    expect(createBrand).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug and shows the API error', async () => {
    vi.mocked(createBrand).mockRejectedValue(
      new ApiClientError({ code: 'CONFLICT', message: 'اسلاگ تکراری است', requestId: 'r', statusCode: 409 }),
    );
    renderDialog();

    fireEvent.change(screen.getByLabelText(/نام برند/), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'Bad Slug?' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت برند' }));
    expect(screen.getByText('شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'good-slug' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت برند' }));

    expect(await screen.findByText('اسلاگ تکراری است')).toBeInTheDocument();
  });
});
