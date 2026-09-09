import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalSearch } from '../GlobalSearch';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/dashboard',
}));

describe('GlobalSearch', () => {
  afterEach(() => {
    mocks.push.mockReset();
  });

  it('opens the dialog on Ctrl+K', () => {
    render(<GlobalSearch />);
    expect(screen.queryByRole('dialog', { name: 'جستجوی سریع' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'جستجوی سریع' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'عبارت جستجو' })).toBeInTheDocument();
  });

  it('opens via the trigger button', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));
    expect(screen.getByRole('dialog', { name: 'جستجوی سریع' })).toBeInTheDocument();
  });

  it('lists the live dashboard page and marks planned sections', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));

    expect(screen.getByRole('button', { name: /داشبورد عملیات/ })).toBeEnabled();
    const orders = screen.getByRole('button', { name: /سفارش‌ها/ });
    expect(orders).toHaveAttribute('aria-disabled', 'true');
  });

  it('filters results and jumps to the selected page', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'عبارت جستجو' }), {
      target: { value: 'داشبورد' },
    });

    fireEvent.click(screen.getByRole('button', { name: /داشبورد عملیات/ }));
    expect(mocks.push).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to the first non-planned result on Enter', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));

    const input = screen.getByRole('textbox', { name: 'عبارت جستجو' });
    fireEvent.change(input, { target: { value: 'داشبورد' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.push).toHaveBeenCalledWith('/dashboard');
  });

  it('does not navigate when the only match is planned', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'عبارت جستجو' }), {
      target: { value: 'پرداخت' },
    });

    expect(screen.getByRole('button', { name: /پرداخت‌ها/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows an empty result message', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی سریع در پنل' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'عبارت جستجو' }), {
      target: { value: 'چیزی که وجود ندارد' },
    });

    expect(screen.getByText(/نتیجه‌ای برای/)).toBeInTheDocument();
  });
});