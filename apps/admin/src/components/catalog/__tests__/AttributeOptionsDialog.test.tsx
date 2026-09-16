import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { AttributeDefinitionResponse } from '@iranyaragh/contracts';
import { AttributeOptionsDialog } from '../AttributeOptionsDialog';

const mocks = vi.hoisted(() => ({
  getAttribute: vi.fn(),
  createAttributeOption: vi.fn(),
  updateAttributeOption: vi.fn(),
  keyCount: { value: 0 },
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  getAttribute: mocks.getAttribute,
  createAttributeOption: mocks.createAttributeOption,
  updateAttributeOption: mocks.updateAttributeOption,
  createIdempotencyKey: (prefix: string) => `${prefix}-key-${++mocks.keyCount.value}`,
}));

const option = (id: string, code: string, label: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') => ({
  id,
  code,
  label,
  status,
  version: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const detail: AttributeDefinitionResponse['data'] = {
  attribute: {
    id: 'attr-1',
    code: 'color',
    name: 'رنگ',
    description: null,
    status: 'ACTIVE',
    optionCount: 2,
    version: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    options: [option('o1', 'red', 'قرمز'), option('o2', 'blue', 'آبی', 'INACTIVE')],
  },
};

function renderDialog(props: Partial<Parameters<typeof AttributeOptionsDialog>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <AttributeOptionsDialog
        attributeId="attr-1"
        attributeName="رنگ"
        onChanged={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </FeedbackProvider>,
  );
}

describe('AttributeOptionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keyCount.value = 0;
    mocks.getAttribute.mockResolvedValue(detail);
    mocks.createAttributeOption.mockResolvedValue(detail);
    mocks.updateAttributeOption.mockResolvedValue({ option: option('o1', 'red', 'قرمز') });
  });

  it('loads and renders the existing options with their statuses', async () => {
    renderDialog();
    expect(await screen.findByText('قرمز')).toBeInTheDocument();
    expect(screen.getByText('آبی')).toBeInTheDocument();
    expect(screen.getAllByText('فعال')).toHaveLength(1);
  });

  it('validates the add form before calling the API', async () => {
    renderDialog();
    await screen.findByText('قرمز');
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));
    expect(screen.getByText('کد گزینه الزامی است.')).toBeInTheDocument();
    expect(mocks.createAttributeOption).not.toHaveBeenCalled();
  });

  it('creates an option and refreshes the list', async () => {
    const onChanged = vi.fn();
    renderDialog({ onChanged });
    await screen.findByText('قرمز');
    fireEvent.change(screen.getByLabelText('کد *'), { target: { value: 'GREEN' } });
    fireEvent.change(screen.getByLabelText('برچسب *'), { target: { value: 'سبز' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));

    await waitFor(() =>
      expect(mocks.createAttributeOption).toHaveBeenCalledWith(
        'attr-1',
        { code: 'green', label: 'سبز' },
        'catalog-attribute-option-key-1',
      ),
    );
    expect(await screen.findByText(/گزینهٔ «سبز» ساخته شد/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.getAttribute).toHaveBeenCalledTimes(2));
  });

  it('toggles an option status with its expected version', async () => {
    renderDialog();
    fireEvent.click(await screen.findByLabelText('غیرفعال کردن گزینهٔ قرمز'));
    await waitFor(() =>
      expect(mocks.updateAttributeOption).toHaveBeenCalledWith('attr-1', 'o1', {
        status: 'INACTIVE',
        expectedVersion: 2,
      }),
    );
    expect(await screen.findByText('وضعیت گزینه به‌روزرسانی شد.')).toBeInTheDocument();
  });

  it('shows a load failure without exposing the action form', async () => {
    mocks.getAttribute.mockRejectedValue(new Error('down'));
    renderDialog();
    expect(
      await screen.findByText('بارگیری گزینه‌های این ویژگی ناموفق بود.'),
    ).toBeInTheDocument();
  });
});