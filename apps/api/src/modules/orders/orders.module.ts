import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { ConfiguredShippingQuoteAdapter } from "./configured-shipping-quote.adapter";
import { OrderReadController } from "./order-read.controller";
import { OrderReadService } from "./order-read.service";
import { SHIPPING_QUOTE_PORT } from "./shipping-quote.port";

@Module({
  imports: [AuditModule],
  controllers: [OrderReadController, CartController, CheckoutController],
  providers: [
    CartService,
    CheckoutService,
    OrderReadService,
    ConfiguredShippingQuoteAdapter,
    {
      provide: SHIPPING_QUOTE_PORT,
      useExisting: ConfiguredShippingQuoteAdapter,
    },
  ],
})
export class OrdersModule {}
