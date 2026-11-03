import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MediaModule } from "../media/media.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { PaymentsModule } from "../payments/payments.module";
import { DoorCatalogService } from "./door-catalog.service";
import { DoorFilesService } from "./door-files.service";
import { DoorOrdersService } from "./door-orders.service";
import {
  DoorAdminController,
  DoorCustomerController,
  DoorPublicController,
} from "./door.controller";
@Module({
  imports: [
    AuditModule,
    AuthModule,
    InventoryModule,
    MediaModule,
    PaymentsModule,
    InvoicesModule,
  ],
  controllers: [
    DoorPublicController,
    DoorAdminController,
    DoorCustomerController,
  ],
  providers: [DoorCatalogService, DoorOrdersService, DoorFilesService],
})
export class CustomDoorOrdersModule {}
