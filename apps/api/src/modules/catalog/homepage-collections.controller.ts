import { Body, Controller, Get, Header, Headers, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { HomepageCollectionsConfig, HomepageCollectionsResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { HomepageCollectionsService } from './homepage-collections.service';
import { homepageCollectionsSchemas } from './homepage-collections.openapi';

class HomepageCollectionSectionDto {
  @IsOptional() @IsIn(['CATEGORY', 'ALL_PRODUCTS']) kind?: 'CATEGORY' | 'ALL_PRODUCTS';
  @IsOptional() @IsString() @MaxLength(128) @Matches(/^[A-Za-z0-9_-]+$/u) categoryId?: string;
  @IsIn(['NEWEST', 'BESTSELLING']) sortBy!: 'NEWEST' | 'BESTSELLING';
}

class HomepageCollectionsUpdateDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(8) @ArrayUnique(section => section.kind === 'ALL_PRODUCTS' ? `ALL_PRODUCTS:${section.sortBy}` : `CATEGORY:${section.categoryId}`) @ValidateNested({ each: true }) @Type(() => HomepageCollectionSectionDto) sections!: HomepageCollectionSectionDto[];
}

@ApiTags('homepage-collections')
@Controller({ path: 'catalog/homepage-collections', version: '1' })
export class HomepageCollectionsController {
  constructor(@Inject(HomepageCollectionsService) private readonly service: HomepageCollectionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read public category carousel selections for the storefront homepage' })
  @ApiOkResponse({ schema: homepageCollectionsSchemas.response })
  async publicConfig(): Promise<HomepageCollectionsResponse> { return { data: { config: await this.service.read() } }; }

  @Get('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: homepageCollectionsSchemas.response })
  @ApiResponse({ status: 401, schema: homepageCollectionsSchemas.unauthorized })
  @ApiResponse({ status: 403, schema: homepageCollectionsSchemas.forbidden })
  async adminConfig(): Promise<HomepageCollectionsResponse> { return { data: { config: await this.service.read() } }; }

  @Put('admin')
  @ApiBearerAuth('access-token')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: homepageCollectionsSchemas.body })
  @ApiOkResponse({ schema: homepageCollectionsSchemas.response })
  @ApiResponse({ status: 400, schema: homepageCollectionsSchemas.invalid })
  @ApiResponse({ status: 401, schema: homepageCollectionsSchemas.unauthorized })
  @ApiResponse({ status: 403, schema: homepageCollectionsSchemas.forbidden })
  @ApiResponse({ status: 409, schema: homepageCollectionsSchemas.conflict })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: HomepageCollectionsUpdateDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: HomepageCollectionsUpdateDto): Promise<HomepageCollectionsResponse> {
    const config: HomepageCollectionsConfig = await this.service.update(principal.userId, getRequestId(), input, normalizeIdempotencyKey(key));
    return { data: { config } };
  }
}
