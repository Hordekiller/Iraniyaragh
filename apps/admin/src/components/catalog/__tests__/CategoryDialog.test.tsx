import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CategorySummary } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createCategory, updateCategory } from '@/lib/catalog/catalog-api';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CategoryDialog } from '../CategoryDialog';

vi.mock('@/lib/catalog/catalog-api', () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  createIdempotencyKey: (prefix: string) => `${prefix}-test-key`,
}));

const categories: CategorySummary[] = [
  { id: 'c1', name: 'کرکره', slug: 'shutter', parentId: null, productCount: 1 },
  { id: 'c2', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 5 },
];

function renderDialog(props: Partial<React.ComponentProps<typeof CategoryDialog>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const result = render(
    <FeedbackProvider>
      <CategoryDialog open onClose={onClose} categories={categories} onSaved={onSaved} {...props} />
    </FeedbackProvider>,
  );
  return { onClose, onSaved, ...result };
}

describe('CategoryDialog', () => {
  it('creates a root category without a parent id', async () => {
    vi.mocked(createCategory).mockResolvedValue({ category: { ...categories[0], children: [] } } as never);
    const { onSaved, onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText(/نام دسته‌بندی/), { target: { value: 'درب‌ها' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'doors' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت دسته‌بندی' }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ name: 'درب‌ها', slug: 'doors' }, expect.any(String)));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a category with a selected parent and updates an existing one', async () => {
    vi.mocked(createCategory).mockResolvedValue({ category: categories[1] } as never);
    const { onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText(/نام دسته‌بندی/), { target: { value: 'قفل دستگیره‌ای' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'handle-locks' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'دستهٔ والد' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('قفل‌ها'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت دسته‌بندی' }));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({
        name: 'قفل دستگیره‌ای',
        slug: 'handle-locks',
        parentId: 'c2',
      }, expect.any(String)),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('excludes the edited category from its own parent picker', async () => {
    renderDialog({ category: categories[1] });
    expect(screen.getByText('ویرایش دسته‌بندی')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'دستهٔ والد' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['بدون والد', 'کرکره']);
  });

  it('submits an update with parent cleared to null', async () => {
    vi.mocked(updateCategory).mockResolvedValue({ category: categories[1] } as never);
    renderDialog({ category: { ...categories[1], parentId: 'c1' } });

    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'locks-v2' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'دستهٔ والد' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('بدون والد'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith('c2', { name: 'قفل‌ها', slug: 'locks-v2', parentId: null }),
    );
  });

  it('validates required fields and shows API errors', async () => {
    vi.mocked(createCategory).mockRejectedValue(
      new ApiClientError({ code: 'CONFLICT', message: 'این نام موجود است', requestId: 'r', statusCode: 409 }),
    );
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'ساخت دسته‌بندی' }));
    expect(screen.getByText('نام دسته‌بندی الزامی است.')).toBeInTheDocument();
    expect(createCategory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/نام دسته‌بندی/), { target: { value: 'درب' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'door' } });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت دسته‌بندی' }));

    expect(await screen.findByText('این نام موجود است')).toBeInTheDocument();
  });
});
