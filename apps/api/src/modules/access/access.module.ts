import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
