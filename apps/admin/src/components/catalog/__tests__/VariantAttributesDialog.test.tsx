import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttributeDefinitionDetail, ProductVariant } from '@iranyaragh/contracts';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import { VariantAttributesDialog } from '../VariantAttributesDialog';

const api = vi.hoisted(() => ({ getAttribute: vi.fn(), updateVariantAttributes: vi.fn() }));
vi.mock('@/lib/catalog/catalog-api', () => ({ ...api, createIdempotencyKey: () => 'attribute-retry-key' }));
const definition: AttributeDefinitionDetail = { id: 'color-id', code: 'color', name: 'رنگ', description: null, status: 'ACTIVE', version: 1, optionCount: 1, createdAt: '', updatedAt: '', options: [{ id: 'red-id', code: 'red', label: 'قرمز', status: 'ACTIVE', version: 1, createdAt: '', updatedAt: '' }] };
const variant: ProductVariant = { id: 'sku-id', sku: 'LOCK-RED', costPrice: { amount: '100', currency: 'IRR' }, salePrice: { amount: '200', currency: 'IRR' }, isActive: true, version: 3, createdAt: '', updatedAt: '', attributeValues: [{ attributeCode: 'color', attributeName: 'رنگ', optionCode: 'red', optionLabel: 'قرمز', isVariantAxis: true }] };
function show(input = variant) {
  const saved = vi.fn(); const close = vi.fn();
  render(<FeedbackProvider><VariantAttributesDialog variant={input} configurations={[{ attributeCode: 'color', attributeName: 'رنگ', isRequired: true, isVariantAxis: true }]} definitions={[definition]} onSaved={saved} onClose={close} /></FeedbackProvider>);
  return { saved, close };
}
beforeEach(() => { vi.clearAllMocks(); api.getAttribute.mockResolvedValue({ attribute: definition }); api.updateVariantAttributes.mockResolvedValue({ variant }); });

describe('VariantAttributesDialog mutation and recovery', () => {
  it('loads the configured definition and saves current codes/version without client-owned IDs', async () => {
    const { saved } = show();
    const save = await screen.findByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' });
    await waitFor(() => expect(save).toBeEnabled());
    expect(api.getAttribute).toHaveBeenCalledWith('color-id', expect.any(AbortSignal));
    fireEvent.click(save);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(api.updateVariantAttributes).toHaveBeenCalledWith('sku-id', { expectedVersion: 3, values: [{ attributeCode: 'color', optionCode: 'red' }] }, 'attribute-retry-key');
  });
  it('rejects an empty required value before submit', async () => {
    show({ ...variant, attributeValues: [] });
    const save = screen.getByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' });
    await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    expect(await screen.findByText('برای همهٔ ویژگی‌های اجباری مقدار انتخاب کنید.')).toBeVisible();
    expect(api.updateVariantAttributes).not.toHaveBeenCalled();
  });
  it('retries definition loading after network failure and never enables an incomplete form', async () => {
    api.getAttribute.mockRejectedValueOnce(new Error('بارگذاری ناموفق'));
    show();
    expect(await screen.findByText('بارگذاری ناموفق')).toBeVisible();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' })).toBeEnabled());
  });
  it('retains the exact command across ambiguous retry without reporting success early', async () => {
    api.updateVariantAttributes.mockRejectedValueOnce(new Error('network failure'));
    const { saved, close } = show();
    const save = screen.getByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' });
    await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    expect(await screen.findByText('ذخیره ناموفق بود؛ دوباره تلاش کنید.')).toBeVisible();
    expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    fireEvent.click(save); await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(api.updateVariantAttributes.mock.calls[1]).toEqual(api.updateVariantAttributes.mock.calls[0]);
  });
  it.each(['STALE_VERSION', 'DUPLICATE_VARIANT_COMBINATION'])('keeps the form open on domain rejection: %s', async code => {
    api.updateVariantAttributes.mockRejectedValueOnce(new ApiClientError({ code, message: 'domain error', requestId: 'test-request', statusCode: 409 }));
    const { saved, close } = show();
    const save = screen.getByRole('button', { name: 'ذخیرهٔ مقادیر ویژگی‌ها' });
    await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    await screen.findByRole('alert');
    expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(save).toBeEnabled();
  });
});
