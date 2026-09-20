import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DevLoginForm } from '../DevLoginForm';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    signIn: vi.fn(),
  }),
}));

describe('DevLoginForm authenticated transition', () => {
  it('keeps visible status content while navigating to the dashboard', () => {
    render(<DevLoginForm />);

    expect(screen.getByRole('heading', { name: 'ورود با موفقیت انجام شد' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(mocks.replace).toHaveBeenCalledWith('/dashboard');
  });
});
