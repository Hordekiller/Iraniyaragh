import { Body, Controller, Get, Header, Headers, Inject, Put } from '@nestjs/common';
import { ApiHeader, ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { ShopSectionKind } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { BannerDto } from './homepage-banners.dto';
import { ShopService } from './shop.service';
export class ShopSectionDto {
  @ApiProperty() @IsString() @MaxLength(64) id!: string;
  @ApiProperty() @IsIn(['categories', 'brands', 'offers', 'newest', 'bestsellers', 'manual', 'category', 'campaigns', 'recent']) kind!: ShopSectionKind;
  @ApiProperty() @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @IsString() @MaxLength(200) description!: string;
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty() @IsInt() @Min(1) @Max(24) limit!: number;
  @ApiProperty() @IsOptional() @IsString() @MaxLength(128) categoryId!: string | null;
  @ApiProperty() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(128, { each: true }) productIds!: string[];
}
export class ShopUpdateDto {
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ type: [BannerDto] }) @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => BannerDto) hero!: BannerDto[];
  @ApiProperty({ type: [BannerDto] }) @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => BannerDto) banners!: BannerDto[];
  @ApiProperty() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(128, { each: true }) categoryIds!: string[];
  @ApiProperty() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(128, { each: true }) brandIds!: string[];
  @ApiProperty({ type: [ShopSectionDto] }) @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ShopSectionDto) sections!: ShopSectionDto[];
}
@Controller({ path: 'catalog/shop', version: '1' })
export class ShopController {
  constructor(@Inject(ShopService) private readonly service: ShopService) {}
  @Get() @Header('Cache-Control', 'no-store')
  async publicConfig() { return { data: { config: await this.service.readPublic() } }; }
  @Get('admin') @Header('Cache-Control', 'no-store')
  @RequireAuthentication('STAFF_MFA') @RequirePermission('settings.manage')
  async adminConfig() { return { data: { config: await this.service.readAdmin() } }; }
  @Put('admin') @RequireAuthentication('STAFF_MFA') @RequirePermission('settings.manage') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body() input: ShopUpdateDto) { return { data: { config: await this.service.update(principal.userId, key, input) } }; }
}
