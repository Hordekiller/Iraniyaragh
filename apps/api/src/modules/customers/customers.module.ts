import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersController } from './customers.controller';
import { CustomerSelfController } from './customer-self.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuditModule],
  controllers: [CustomersController, CustomerSelfController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
