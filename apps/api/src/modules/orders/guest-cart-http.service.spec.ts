import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRuntimeConfig } from '../auth/auth.config';
import { GuestCartHttpService } from './guest-cart-http.service';

function config(secure = false): AuthRuntimeConfig {
  return {
    accessSigningSecret: 'a'.repeat(48),
    issuer: 'test',
    audience: 'iranyaragh-browser',
    accessTokenTtlSeconds: 600,
    clockToleranceSeconds: 30,
    currentHashKey: { version: 1, secret: 'b'.repeat(32) },
    devLoginEnabled: false,
    devCode: '',
    cookies: {
      refreshName: secure
        ? '__Host-iranyaragh_refresh'
        : 'iranyaragh_customer_refresh',
      csrfName: secure
        ? '__Host-iranyaragh_csrf'
        : 'iranyaragh_customer_csrf',
      secure,
      sameSite: 'strict',
      path: '/',
    },
    corsOrigins: ['http://localhost:3000'],
  };
}

function response() {
  const cookie = vi.fn();
  return { value: { cookie } as unknown as Response, cookie };
}

function request(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('GuestCartHttpService', () => {
  it('generates independent opaque session credentials and stable keyed rotation candidates', () => {
    const service = new GuestCartHttpService(config());
    const first = service.generate();
    const second = service.generate();
    const rotation = service.deriveReplacementCredentials(first.tokenHash)[0]!;
    const replay = service.deriveReplacementCredentials(first.tokenHash)[0]!;

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.token).not.toBe(first.csrfToken);
    expect(replay).toEqual(rotation);
    expect(second.token).not.toBe(first.token);
    expect(rotation.token).not.toBe(first.token);
  });

  it('requires a pre-established credential and a configured trusted origin', () => {
    const service = new GuestCartHttpService(config());

    expect(() =>
      service.requireMutationProof(
        request({ origin: 'http://localhost:3000' }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      service.requireOptionalMutationProof(
        request({ origin: 'http://localhost:3000' }),
      ),
    ).toBeNull();
    expect(() =>
      service.requireMutationProof(request({ origin: 'https://evil.test' })),
    ).toThrow(ForbiddenException);
  });

  it('requires an exact double-submit proof for an existing guest credential', () => {
    const service = new GuestCartHttpService(config());
    const credential = service.generate();
    const cookie = `iranyaragh_guest_cart=${credential.token}; iranyaragh_guest_csrf=${credential.csrfToken}`;

    expect(
      service.requireMutationProof(
        request({
          origin: 'http://localhost:3000',
          cookie,
          'x-csrf-token': credential.csrfToken,
        }),
      ),
    ).toEqual(credential);
    expect(() =>
      service.requireMutationProof(
        request({
          origin: 'http://localhost:3000',
          cookie,
          'x-csrf-token': service.generate().csrfToken,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects partial or malformed cookie state instead of treating it as bootstrap', () => {
    const service = new GuestCartHttpService(config());

    expect(() =>
      service.requireMutationProof(
        request({
          origin: 'http://localhost:3000',
          cookie: 'iranyaragh_guest_cart=malformed',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('sets and clears environment-safe HttpOnly and readable CSRF cookies', () => {
    const service = new GuestCartHttpService(config(true));
    const credential = service.generate();
    const target = response();

    service.set(target.value, credential);
    service.clear(target.value);

    expect(target.cookie).toHaveBeenNthCalledWith(
      1,
      '__Host-iranyaragh_guest_cart',
      credential.token,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 86_400_000,
      }),
    );
    expect(target.cookie).toHaveBeenNthCalledWith(
      2,
      '__Host-iranyaragh_guest_csrf',
      credential.csrfToken,
      expect.objectContaining({ httpOnly: false, secure: true }),
    );
    expect(target.cookie).toHaveBeenNthCalledWith(
      3,
      '__Host-iranyaragh_guest_cart',
      '',
      expect.objectContaining({ httpOnly: true, maxAge: 0 }),
    );
  });
});
