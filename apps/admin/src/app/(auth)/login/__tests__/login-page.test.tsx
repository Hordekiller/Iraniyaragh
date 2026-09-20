import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ establishSession: vi.fn() }),
}));

describe('LoginPage', () => {
  it('uses the real staff MFA flow as the canonical admin login', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'ورود کارکنان' })).toBeVisible();
    expect(screen.getByLabelText('شناسه کارکن')).toBeVisible();
    expect(screen.getByLabelText('رمز عبور')).toBeVisible();
    expect(screen.queryByLabelText('کد دسترسی توسعه‌دهنده')).not.toBeInTheDocument();
  });
});
