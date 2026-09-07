import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthenticationLevel } from '@prisma/client';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';

/** AUTH_CONTRACT §5: fresh authentication means `now - auth_time <= 300 seconds`. */
export const FRESH_AUTH_MAX_AGE_SECONDS = 300;

export const REQUIRE_AUTH_LEVEL = 'auth:require-level';
export const REQUIRE_PERMISSION = 'auth:require-permission';
export const REQUIRE_SESSION = 'auth:require-session';
export const REQUIRE_FRESH_AUTH = 'auth:require-fresh-auth';

export const RequireAuthentication = (level: AuthenticationLevel) => SetMetadata(REQUIRE_AUTH_LEVEL, level);

export const RequirePermission = (permission: string) => SetMetadata(REQUIRE_PERMISSION, permission);

export const RequireLiveSession = () => SetMetadata(REQUIRE_SESSION, true);

/** Requires that the live principal authenticated within the last 300 seconds. */
export const RequireFreshAuth = () => SetMetadata(REQUIRE_FRESH_AUTH, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipalContext => {
    const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipalContext }>();
    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'A live principal is required.' });
    }
    return principal;
  },
);

type ProtectedRouteMetadata = Readonly<{
  authenticationLevel: AuthenticationLevel | undefined;
  liveSession: boolean | undefined;
  permission: string | undefined;
  freshAuth: boolean | undefined;
}>;

function readProtectedRouteMetadata(context: ExecutionContext): ProtectedRouteMetadata {
  const handler = context.getHandler();
  const target = context.getClass();
  const handlerLevel = Reflect.getMetadata(REQUIRE_AUTH_LEVEL, handler) as AuthenticationLevel | undefined;
  const classLevel = Reflect.getMetadata(REQUIRE_AUTH_LEVEL, target) as AuthenticationLevel | undefined;
  const handlerPermission = Reflect.getMetadata(REQUIRE_PERMISSION, handler) as string | undefined;
  const classPermission = Reflect.getMetadata(REQUIRE_PERMISSION, target) as string | undefined;
  const handlerLiveSession = Reflect.getMetadata(REQUIRE_SESSION, handler) as boolean | undefined;
  const classLiveSession = Reflect.getMetadata(REQUIRE_SESSION, target) as boolean | undefined;
  const handlerFreshAuth = Reflect.getMetadata(REQUIRE_FRESH_AUTH, handler) as boolean | undefined;
  const classFreshAuth = Reflect.getMetadata(REQUIRE_FRESH_AUTH, target) as boolean | undefined;
  return Object.freeze({
    authenticationLevel: handlerLevel ?? classLevel,
    liveSession: handlerLiveSession ?? classLiveSession,
    permission: handlerPermission ?? classPermission,
    freshAuth: handlerFreshAuth ?? classFreshAuth,
  });
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly principalService: AuthPrincipalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = readProtectedRouteMetadata(context);
    if (
      !metadata.liveSession &&
      metadata.authenticationLevel === undefined &&
      metadata.permission === undefined
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      principal?: AuthPrincipalContext;
    }>();
    const principal = await this.principalService.resolveBearerToken(request.headers.authorization);
    request.principal = principal;

    if (metadata.authenticationLevel !== undefined && principal.authenticationLevel !== metadata.authenticationLevel) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'The current authentication level does not permit this action.',
      });
    }

    if (metadata.permission !== undefined && !principal.permissions.has(metadata.permission)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'The current principal lacks the required permission.',
      });
    }

    if (metadata.freshAuth === true) {
      const freshnessDeadlineMs = principal.authenticatedAt.getTime() + FRESH_AUTH_MAX_AGE_SECONDS * 1_000;
      if (Date.now() > freshnessDeadlineMs) {
        throw new UnauthorizedException({
          code: 'AUTH_REAUTHENTICATION_REQUIRED',
          message: 'Fresh authentication is required for this action.',
        });
      }
    }

    return true;
  }
}