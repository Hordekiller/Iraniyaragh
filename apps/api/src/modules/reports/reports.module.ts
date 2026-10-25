import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationalReportController } from './operational-report.controller';
import { OperationalReportService } from './operational-report.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportExportArtifactStore } from './report-export-artifact.store';
import { BullMqReportExportQueue } from './bullmq-report-export-queue.adapter';
import { ReportExportJobService } from './report-export-job.service';
import { ReportExportController } from './report-export.controller';
import { REPORT_EXPORT_QUEUE } from './report-export-queue.port';

@Module({
  imports: [AuditModule],
  controllers: [DashboardController, OperationalReportController, ReportExportController],
  providers: [
    DashboardService,
    OperationalReportService,
    ReportExportArtifactStore,
    BullMqReportExportQueue,
    { provide: REPORT_EXPORT_QUEUE, useExisting: BullMqReportExportQueue },
    ReportExportJobService,
  ],
  exports: [],
})
export class ReportsModule {}
