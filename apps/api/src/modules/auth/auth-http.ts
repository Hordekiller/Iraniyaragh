import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type AuthCookieSpec, DEV_SIGNIN_COOKIE_SPEC } from './auth.config';
import { AuthTokenService } from './auth-token.service';

export class AuthCsrfException extends ForbiddenException {
  constructor() {
    super({
      code: 'AUTH_CSRF_INVALID',
      message: 'The authentication proof is invalid.',
    });
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers?.cookie;
  if (typeof header !== 'string') return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

export function cookieSpecForRequest(request: Request, configured: AuthCookieSpec): AuthCookieSpec {
  if (configured.secure) return configured;
  if (!readCookie(request, configured.refreshName) && readCookie(request, DEV_SIGNIN_COOKIE_SPEC.refreshName)) {
    return Object.freeze({ ...configured, ...DEV_SIGNIN_COOKIE_SPEC });
  }
  return configured;
}

export function requireCookieProof(
  request: Request,
  tokens: AuthTokenService,
  cookieSpec: AuthCookieSpec,
  allowedOrigins: readonly string[],
): string {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !allowedOrigins.includes(origin)) throw new AuthCsrfException();

  const refreshToken = readCookie(request, cookieSpec.refreshName);
  const csrfCookie = readCookie(request, cookieSpec.csrfName);
  const csrfHeader = readHeader(request, 'x-csrf-token');
  if (!refreshToken || !tokens.matchesCsrfToken(csrfCookie, csrfHeader)) throw new AuthCsrfException();
  return refreshToken;
}

export function setAuthCookies(
  response: Response,
  cookieSpec: AuthCookieSpec,
  refreshToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  const base = { sameSite: cookieSpec.sameSite, path: cookieSpec.path, secure: cookieSpec.secure, maxAge };
  const base = { sameSite: cookieSpec.sameSite, path: cookieSpec.path, secure: cookieSpec.secure, maxAge };
  // Refresh JWT rides a httpOnly+SameSite cookie; the CSRF cookie below is the double-submit token, intentionally client-readable to echo in x-csrf-token.
  response.cookie(cookieSpec.refreshName, refreshToken, { ...base, httpOnly: true });
  response.cookie(cookieSpec.csrfName, csrfToken, { ...base, httpOnly: false });
}

export function clearAuthCookies(response: Response, cookieSpec: AuthCookieSpec): void {
  const base = { sameSite: cookieSpec.sameSite, path: cookieSpec.path, secure: cookieSpec.secure, maxAge: 0 };
  response.cookie(cookieSpec.refreshName, '', { ...base, httpOnly: true });
  response.cookie(cookieSpec.csrfName, '', { ...base, httpOnly: false });
  if (!cookieSpec.secure && cookieSpec.refreshName !== DEV_SIGNIN_COOKIE_SPEC.refreshName) {
    response.cookie(DEV_SIGNIN_COOKIE_SPEC.refreshName, '', { ...base, httpOnly: true });
    response.cookie(DEV_SIGNIN_COOKIE_SPEC.csrfName, '', { ...base, httpOnly: false });
  }
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}
