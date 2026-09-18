import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  CheckoutPreviewResponse,
  CheckoutResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CheckoutCreateDto, CheckoutPreviewDto } from './checkout.dto';
import { openApiCheckout } from './checkout.openapi';
import { CheckoutService } from './checkout.service';

@ApiTags('checkout')
@ApiBearerAuth('access-token')
@Controller({ path: 'checkout', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reprice the authenticated cart and create shipping quotes',
  })
  @ApiBody({ schema: openApiCheckout.previewBody })
  @ApiOkResponse({
    description: 'Authoritative cart and shipping quotes.',
    schema: openApiCheckout.previewResponse,
  })
  @ApiResponse({ status: 400, schema: openApiCheckout.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCheckout.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCheckout.failures.forbidden })
  @ApiResponse({ status: 409, schema: openApiCheckout.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCheckout.failures.unprocessable })
  preview(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: CheckoutPreviewDto,
  ): Promise<CheckoutPreviewResponse> {
    return this.checkout.previewForUser(principal.userId, input.address);
  }

  @Post()
  @ApiOperation({
    summary: 'Create one reserved pending-payment order atomically',
  })
  @ApiBody({ schema: openApiCheckout.createBody })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque retry key, maximum 128 characters.',
  })
  @ApiCreatedResponse({
    description: 'Order, immutable snapshots and reservations.',
    schema: openApiCheckout.createResponse,
  })
  @ApiResponse({ status: 400, schema: openApiCheckout.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCheckout.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCheckout.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiCheckout.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiCheckout.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCheckout.failures.unprocessable })
  create(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CheckoutCreateDto,
  ): Promise<CheckoutResponse> {
    const idempotencyKey = normalizeIdempotencyKey(key);
    return this.checkout.createForUser(
      principal.userId,
      input,
      idempotencyKey,
      getRequestId(),
    );
  }
}

function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  const hasControlCharacter = [...(key ?? '')].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!key || key.length > 128 || hasControlCharacter) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key of at most 128 characters is required.',
    });
  }
  return key;
}
