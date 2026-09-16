import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CATALOG_READ, CATALOG_WRITE } from '@/lib/catalog/catalog-permissions';
import type { AttributeDefinitionSummary } from '@iranyaragh/contracts';
import { AttributesView } from '../AttributesView';

const mocks = vi.hoisted(() => ({
  user: { permissions: [] as string[] },
  listAttributes: vi.fn(),
  createAttribute: vi.fn(),
  updateAttribute: vi.fn(),
  createAttributeOption: vi.fn(),
  updateAttributeOption: vi.fn(),
  getAttribute: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  listAttributes: mocks.listAttributes,
  createAttribute: mocks.createAttribute,
  updateAttribute: mocks.updateAttribute,
  createAttributeOption: mocks.createAttributeOption,
  updateAttributeOption: mocks.updateAttributeOption,
  getAttribute: mocks.getAttribute,
  createIdempotencyKey: (prefix: string) => `${prefix}-key`,
}));

const attribute = (id: string, code: string, name: string, optionCount = 2): AttributeDefinitionSummary => ({
  id,
  code,
  name,
  description: null,
  status: 'ACTIVE',
  optionCount,
  version: 1,
  updatedAt: '2026-01-02T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
});

function renderView() {
  return render(
    <FeedbackProvider>
      <AttributesView />
    </FeedbackProvider>,
  );
}

describe('AttributesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { permissions: [CATALOG_READ, CATALOG_WRITE] };
    mocks.listAttributes.mockResolvedValue({ items: [attribute('a1', 'color', 'رنگ')] });
    mocks.createAttribute.mockResolvedValue({ attribute: attribute('a1', 'color', 'رنگ') });
    mocks.updateAttribute.mockResolvedValue({ attribute: attribute('a1', 'color', 'رنگ') });
    mocks.getAttribute.mockResolvedValue({
      attribute: { ...attribute('a1', 'color', 'رنگ'), options: [] },
    });
  });

  it('blocks full access without catalog.read', async () => {
    mocks.user = { permissions: [] };
    renderView();
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(screen.getByText('حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد.')).toBeInTheDocument();
  });

  it('renders attributes and opens the create dialog', async () => {
    renderView();
    expect(await screen.findByText('رنگ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ویژگی جدید' }));
    expect(await screen.findByRole('dialog', { name: 'ویژگی جدید' })).toBeInTheDocument();
  });

  it('opens the edit dialog from the row menu and puts the status change through', async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText('اقدامات رنگ'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'ویرایش' }));
    const dialog = await screen.findByRole('dialog', { name: 'ویرایش ویژگی' });
    expect(within(dialog).getByDisplayValue('رنگ')).toBeInTheDocument();
  });

  it('opens the options dialog from the row menu', async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText('اقدامات رنگ'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'گزینه‌ها' }));
    expect(
      await screen.findByRole('dialog', { name: 'گزینه‌های «رنگ»' }),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure and reloads on refresh', async () => {
    mocks.listAttributes.mockRejectedValueOnce(new Error('down'));
    renderView();
    expect(
      await screen.findByText('بارگیری ویژگی‌ها ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی' }));
    await waitFor(() => expect(mocks.listAttributes).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('رنگ')).toBeInTheDocument();
  });
});