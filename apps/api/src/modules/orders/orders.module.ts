import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ConfiguredShippingQuoteAdapter } from './configured-shipping-quote.adapter';
import { SHIPPING_QUOTE_PORT } from './shipping-quote.port';

@Module({
  imports: [AuditModule],
  controllers: [CartController, CheckoutController],
  providers: [
    CartService,
    CheckoutService,
    ConfiguredShippingQuoteAdapter,
    {
      provide: SHIPPING_QUOTE_PORT,
      useExisting: ConfiguredShippingQuoteAdapter,
    },
  ],
})
export class OrdersModule {}
