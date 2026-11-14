import { Body, Controller, Get, Header, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { StorefrontContactsAdminResponse, StorefrontContactsPublicResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { StorefrontContactsService } from './storefront-contacts.service';

@Controller({ path: 'catalog/storefront-contacts', version: '1' })
export class StorefrontContactsController {
  constructor(@Inject(StorefrontContactsService) private readonly service: StorefrontContactsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  @ApiOperation({ summary: 'Published storefront contact links' })
  async publicConfig(): Promise<StorefrontContactsPublicResponse> { return { data: await this.service.readPublic() }; }

  @Get('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async adminConfig(): Promise<StorefrontContactsAdminResponse> { return { data: { config: await this.service.readAdmin() } }; }

  @Put('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: unknown): Promise<StorefrontContactsAdminResponse> {
    return { data: { config: await this.service.update(principal.userId, getRequestId(), input) } };
  }
}
