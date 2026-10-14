import { Module } from '@nestjs/common';
import { OperationalReportController } from './operational-report.controller';
import { OperationalReportService } from './operational-report.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController, OperationalReportController],
  providers: [DashboardService, OperationalReportService],
})
export class ReportsModule {}
