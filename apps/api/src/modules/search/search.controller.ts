import { SearchAdminService } from './search-admin.service';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { Body, Controller, Get, Header, Headers, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Max, Min, IsInt, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { CatalogService } from '../catalog/catalog.service';
import { ProductListQueryDto } from '../catalog/catalog.dto';
import { RateLimitService } from '../auth/rate-limit.service';
import { openApiSearchProducts } from '../catalog/catalog.openapi';

export class SearchQueryDto extends ProductListQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @IsString() @MinLength(2) @MaxLength(150) q!: string;
  @ApiPropertyOptional({ maximum: 24, default: 24 })
  @IsOptional() @Type(() => Number) @IsInt() @Max(24) override perPage = 24;
  @IsOptional() @IsString() @MaxLength(128) override brandId: string | undefined = undefined;
  @IsOptional() @IsString() @MaxLength(128) override categoryId: string | undefined = undefined;
  @IsOptional() @IsIn(['relevance','createdAt','popular','price']) override sortBy: ProductListQueryDto['sortBy'] = 'relevance';
}

export class SearchClickDto {
  @IsString() @MinLength(2) @MaxLength(150) q!: string;
  @IsString() @MaxLength(128) productId!: string;
}

export class SearchCommandDto {
  @IsIn(['alias','keywords','reindex']) action!: 'alias'|'keywords'|'reindex';
  @IsOptional() @IsString() @MaxLength(60) term?: string;
  @IsOptional() @IsString() @MaxLength(60) replacement?: string;
  @IsOptional() @IsString() @MaxLength(128) productId?: string;
  @IsOptional() @IsString() @MaxLength(500) keywords?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10) boost?: number;
  @IsOptional() @IsString() @MaxLength(128) cursor?: string;
  @IsOptional() @IsBoolean() remove?: boolean;
}

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly catalog: CatalogService, private readonly limits: RateLimitService, private readonly admin: SearchAdminService) {}

  @Get('suggest')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Persian instant search; up to eight public products with live commerce values' })
  @ApiOkResponse({ schema: openApiSearchProducts })
  async suggest(@Query() query: SearchQueryDto, @Req() request: Request) {
    await this.throttle(request);
    const result = await this.catalog.searchPublicProducts({ ...query, search: query.q, page: 1, perPage: 8, sortBy: 'relevance' });
    await this.admin.metric(query.q,result.data.meta.total).catch(() => undefined);
    return result;
  }

  @Get('products')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Ranked public search with complete filtering, facets and pagination' })
  @ApiOkResponse({ schema: openApiSearchProducts })
  async products(@Query() query: SearchQueryDto, @Req() request: Request) {
    await this.throttle(request);
    return this.catalog.searchPublicProducts({ ...query, search: query.q });
  }

  @Post('click')
  @Header('Cache-Control', 'no-store')
  async click(@Body() input: SearchClickDto, @Req() request: Request) {
    await this.throttle(request);
    const result=await this.catalog.searchPublicProducts({search:input.q,sortBy:'relevance',perPage:8});
    if(result.data.items.some(item=>item.id===input.productId)) await this.admin.metric(input.q,result.data.meta.total,true);
    return {data:{recorded:result.data.items.some(item=>item.id===input.productId)}};
  }

  @Get('popular')
  @Header('Cache-Control', 'public, max-age=60')
  async popular(@Req() request: Request) { await this.throttle(request); return this.admin.popular(); }

  @Get('admin')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  @Header('Cache-Control', 'no-store')
  async status() { return { data: await this.admin.read() }; }

  @Post('admin')
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @Header('Cache-Control', 'no-store')
  async command(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body() input: SearchCommandDto) { return this.admin.command(principal.userId,key,input); }

  private throttle(request: Request) {
    return this.limits.enforce({ dimension: 'search:ip-minute', value: request.ip || request.socket.remoteAddress || 'unknown', context: 'ip' });
  }
}
