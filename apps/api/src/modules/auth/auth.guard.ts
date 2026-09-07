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

const FRESH_AUTH_WINDOW_MS = 5 * 60 * 1_000;

export const REQUIRE_AUTH_LEVEL = 'auth:require-level';
export const REQUIRE_PERMISSION = 'auth:require-permission';
export const REQUIRE_SESSION = 'auth:require-session';
export const REQUIRE_FRESH_AUTH = 'auth:require-fresh';

export const RequireAuthentication = (level: AuthenticationLevel) => SetMetadata(REQUIRE_AUTH_LEVEL, level);

export const RequirePermission = (permission: string) => SetMetadata(REQUIRE_PERMISSION, permission);

export const RequireLiveSession = () => SetMetadata(REQUIRE_SESSION, true);

export const RequireFreshAuthentication = (level: AuthenticationLevel | undefined) => applyFreshAuthentication(level);

function applyFreshAuthentication(level: AuthenticationLevel | undefined) {
  return (target: object, propertyKey: string | symbol, descriptor: unknown) => {
    const setFresh = SetMetadata(REQUIRE_FRESH_AUTH, true);
    setFresh(target, propertyKey, descriptor as PropertyDescriptor);
    if (level !== undefined) {
      const setLevel = SetMetadata(REQUIRE_AUTH_LEVEL, level);
      setLevel(target, propertyKey, descriptor as PropertyDescriptor);
    }
  };
}

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
      metadata.permission === undefined &&
      metadata.freshAuth === undefined
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
      const authAgeMs = Date.now() - principal.authenticatedAt.getTime();
      if (authAgeMs > FRESH_AUTH_WINDOW_MS) {
        throw new UnauthorizedException({
          code: 'AUTH_REAUTHENTICATION_REQUIRED',
          message: 'Re-authentication is required before this action.',
        });
      }
    }

    return true;
  }
}