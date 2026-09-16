import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { AttributeDefinitionSummary } from '@iranyaragh/contracts';
import { AttributeDialog } from '../AttributeDialog';

const mocks = vi.hoisted(() => ({
  createAttribute: vi.fn(),
  updateAttribute: vi.fn(),
  keyCount: { value: 0 },
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  createAttribute: mocks.createAttribute,
  updateAttribute: mocks.updateAttribute,
  createIdempotencyKey: (prefix: string) => `${prefix}-key-${++mocks.keyCount.value}`,
}));

const attribute: AttributeDefinitionSummary = {
  id: 'attr-1',
  code: 'color',
  name: 'رنگ',
  description: 'رنگ کالا',
  status: 'ACTIVE',
  optionCount: 2,
  version: 5,
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<Parameters<typeof AttributeDialog>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <AttributeDialog mode="create" onSaved={vi.fn()} onClose={vi.fn()} {...props} />
    </FeedbackProvider>,
  );
}

describe('AttributeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keyCount.value = 0;
    mocks.createAttribute.mockResolvedValue({ attribute });
    mocks.updateAttribute.mockResolvedValue({ attribute });
  });

  it('shows validation errors for an empty create form without calling the API', () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <FeedbackProvider>
        <AttributeDialog mode="create" onSaved={onSaved} onClose={onClose} />
      </FeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));
    expect(screen.getByText('کد ویژگی الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('نام ویژگی الزامی است.')).toBeInTheDocument();
    expect(mocks.createAttribute).not.toHaveBeenCalled();
  });

  it('rejects codes that are not a valid slug pattern', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('کد *'), { target: { value: 'Kala Rangi' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));
    expect(screen.getByText('کد فقط شامل a-z، عدد و خط تیره (-) باشد.')).toBeInTheDocument();
    expect(mocks.createAttribute).not.toHaveBeenCalled();
  });

  it('creates an attribute with options and resets the idempotency key after success', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <FeedbackProvider>
        <AttributeDialog mode="create" onSaved={onSaved} onClose={onClose} />
      </FeedbackProvider>,
    );
    fireEvent.change(screen.getByLabelText('کد *'), { target: { value: 'COLOR' } });
    fireEvent.change(screen.getByLabelText('نام *'), { target: { value: 'رنگ' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن گزینه' }));
    fireEvent.change(screen.getAllByLabelText('کد *')[1], { target: { value: 'RED' } });
    fireEvent.change(screen.getByLabelText('برچسب *'), { target: { value: 'قرمز' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));

    await waitFor(() =>
      expect(mocks.createAttribute).toHaveBeenCalledWith(
        {
          code: 'color',
          name: 'رنگ',
          status: 'ACTIVE',
          options: [{ code: 'red', label: 'قرمز' }],
        },
        'catalog-attribute-key-1',
      ),
    );
    expect(await screen.findByText(/ویژگی «رنگ» ساخته شد/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reuses the same idempotency key across a failed create retry, then refreshes after success', async () => {
    mocks.createAttribute.mockRejectedValueOnce(new Error('boom'));
    render(
      <FeedbackProvider>
        <AttributeDialog mode="create" onSaved={vi.fn()} onClose={vi.fn()} />
      </FeedbackProvider>,
    );
    fireEvent.change(screen.getByLabelText('کد *'), { target: { value: 'color' } });
    fireEvent.change(screen.getByLabelText('نام *'), { target: { value: 'رنگ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));
    await waitFor(() => expect(mocks.createAttribute).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByText('ثبت ویژگی ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));
    await waitFor(() => expect(mocks.createAttribute).toHaveBeenCalledTimes(2));
    const keyOne = mocks.createAttribute.mock.calls[0]?.[1];
    const keyTwo = mocks.createAttribute.mock.calls[1]?.[1];
    expect(keyTwo).toBe('catalog-attribute-key-1');
    expect(keyOne).toBe(keyTwo);
    expect(await screen.findByText(/ویژگی «رنگ» ساخته شد/)).toBeInTheDocument();
  });

  it('edits the attribute: keeps the code disabled, limits the payload and sends the expected version', async () => {
    const onSaved = vi.fn();
    render(
      <FeedbackProvider>
        <AttributeDialog
          mode="edit"
          attribute={attribute}
          onSaved={onSaved}
          onClose={vi.fn()}
        />
      </FeedbackProvider>,
    );
    const codeField = screen.getByLabelText('کد *');
    expect(codeField.closest('.MuiOutlinedInput-root')).toHaveClass('Mui-disabled');
    const nameField = screen.getByLabelText('نام *');
    fireEvent.change(nameField, { target: { value: 'رنگ اصلی' } });
    fireEvent.mouseDown(screen.getByLabelText('وضعیت ویژگی'));
    fireEvent.click(screen.getByText('غیرفعال'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() =>
      expect(mocks.updateAttribute).toHaveBeenCalledWith('attr-1', {
        name: 'رنگ اصلی',
        status: 'INACTIVE',
        expectedVersion: 5,
      }),
    );
    expect(await screen.findByText(/ویژگی «رنگ اصلی» به‌روزرسانی شد/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('surfaces the API error message on failure', async () => {
    mocks.createAttribute.mockRejectedValue(new Error('duplicate'));
    render(
      <FeedbackProvider>
        <AttributeDialog mode="create" onSaved={vi.fn()} onClose={vi.fn()} />
      </FeedbackProvider>,
    );
    fireEvent.change(screen.getByLabelText('کد *'), { target: { value: 'color' } });
    fireEvent.change(screen.getByLabelText('نام *'), { target: { value: 'رنگ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت ویژگی' }));
    expect(
      await screen.findByText('ثبت ویژگی ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });
});