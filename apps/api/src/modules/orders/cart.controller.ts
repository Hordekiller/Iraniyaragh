import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CartResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CartLineDto } from './cart.dto';
import { openApiCart } from './cart.openapi';
import { CartService } from './cart.service';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@Controller({ path: 'cart', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Read the authenticated customer cart' })
  @ApiOkResponse({
    description:
      'Authoritative server-priced cart; a non-persisted empty cart has null id and updatedAt with version 0.',
    schema: openApiCart.response,
  })
  @ApiResponse({ status: 401, schema: openApiCart.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCart.failures.forbidden })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  get(
    @CurrentPrincipal() principal: AuthPrincipalContext,
  ): Promise<CartResponse> {
    return this.cart.getForUser(principal.userId);
  }

  @Post('lines')
  @ApiOperation({ summary: 'Add quantity to one authenticated cart line' })
  @ApiHeader(idempotencyHeader())
  @ApiBody({ schema: openApiCart.mutationBody })
  @ApiCreatedResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCart.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCart.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiCart.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCart.failures.unprocessable })
  add(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CartLineDto,
  ): Promise<CartResponse> {
    return this.cart.addForUser(
      principal.userId,
      body,
      normalizeIdempotencyKey(key),
    );
  }

  @Put('lines/:variantId')
  @ApiOperation({ summary: 'Set the absolute quantity of one cart line' })
  @ApiHeader(idempotencyHeader())
  @ApiParam({
    name: 'variantId',
    schema: { type: 'string', minLength: 1, maxLength: 191 },
  })
  @ApiBody({ schema: openApiCart.mutationBody })
  @ApiOkResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCart.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCart.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiCart.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  @ApiResponse({ status: 422, schema: openApiCart.failures.unprocessable })
  set(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string | undefined,
    @Param('variantId') variantId: string,
    @Body() body: CartLineDto,
  ): Promise<CartResponse> {
    const normalizedVariantId = normalizeVariantId(variantId);
    if (body.variantId !== normalizedVariantId) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'variantId must match the request path.',
      });
    }
    return this.cart.setForUser(
      principal.userId,
      normalizedVariantId,
      body.quantity,
      normalizeIdempotencyKey(key),
    );
  }

  @Delete('lines/:variantId')
  @ApiOperation({ summary: 'Remove one authenticated cart line' })
  @ApiHeader(idempotencyHeader())
  @ApiParam({
    name: 'variantId',
    schema: { type: 'string', minLength: 1, maxLength: 191 },
  })
  @ApiOkResponse({ schema: openApiCart.response })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCart.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiCart.failures.forbidden })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  remove(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string | undefined,
    @Param('variantId') variantId: string,
  ): Promise<CartResponse> {
    return this.cart.removeForUser(
      principal.userId,
      normalizeVariantId(variantId),
      normalizeIdempotencyKey(key),
    );
  }
}

function idempotencyHeader() {
  return {
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque operation-scoped retry key, maximum 128 characters.',
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  } as const;
}

function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 128 || hasControlCharacter(key)) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key of at most 128 characters is required.',
    });
  }
  return key;
}

function normalizeVariantId(value: string): string {
  const variantId = value.trim();
  if (!variantId || variantId.length > 191 || hasControlCharacter(variantId)) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid variantId is required.',
    });
  }
  return variantId;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}
