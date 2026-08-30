import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockAlertsController } from './stock-alerts.controller';
import { StockAlertsService } from './stock-alerts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [StockAlertsController],
  providers: [StockAlertsService],
  exports: [StockAlertsService],
})
export class StockAlertsModule {}
