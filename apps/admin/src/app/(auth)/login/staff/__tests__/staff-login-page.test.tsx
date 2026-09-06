import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PasswordStep,
  SessionStatePanel,
  TotpStep,
} from '@/app/(auth)/login/staff/page';
import { StaffAuthFixtureClient } from '@/lib/auth/staff-fixture';
import { StaffLoginController } from '@/lib/auth/staff-login';
import { createMemoryStaffTokenStore } from '@/lib/auth/token-store';

function makeController(
  fixture: StaffAuthFixtureClient = new StaffAuthFixtureClient(),
): StaffLoginController {
  return new StaffLoginController(fixture, createMemoryStaffTokenStore());
}

async function reachTotp(controller: StaffLoginController): Promise<void> {
  controller.open();
  controller.setIdentifier('ops@iranyaragh.local');
  controller.setPassword('FixtuRe-E2E-Admin!2026');
  await controller.submitPassword();
}

describe('StaffLoginPage steps', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('password step renders accessible labels, autofocus and the continue button', () => {
    const c = makeController();
    c.open();
    render(<PasswordStep state={c.getState()} controller={c} />);

    const identifier = screen.getByLabelText('شناسه کارکن');
    expect(identifier).toHaveFocus();
    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'ادامه' })).toBeInTheDocument();
  });

  it('password step shows an aria-live error after an invalid submit', async () => {
    const c = makeController();
    c.open();
    c.setIdentifier('ops@iranyaragh.local');
    c.setPassword('wrong-password');
    await c.submitPassword();

    render(<PasswordStep state={c.getState()} controller={c} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('شناسه یا رمز عبور نادرست است');
  });

  it('totp step renders the six-digit numeric field once the challenge is issued', async () => {
    const c = makeController();
    await reachTotp(c);
    expect(c.getState().phase).toBe('totp');

    render(<TotpStep state={c.getState()} controller={c} />);
    const code = screen.getByLabelText('کد تایید شش‌رقمی');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });

  it('session-expired panel announces re-authentication and offers retry', () => {
    render(<SessionStatePanel phase="session-expired" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('نشست شما به پایان رسیده است');
    expect(screen.getByRole('button', { name: 'ورود دوباره' })).toBeInTheDocument();
  });

  it('forbidden panel announces denial and offers retry', () => {
    render(<SessionStatePanel phase="forbidden" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجاز نیست');
  });
});
