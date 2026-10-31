import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryRateLimitService } from './discovery-rate-limit.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryRateLimitService],
})
export class DiscoveryModule {}
