import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { ProductVariant } from '@iranyaragh/contracts';
import { VariantEditDialog } from '../VariantEditDialog';

const mocks = vi.hoisted(() => ({
  updateVariant: vi.fn(),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  updateVariant: mocks.updateVariant,
}));

const variant: ProductVariant = {
  id: 'v1',
  sku: 'LOCK-RED-M',
  title: 'قرمز M',
  status: 'ACTIVE',
  isActive: true,
  version: 4,
  barcode: '626000',
  weightGrams: 120,
  dimensions: { lengthCm: 10, widthCm: 5, heightCm: 3 },
  costPrice: { amount: '1500', currency: 'IRR' },
  salePrice: { amount: '2500', currency: 'IRR' },
  attributeValues: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<Parameters<typeof VariantEditDialog>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <VariantEditDialog variant={variant} onSaved={vi.fn()} onClose={vi.fn()} {...props} />
    </FeedbackProvider>,
  );
}

describe('VariantEditDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateVariant.mockResolvedValue({ variant });
  });

  it('prefills fields and strips non-digit characters from numeric inputs', () => {
    renderDialog();
    expect(screen.getByLabelText('بارکد')).toHaveValue('626000');
    expect(screen.getByLabelText('وزن (گرم)')).toHaveValue('120');
    expect(screen.getByLabelText('طول (سانتیمتر)')).toHaveValue('10');

    fireEvent.change(screen.getByLabelText('وزن (گرم)'), { target: { value: '1a2b3' } });
    expect(screen.getByLabelText('وزن (گرم)')).toHaveValue('123');
  });

  it('shows a validation error for numbers longer than ten digits', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('وزن (گرم)'), { target: { value: '12345678901' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(screen.getByText('فقط عدد صحیح مثبت مجاز است.')).toBeInTheDocument();
    expect(mocks.updateVariant).not.toHaveBeenCalled();
  });

  it('closes without calling the API when nothing changed', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.updateVariant).not.toHaveBeenCalled();
  });

  it('sends changed fields with the expectedVersion and reports success', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onSaved, onClose });
    fireEvent.change(screen.getByLabelText('بارکد'), { target: { value: '626001' } });
    fireEvent.change(screen.getByLabelText('وزن (گرم)'), { target: { value: '130' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() =>
      expect(mocks.updateVariant).toHaveBeenCalledWith('v1', {
        barcode: '626001',
        weightGrams: 130,
        expectedVersion: 4,
      }),
    );
    expect(await screen.findByText(/ویرایش تنوع «LOCK-RED-M» ثبت شد/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends null for cleared optional fields', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('بارکد'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() =>
      expect(mocks.updateVariant).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ barcode: null }),
      ),
    );
  });

  it('surfaces a generic error on failure', async () => {
    mocks.updateVariant.mockRejectedValue(new Error('down'));
    renderDialog();
    fireEvent.change(screen.getByLabelText('بارکد'), { target: { value: '626001' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(
      await screen.findByText('ویرایش تنوع ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });
});