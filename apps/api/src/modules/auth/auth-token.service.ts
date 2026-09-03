import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticationLevel } from '@iranyaragh/contracts';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ACCESS_TOKEN_TYPE, AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';

const ACCESS_TOKEN_MAX_LENGTH = 4096;
const OPAQUE_TOKEN_BYTES = 32;
const TOKEN_FAMILY_BYTES = 20;
const OPAQUE_ID_MAX_LENGTH = 128;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ACCESS_HEADER_KEYS = new Set(['alg', 'typ']);
const ACCESS_CLAIM_KEYS = new Set(['aal', 'amr', 'aud', 'auth_time', 'exp', 'iat', 'iss', 'jti', 'nbf', 'sid', 'sub']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type SignAccessTokenInput = Readonly<{
  userId: string;
  sessionId: string;
  authenticationLevel: AuthenticationLevel;
  authenticatedAt: Date;
}>;

export type VerifiedAccessToken = Readonly<{
  userId: string;
  sessionId: string;
  tokenId: string;
  authenticationLevel: AuthenticationLevel;
  authenticationMethods: readonly ('pwd' | 'sms' | 'totp')[];
  authenticatedAtSeconds: number;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
}>;

export class InvalidAccessTokenError extends Error {
  constructor() {
    super('Access token is invalid.');
    this.name = 'InvalidAccessTokenError';
  }
}

@Injectable()
export class AuthTokenService {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG)
    private readonly config: AuthRuntimeConfig,
  ) {}

  generateRefreshToken(): string {
    return this.generateOpaqueToken(OPAQUE_TOKEN_BYTES);
  }

  generateCsrfToken(): string {
    return this.generateOpaqueToken(OPAQUE_TOKEN_BYTES);
  }

  generateMfaChallengeToken(): string {
    return this.generateOpaqueToken(OPAQUE_TOKEN_BYTES);
  }

  generateTokenFamilyId(): string {
    return this.generateOpaqueToken(TOKEN_FAMILY_BYTES);
  }

  matchesCsrfToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
    if (
      !cookieToken ||
      !headerToken ||
      !OPAQUE_TOKEN_PATTERN.test(cookieToken) ||
      !OPAQUE_TOKEN_PATTERN.test(headerToken)
    ) {
      return false;
    }
    const cookie = Buffer.from(cookieToken, 'base64url');
    const header = Buffer.from(headerToken, 'base64url');
    return (
      cookie.length === OPAQUE_TOKEN_BYTES && header.length === OPAQUE_TOKEN_BYTES && timingSafeEqual(cookie, header)
    );
  }

  signAccessToken(input: SignAccessTokenInput): string {
    const userId = this.requireOpaqueId(input.userId);
    const sessionId = this.requireOpaqueId(input.sessionId);
    const authenticatedAtSeconds = Math.floor(input.authenticatedAt.getTime() / 1000);
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(authenticatedAtSeconds) ||
      authenticatedAtSeconds < 1 ||
      authenticatedAtSeconds > issuedAtSeconds
    ) {
      throw new TypeError('authenticatedAt must be a valid non-future date.');
    }

    const authenticationMethods = this.methodsFor(input.authenticationLevel);
    return jwt.sign(
      {
        aal: input.authenticationLevel,
        amr: authenticationMethods,
        auth_time: authenticatedAtSeconds,
        iat: issuedAtSeconds,
        sid: sessionId,
      },
      this.config.accessSigningSecret,
      {
        algorithm: 'HS256',
        audience: this.config.audience,
        expiresIn: this.config.accessTokenTtlSeconds,
        header: { alg: 'HS256', typ: AUTH_ACCESS_TOKEN_TYPE },
        issuer: this.config.issuer,
        jwtid: randomUUID(),
        notBefore: 0,
        subject: userId,
      },
    );
  }

  verifyAccessToken(token: string): VerifiedAccessToken {
    if (typeof token !== 'string' || token.length === 0 || token.length > ACCESS_TOKEN_MAX_LENGTH) {
      throw new InvalidAccessTokenError();
    }

    let decoded: { header: JwtHeader; payload: JwtPayload | string };
    try {
      decoded = jwt.verify(token, this.config.accessSigningSecret, {
        algorithms: ['HS256'],
        audience: this.config.audience,
        clockTolerance: this.config.clockToleranceSeconds,
        complete: true,
        issuer: this.config.issuer,
        maxAge: this.config.accessTokenTtlSeconds,
      });
    } catch {
      throw new InvalidAccessTokenError();
    }

    if (typeof decoded.payload === 'string' || !this.hasExactKeys(decoded.header, ACCESS_HEADER_KEYS)) {
      throw new InvalidAccessTokenError();
    }
    if (decoded.header.alg !== 'HS256' || decoded.header.typ !== AUTH_ACCESS_TOKEN_TYPE) {
      throw new InvalidAccessTokenError();
    }

    const payload = decoded.payload;
    if (!this.hasExactKeys(payload, ACCESS_CLAIM_KEYS) || !this.hasValidClaims(payload)) {
      throw new InvalidAccessTokenError();
    }

    const authenticationLevel = payload.aal as AuthenticationLevel;
    const authenticationMethods = payload.amr as ('pwd' | 'sms' | 'totp')[];
    return Object.freeze({
      userId: payload.sub as string,
      sessionId: payload.sid as string,
      tokenId: payload.jti as string,
      authenticationLevel,
      authenticationMethods: Object.freeze([...authenticationMethods]),
      authenticatedAtSeconds: payload.auth_time as number,
      issuedAtSeconds: payload.iat as number,
      expiresAtSeconds: payload.exp as number,
    });
  }

  private hasValidClaims(payload: JwtPayload): boolean {
    if (
      payload.iss !== this.config.issuer ||
      payload.aud !== this.config.audience ||
      !this.isOpaqueId(payload.sub) ||
      !this.isOpaqueId(payload.sid) ||
      typeof payload.jti !== 'string' ||
      !UUID_PATTERN.test(payload.jti) ||
      !this.isPositiveInteger(payload.iat) ||
      !this.isPositiveInteger(payload.nbf) ||
      !this.isPositiveInteger(payload.exp) ||
      !this.isPositiveInteger(payload.auth_time)
    ) {
      return false;
    }

    if (
      payload.nbf !== payload.iat ||
      payload.exp - payload.iat !== this.config.accessTokenTtlSeconds ||
      payload.auth_time > payload.iat
    ) {
      return false;
    }

    if (payload.aal === 'CUSTOMER_OTP') return this.hasExactMethods(payload.amr, ['sms']);
    if (payload.aal === 'STAFF_MFA') return this.hasExactMethods(payload.amr, ['pwd', 'totp']);
    return false;
  }

  private hasExactMethods(value: unknown, expected: readonly string[]): boolean {
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((method, index) => method === expected[index])
    );
  }

  private hasExactKeys(value: object, expected: ReadonlySet<string>): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.size && keys.every(key => expected.has(key));
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  private isOpaqueId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= OPAQUE_ID_MAX_LENGTH;
  }

  private requireOpaqueId(value: string): string {
    if (!this.isOpaqueId(value))
      throw new TypeError('Auth IDs must be non-empty opaque strings of at most 128 characters.');
    return value;
  }

  private methodsFor(level: AuthenticationLevel): readonly string[] {
    if (level === 'CUSTOMER_OTP') return ['sms'];
    if (level === 'STAFF_MFA') return ['pwd', 'totp'];
    throw new TypeError('Unsupported authentication level.');
  }

  private generateOpaqueToken(bytes: number): string {
    return randomBytes(bytes).toString('base64url');
  }
}
