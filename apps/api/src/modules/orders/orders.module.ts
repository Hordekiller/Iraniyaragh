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
import { ShipmentDeliveryController } from './shipment-delivery.controller';
import { ShipmentDeliveryService } from './shipment-delivery.service';
import { ShipmentReadController } from './shipment-read.controller';
import { ShipmentReadService } from './shipment-read.service';
import { StaffOrderController } from './staff-order.controller';
import { StaffOrderService } from './staff-order.service';
import { ShippingSettingsController } from './shipping-settings.controller';
import { ShippingSettingsService } from './shipping-settings.service';

@Module({
  imports: [AuditModule, AuthModule, InventoryModule],
  controllers: [
    // Static staff sub-routes (`orders/admin/options`) must be registered before
    // the parametric `orders/admin/:id` route in OrderReadController, otherwise
    // Nest matches `/orders/admin/options` as an id and returns 404.
    StaffOrderController,
    OrderReadController,
    OrderCommandController,
    FulfillmentCommandController,
    FulfillmentPickController,
    ShipmentDispatchController,
    ShipmentDeliveryController,
    ShipmentReadController,
    CartController,
    CartMergeController,
    GuestCartController,
    CheckoutController,
    ShippingSettingsController,
  ],
  providers: [
    CartService,
    GuestCartService,
    GuestCartHttpService,
    CheckoutService,
    StaffOrderService,
    OrderReadService,
    OrderCommandService,
    FulfillmentCommandService,
    FulfillmentPickService,
    ShipmentDispatchService,
    ShipmentDeliveryService,
    ShipmentReadService,
    ConfiguredShippingQuoteAdapter,
    ShippingSettingsService,
    {
      provide: SHIPPING_QUOTE_PORT,
      useExisting: ConfiguredShippingQuoteAdapter,
    },
  ],
  exports: [GuestCartService],
})
export class OrdersModule {}
