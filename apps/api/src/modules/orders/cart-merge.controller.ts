import {
  Controller,
  Header,
  Headers,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CartMergeResponse } from '@iranyaragh/contracts';
import type { Request, Response } from 'express';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import {
  cartIdempotencyHeader,
  normalizeCartIdempotencyKey,
} from './cart-http';
import { openApiCart } from './cart.openapi';
import { GuestCartHttpService } from './guest-cart-http.service';
import { GuestCartService } from './guest-cart.service';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@Controller({ path: 'cart', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CartMergeController {
  constructor(
    private readonly cart: GuestCartService,
    private readonly guestHttp: GuestCartHttpService,
  ) {}

  @Post('merge-guest')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Merge the anonymous cart after customer OTP login' })
  @ApiHeader(cartIdempotencyHeader())
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: false,
    description: 'Required when guest-cart cookies are present.',
  })
  @ApiCreatedResponse({ schema: openApiCart.mergeResponse })
  @ApiResponse({ status: 400, schema: openApiCart.failures.validation })
  @ApiResponse({ status: 401, schema: openApiCart.failures.unauthorized })
  @ApiResponse({
    status: 403,
    schema: openApiCart.failures.authOrCsrfForbidden,
    description: 'Authentication level or guest-cart CSRF proof is invalid.',
  })
  @ApiResponse({ status: 409, schema: openApiCart.failures.conflict })
  async merge(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<CartMergeResponse> {
    let current;
    try {
      current = this.guestHttp.requireOptionalMutationProof(request);
    } catch (error) {
      this.guestHttp.clear(response);
      throw error;
    }
    const result = await this.cart.mergeForUser(
      principal.userId,
      current?.tokenHash ?? null,
      normalizeCartIdempotencyKey(key),
      getRequestId(),
    );
    this.guestHttp.clear(response);
    return result;
  }
}
