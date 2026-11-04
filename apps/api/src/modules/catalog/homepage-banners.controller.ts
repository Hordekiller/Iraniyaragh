import { Body, Controller, Get, Header, Headers, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { HomepageBannerMediaOptionsResponse, HomepageBannersAdminResponse, HomepageBannersPublicResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { HomepageBannersService } from './homepage-banners.service';

class BannerDto {
  @IsString() @MaxLength(64) id!: string;
  @IsString() @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(160) subtitle!: string | null;
  @IsString() @MaxLength(40) ctaLabel!: string;
  @IsString() @MaxLength(500) href!: string;
  @IsString() @MaxLength(128) desktopMediaId!: string;
  @IsOptional() @IsString() @MaxLength(128) mobileMediaId!: string | null;
  @IsString() @MaxLength(200) imageAlt!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(40) publishAt!: string | null;
  @IsOptional() @IsString() @MaxLength(40) unpublishAt!: string | null;
}
class BannersUpdateDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => BannerDto) banners!: BannerDto[];
}

@Controller({ path: 'catalog/homepage-banners', version: '1' })
export class HomepageBannersController {
  constructor(@Inject(HomepageBannersService) private readonly service: HomepageBannersService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Read live promotional banners for the storefront homepage' })
  async publicConfig(): Promise<HomepageBannersPublicResponse> { return { data: await this.service.readPublic() }; }

  @Get('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async adminConfig(): Promise<HomepageBannersAdminResponse> { return { data: { config: await this.service.readAdmin() } }; }

  @Get('admin/media-options')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  async mediaOptions(): Promise<HomepageBannerMediaOptionsResponse> { return { data: { items: await this.service.mediaOptions() } }; }

  @Put('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: BannersUpdateDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: BannersUpdateDto): Promise<HomepageBannersAdminResponse> {
    return { data: { config: await this.service.update(principal.userId, getRequestId(), input, normalizeIdempotencyKey(key)) } };
  }
}
