import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { getAccessToken, setAccessToken } from '@/lib/auth/token-store';
import { apiFetch } from '@/lib/api/client';
import { FreshAuthenticationDialog } from '../FreshAuthenticationDialog';

const principal = { userId: 'test-staff', sessionId: 'test-initial', authenticationLevel: 'STAFF_MFA', permissions: ['settings.manage'] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function Panel() {
  const auth = useAuth();
  return <>
    <span data-testid="user">{auth.user?.userId ?? 'none'}</span>
    <input aria-label="unsaved form" defaultValue="pending edit" />
    <button onClick={() => auth.establishSession({ accessToken: 'test-initial-token', principal })}>adopt</button>
    <button onClick={() => void apiFetch('/sensitive', { token: getAccessToken(), method: 'PUT' }).catch(() => undefined)}>sensitive command</button>
    {auth.freshAuthenticationOpen && auth.isAuthenticated ? <FreshAuthenticationDialog /> : null}
  </>;
}

describe('in-place real HTTP staff reauthentication', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });
  async function setup() {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/sensitive')) return json({ code: 'AUTH_REAUTHENTICATION_REQUIRED', message: 'fresh authentication required', requestId: 'test', statusCode: 401 }, 401);
      if (url.endsWith('/password')) return json({ data: { challengeToken: 'test-challenge', expiresInSeconds: 120, next: 'TOTP' } });
      return json({ data: { accessToken: 'test-fresh-token', principal: { ...principal, sessionId: 'test-fresh' }, expiresInSeconds: 600, tokenType: 'Bearer' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><Panel /></AuthProvider>);
    fireEvent.click(screen.getByText('adopt'));
    fireEvent.click(screen.getByText('sensitive command'));
    await screen.findByRole('dialog', { name: 'تأیید مجدد عملیات حساس' });
    return fetchMock;
  }
  async function passwordStep() {
    fireEvent.change(screen.getByLabelText('شناسه کارکن'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'unit-test-password-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    await screen.findByLabelText('کد تایید شش‌رقمی');
  }
  it('cancels without losing the mounted draft or ending the session', async () => {
    const mock = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'فعلاً انصراف' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('unsaved form')).toHaveValue('pending edit');
    expect(getAccessToken()).toBe('test-initial-token');
    expect(mock).toHaveBeenCalledOnce();
  });
  it('uses password and TOTP endpoints, closes after verified same-user MFA and never replays the command', async () => {
    const mock = await setup();
    await passwordStep();
    fireEvent.change(screen.getByLabelText('کد تایید شش‌رقمی'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(getAccessToken()).toBe('test-fresh-token');
    expect(screen.getByLabelText('unsaved form')).toHaveValue('pending edit');
    expect(mock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/v1/sensitive', '/api/v1/auth/staff/password', '/api/v1/auth/staff/totp/verify']);
  });
  it('keeps invalid TOTP recoverable with the original draft and identity', async () => {
    const mock = await setup();
    await passwordStep();
    mock.mockResolvedValueOnce(json({ code: 'AUTH_CHALLENGE_INVALID', message: 'invalid test code', statusCode: 401 }, 401));
    fireEvent.change(screen.getByLabelText('کد تایید شش‌رقمی'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    await screen.findByText('کد تایید نادرست است.');
    expect(screen.getByTestId('user')).toHaveTextContent('test-staff');
    expect(screen.getByLabelText('unsaved form')).toHaveValue('pending edit');
    expect(getAccessToken()).toBe('test-initial-token');
    expect(screen.getByRole('button', { name: 'ورود' })).toBeEnabled();
  });
  it('disables cancellation while a password request is pending', async () => {
    const mock = await setup();
    let finish!: (value: Response) => void;
    mock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('شناسه کارکن'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'unit-test-password-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(screen.getByRole('button', { name: 'فعلاً انصراف' })).toBeDisabled();
    finish(json({ data: { challengeToken: 'test-challenge', expiresInSeconds: 120, next: 'TOTP' } }));
    await screen.findByLabelText('کد تایید شش‌رقمی');
    expect(screen.getByRole('button', { name: 'فعلاً انصراف' })).toBeEnabled();
  });
});
