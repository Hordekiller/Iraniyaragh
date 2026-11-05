import { BadRequestException, Body, Controller, Delete, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ApplyCouponRequest, CartResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CartCouponService } from './cart-coupon.service';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@Controller({ path: 'cart/coupon', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CartCouponController {
  constructor(@Inject(CartCouponService) private readonly coupons: CartCouponService) {}

  @Put()
  @ApiOperation({ summary: 'Validate a coupon server-side and attach it to the customer cart' })
  @ApiBody({ schema: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string', minLength: 1, maxLength: 64 } } } })
  @ApiOkResponse({ description: 'Cart with a trusted discount breakdown.' })
  @ApiResponse({ status: 422, description: 'Coupon rejected; `code` carries the precise COUPON_* reason.' })
  @ApiResponse({ status: 429, description: 'Too many coupon attempts.' })
  apply(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() body: ApplyCouponRequest): Promise<CartResponse> {
    if (!body || typeof body.code !== 'string' || body.code.length > 64) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'code is required.' });
    }
    return this.coupons.apply(principal.userId, body.code, getRequestId());
  }

  @Delete()
  @ApiOperation({ summary: 'Remove the coupon from the customer cart' })
  @ApiOkResponse({ description: 'Cart without a coupon.' })
  remove(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<CartResponse> {
    return this.coupons.remove(principal.userId, getRequestId());
  }
}
