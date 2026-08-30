import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StockAlertsModule } from './modules/stock-alerts/stock-alerts.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { validateEnvironment } from './config/environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: false,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    StockAlertsModule,
    CustomersModule,
    SuppliersModule,
    AuditModule,
  ],
})
export class AppModule {}
