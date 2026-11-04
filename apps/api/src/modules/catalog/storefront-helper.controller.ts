import { Body, Controller, Get, Header, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';
import type { StorefrontHelperAdminResponse, StorefrontHelperPublicResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { StorefrontHelperService } from './storefront-helper.service';

class HelperUpdateDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsBoolean() enabled!: boolean;
}

@Controller({ path: 'catalog/storefront-helper', version: '1' })
export class StorefrontHelperController {
  constructor(@Inject(StorefrontHelperService) private readonly service: StorefrontHelperService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  @ApiOperation({ summary: 'Whether the interactive customer helper is shown on the storefront' })
  async publicConfig(): Promise<StorefrontHelperPublicResponse> { return { data: await this.service.readPublic() }; }

  @Get('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async adminConfig(): Promise<StorefrontHelperAdminResponse> { return { data: { config: await this.service.readAdmin() } }; }

  @Put('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async update(@CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: HelperUpdateDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: HelperUpdateDto): Promise<StorefrontHelperAdminResponse> {
    return { data: { config: await this.service.update(principal.userId, getRequestId(), input) } };
  }
}
