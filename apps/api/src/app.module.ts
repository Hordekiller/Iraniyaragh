import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiFoundationModule } from './common/api-foundation.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
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
    ApiFoundationModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    CustomersModule,
    SuppliersModule,
    AuditModule,
  ],
})
export class AppModule {}
