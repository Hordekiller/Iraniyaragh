import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '../page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    signIn: vi.fn(),
  }),
}));

describe('LoginPage authenticated transition', () => {
  it('keeps visible status content while navigating to the dashboard', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'ورود با موفقیت انجام شد' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(mocks.replace).toHaveBeenCalledWith('/dashboard');
  });
});
