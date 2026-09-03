import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthenticationLevel } from '@prisma/client';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';

export const REQUIRE_AUTH_LEVEL = 'auth:require-level';
export const REQUIRE_PERMISSION = 'auth:require-permission';

export const RequireAuthentication = (level: AuthenticationLevel) => SetMetadata(REQUIRE_AUTH_LEVEL, level);

export const RequirePermission = (permission: string) => SetMetadata(REQUIRE_PERMISSION, permission);

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
  permission: string | undefined;
}>;

function readProtectedRouteMetadata(context: ExecutionContext): ProtectedRouteMetadata {
  const handler = context.getHandler();
  const target = context.getClass();
  const handlerLevel = Reflect.getMetadata(REQUIRE_AUTH_LEVEL, handler) as AuthenticationLevel | undefined;
  const classLevel = Reflect.getMetadata(REQUIRE_AUTH_LEVEL, target) as AuthenticationLevel | undefined;
  const handlerPermission = Reflect.getMetadata(REQUIRE_PERMISSION, handler) as string | undefined;
  const classPermission = Reflect.getMetadata(REQUIRE_PERMISSION, target) as string | undefined;
  return Object.freeze({
    authenticationLevel: handlerLevel ?? classLevel,
    permission: handlerPermission ?? classPermission,
  });
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly principalService: AuthPrincipalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = readProtectedRouteMetadata(context);
    if (metadata.authenticationLevel === undefined && metadata.permission === undefined) return true;

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

    return true;
  }
}