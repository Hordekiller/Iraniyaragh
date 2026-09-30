'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken, setAccessToken } from './token-store';

export type AuthUser = {
  userId: string;
  sessionId: string;
  authenticationLevel: string;
  permissions: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  /** Adopt the session verified by the real staff password + TOTP login. */
  establishSession: (input: { accessToken: string; principal: AuthUser }) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const establishSession = useCallback((input: { accessToken: string; principal: AuthUser }): void => {
    setAccessToken(input.accessToken);
    setUser({
      userId: input.principal.userId,
      sessionId: input.principal.sessionId,
      authenticationLevel: input.principal.authenticationLevel,
      permissions: input.principal.permissions,
    });
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    try {
      if (token) {
        await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST', token });
      }
    } catch {
      // Idempotent logout: clear local state even if the API is unreachable.
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      signOut,
      establishSession,
    }),
    [user, signOut, establishSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
