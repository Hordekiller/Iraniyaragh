import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthProvider';
import { getAccessToken, setAccessToken } from '../token-store';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function TestPanel() {
  const { isAuthenticated, signIn, signOut, user } = useAuth();
  return (
    <div>
      <span data-testid="authed">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="email">{user?.userId ?? 'none'}</span>
      <button type="button" onClick={() => signIn('dev-code')}>
        signin
      </button>
      <button type="button" onClick={() => signOut()}>
        signout
      </button>
    </div>
  );
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
      <button type="button" onClick={() => signOut()}>
        signout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('starts unauthenticated', () => {
    render(
      <AuthProvider>
        <TestPanel />
      </AuthProvider>,
    );
    expect(screen.getByTestId('authed')).toHaveTextContent('no');
  });

  it('sets the user and authenticates after a successful sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: {
            accessToken: 'at-1',
            principal: {
              userId: 'dev-admin',
              sessionId: 's-1',
              authenticationLevel: 'STAFF_MFA',
              permissions: ['catalog.read'],
            },
          },
        }),
      ),
    );

    render(
      <AuthProvider>
        <TestPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('signin'));
    expect(await screen.findByTestId('authed')).toHaveTextContent('yes');
    expect(screen.getByTestId('email')).toHaveTextContent('dev-admin');
  });

  it('remains unauthenticated on a failed sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          jsonResponse(
            { code: 'AUTH_INVALID_CREDENTIALS', message: 'invalid', requestId: 'r', statusCode: 401 },
            false,
            401,
          ),
      ),
    );

    render(
      <AuthProvider>
        <TestPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('signin'));
    await screen.findByTestId('authed');
    expect(screen.getByTestId('authed')).toHaveTextContent('no');
  });

  it('clears the user on sign-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: { accessToken: 'at-1', principal: { userId: 'u', sessionId: 's', authenticationLevel: 'STAFF_MFA', permissions: [] } } })),
    );

    render(
      <AuthProvider>
        <TestPanel />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('signin'));
    await screen.findByTestId('authed');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    fireEvent.click(screen.getByText('signout'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('no'));
    expect(screen.getByTestId('email')).toHaveTextContent('none');
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
});
