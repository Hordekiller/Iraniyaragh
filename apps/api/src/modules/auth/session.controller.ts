import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { EmptyResponse, SessionListResponse, SessionSummary } from '@iranyaragh/contracts';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';
import { AuthSessionService, type AuthSessionSummary } from './auth-session.service';
import { CurrentPrincipal, RequireFreshAuthentication, RequireLiveSession } from './auth.guard';
import type { AuthPrincipalContext } from './auth-principal.service';
import { clearAuthCookies, cookieSpecForRealm } from './auth-http';

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

  /**
   * Authenticated activity signal for long-running work that makes no other
   * API calls (e.g. editing a form). Only the guard-validated live session is
   * touched; it cannot extend expiry or revive an inactive/revoked session.
   */
  @Post('activity')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireLiveSession()
  async activity(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<void> {
    await this.sessions.touchActivity(principal.sessionId);
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

    const targetId = await this.sessions.resolveLiveSessionId(principal.userId, sessionId);
    const outcome = await this.sessions.revokeUserSession(principal.userId, targetId);
    if (outcome === 'notFound') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }

    if (targetId === principal.sessionId) {
      this.clearAuthCookies(response, principal);
    }
    return { data: {} };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireFreshAuthentication(undefined)
  async logoutAll(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResponse> {
    await this.sessions.revokeAllSessions(principal.userId);
    this.clearAuthCookies(response, principal);
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

  private clearAuthCookies(response: Response, principal: AuthPrincipalContext): void {
    const realm = principal.authenticationLevel === 'STAFF_MFA' ? 'staff' : 'customer';
    clearAuthCookies(response, cookieSpecForRealm(this.config, realm));
  }
}
