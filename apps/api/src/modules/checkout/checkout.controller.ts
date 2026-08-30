import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  create(
    @Headers()
    headers: Record<string, string | string[] | undefined>,
    @Body() body: CheckoutDto,
  ) {
    const key = (Array.isArray(headers['idempotency-key'])
      ? headers['idempotency-key'][0]
      : headers['idempotency-key']) as string | undefined;
    const userId = (Array.isArray(headers['x-user-id'])
      ? headers['x-user-id'][0]
      : headers['x-user-id']) as string | undefined;
    const guestToken = (Array.isArray(headers['x-guest-token'])
      ? headers['x-guest-token'][0]
      : headers['x-guest-token']) as string | undefined;
    return this.checkout.checkout(
      { userId: userId ?? null, guestToken: guestToken ?? null },
      key,
      body.customer,
    );
  }
}
