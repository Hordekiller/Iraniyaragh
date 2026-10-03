import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthProvider';
import { getAccessToken, setAccessToken } from '../token-store';
import { recoverApiSession } from '@/lib/api/client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}


const staffPrincipal = {
  userId: 'ops@iranyaragh.local',
  sessionId: 'staff-s-1',
  authenticationLevel: 'STAFF_MFA',
  permissions: ['admin.dashboard.read'],
};

function AdoptPanel() {
  const { isAuthenticated, establishSession, signOut, user } = useAuth();
  return (
    <div>
      <span data-testid="authed">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="email">{user?.userId ?? 'none'}</span>
      <button
        type="button"
        onClick={() => establishSession({ accessToken: 'staff-at-1', principal: staffPrincipal })}
      >
        adopt
      </button>
      <button type="button" onClick={() => signOut().catch(() => undefined)}>
        signout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const name of ['__Host-iranyaragh_csrf', 'iranyaragh_customer_csrf']) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('starts unauthenticated', () => {
    render(
      <AuthProvider>
        <AdoptPanel />
      </AuthProvider>,
    );
    expect(screen.getByTestId('authed')).toHaveTextContent('no');
  });

  it('restores a reloaded staff session from cookies after authoritative MFA and permission verification', async () => {
    document.cookie = 'iranyaragh_customer_csrf=csrf-tok; path=/';
    const fetchMock = vi.fn(async (url: string) => jsonResponse({ data: url.endsWith('/refresh')
      ? { accessToken: 'restored' } : { principal: staffPrincipal } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));
    expect(getAccessToken()).toBe('restored');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/auth/refresh'), expect.stringContaining('/auth/me'),
    ]);
  });

  it('never adopts a customer-level cookie into the staff panel', async () => {
    document.cookie = 'iranyaragh_customer_csrf=csrf-tok; path=/';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => jsonResponse({ data: url.endsWith('/refresh')
      ? { accessToken: 'customer' } : { principal: { ...staffPrincipal, authenticationLevel: 'CUSTOMER_OTP' } } })));
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    await act(async () => { await recoverApiSession().catch(() => undefined); });
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
    expect(getAccessToken()).toBeNull();
  });

  it('serializes refresh and logout with the same origin-wide lock used by the storefront', async () => {
    const request = vi.fn(async (_name: string, _options: LockOptions, operation: () => Promise<unknown>) => operation());
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request } }));
    document.cookie = 'iranyaragh_customer_csrf=csrf-tok; path=/';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => jsonResponse({ data: url.endsWith('/refresh')
      ? { accessToken: 'restored' } : url.endsWith('/me') ? { principal: staffPrincipal } : {} })));
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('yes'));
    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
    expect(request.mock.calls.map(([name]) => name)).toEqual(['iranyaragh:auth:refresh', 'iranyaragh:auth:refresh']);
  });

  it('bounds waiting for another tab without rotating a cookie outside the shared lock', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    const request = vi.fn((_name: string, options: LockOptions) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    fireEvent.click(screen.getByText('adopt'));
    const recovered = recoverApiSession().catch(error => error);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(await recovered).toBeInstanceOf(DOMException);
    expect(request.mock.calls[0]![1].signal!.aborted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('staff-at-1');
    vi.useRealTimers();
  });

  it('ignores a refresh completing after logout', async () => {
    let resolveRefresh!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/refresh')
      ? new Promise<Response>(resolve => { resolveRefresh = resolve; })
      : Promise.resolve(jsonResponse({ data: url.endsWith('/me') ? { principal: staffPrincipal } : {} }))));
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    fireEvent.click(screen.getByText('adopt'));
    const attempt = recoverApiSession().catch(() => undefined);
    await waitFor(() => expect(resolveRefresh).toBeDefined());
    fireEvent.click(screen.getByText('signout'));
    await act(async () => {
      resolveRefresh(jsonResponse({ data: { accessToken: 'late' } }));
      await attempt;
    });
    expect(screen.getByTestId('authed')).toHaveTextContent('no');
    expect(getAccessToken()).toBeNull();
  });


  it('adopts a staff-verified session: sets the user and stores the token for apiFetch', () => {
    render(
      <AuthProvider>
        <AdoptPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('adopt'));
    expect(screen.getByTestId('authed')).toHaveTextContent('yes');
    expect(screen.getByTestId('email')).toHaveTextContent('ops@iranyaragh.local');
    expect(getAccessToken()).toBe('staff-at-1');
  });

  it('sign-out clears a staff-adopted session and the shared token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    render(
      <AuthProvider>
        <AdoptPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('adopt'));
    await waitFor(() => expect(getAccessToken()).toBe('staff-at-1'));

    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
    expect(getAccessToken()).toBeNull();
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('none'));
  });

  it('retains identity when server logout fails so a reload cannot silently undo an apparent logout', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><AdoptPanel /></AuthProvider>);
    fireEvent.click(screen.getByText('adopt'));
    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('authed')).toHaveTextContent('yes');
    expect(getAccessToken()).toBe('staff-at-1');
    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
  });

  it('sign-out sends /auth/logout with the double-submit CSRF proof so the server session is revoked', async () => {
    document.cookie = 'iranyaragh_customer_csrf=csrf-tok; path=/';
    const fetchMock = vi.fn(async () => jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <AdoptPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('adopt'));
    await waitFor(() => expect(getAccessToken()).toBe('staff-at-1'));

    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));

    const logoutCall = fetchMock.mock.calls.find((call) =>
      String((call as unknown[])[0]).endsWith('/api/v1/auth/logout'),
    );
    expect(logoutCall).toBeDefined();
    if (!logoutCall) throw new Error('expected a logout request');
    const [, logoutInit] = (logoutCall as unknown) as [string, RequestInit];
    expect(logoutInit).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-tok' }),
    });
  });
});
