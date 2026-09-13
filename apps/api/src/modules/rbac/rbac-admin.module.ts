import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { RbacAdminController } from './rbac-admin.controller';
import { RbacAdminService } from './rbac-admin.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [RbacAdminController],
  providers: [RbacAdminService],
  exports: [RbacAdminService],
})
export class RbacModule {}