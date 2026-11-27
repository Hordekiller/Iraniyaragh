import { Body, Controller, Get, Header, Headers, Inject, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsString, Matches } from 'class-validator';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { WishlistService } from './wishlist.service';
export class WishlistMergeDto {
  @ApiProperty({ type: [String], maxItems: 40 }) @IsArray() @ArrayMaxSize(40) @ArrayUnique() @IsString({ each: true }) @Matches(/^[\p{L}\p{N}-]{1,250}$/u, { each: true }) slugs!: string[];
}
export class WishlistSetDto {
  @ApiProperty() @IsString() @Matches(/^[\p{L}\p{N}-]{1,250}$/u) slug!: string;
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
@Controller({ path: 'wishlist', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class WishlistController {
  constructor(@Inject(WishlistService) private readonly service: WishlistService) {}
  @Get() @Header('Cache-Control', 'private, no-store') async list(@CurrentPrincipal() principal: AuthPrincipalContext) { return { data: { items: await this.service.list(principal.userId) } }; }
  @Post('merge') @ApiHeader({ name: 'Idempotency-Key', required: true })
  async merge(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body() input: WishlistMergeDto) { return { data: { items: await this.service.change(principal.userId, key, input) } }; }
  @Put() @ApiHeader({ name: 'Idempotency-Key', required: true })
  async set(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body() input: WishlistSetDto) { return { data: { items: await this.service.change(principal.userId, key, input) } }; }
}
