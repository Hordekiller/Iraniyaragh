import { Body, Controller, Get, Header, Headers, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import type { HomepageBannerMediaOptionsResponse, HomepageBannersAdminResponse, HomepageBannersPublicResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { HomepageHeroService } from './homepage-hero.service';
import { BannersUpdateDto } from './homepage-banners.dto';

@Controller({ path: 'catalog/homepage-hero', version: '1' })
export class HomepageHeroController {
  constructor(@Inject(HomepageHeroService) private readonly service: HomepageHeroService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Read live slides for the storefront homepage hero' })
  async publicConfig(): Promise<HomepageBannersPublicResponse> { return { data: await this.service.readPublic() }; }

  @Get('admin/media-options')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async mediaOptions(): Promise<HomepageBannerMediaOptionsResponse> { return { data: { items: await this.service.mediaOptions() } }; }

  @Get('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async adminConfig(): Promise<HomepageBannersAdminResponse> { return { data: { config: await this.service.readAdmin() } }; }

  @Put('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: BannersUpdateDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: BannersUpdateDto): Promise<HomepageBannersAdminResponse> {
    const commandKey = normalizeIdempotencyKey(key);
    const config = await this.service.update(principal.userId, getRequestId(), input, commandKey);
    return { data: { config } };
  }
}
