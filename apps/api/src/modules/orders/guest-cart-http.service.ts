import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Request, Response } from 'express';
import {
  AUTH_RUNTIME_CONFIG,
  type AuthRuntimeConfig,
} from '../auth/auth.config';
import { readCookie } from '../auth/auth-http';
import { GUEST_CART_IDLE_TTL_MS } from './cart.constants';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export type GuestCartCredential = Readonly<{
  token: string;
  tokenHash: string;
  csrfToken: string;
}>;

export type GuestCartCredentialRead = Readonly<{
  credential: GuestCartCredential | null;
  hadCookieMaterial: boolean;
}>;

@Injectable()
export class GuestCartHttpService {
  private readonly tokenCookieName: string;
  private readonly csrfCookieName: string;

  constructor(
    @Inject(AUTH_RUNTIME_CONFIG)
    private readonly authConfig: AuthRuntimeConfig,
  ) {
    this.tokenCookieName = authConfig.cookies.secure
      ? '__Host-iranyaragh_guest_cart'
      : 'iranyaragh_guest_cart';
    this.csrfCookieName = authConfig.cookies.secure
      ? '__Host-iranyaragh_guest_csrf'
      : 'iranyaragh_guest_csrf';
  }

  read(request: Request): GuestCartCredentialRead {
    const token = readCookie(request, this.tokenCookieName);
    const csrfToken = readCookie(request, this.csrfCookieName);
    const hadCookieMaterial = token !== undefined || csrfToken !== undefined;
    if (!isOpaqueToken(token) || !isOpaqueToken(csrfToken)) {
      return { credential: null, hadCookieMaterial };
    }
    return {
      credential: Object.freeze({
        token,
        tokenHash: hashToken(token),
        csrfToken,
      }),
      hadCookieMaterial,
    };
  }

  requireMutationProof(request: Request): GuestCartCredential {
    const credential = this.requireOptionalMutationProof(request);
    if (!credential) throw invalidGuestProof();
    return credential;
  }

  requireBootstrapOrigin(request: Request): void {
    this.requireTrustedOrigin(request);
  }

  requireOptionalMutationProof(request: Request): GuestCartCredential | null {
    this.requireTrustedOrigin(request);
    const read = this.read(request);
    const header = readSingleHeader(request, 'x-csrf-token');
    if (!read.hadCookieMaterial && header === undefined) return null;
    if (
      !read.credential ||
      !isOpaqueToken(header) ||
      !tokensMatch(read.credential.csrfToken, header)
    ) {
      throw invalidGuestProof();
    }
    return read.credential;
  }

  generate(): GuestCartCredential {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return Object.freeze({
      token,
      tokenHash: hashToken(token),
      csrfToken: randomBytes(TOKEN_BYTES).toString('base64url'),
    });
  }

  deriveReplacementCredentials(
    currentTokenHash: string,
  ): readonly GuestCartCredential[] {
    const keys = [
      this.authConfig.currentHashKey,
      ...(this.authConfig.previousHashKey
        ? [this.authConfig.previousHashKey]
        : []),
    ];
    const credentials = keys.map(({ secret }) =>
      deriveCredential(secret, currentTokenHash),
    );
    return Object.freeze(
      credentials.filter(
        (credential, index) =>
          credentials.findIndex(
            ({ tokenHash }) => tokenHash === credential.tokenHash,
          ) === index,
      ),
    );
  }

  set(response: Response, credential: GuestCartCredential): void {
    const base = {
      sameSite: this.authConfig.cookies.sameSite,
      path: this.authConfig.cookies.path,
      secure: this.authConfig.cookies.secure,
      maxAge: GUEST_CART_IDLE_TTL_MS,
    } as const;
    response.cookie(this.tokenCookieName, credential.token, {
      ...base,
      httpOnly: true,
    });
    response.cookie(this.csrfCookieName, credential.csrfToken, {
      ...base,
      httpOnly: false,
    });
  }

  clear(response: Response): void {
    const base = {
      sameSite: this.authConfig.cookies.sameSite,
      path: this.authConfig.cookies.path,
      secure: this.authConfig.cookies.secure,
      maxAge: 0,
    } as const;
    response.cookie(this.tokenCookieName, '', { ...base, httpOnly: true });
    response.cookie(this.csrfCookieName, '', { ...base, httpOnly: false });
  }

  private requireTrustedOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (
      typeof origin !== 'string' ||
      !(this.authConfig.corsOrigins ?? []).includes(origin)
    ) {
      throw invalidGuestProof();
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function deriveCredential(secret: string, seed: string): GuestCartCredential {
  const token = deriveOpaqueValue(secret, 'guest-cart-token:v1', seed);
  return Object.freeze({
    token,
    tokenHash: hashToken(token),
    csrfToken: deriveOpaqueValue(secret, 'guest-cart-csrf:v1', seed),
  });
}

function deriveOpaqueValue(
  secret: string,
  purpose: string,
  seed: string,
): string {
  return createHmac('sha256', secret)
    .update(purpose)
    .update('\0')
    .update(seed)
    .digest('base64url');
}

function isOpaqueToken(value: string | undefined): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'base64url');
  const rightBuffer = Buffer.from(right, 'base64url');
  return (
    leftBuffer.length === TOKEN_BYTES &&
    rightBuffer.length === TOKEN_BYTES &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readSingleHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function invalidGuestProof(): ForbiddenException {
  return new ForbiddenException({
    code: 'AUTH_CSRF_INVALID',
    message: 'The guest cart proof is invalid.',
  });
}
