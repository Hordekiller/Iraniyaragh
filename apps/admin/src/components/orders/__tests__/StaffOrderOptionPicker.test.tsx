import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffOrderOptionPicker } from '../StaffOrderOptionPicker';

const mocks = vi.hoisted(() => ({
  searchStaffOrderOptions: vi.fn(),
}));

vi.mock('@/lib/orders/orders-api', () => ({
  searchStaffOrderOptions: mocks.searchStaffOrderOptions,
}));

describe('StaffOrderOptionPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchStaffOrderOptions.mockResolvedValue({
      items: [{ id: 'c1', label: 'رضا محمدی', detail: '+98912*****000' }],
      count: 1,
    });
  });

  it('asks the server for the matching kind and shows the masked detail', async () => {
    render(<StaffOrderOptionPicker kind="customer" label="مشتری" value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('مشتری'), { target: { value: 'رضا' } });

    expect(await screen.findByRole('option', { name: /رضا محمدی/ })).toBeInTheDocument();
    expect(mocks.searchStaffOrderOptions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'customer', search: 'رضا' }),
    );
  });

  it('does not filter client-side, so the server stays the source of truth', async () => {
    render(<StaffOrderOptionPicker kind="variant" label="تنوع کالا" value={null} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('تنوع کالا'), { target: { value: 'zzzz' } });

    // The server returned an item that does not match the typed text; it must
    // still be offered, because the server already applied the real filter.
    expect(await screen.findByRole('option', { name: /رضا محمدی/ })).toBeInTheDocument();
  });

  it('reports the selected option to the caller', async () => {
    const onChange = vi.fn();
    render(<StaffOrderOptionPicker kind="customer" label="مشتری" value={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('مشتری'), { target: { value: 'رضا' } });
    fireEvent.click(await screen.findByRole('option', { name: /رضا محمدی/ }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }),
      ),
    );
  });
});
