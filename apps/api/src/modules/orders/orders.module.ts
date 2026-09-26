import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartController } from './cart.controller';
import { CartMergeController } from './cart-merge.controller';
import { CartService } from './cart.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ConfiguredShippingQuoteAdapter } from './configured-shipping-quote.adapter';
import { OrderCommandController } from './order-command.controller';
import { OrderCommandService } from './order-command.service';
import { OrderReadController } from './order-read.controller';
import { OrderReadService } from './order-read.service';
import { SHIPPING_QUOTE_PORT } from './shipping-quote.port';
import { GuestCartController } from './guest-cart.controller';
import { GuestCartHttpService } from './guest-cart-http.service';
import { GuestCartService } from './guest-cart.service';
import { FulfillmentCommandController } from './fulfillment-command.controller';
import { FulfillmentCommandService } from './fulfillment-command.service';
import { FulfillmentPickController } from './fulfillment-pick.controller';
import { FulfillmentPickService } from './fulfillment-pick.service';
import { ShipmentDispatchController } from './shipment-dispatch.controller';
import { ShipmentDispatchService } from './shipment-dispatch.service';

@Module({
  imports: [AuditModule, AuthModule, InventoryModule],
  controllers: [
    OrderReadController,
    OrderCommandController,
    FulfillmentCommandController,
    FulfillmentPickController,
    ShipmentDispatchController,
    CartController,
    CartMergeController,
    GuestCartController,
    CheckoutController,
  ],
  providers: [
    CartService,
    GuestCartService,
    GuestCartHttpService,
    CheckoutService,
    OrderReadService,
    OrderCommandService,
    FulfillmentCommandService,
    FulfillmentPickService,
    ShipmentDispatchService,
    ConfiguredShippingQuoteAdapter,
    {
      provide: SHIPPING_QUOTE_PORT,
      useExisting: ConfiguredShippingQuoteAdapter,
    },
  ],
  exports: [GuestCartService],
})
export class OrdersModule {}
