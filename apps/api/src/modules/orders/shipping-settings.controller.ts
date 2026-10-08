import { Body, Controller, Get, Headers, Inject, Param, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsString, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import type { ShippingMethodSettingsListResponse, ShippingMethodSettingsResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { MoneyDto } from '../catalog/catalog.dto';
import { ShippingSettingsService } from './shipping-settings.service';
import { shippingSettingsSchemas } from './shipping-settings.openapi';

export class ShippingSettingsDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
  @ValidateNested() @Type(() => MoneyDto) amount!: MoneyDto;
  @IsBoolean() isActive!: boolean;
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(0) expectedVersion!: number | null;
}

@ApiTags('shipping-settings')
@ApiBearerAuth('access-token')
@Controller({ path: 'settings/admin/shipping-methods', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('settings.manage')
@ApiResponse({ status: 401, schema: shippingSettingsSchemas.unauthorized })
@ApiResponse({ status: 403, schema: shippingSettingsSchemas.forbidden })
export class ShippingSettingsController {
  constructor(@Inject(ShippingSettingsService) private readonly settings: ShippingSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List configured fixed shipping tariffs, including inactive methods' })
  @ApiOkResponse({ schema: shippingSettingsSchemas.list })
  async list(): Promise<ShippingMethodSettingsListResponse> { return { data: { items: await this.settings.list() } }; }

  @Put(':code')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Create or update an approved fixed shipping tariff with version and retry protection' })
  @ApiParam({ name: 'code', schema: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: shippingSettingsSchemas.body })
  @ApiOkResponse({ schema: shippingSettingsSchemas.response })
  @ApiResponse({ status: 400, schema: shippingSettingsSchemas.invalid })
  @ApiResponse({ status: 409, schema: shippingSettingsSchemas.conflict })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('code') code: string, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: ShippingSettingsDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: ShippingSettingsDto): Promise<ShippingMethodSettingsResponse> {
    return { data: { method: await this.settings.update(principal.userId, getRequestId(), code, input, normalizeIdempotencyKey(key)) } };
  }
}
