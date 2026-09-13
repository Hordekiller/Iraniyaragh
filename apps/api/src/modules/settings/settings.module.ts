import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsAdminController } from './settings.admin.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuditModule],
  controllers: [SettingsAdminController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}