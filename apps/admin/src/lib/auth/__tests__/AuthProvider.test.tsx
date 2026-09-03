import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthProvider';

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

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(await screen.findByTestId('authed')).toHaveTextContent('no');
    expect(screen.getByTestId('email')).toHaveTextContent('none');
  });
});
