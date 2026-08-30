import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { CartService, CartIdentity } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto';

function toIdentity(headers: Record<string, string | string[] | undefined>): CartIdentity {
  const header = (name: string): string | undefined => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    userId: header('x-user-id') || null,
    guestToken: header('x-guest-token') || null,
    clientRequestId: header('x-request-id') || null,
    userAgent: header('user-agent') || null,
  };
}

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  getCart(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.cart.getCart(toIdentity(headers));
  }

  @Post('items')
  addItem(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: AddCartItemDto,
  ) {
    return this.cart.addItem(toIdentity(headers), body.skuId, body.quantity);
  }

  @Patch('items/:itemId')
  updateItem(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cart.updateQuantity(toIdentity(headers), itemId, body.quantity);
  }

  @Delete('items/:itemId')
  removeItem(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('itemId') itemId: string,
  ) {
    return this.cart.removeItem(toIdentity(headers), itemId);
  }
}
