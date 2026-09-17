import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import type { CartResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CartLineDto } from './cart.dto';
import { CartService } from './cart.service';

@Controller({ path: 'cart', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
export class CartController {
  constructor(private readonly cart: CartService) {}
  @Get() get(@CurrentPrincipal() p: AuthPrincipalContext): Promise<CartResponse> { return this.cart.getForUser(p.userId); }
  @Post('lines') add(@CurrentPrincipal() p: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined, @Body() body: CartLineDto): Promise<CartResponse> { if (!key?.trim()) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Idempotency-Key is required.' }); return this.cart.addForUser(p.userId, body, key.trim()); }
}
