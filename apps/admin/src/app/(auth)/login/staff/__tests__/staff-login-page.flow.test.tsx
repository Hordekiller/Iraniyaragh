import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffLoginPage from '@/app/(auth)/login/staff/page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

describe('StaffLoginPage full flow (fixture)', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    process.env.NEXT_PUBLIC_FIXTURE_AUTH = 'true';
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
  });

  it('drives password -> totp -> authenticated, clears challenge state, and never touches storage', async () => {
    render(<StaffLoginPage />);

    // password step
    expect(screen.getByRole('button', { name: 'ادامه' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('شناسه کارکن'), {
      target: { value: 'ops@iranyaragh.local' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'FixtuRe-E2E-Admin!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

    // totp step
    const codeField = await screen.findByLabelText('کد تایید شش‌رقمی');
    expect(codeField).toBeInTheDocument();
    fireEvent.change(codeField, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));

    // storage must stay completely untouched by the memory-only slice.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps a failed password submit on the password step and leaves storage untouched', async () => {
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText('شناسه کارکن'), {
      target: { value: 'ops@iranyaragh.local' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('شناسه یا رمز عبور نادرست است');
    expect(screen.getByLabelText('شناسه کارکن')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('fails closed and renders no sign-in form when the fixture opt-in is absent', () => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    render(<StaffLoginPage />);

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('ورود کارکنان به‌صورت آزمایشی در این نسخه فعال نیست');
    expect(screen.queryByLabelText('شناسه کارکن')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ادامه' })).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
