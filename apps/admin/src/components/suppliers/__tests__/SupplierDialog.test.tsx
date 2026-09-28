import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { SupplierDialog, supplierErrorMessage } from '../SupplierDialog';

const mocks = vi.hoisted(() => ({
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}));

vi.mock('@/lib/suppliers/suppliers-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/suppliers/suppliers-api')>('@/lib/suppliers/suppliers-api');
  return { ...actual, createSupplier: mocks.createSupplier, updateSupplier: mocks.updateSupplier };
});

const supplier = {
  id: 'sup-1', code: 'SUP-1', name: 'تأمین تهران', mobile: null, phone: null,
  email: null, nationalId: null, economicCode: null, isActive: true, version: 7,
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
};

describe('SupplierDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects a malformed code before any request', async () => {
    render(<SupplierDialog open supplier={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'کد تأمین‌کننده' }), { target: { value: '9bad code!' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'نام تأمین‌کننده' }), { target: { value: 'نام' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText(/کد تأمین‌کننده باید/)).toBeTruthy();
    expect(mocks.createSupplier).not.toHaveBeenCalled();
  });

  it('sends the current expectedVersion when editing', async () => {
    mocks.updateSupplier.mockResolvedValue({ ...supplier, version: 8 });
    const onSaved = vi.fn();
    render(<SupplierDialog open supplier={supplier} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'نام تأمین‌کننده' }), { target: { value: 'نام تازه' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(mocks.updateSupplier).toHaveBeenCalled());
    const [id, input] = mocks.updateSupplier.mock.calls[0];
    expect(id).toBe('sup-1');
    expect(input.expectedVersion).toBe(7);
    expect(input.name).toBe('نام تازه');
    expect(onSaved).toHaveBeenCalled();
  });

  it('keeps the immutable code disabled while editing', () => {
    render(<SupplierDialog open supplier={supplier} onClose={vi.fn()} onSaved={vi.fn()} />);
    const code = screen.getByRole('textbox', { name: 'کد تأمین‌کننده' });
    expect(code).toBeInTheDocument();
    expect(code).toHaveProperty('disabled', true);
    expect(code).toHaveProperty('maxLength', 64);
    expect(code).toHaveProperty('dir', 'ltr');
  });

  it('surfaces a duplicate-code conflict in Persian', async () => {
    mocks.createSupplier.mockRejectedValue(new ApiClientError({ code: 'SUPPLIER_CODE_CONFLICT', message: 'Supplier code already exists.', statusCode: 409, requestId: 'r1' }));
    render(<SupplierDialog open supplier={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'کد تأمین‌کننده' }), { target: { value: 'SUP-1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'نام تأمین‌کننده' }), { target: { value: 'نام' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText('این کد تأمین‌کننده قبلاً ثبت شده است.')).toBeTruthy();
  });

  it('maps every documented command failure to an actionable Persian message', () => {
    const code = (value: string) => new ApiClientError({ code: value, message: 'raw', statusCode: 409, requestId: 'r' });
    expect(supplierErrorMessage(code('VERSION_CONFLICT'))).toContain('نسخهٔ تأمین‌کننده تغییر کرده است');
    expect(supplierErrorMessage(code('NOT_FOUND'))).toContain('یافت نشد');
    expect(supplierErrorMessage(code('VALIDATION_ERROR'))).toContain('حداقل یک فیلد');
    expect(supplierErrorMessage(code('IDEMPOTENCY_CONFLICT'))).toContain('کلید تکرارپذیری');
    expect(supplierErrorMessage(code('RETRYABLE_CONFLICT'))).toContain('هم‌زمانی');
    expect(supplierErrorMessage(new ApiNetworkError('boom'))).toContain('نتیجه نامشخص');
    expect(supplierErrorMessage(new Error('boom'))).toContain('ناموفق بود');
  });

  it('warns that deactivation preserves history and never deletes', () => {
    render(<SupplierDialog open supplier={supplier} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'تأمین‌کننده فعال است' }));
    expect(screen.getByText(/غیرفعال‌سازی تأمین‌کننده/)).toBeTruthy();
  });
});
