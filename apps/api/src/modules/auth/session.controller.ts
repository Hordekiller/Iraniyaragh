import { Controller, Delete, Get, Header, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { EmptyResponse, SessionListResponse, SessionSummary } from '@iranyaragh/contracts';
import { AUTH_RUNTIME_CONFIG, DEV_SIGNIN_COOKIE_SPEC, type AuthRuntimeConfig } from './auth.config';
import { AuthSessionService, type AuthSessionSummary } from './auth-session.service';
import { CurrentPrincipal, RequireLiveSession } from './auth.guard';
import type { AuthPrincipalContext } from './auth-principal.service';

const MAX_SESSION_ID_LENGTH = 128;

@Controller({ path: 'auth', version: '1' })
export class SessionManagementController {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    private readonly sessions: AuthSessionService,
  ) {}

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireLiveSession()
  async list(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<SessionListResponse> {
    const sessions = await this.sessions.listSessions(principal.userId, principal.sessionId);
    return { data: { sessions: sessions.map(session => this.toSessionSummary(session)) } };
  }

  @Delete('sessions/:sessionId')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireLiveSession()
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResponse> {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }

    const outcome = await this.sessions.revokeUserSession(principal.userId, sessionId);
    if (outcome === 'notFound') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }

    if (sessionId === principal.sessionId) {
      this.clearAuthCookies(response);
    }
    return { data: {} };
  }

  private toSessionSummary(session: AuthSessionSummary): SessionSummary {
    return {
      sessionId: session.sessionId,
      current: session.current,
      deviceName: session.deviceName,
      authenticationLevel: session.authenticationLevel,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt ? session.lastUsedAt.toISOString() : null,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  private clearAuthCookies(response: Response): void {
    const { refreshName, csrfName, secure, sameSite, path } = this.config.cookies;
    const base = { sameSite, path, secure, maxAge: 0 };
    response.cookie(refreshName, '', { ...base, httpOnly: true });
    response.cookie(csrfName, '', { ...base, httpOnly: false });
    if (!secure) {
      const { refreshName: devRefreshName, csrfName: devCsrfName } = DEV_SIGNIN_COOKIE_SPEC;
      response.cookie(devRefreshName, '', { ...base, httpOnly: true });
      response.cookie(devCsrfName, '', { ...base, httpOnly: false });
    }
  }
}